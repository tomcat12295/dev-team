import { Role } from '../types/task.js';
import { Message } from '../types/message.js';
import { addMessage, generateMessageId, addActivity, updateTaskInList, updateMemberStatus } from '../utils/queue.js';
import { notifyRole } from '../utils/wezterm.js';
import { getCurrentRole, validateLeaderOnly } from '../utils/permission.js';
import { validateRequiredString } from '../utils/validation.js';
import { info, error } from '../utils/logger.js';
import { getProjectContext, updateProjectContext, MemberTaskInfo, parseCurrentStateSections, generateCurrentStateMarkdown, getReviewMode } from '../utils/memory.js';
import { getTaskWithValidation } from '../utils/task-manager.js';

export interface ApprovePlanParams {
    task_id: string;           // 対象タスクID
    comments?: string;         // 承認コメント（任意）
}

export interface ApprovePlanResult {
    success: boolean;
    error?: string;
    notified: boolean;
}

export async function approvePlan(params: ApprovePlanParams): Promise<ApprovePlanResult> {
    const from = getCurrentRole();

    // Validate that caller is leader
    const leaderCheck = validateLeaderOnly(from, 'approve_plan');
    if (!leaderCheck.allowed) {
        return { success: false, error: leaderCheck.reason, notified: false };
    }

    // Validate required fields
    const taskIdCheck = validateRequiredString(params.task_id, 'task_id');
    if (!taskIdCheck.valid) {
        return { success: false, error: taskIdCheck.error, notified: false };
    }

    try {
        // Get and validate task
        const { task, error: validationError } = await getTaskWithValidation(params.task_id, {
            expectedPhase: 'awaiting_approval',
            requirePlan: true,
        });

        if (validationError || !task) {
            return {
                success: false,
                error: validationError || 'タスクの取得に失敗しました',
                notified: false,
            };
        }

        // Get review mode to determine next phase
        const reviewMode = await getReviewMode();
        const isStrictMode = reviewMode === 'strict';
        const nextPhase = isStrictMode ? 'test_review' : 'implementing';

        // Update task: change phase based on review mode and set approvedAt
        // Note: task.plan is guaranteed to exist by requirePlan: true validation
        const updatedPlan = {
            ...task.plan!,
            approvedAt: new Date().toISOString(),
        };

        // In strict mode, don't set status to in_progress yet (wait for test approval)
        const taskUpdate: any = {
            phase: nextPhase,
            plan: updatedPlan,
        };

        if (!isStrictMode) {
            taskUpdate.status = 'in_progress';
            taskUpdate.startedAt = new Date().toISOString();
        }

        await updateTaskInList(params.task_id, taskUpdate);

        // Send notification to assignee
        const assignee = task.assignee;
        const messageContent = formatApprovalContent(task.title, params.comments, task.plan!, isStrictMode);
        const messageId = generateMessageId();
        const message: Message = {
            id: messageId,
            type: 'notification',
            from: 'leader',
            to: assignee,
            subject: `計画承認: ${task.title}`,
            content: messageContent,
            timestamp: new Date().toISOString(),
            read: false,
        };

        await addMessage(assignee, message);

        // Log activity
        await addActivity({
            role: 'leader',
            action: 'approve_plan',
            details: `Approved plan for task: ${task.title}`,
        });

        info(`Plan approved by leader`, { taskId: params.task_id, assignee });

        // Update member status
        try {
            await updateMemberStatus(assignee, {
                status: 'working',
                lastActivity: new Date().toISOString(),
            });
        } catch (err) {
            error('Failed to update member status', err);
        }

        // Notify assignee via WezTerm
        let notified = false;
        try {
            notified = await notifyRole(assignee, `Plan approved by leader`);
        } catch (err) {
            error('Failed to notify assignee', err);
        }

        // Update project_context current_state
        try {
            const context = await getProjectContext();
            const updatedState = updateTaskPhaseInCurrentState(
                context.currentState || '',
                params.task_id,
                assignee,
                task.title,
                nextPhase
            );
            await updateProjectContext('current_state', updatedState, false);
            info('Updated current_state after plan approval', { taskId: params.task_id, assignee });
        } catch (err) {
            error('Failed to update current_state', err);
            // current_state更新失敗は承認自体の失敗とはしない
        }

        // Update leader status to idle after completing approval
        try {
            await updateMemberStatus('leader', {
                status: 'idle',
                lastActivity: new Date().toISOString(),
                currentTask: undefined,
            });
            info('Leader status updated to idle after plan approval');
        } catch (err) {
            error('Failed to update leader status to idle', err);
        }

        return {
            success: true,
            notified,
        };
    } catch (err) {
        error('Failed to approve plan', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
            notified: false,
        };
    }
}

function formatApprovalContent(taskTitle: string, comments: string | undefined, plan: any, isStrictMode: boolean): string {
    let content = `## 計画が承認されました: ${taskTitle}\n\n`;

    if (isStrictMode) {
        content += `✅ あなたの計画が承認されました。**テストコードを先に作成**してください。\n\n`;
    } else {
        content += `✅ あなたの計画が承認されました。実装を開始してください。\n\n`;
    }

    if (comments) {
        content += `### leaderからのコメント\n${comments}\n\n`;
    }

    content += `### 承認された計画\n`;
    content += `- 変更ファイル: ${plan.filesToChange.length}件\n`;
    content += `- 新規作成ファイル: ${plan.filesToCreate.length}件\n\n`;

    content += `---\n`;
    if (isStrictMode) {
        content += `テストコードを作成後、\`submit_test\` でテストレビューを依頼してください。`;
    } else {
        content += `実装が完了したら \`send_task(type='report')\` で完了報告を送ってください。`;
    }

    return content;
}

export function formatApprovePlanResult(result: ApprovePlanResult): string {
    if (!result.success) {
        return `❌ 計画承認に失敗しました: ${result.error}`;
    }

    let output = `✅ 計画を承認しました。\n`;
    output += `Phase: implementing（実装中）\n`;
    output += result.notified
        ? `📢 memberに通知しました。`
        : `⚠️ memberへの通知に失敗しました。`;

    return output;
}

/**
 * current_state内のタスクフェーズを更新する
 * 該当タスクが見つからない場合は新規追加する
 */
function updateTaskPhaseInCurrentState(
    currentState: string,
    taskId: string,
    assignee: Role,
    taskTitle: string,
    newPhase: string
): string {
    const now = new Date().toISOString();
    const sections = parseCurrentStateSections(currentState);

    // 該当メンバーのタスクを更新または追加
    sections[assignee] = {
        taskId,
        title: taskTitle,
        phase: newPhase,
        startTime: sections[assignee]?.startTime || now,
        memo: sections[assignee]?.memo,
    };

    return generateCurrentStateMarkdown(sections, now);
}
