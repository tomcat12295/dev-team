import { Role, TaskSummary, TaskPriority, TaskPhase, TaskType } from '../types/task.js';
import { Message } from '../types/message.js';
import { addMessage, generateId, addActivity, addTaskToList, updateMemberStatus, getDashboard, linkParentChild } from '../utils/queue.js';
import { notifyRole, sendTextToPane } from '../utils/wezterm.js';
import { getCurrentRole, isValidRole, validateLeaderOnly } from '../utils/permission.js';
import { validateRequiredString, validateRequiredArray } from '../utils/validation.js';
import { info, error } from '../utils/logger.js';
import { isMemberRole } from '../config/team-config.js';
import { recalculateDashboardTasks } from '../utils/task-manager.js';
import { getProjectContext, updateProjectContext, MemberTaskInfo, parseCurrentStateSections, generateCurrentStateMarkdown, getReviewMode } from '../utils/memory.js';

export interface AssignTaskParams {
    to: string;                      // member-01, member-02
    title: string;                   // タスク名
    description: string;             // 詳細説明
    acceptance_criteria: string[];   // 完了条件（必須・配列）
    allowed_files: string[];         // 変更許可ファイル（必須）
    forbidden_files?: string[];      // 禁止ファイル
    priority?: TaskPriority;
    parent_task_id?: string;         // 親タスクID（任意）
    task_type?: TaskType;            // タスク種別（デフォルト: implementation）
    clear_before?: boolean;          // trueなら/clear、falseまたは未指定なら/compact
}

export interface AssignTaskResult {
    success: boolean;
    taskId?: string;
    error?: string;
    notified: boolean;
}

/**
 * 外部向け assignTask（MCPツールとして公開）
 * leader からのみ呼び出し可能
 */
export async function assignTask(params: AssignTaskParams): Promise<AssignTaskResult> {
    const from = getCurrentRole();

    // Validate that caller is leader
    const leaderCheck = validateLeaderOnly(from, 'assign_task');
    if (!leaderCheck.allowed) {
        return { success: false, error: leaderCheck.reason, notified: false };
    }

    return assignTaskCore(params, from);
}

/**
 * 内部向け assignTaskCore（権限チェックなし）
 * process-approval.ts など内部から呼び出す用
 */
export async function assignTaskCore(params: AssignTaskParams, from: Role = 'leader'): Promise<AssignTaskResult> {
    // Validate target is a member
    if (!isValidRole(params.to)) {
        return {
            success: false,
            error: `無効な送信先: ${params.to}`,
            notified: false,
        };
    }

    if (!isMemberRole(params.to)) {
        return {
            success: false,
            error: `assign_taskはmemberにのみ送信可能です。送信先: ${params.to}`,
            notified: false,
        };
    }

    const to = params.to as Role;

    // Validate required fields
    for (const [field, value] of [['title', params.title], ['description', params.description]] as const) {
        const check = validateRequiredString(value, field);
        if (!check.valid) {
            return { success: false, error: check.error, notified: false };
        }
    }

    const criteriaCheck = validateRequiredArray(params.acceptance_criteria, 'acceptance_criteria');
    if (!criteriaCheck.valid) {
        return { success: false, error: criteriaCheck.error, notified: false };
    }

    // 調査タスク以外はallowed_filesが必須
    const isInvestigation = params.task_type === 'investigation';
    if (!isInvestigation) {
        const filesCheck = validateRequiredArray(params.allowed_files, 'allowed_files');
        if (!filesCheck.valid) {
            return { success: false, error: 'allowed_filesは1つ以上の変更許可ファイルが必須です（調査タスクを除く）', notified: false };
        }
    }
    // 調査タスクはallowed_filesを空配列に正規化（編集禁止）
    if (isInvestigation && !params.allowed_files) {
        params.allowed_files = [];
    }

    try {
        // parent_task_idが未指定の場合、leaderのcurrentTaskを自動設定
        let effectiveParentId = params.parent_task_id;
        if (!effectiveParentId) {
            const dashboard = await getDashboard({ readOnly: true });
            const leaderCurrentTask = dashboard.memberStatus['leader']?.currentTask?.id;
            if (leaderCurrentTask) {
                effectiveParentId = leaderCurrentTask;
                info(`Auto-setting parent_task_id to leader's current task: ${leaderCurrentTask}`);
            }
        }

        const taskId = await generateId();

        // 調査タスクかどうかを判定
        const isInvestigationTask = params.task_type === 'investigation';

        // レビューモードを取得
        const reviewMode = await getReviewMode();

        // Create structured message content
        const content = formatTaskContent(taskId, params, isInvestigationTask, reviewMode);

        const message: Message = {
            id: taskId,
            type: 'task',
            from,
            to,
            subject: params.title,
            content,
            timestamp: new Date().toISOString(),
            read: false,
        };

        // 実装タスク（implementation or undefined）の場合、タスク送信前に/compactを送る
        // メンバーは入力待ち状態なので確実に実行される
        const effectiveTaskType = params.task_type ?? 'implementation';
        if (effectiveTaskType === 'implementation') {
            try {
                await sendTextToPane(to, '/compact');
                info(`Auto-compact sent to ${to} before task assignment`);
            } catch (err) {
                error(`Failed to send auto-compact to ${to}`, err);
                // compact送信失敗はタスク割り当てには影響させない
            }
        }

        // Add message to queue
        await addMessage(to, message);

        // Log activity
        await addActivity({
            role: from,
            action: 'assign_task',
            details: `Assigned task to ${to}: ${params.title}`,
        });

        info(`Task assigned from ${from} to ${to}`, { taskId, subject: params.title });

        // Add to task list with phase = 'planning' (or 'implementing' for investigation)
        const initialPhase: TaskPhase = isInvestigationTask ? 'implementing' : 'planning';
        const taskSummary: TaskSummary = {
            id: taskId,
            title: params.title,
            status: 'pending',
            assignee: to,
            priority: params.priority ?? 'medium',
            createdAt: message.timestamp,
            parentMessageId: taskId,
            // 計画モード用フィールド（調査タスクはimplementingで開始）
            phase: initialPhase,
            description: params.description,
            acceptanceCriteria: params.acceptance_criteria,
            allowedFiles: params.allowed_files,
            forbiddenFiles: params.forbidden_files,
            // 親タスクID（自動設定または明示的指定）
            parentTaskId: effectiveParentId,
            // タスク種別（デフォルト: implementation）
            taskType: params.task_type ?? 'implementation',
        };
        await addTaskToList(taskSummary);
        await recalculateDashboardTasks();

        // 親子関係を設定（effectiveParentIdが設定されている場合）
        if (effectiveParentId) {
            try {
                await linkParentChild(effectiveParentId, taskId);
                info(`Linked task ${taskId} as child of ${effectiveParentId}`);
            } catch (err) {
                error('Failed to link parent-child relationship', err);
                // 親子関係の設定失敗はタスク作成自体には影響させない
            }
        }

        // Update receiver's status
        try {
            await updateMemberStatus(to, {
                status: 'working',
                lastActivity: new Date().toISOString(),
                currentTask: {
                    id: taskId,
                    title: params.title,
                    startedAt: message.timestamp,
                },
                hasReceivedTaskThisSession: true,  // セッション中にタスクを受け取ったことを記録
            });
        } catch (err) {
            error('Failed to update receiver status', err);
        }

        // Notify the recipient via WezTerm
        let notified = false;
        try {
            notified = await notifyRole(to, `New task from ${from}`);
        } catch (err) {
            error('Failed to notify recipient', err);
        }

        // Update current_state with new task
        try {
            await updateCurrentStateWithNewTask(to, taskId, params.title, initialPhase);
        } catch (err) {
            error('Failed to update current_state', err);
            // current_state更新失敗はタスク作成には影響させない
        }

        // Update leader status to idle after successful task assignment
        try {
            await updateMemberStatus('leader', {
                status: 'idle',
                lastActivity: new Date().toISOString(),
                currentTask: undefined,
            });
        } catch (err) {
            error('Failed to update leader status to idle', err);
        }

        return {
            success: true,
            taskId,
            notified,
        };
    } catch (err) {
        error('Failed to assign task', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
            notified: false,
        };
    }
}

function formatTaskContent(taskId: string, params: AssignTaskParams, isInvestigation: boolean = false, reviewMode: 'normal' | 'strict' = 'normal'): string {
    let content = `## タスク: ${params.title}\n\n`;
    content += `**タスクID: ${taskId}**\n\n`;

    if (isInvestigation) {
        content += `**タスク種別: 調査**\n\n`;
    }

    // strictモードの場合、目立つ警告を追加
    if (reviewMode === 'strict' && !isInvestigation) {
        content += `⚠️ **【strictモード】** テストコードを先に実装し、テストレビューを受けてから実装を進めてください。\n\n`;
    }

    content += `### 詳細説明\n${params.description}\n\n`;
    content += `### 完了条件\n`;
    for (const criteria of params.acceptance_criteria) {
        content += `- [ ] ${criteria}\n`;
    }

    // 調査タスクはallowed_files/forbidden_filesを表示しない（編集禁止のため）
    if (!isInvestigation) {
        content += `\n### 変更許可ファイル\n`;
        for (const file of params.allowed_files) {
            content += `- ${file}\n`;
        }
        if (params.forbidden_files && params.forbidden_files.length > 0) {
            content += `\n### 禁止ファイル（触るな）\n`;
            for (const file of params.forbidden_files) {
                content += `- ${file}\n`;
            }
        }
    }

    content += `\n---\n`;

    if (isInvestigation) {
        content += `**重要**: これは調査タスクです。計画提出（submit_plan）は不要です。調査完了後、\`send_task(type='report')\` で結果を報告してください。\n`;
        content += `**注意**: ファイルの編集は禁止です。読み取りのみ許可されています。`;
    } else if (reviewMode === 'strict') {
        content += `**重要**: 実装前に必ず \`submit_plan\` で計画を提出してください。\n`;
        content += `**strictモード手順**: 計画承認後 → テストコード実装 → テストレビュー依頼 → テスト承認後 → 実装コード作成`;
    } else {
        content += `**重要**: 実装前に必ず \`submit_plan\` で計画を提出してください。承認後に実装を開始してください。`;
    }
    return content;
}

/**
 * current_stateに新しいタスク情報を追加する
 * 既存の他メンバーのタスク情報は保持する
 */
async function updateCurrentStateWithNewTask(
    assignee: string,
    taskId: string,
    title: string,
    phase: string
): Promise<void> {
    const context = await getProjectContext();
    const currentState = context.currentState || '';
    const now = new Date().toISOString();

    // 既存のメンバーセクションをパース
    const memberSections = parseCurrentStateSections(currentState);

    // 新しいタスク情報を作成
    memberSections[assignee] = {
        taskId,
        title,
        phase,
        startTime: now,
    };

    // Markdownを再生成
    const newContent = generateCurrentStateMarkdown(memberSections, now);

    // current_stateを更新
    await updateProjectContext('current_state', newContent, false);
    info(`Updated current_state with task ${taskId} for ${assignee}`);
}

export function formatAssignTaskResult(result: AssignTaskResult): string {
    if (!result.success) {
        return `❌ タスク割り当てに失敗しました: ${result.error}`;
    }

    let output = `✅ タスクを割り当てました。\n`;
    output += `Task ID: ${result.taskId}\n`;
    output += `Phase: planning（計画待ち）\n`;
    output += result.notified
        ? `📢 受信者に通知しました。`
        : `⚠️ 受信者への通知に失敗しました。`;

    return output;
}
