import { TaskPriority, TaskType } from '../types/task.js';
import { getCurrentRole, validateLeaderOnly } from '../utils/permission.js';
import { validateRequiredString, validateRequiredArray } from '../utils/validation.js';
import { getDashboard, addApprovalRequest } from '../utils/queue.js';
import { getTaskSplitApproval } from '../utils/memory.js';
import { assignTask, AssignTaskResult } from './assign-task.js';
import { requestMemberIncrease } from './request-member-increase.js';
import { info, error } from '../utils/logger.js';

export interface SubtaskInput {
    title: string;
    description: string;
    acceptance_criteria: string[];
    allowed_files: string[];
    to?: string;  // 省略時は空きメンバーに自動割り当て
    priority?: TaskPriority;
    task_type?: TaskType;
}

export interface DistributeTasksParams {
    parent_task_id: string;
    subtasks: SubtaskInput[];
}

export interface SubtaskResult {
    title: string;
    taskId?: string;
    to?: string;
    success: boolean;
    error?: string;
}

export interface DistributeTasksResult {
    success: boolean;
    results: SubtaskResult[];
    successCount: number;
    failureCount: number;
    error?: string;
    // メンバー不足時の情報
    needsMemberIncrease?: boolean;
    memberIncreaseRequested?: number;
    pendingSubtasks?: SubtaskInput[];
    // タスク分割承認待ち時の情報
    awaitingApproval?: boolean;
    approvalId?: string;
}

/**
 * 空きメンバー（status: idle）を取得
 */
async function getIdleMembers(): Promise<string[]> {
    const dashboard = await getDashboard();
    const idleMembers: string[] = [];
    for (const [member, status] of Object.entries(dashboard.memberStatus)) {
        if (member.startsWith('member-') && status.status === 'idle') {
            idleMembers.push(member);
        }
    }
    return idleMembers;
}

export async function distributeTasks(params: DistributeTasksParams): Promise<DistributeTasksResult> {
    const from = getCurrentRole();

    // Validate that caller is leader
    const leaderCheck = validateLeaderOnly(from, 'distribute_tasks');
    if (!leaderCheck.allowed) {
        return { success: false, results: [], successCount: 0, failureCount: 0, error: leaderCheck.reason };
    }

    // Validate parent_task_id
    const parentIdCheck = validateRequiredString(params.parent_task_id, 'parent_task_id');
    if (!parentIdCheck.valid) {
        return { success: false, results: [], successCount: 0, failureCount: 0, error: parentIdCheck.error };
    }

    // Validate subtasks
    const subtasksCheck = validateRequiredArray(params.subtasks, 'subtasks');
    if (!subtasksCheck.valid) {
        return { success: false, results: [], successCount: 0, failureCount: 0, error: subtasksCheck.error };
    }

    info(`Distributing ${params.subtasks.length} subtasks for parent ${params.parent_task_id}`);

    // タスク分割承認チェック
    const taskSplitApproval = await getTaskSplitApproval();
    if (taskSplitApproval === 'required') {
        info('Task split approval is enabled, creating approval request');

        // 親タスクのタイトルを取得（parent_task_idから）
        const parentTaskTitle = params.parent_task_id;

        // 承認リクエストを生成
        const approvalRequest = await addApprovalRequest({
            title: `タスク分割承認: ${parentTaskTitle}`,
            description: formatSplitApprovalDescription(params.subtasks),
            requestedBy: 'leader',
            type: 'task_split',
            metadata: {
                parentTaskId: params.parent_task_id,
                subtasks: params.subtasks,
            },
        });

        info(`Approval request created: ${approvalRequest.id}`);

        // 承認待ちとして返却（タスク配信はしない）
        return {
            success: true,
            results: [],
            successCount: 0,
            failureCount: 0,
            awaitingApproval: true,
            approvalId: approvalRequest.id,
        };
    }

    // toが未指定のサブタスクをカウント
    const subtasksNeedingAssignment = params.subtasks.filter(s => !s.to);
    const subtasksWithAssignment = params.subtasks.filter(s => s.to);

    // 空きメンバーを取得
    let idleMembers: string[] = [];
    try {
        idleMembers = await getIdleMembers();
        info(`Found ${idleMembers.length} idle members: ${idleMembers.join(', ')}`);
    } catch (err) {
        error('Failed to get idle members', err);
    }

    // メンバー不足チェック
    if (subtasksNeedingAssignment.length > idleMembers.length) {
        const shortage = subtasksNeedingAssignment.length - idleMembers.length;
        info(`Member shortage detected: need ${subtasksNeedingAssignment.length}, have ${idleMembers.length}, shortage ${shortage}`);

        // 増員リクエストを自動で送信
        try {
            const increaseResult = await requestMemberIncrease({
                count: Math.min(shortage, 4),  // 最大4名まで
                reason: `タスク分配のため${shortage}名の増員が必要です（割り当て待ちタスク: ${subtasksNeedingAssignment.length}件）`,
            });

            if (increaseResult.success) {
                info(`Member increase requested: ${shortage} members`);
                return {
                    success: false,
                    results: [],
                    successCount: 0,
                    failureCount: 0,
                    needsMemberIncrease: true,
                    memberIncreaseRequested: Math.min(shortage, 4),
                    pendingSubtasks: subtasksNeedingAssignment,
                };
            } else {
                error('Failed to request member increase', increaseResult.error);
            }
        } catch (err) {
            error('Exception requesting member increase', err);
        }

        // 増員リクエストに失敗した場合でも、割り当て可能なタスクは処理する
    }

    // 自動割り当て: ラウンドロビンでtoを設定
    let memberIndex = 0;
    const subtasksToProcess = params.subtasks.map(subtask => {
        if (!subtask.to && idleMembers.length > 0) {
            const assignedTo = idleMembers[memberIndex % idleMembers.length];
            memberIndex++;
            return { ...subtask, to: assignedTo };
        }
        return subtask;
    });

    const results: SubtaskResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const subtask of subtasksToProcess) {
        // Check if 'to' is specified (after auto-assignment)
        if (!subtask.to) {
            results.push({
                title: subtask.title,
                success: false,
                error: '割り当て先(to)が指定されておらず、空きメンバーもいません。',
            });
            failureCount++;
            continue;
        }

        // Validate required fields
        if (!subtask.title || !subtask.description) {
            results.push({
                title: subtask.title || '(無題)',
                success: false,
                error: 'title と description は必須です',
            });
            failureCount++;
            continue;
        }

        const criteriaCheck = validateRequiredArray(subtask.acceptance_criteria, 'acceptance_criteria');
        if (!criteriaCheck.valid) {
            results.push({ title: subtask.title, success: false, error: criteriaCheck.error });
            failureCount++;
            continue;
        }

        const filesCheck = validateRequiredArray(subtask.allowed_files, 'allowed_files');
        if (!filesCheck.valid) {
            results.push({ title: subtask.title, success: false, error: filesCheck.error });
            failureCount++;
            continue;
        }

        try {
            // Call assignTask for each subtask
            const assignResult: AssignTaskResult = await assignTask({
                to: subtask.to,
                title: subtask.title,
                description: subtask.description,
                acceptance_criteria: subtask.acceptance_criteria,
                allowed_files: subtask.allowed_files,
                priority: subtask.priority,
                parent_task_id: params.parent_task_id,
                task_type: subtask.task_type,
            });

            if (assignResult.success) {
                results.push({
                    title: subtask.title,
                    taskId: assignResult.taskId,
                    to: subtask.to,
                    success: true,
                });
                successCount++;
                info(`Subtask assigned: ${subtask.title} -> ${subtask.to} (${assignResult.taskId})`);
            } else {
                results.push({
                    title: subtask.title,
                    to: subtask.to,
                    success: false,
                    error: assignResult.error,
                });
                failureCount++;
                error(`Failed to assign subtask: ${subtask.title}`, assignResult.error);
            }
        } catch (err) {
            results.push({
                title: subtask.title,
                to: subtask.to,
                success: false,
                error: err instanceof Error ? err.message : 'Unknown error',
            });
            failureCount++;
            error(`Exception assigning subtask: ${subtask.title}`, err);
        }
    }

    const overallSuccess = failureCount === 0;

    info(`Distribution complete: ${successCount} success, ${failureCount} failure`);

    return {
        success: overallSuccess,
        results,
        successCount,
        failureCount,
    };
}

export function formatDistributeTasksResult(result: DistributeTasksResult): string {
    if (result.error) {
        return `❌ タスク分配に失敗しました: ${result.error}`;
    }

    // 承認待ちの場合
    if (result.awaitingApproval) {
        let output = `⏳ タスク分割の承認待ちです。\n\n`;
        output += `**承認リクエストID**: ${result.approvalId}\n\n`;
        output += `ユーザーの承認後、タスクが配信されます。`;
        return output;
    }

    // メンバー不足で増員リクエストした場合
    if (result.needsMemberIncrease) {
        let output = `⏳ メンバー不足のため増員をリクエストしました。\n\n`;
        output += `**リクエスト増員数**: ${result.memberIncreaseRequested}名\n`;
        output += `**割り当て待ちタスク**: ${result.pendingSubtasks?.length ?? 0}件\n\n`;

        if (result.pendingSubtasks && result.pendingSubtasks.length > 0) {
            output += `### 割り当て待ちタスク一覧\n`;
            for (const subtask of result.pendingSubtasks) {
                output += `- ${subtask.title}\n`;
            }
            output += `\n`;
        }

        output += `増員が承認されたら、再度distribute_tasksを実行してください。`;
        return output;
    }

    let output = '';

    if (result.success) {
        output += `✅ 全${result.successCount}件のタスクを分配しました。\n\n`;
    } else {
        output += `⚠️ タスク分配が部分的に失敗しました。\n`;
        output += `成功: ${result.successCount}件 / 失敗: ${result.failureCount}件\n\n`;
    }

    output += `### 結果一覧\n`;

    for (const r of result.results) {
        if (r.success) {
            output += `- ✅ **${r.title}** → ${r.to} (ID: ${r.taskId})\n`;
        } else {
            output += `- ❌ **${r.title}**: ${r.error}\n`;
        }
    }

    return output;
}

/**
 * タスク分割承認リクエストの説明文を整形
 */
export function formatSplitApprovalDescription(subtasks: SubtaskInput[]): string {
    let output = `## タスク分割案\n\n`;
    output += `**サブタスク数**: ${subtasks.length}件\n\n`;

    if (subtasks.length === 0) {
        output += `（サブタスクなし）\n`;
        return output;
    }

    output += `### サブタスク一覧\n\n`;

    for (let i = 0; i < subtasks.length; i++) {
        const subtask = subtasks[i];
        output += `#### ${i + 1}. ${subtask.title}\n`;
        output += `- **説明**: ${subtask.description}\n`;
        output += `- **担当**: ${subtask.to ?? '（自動割り当て）'}\n`;
        output += `- **完了条件**: ${subtask.acceptance_criteria.join(', ')}\n`;
        output += `- **変更ファイル**: ${subtask.allowed_files.join(', ')}\n`;
        output += `\n`;
    }

    return output;
}
