import { TaskPhase } from '../types/task.js';
import { Message } from '../types/message.js';
import { addMessage, generateMessageId, addActivity, getDashboard, updateTaskInList, updateMemberStatus } from '../utils/queue.js';
import { notifyRole } from '../utils/wezterm.js';
import { getCurrentRole, validateLeaderOnly } from '../utils/permission.js';
import { validateRequiredString } from '../utils/validation.js';
import { info, error } from '../utils/logger.js';

export interface ApproveTestParams {
    task_id: string;
    comments?: string;
}

export interface ApproveTestResult {
    success: boolean;
    taskId?: string;
    phase?: TaskPhase;
    assignee?: string;
    error?: string;
}

export async function approveTest(params: ApproveTestParams): Promise<ApproveTestResult> {
    const from = getCurrentRole();

    // leaderのみ使用可能
    const leaderCheck = validateLeaderOnly(from, 'approve_test');
    if (!leaderCheck.allowed) {
        return { success: false, error: leaderCheck.reason };
    }

    // バリデーション
    const taskIdCheck = validateRequiredString(params.task_id, 'task_id');
    if (!taskIdCheck.valid) {
        return { success: false, error: taskIdCheck.error };
    }

    try {
        // タスクを取得して確認
        const dashboard = await getDashboard();
        const task = dashboard.taskList.find(t => t.id === params.task_id);

        if (!task) {
            return {
                success: false,
                error: `タスクが見つかりません: ${params.task_id}`,
            };
        }

        if (task.phase !== 'test_review') {
            return {
                success: false,
                error: `タスクはテストレビュー待ちではありません。現在のフェーズ: ${task.phase}`,
            };
        }

        // フェーズをimplementingに変更し、statusとstartedAtを設定
        await updateTaskInList(params.task_id, {
            phase: 'implementing' as TaskPhase,
            status: 'in_progress',
            startedAt: new Date().toISOString(),
        });

        // memberにメッセージを送信
        const messageId = generateMessageId();
        const message: Message = {
            id: messageId,
            type: 'notification',
            from: 'leader',
            to: task.assignee,
            subject: `テスト承認: ${task.title}`,
            content: formatTestApproval(params, task.title),
            timestamp: new Date().toISOString(),
            read: false,
        };

        await addMessage(task.assignee, message);

        // アクティビティログ
        await addActivity({
            role: from,
            action: 'approve_test',
            details: `Approved test for ${params.task_id}`,
        });

        info(`Test approved for task ${params.task_id}`, { assignee: task.assignee });

        // memberに通知
        try {
            await notifyRole(task.assignee, `Test approved by ${from}`);
        } catch (err) {
            error('Failed to notify member', err);
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
            taskId: params.task_id,
            phase: 'implementing',
            assignee: task.assignee,
        };
    } catch (err) {
        error('Failed to approve test', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

function formatTestApproval(params: ApproveTestParams, taskTitle: string): string {
    let content = `## テスト承認: ${taskTitle}\n\n`;
    content += `✅ テストが承認されました。実装を開始してください。\n\n`;

    if (params.comments) {
        content += `### leaderからのコメント\n${params.comments}\n\n`;
    }

    content += `---\n`;
    content += `実装が完了したら \`send_task(type='report')\` で完了報告を送ってください。`;
    return content;
}

export function formatApproveTestResult(result: ApproveTestResult): string {
    if (!result.success) {
        return `❌ テスト承認に失敗しました: ${result.error}`;
    }

    let output = `✅ テストを承認しました。\n`;
    output += `Task ID: ${result.taskId}\n`;
    output += `Phase: ${result.phase}（実装中）\n`;
    output += `📢 ${result.assignee}に通知しました。`;

    return output;
}
