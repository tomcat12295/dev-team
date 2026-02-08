import { TaskStatus, Dashboard } from '../types/task.js';
import { updateDashboard, addActivity, updateTaskInList, getDashboard, updateMemberStatus, withDashboardTransaction } from '../utils/queue.js';
import { getCurrentRole, validateDashboardUpdatePermission } from '../utils/permission.js';
import { info, error } from '../utils/logger.js';
import { recalculateDashboardTasks } from '../utils/task-manager.js';
import { getProjectContext, updateProjectContext, MemberTaskInfo, parseCurrentStateSections, generateCurrentStateMarkdown } from '../utils/memory.js';

export interface UpdateTaskStatusParams {
    phase?: 'planning' | 'design' | 'implementation' | 'testing' | 'review' | 'completed';
    // 非推奨: deltaパラメータは後方互換のため維持。taskListから自動計算されるため無視される
    /** @deprecated 集計値はtaskListから自動計算されます */
    pendingDelta?: number;
    /** @deprecated 集計値はtaskListから自動計算されます */
    inProgressDelta?: number;
    /** @deprecated 集計値はtaskListから自動計算されます */
    completedDelta?: number;
    /** @deprecated 集計値はtaskListから自動計算されます */
    blockedDelta?: number;
    // 推奨: taskId + newStatus による個別更新
    taskId?: string;
    newStatus?: 'pending' | 'in_progress' | 'completed' | 'blocked';
    blockReason?: string;
    // current_stateから削除するための情報
    completed_task_id?: string;     // 完了したタスクID
    completed_assignee?: string;    // 完了したタスクの担当者
}

export interface UpdateTaskStatusResult {
    success: boolean;
    dashboard?: Dashboard;
    error?: string;
}

export async function updateTaskStatus(params: UpdateTaskStatusParams): Promise<UpdateTaskStatusResult> {
    const role = getCurrentRole();

    // Validate permission
    const permission = validateDashboardUpdatePermission(role);
    if (!permission.allowed) {
        return {
            success: false,
            error: permission.reason,
        };
    }

    try {
        // Log input parameters for debugging
        info(`Updating task status`, {
            role,
            phase: params.phase,
            pendingDelta: params.pendingDelta,
            inProgressDelta: params.inProgressDelta,
            completedDelta: params.completedDelta,
            blockedDelta: params.blockedDelta,
            taskId: params.taskId,
            newStatus: params.newStatus,
            blockReason: params.blockReason,
        });

        // 自動再計算: taskListからtasksを計算（deltaパラメータは無視）
        if (params.pendingDelta !== undefined ||
            params.inProgressDelta !== undefined ||
            params.completedDelta !== undefined ||
            params.blockedDelta !== undefined) {
            info('Delta parameters are deprecated. Task counts will be recalculated from taskList.');
        }

        // 1回のトランザクションで全dashboard操作をまとめて実行
        const { dashboard } = await withDashboardTransaction(async (db) => {
            // Build updates
            if (params.phase) {
                db.currentPhase = params.phase;
            }

            // タスクリスト更新（推奨パス: taskId + newStatus）
            if (params.taskId && params.newStatus) {
                const updateData: { status: TaskStatus; startedAt?: string; completedAt?: string } = {
                    status: params.newStatus,
                };
                if (params.newStatus === 'in_progress') {
                    updateData.startedAt = new Date().toISOString();
                } else if (params.newStatus === 'completed') {
                    updateData.completedAt = new Date().toISOString();
                }
                await updateTaskInList(params.taskId, updateData, db);
            }

            // completed_task_idが指定された場合: taskListのステータスを完了に更新
            if (params.completed_task_id) {
                const updated = await updateTaskInList(params.completed_task_id, {
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                }, db);
                if (updated) {
                    info(`Task ${params.completed_task_id} marked as completed in taskList`);
                } else {
                    info(`Task ${params.completed_task_id} was not found in taskList, skipping status update`);
                }

                // memberStatusをリセット（assigneeが指定されている場合）
                if (params.completed_assignee) {
                    await updateMemberStatus(params.completed_assignee, {
                        status: 'idle',
                        currentTask: undefined,
                        lastActivity: new Date().toISOString(),
                    }, db);
                    info(`Member status reset to idle for ${params.completed_assignee}`);
                }
            }

            // 集計値を再計算
            await recalculateDashboardTasks(db);

            // Log activity
            const details = [];
            if (params.phase) details.push(`phase: ${params.phase}`);
            if (params.pendingDelta) details.push(`pending: ${params.pendingDelta > 0 ? '+' : ''}${params.pendingDelta}`);
            if (params.inProgressDelta) details.push(`in_progress: ${params.inProgressDelta > 0 ? '+' : ''}${params.inProgressDelta}`);
            if (params.completedDelta) details.push(`completed: ${params.completedDelta > 0 ? '+' : ''}${params.completedDelta}`);
            if (params.blockedDelta) details.push(`blocked: ${params.blockedDelta > 0 ? '+' : ''}${params.blockedDelta}`);
            if (params.taskId && params.newStatus) {
                let taskDetail = `task ${params.taskId}: ${params.newStatus}`;
                if (params.newStatus === 'blocked' && params.blockReason) {
                    taskDetail += ` (${params.blockReason})`;
                }
                details.push(taskDetail);
            }

            await addActivity({
                role,
                action: 'update_task_status',
                details: details.join(', '),
            }, db);
        });

        info(`Task status updated by ${role}`, params);

        // current_stateからの削除はdashboard外の操作なのでトランザクション外で実行
        if (params.completed_task_id && params.completed_assignee) {
            try {
                await removeTaskFromCurrentState(params.completed_assignee, params.completed_task_id);
            } catch (err) {
                error('Failed to remove task from current_state', err);
            }
        }

        return {
            success: true,
            dashboard,
        };
    } catch (err) {
        error('Failed to update task status', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export function formatUpdateResult(result: UpdateTaskStatusResult): string {
    if (!result.success) {
        return `❌ タスクステータスの更新に失敗しました: ${result.error}`;
    }

    const d = result.dashboard!;
    let output = `✅ タスクステータスを更新しました。\n\n`;
    output += `**現在のフェーズ:** ${d.currentPhase}\n`;
    output += `**タスク状況:** 保留 ${d.tasks.pending} / 進行中 ${d.tasks.inProgress} / ブロック ${d.tasks.blocked} / 完了 ${d.tasks.completed}`;

    return output;
}

/**
 * current_stateから指定されたメンバーのタスク情報を削除する
 */
async function removeTaskFromCurrentState(assignee: string, taskId: string): Promise<void> {
    const context = await getProjectContext();
    const currentState = context.currentState || '';

    if (!currentState || currentState === '（未設定）') {
        info(`current_state is empty, nothing to remove for ${assignee}`);
        return;
    }

    const sections = parseCurrentStateSections(currentState);

    // 該当メンバーのセクションが存在し、タスクIDが一致する場合のみ削除
    if (sections[assignee] && sections[assignee].taskId === taskId) {
        delete sections[assignee];

        // Markdownを再生成
        const newContent = generateCurrentStateMarkdown(sections, new Date().toISOString());
        await updateProjectContext('current_state', newContent, false);
        info(`Removed task ${taskId} for ${assignee} from current_state`);
    } else {
        info(`Task ${taskId} for ${assignee} not found in current_state, skipping removal`);
    }
}
