import { updateApprovalStatus, addActivity } from '../utils/queue.js';
import { getCurrentRole, validateProcessApprovalPermission } from '../utils/permission.js';
import { info, error, warn } from '../utils/logger.js';
import { validateRequiredString, validateEnumValue } from '../utils/validation.js';
import type { ApprovalRequest } from '../types/task.js';
import { assignTaskCore } from './assign-task.js';
import { sendTask } from './send-task.js';
import { addMember, removeMember } from '../utils/team-session.js';

export interface ProcessApprovalParams {
    approval_id: string;
    action: 'approve' | 'reject';
    comments?: string;
}

export interface ProcessApprovalResult {
    success: boolean;
    approvalId?: string;
    status?: 'approved' | 'rejected';
    error?: string;
}

export async function processApproval(params: ProcessApprovalParams): Promise<ProcessApprovalResult> {
    const role = getCurrentRole();

    // Validate permission
    const permission = validateProcessApprovalPermission(role);
    if (!permission.allowed) {
        return {
            success: false,
            error: permission.reason,
        };
    }

    // Validate inputs
    const idCheck = validateRequiredString(params.approval_id, 'approval_id');
    if (!idCheck.valid) return { success: false, error: idCheck.error };

    const actionCheck = validateEnumValue(params.action, ['approve', 'reject'], 'action');
    if (!actionCheck.valid) return { success: false, error: actionCheck.error };

    try {
        // Convert action to status
        const status: 'approved' | 'rejected' = params.action === 'approve' ? 'approved' : 'rejected';

        const updatedRequest = await updateApprovalStatus(
            params.approval_id,
            status,
            params.comments
        );

        if (!updatedRequest) {
            return {
                success: false,
                error: `Approval request not found: ${params.approval_id}`,
            };
        }

        // Log activity
        await addActivity({
            role,
            action: 'process_approval',
            details: `${status} approval: ${updatedRequest.title}`,
        });

        info(`Approval processed by ${role}`, { approvalId: params.approval_id, status });

        // Handle member_increase approval - call addMember
        if (updatedRequest.type === 'member_increase' && status === 'approved') {
            await handleMemberIncreaseApproval(updatedRequest);
        }

        // Handle member_decrease approval - call removeMember
        if (updatedRequest.type === 'member_decrease' && status === 'approved') {
            await handleMemberDecreaseApproval(updatedRequest);
        }

        // Handle task_split approval - distribute subtasks via assignTask
        if (updatedRequest.type === 'task_split' && status === 'approved') {
            await handleTaskSplitApproval(updatedRequest);
        }

        // Handle task_split rejection - notify leader
        if (updatedRequest.type === 'task_split' && status === 'rejected') {
            await handleTaskSplitRejection(updatedRequest);
        }

        return {
            success: true,
            approvalId: params.approval_id,
            status,
        };
    } catch (err) {
        error('Failed to process approval', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export function formatProcessApprovalResult(result: ProcessApprovalResult): string {
    if (!result.success) {
        return `❌ 承認処理に失敗しました: ${result.error}`;
    }

    const statusEmoji = result.status === 'approved' ? '✅' : '❌';
    const statusText = result.status === 'approved' ? '承認' : '却下';

    let output = `${statusEmoji} 承認依頼を${statusText}しました。\n\n`;
    output += `ID: ${result.approvalId}\n`;
    output += `ステータス: ${result.status}`;

    return output;
}

interface MemberIncreaseMetadata {
    currentCount: number;
    requestedCount: number;
    newTotal: number;
}

interface MemberDecreaseMetadata {
    currentCount: number;
    requestedCount: number;
    newTotal: number;
}

interface TaskSplitSubtask {
    title: string;
    description: string;
    acceptance_criteria: string[];
    allowed_files: string[];
    to?: string;
}

interface TaskSplitMetadata {
    parentTaskId: string;
    subtasks: TaskSplitSubtask[];
}

async function handleMemberIncreaseApproval(approval: ApprovalRequest): Promise<void> {
    const projectPath = process.env.DEV_TEAM_PROJECT_PATH;

    if (!projectPath) {
        warn('DEV_TEAM_PROJECT_PATH not set, skipping addMember');
        return;
    }

    const metadata = approval.metadata as MemberIncreaseMetadata | undefined;

    if (!metadata || metadata.requestedCount == null || metadata.requestedCount <= 0) {
        warn('Invalid metadata for member_increase approval', { metadata });
        return;
    }

    info('Adding members', { projectPath, count: metadata.requestedCount });

    try {
        const result = await addMember({
            projectPath,
            count: metadata.requestedCount,
        });

        info('Members added successfully', {
            addedRoles: result.addedRoles,
            previousCount: result.previousCount,
            newCount: result.newCount,
        });
    } catch (err) {
        // Log error but don't fail the approval process
        warn('Failed to add members', {
            error: err instanceof Error ? err.message : 'Unknown error',
        });
    }
}

async function handleMemberDecreaseApproval(approval: ApprovalRequest): Promise<void> {
    const projectPath = process.env.DEV_TEAM_PROJECT_PATH;

    if (!projectPath) {
        warn('DEV_TEAM_PROJECT_PATH not set, skipping removeMember');
        return;
    }

    const metadata = approval.metadata as MemberDecreaseMetadata | undefined;

    if (!metadata || metadata.requestedCount == null || metadata.requestedCount <= 0) {
        warn('Invalid metadata for member_decrease approval', { metadata });
        return;
    }

    info('Removing members', { projectPath, count: metadata.requestedCount });

    try {
        const result = await removeMember(projectPath, {
            count: metadata.requestedCount,
        });

        info('Members removed successfully', {
            removedRoles: result.removedRoles,
            previousCount: result.previousCount,
            newCount: result.newCount,
        });
    } catch (err) {
        warn('Failed to remove members', {
            error: err instanceof Error ? err.message : 'Unknown error',
        });
    }
}

async function handleTaskSplitApproval(approval: ApprovalRequest): Promise<void> {
    const metadata = approval.metadata as TaskSplitMetadata | undefined;

    if (!metadata || !metadata.subtasks || !Array.isArray(metadata.subtasks) || metadata.subtasks.length === 0) {
        warn('Invalid metadata for task_split approval', { metadata });
        return;
    }

    const parentTaskId = metadata.parentTaskId;
    const subtasks = metadata.subtasks;

    let successCount = 0;
    let failureCount = 0;

    info('Processing task_split approval', { parentTaskId, subtaskCount: subtasks.length });

    for (const subtask of subtasks) {
        try {
            // assignTaskCore を使用（権限チェックをバイパス）
            // PMがprocess_approvalを呼んでいるため、通常のassignTaskは権限エラーになる
            const result = await assignTaskCore({
                to: subtask.to || 'member-01',  // デフォルトはmember-01
                title: subtask.title,
                description: subtask.description,
                acceptance_criteria: subtask.acceptance_criteria,
                allowed_files: subtask.allowed_files,
                parent_task_id: parentTaskId,
            }, 'leader');  // leaderとして実行

            if (result.success) {
                successCount++;
                info(`Subtask assigned: ${subtask.title}`, { taskId: result.taskId });
            } else {
                failureCount++;
                warn(`Failed to assign subtask: ${subtask.title}`, { error: result.error });
            }
        } catch (err) {
            failureCount++;
            warn('Exception while assigning subtask', {
                title: subtask.title,
                error: err instanceof Error ? err.message : 'Unknown error',
            });
        }
    }

    // leaderに完了通知を送信
    try {
        await sendTask({
            to: 'leader',
            type: 'notification',
            subject: `タスク分割完了: ${approval.title}`,
            content: `## タスク分割が完了しました

親タスクID: ${parentTaskId}

### 結果
- 成功: ${successCount}件
- 失敗: ${failureCount}件
- 合計: ${subtasks.length}件

${failureCount > 0 ? '⚠️ 一部のタスク配信に失敗しました。ログを確認してください。' : '✅ すべてのタスクが正常に配信されました。'}`,
        });
    } catch (err) {
        warn('Failed to send task_split completion notification to leader', {
            error: err instanceof Error ? err.message : 'Unknown error',
        });
    }
}

async function handleTaskSplitRejection(approval: ApprovalRequest): Promise<void> {
    const metadata = approval.metadata as TaskSplitMetadata | undefined;
    const parentTaskId = metadata?.parentTaskId || '(不明)';
    const comments = approval.comments || '理由なし';

    info('Processing task_split rejection', { parentTaskId, comments });

    // leaderに却下通知を送信
    try {
        await sendTask({
            to: 'leader',
            type: 'notification',
            subject: `タスク分割却下: ${approval.title}`,
            content: `## タスク分割が却下されました

親タスクID: ${parentTaskId}

### 却下理由
${comments}

### 次のアクション
タスクの分割方法を見直して、再度distribute_tasksを実行してください。`,
        });
    } catch (err) {
        warn('Failed to send task_split rejection notification to leader', {
            error: err instanceof Error ? err.message : 'Unknown error',
        });
    }
}
