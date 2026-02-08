import { TaskPhase } from '../types/task.js';
import { Message } from '../types/message.js';
import { addMessage, generateId, addActivity, getDashboard, updateTaskInList } from '../utils/queue.js';
import { notifyRole } from '../utils/wezterm.js';
import { getCurrentRole, validateMemberOnly } from '../utils/permission.js';
import { validateRequiredString, validateRequiredArray } from '../utils/validation.js';
import { info, error } from '../utils/logger.js';

export interface SubmitTestParams {
    task_id: string;
    test_files: string[];
    test_summary: string;
}

export interface SubmitTestResult {
    success: boolean;
    taskId?: string;
    phase?: TaskPhase;
    error?: string;
}

export async function submitTest(params: SubmitTestParams): Promise<SubmitTestResult> {
    const from = getCurrentRole();

    // memberのみ使用可能
    const memberCheck = validateMemberOnly(from, 'submit_test');
    if (!memberCheck.allowed) {
        return { success: false, error: memberCheck.reason };
    }

    // バリデーション
    const taskIdCheck = validateRequiredString(params.task_id, 'task_id');
    if (!taskIdCheck.valid) {
        return { success: false, error: taskIdCheck.error };
    }

    const testFilesCheck = validateRequiredArray(params.test_files, 'test_files');
    if (!testFilesCheck.valid) {
        return { success: false, error: testFilesCheck.error };
    }

    const testSummaryCheck = validateRequiredString(params.test_summary, 'test_summary');
    if (!testSummaryCheck.valid) {
        return { success: false, error: testSummaryCheck.error };
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

        if (task.assignee !== from) {
            return {
                success: false,
                error: `このタスクはあなたに割り当てられていません。担当者: ${task.assignee}`,
            };
        }

        // フェーズをtest_reviewに変更
        await updateTaskInList(params.task_id, {
            phase: 'test_review' as TaskPhase,
        });

        // leaderにメッセージを送信
        const messageId = await generateId();
        const message: Message = {
            id: messageId,
            type: 'notification',
            from: from as any,
            to: 'leader',
            subject: `テスト提出: ${task.title}`,
            content: formatTestSubmission(params, task.title),
            timestamp: new Date().toISOString(),
            read: false,
        };

        await addMessage('leader', message);

        // アクティビティログ
        await addActivity({
            role: from,
            action: 'submit_test',
            details: `Submitted test for ${params.task_id}: ${params.test_files.length} files`,
        });

        info(`Test submitted for task ${params.task_id}`, { from, testFiles: params.test_files });

        // leaderに通知
        try {
            await notifyRole('leader', `Test submitted from ${from}`);
        } catch (err) {
            error('Failed to notify leader', err);
        }

        return {
            success: true,
            taskId: params.task_id,
            phase: 'test_review',
        };
    } catch (err) {
        error('Failed to submit test', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

function formatTestSubmission(params: SubmitTestParams, taskTitle: string): string {
    let content = `## テスト提出: ${taskTitle}\n\n`;
    content += `**タスクID**: ${params.task_id}\n\n`;
    content += `### テスト概要\n${params.test_summary}\n\n`;
    content += `### テストファイル\n`;
    for (const file of params.test_files) {
        content += `- ${file}\n`;
    }
    content += `\n---\n`;
    content += `テストをレビューして \`approve_test\` で承認してください。`;
    return content;
}

export function formatSubmitTestResult(result: SubmitTestResult): string {
    if (!result.success) {
        return `❌ テスト提出に失敗しました: ${result.error}`;
    }

    let output = `✅ テストを提出しました。\n`;
    output += `Task ID: ${result.taskId}\n`;
    output += `Phase: ${result.phase}（テストレビュー待ち）\n`;
    output += `📢 leaderに通知しました。\n\n`;
    output += `**重要**: leaderからの承認が下りるまで実装を開始しないでください。`;

    return output;
}
