import { Role } from '../types/task.js';
import { Message } from '../types/message.js';
import { addMessage, generateMessageId, addActivity, updateTaskInList, updateMemberStatus } from '../utils/queue.js';
import { notifyRole } from '../utils/wezterm.js';
import { getCurrentRole, validateLeaderOnly } from '../utils/permission.js';
import { validateRequiredString } from '../utils/validation.js';
import { info, error } from '../utils/logger.js';
import { getTaskWithValidation } from '../utils/task-manager.js';

export interface RejectPlanParams {
    task_id: string;           // 対象タスクID
    reason: string;            // 却下理由（必須）
    feedback: string;          // 修正指示（必須）
}

export interface RejectPlanResult {
    success: boolean;
    error?: string;
    notified: boolean;
}

export async function rejectPlan(params: RejectPlanParams): Promise<RejectPlanResult> {
    const from = getCurrentRole();

    // Validate that caller is leader
    const leaderCheck = validateLeaderOnly(from, 'reject_plan');
    if (!leaderCheck.allowed) {
        return { success: false, error: leaderCheck.reason, notified: false };
    }

    // Validate required fields
    for (const [field, value] of [['task_id', params.task_id], ['reason', params.reason], ['feedback', params.feedback]] as const) {
        const check = validateRequiredString(value, field);
        if (!check.valid) {
            return { success: false, error: check.error, notified: false };
        }
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

        // Add rejection to history
        // Note: task.plan is guaranteed to exist by requirePlan: true validation
        const rejectionEntry = {
            reason: params.reason,
            feedback: params.feedback,
            rejectedAt: new Date().toISOString(),
        };

        const updatedPlan = {
            ...task.plan!,
            rejectionHistory: [
                ...(task.plan!.rejectionHistory || []),
                rejectionEntry,
            ],
        };

        // Update task: change phase back to 'planning'
        await updateTaskInList(params.task_id, {
            phase: 'planning',
            plan: updatedPlan,
        });

        // Send notification to assignee
        const assignee = task.assignee;
        const messageContent = formatRejectionContent(task.title, params.reason, params.feedback, task.plan!);
        const messageId = generateMessageId();
        const message: Message = {
            id: messageId,
            type: 'task',
            from: 'leader',
            to: assignee,
            subject: `計画却下: ${task.title}`,
            content: messageContent,
            timestamp: new Date().toISOString(),
            read: false,
        };

        await addMessage(assignee, message);

        // Log activity
        await addActivity({
            role: 'leader',
            action: 'reject_plan',
            details: `Rejected plan for task: ${task.title}. Reason: ${params.reason}`,
        });

        info(`Plan rejected by leader`, { taskId: params.task_id, assignee, reason: params.reason });

        // Update member status to working (they need to revise the plan)
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
            notified = await notifyRole(assignee, `Plan rejected - revision needed`);
        } catch (err) {
            error('Failed to notify assignee', err);
        }

        // Update leader status to idle after completing rejection
        try {
            await updateMemberStatus('leader', {
                status: 'idle',
                lastActivity: new Date().toISOString(),
                currentTask: undefined,
            });
            info('Leader status updated to idle after plan rejection');
        } catch (err) {
            error('Failed to update leader status to idle', err);
        }

        return {
            success: true,
            notified,
        };
    } catch (err) {
        error('Failed to reject plan', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
            notified: false,
        };
    }
}

function formatRejectionContent(taskTitle: string, reason: string, feedback: string, plan: any): string {
    let content = `## 計画が却下されました: ${taskTitle}\n\n`;
    content += `❌ あなたの計画は修正が必要です。\n\n`;

    content += `### 却下理由\n${reason}\n\n`;
    content += `### 修正指示\n${feedback}\n\n`;

    content += `### 提出した計画（参考）\n`;
    content += `**タスクの理解**: ${plan.summary}\n\n`;
    content += `**実装方針**: ${plan.approach}\n\n`;

    if (plan.filesToChange.length > 0) {
        content += `**変更予定ファイル**:\n`;
        for (const file of plan.filesToChange) {
            content += `- ${file}\n`;
        }
    }

    if (plan.filesToCreate.length > 0) {
        content += `**新規作成ファイル**:\n`;
        for (const file of plan.filesToCreate) {
            content += `- ${file}\n`;
        }
    }

    content += `\n---\n`;
    content += `修正した計画を \`submit_plan\` で再提出してください。`;

    return content;
}

export function formatRejectPlanResult(result: RejectPlanResult): string {
    if (!result.success) {
        return `❌ 計画却下に失敗しました: ${result.error}`;
    }

    let output = `✅ 計画を却下しました。\n`;
    output += `Phase: planning（計画修正中）\n`;
    output += result.notified
        ? `📢 memberに通知しました。`
        : `⚠️ memberへの通知に失敗しました。`;

    return output;
}
