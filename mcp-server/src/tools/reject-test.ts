import { Message } from '../types/message.js';
import { addMessage, generateMessageId, addActivity, updateTaskInList, updateMemberStatus } from '../utils/queue.js';
import { notifyRole } from '../utils/wezterm.js';
import { getCurrentRole, validateLeaderOnly } from '../utils/permission.js';
import { validateRequiredString } from '../utils/validation.js';
import { info, error } from '../utils/logger.js';
import { getTaskWithValidation } from '../utils/task-manager.js';

export interface RejectTestParams {
    task_id: string;           // 対象タスクID
    reason: string;            // 却下理由（必須）
    feedback: string;          // 修正指示（必須）
}

export interface RejectTestResult {
    success: boolean;
    error?: string;
    notified: boolean;
}

export async function rejectTest(params: RejectTestParams): Promise<RejectTestResult> {
    const from = getCurrentRole();

    // Validate that caller is leader
    const leaderCheck = validateLeaderOnly(from, 'reject_test');
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
            expectedPhase: 'test_review',
        });

        if (validationError || !task) {
            return {
                success: false,
                error: validationError || 'タスクの取得に失敗しました',
                notified: false,
            };
        }

        // Update task: change phase back to 'planning'
        await updateTaskInList(params.task_id, {
            phase: 'planning',
        });

        // Send notification to assignee
        const assignee = task.assignee;
        const messageContent = formatRejectionContent(task.title, params.reason, params.feedback);
        const messageId = generateMessageId();
        const message: Message = {
            id: messageId,
            type: 'notification',
            from: 'leader',
            to: assignee,
            subject: `テスト却下: ${task.title}`,
            content: messageContent,
            timestamp: new Date().toISOString(),
            read: false,
        };

        await addMessage(assignee, message);

        // Log activity
        await addActivity({
            role: 'leader',
            action: 'reject_test',
            details: `Rejected test for task: ${task.title}. Reason: ${params.reason}`,
        });

        info(`Test rejected by leader`, { taskId: params.task_id, assignee, reason: params.reason });

        // Update member status to working (they need to revise the test)
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
            notified = await notifyRole(assignee, `Test rejected - revision needed`);
        } catch (err) {
            error('Failed to notify assignee', err);
        }

        // leaderのステータスをidleに戻す
        try {
            await updateMemberStatus('leader', {
                status: 'idle',
                lastActivity: new Date().toISOString(),
                currentTask: undefined,
            });
        } catch (err) {
            error('Failed to update leader status', err);
        }

        return {
            success: true,
            notified,
        };
    } catch (err) {
        error('Failed to reject test', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
            notified: false,
        };
    }
}

function formatRejectionContent(taskTitle: string, reason: string, feedback: string): string {
    let content = `## テストが却下されました: ${taskTitle}\n\n`;
    content += `❌ あなたのテストは修正が必要です。\n\n`;

    content += `### 却下理由\n${reason}\n\n`;
    content += `### 修正指示\n${feedback}\n\n`;

    content += `---\n`;
    content += `修正したテストを再度提出してください（\`submit_test\` または \`send_task(type='question')\` でテストレビュー依頼）。`;

    return content;
}

export function formatRejectTestResult(result: RejectTestResult): string {
    if (!result.success) {
        return `❌ テスト却下に失敗しました: ${result.error}`;
    }

    let output = `✅ テストを却下しました。\n`;
    output += `Phase: planning（テスト修正中）\n`;
    output += result.notified
        ? `📢 memberに通知しました。`
        : `⚠️ memberへの通知に失敗しました。`;

    return output;
}
