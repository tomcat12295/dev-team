import { Role, TaskPlan } from '../types/task.js';
import { Message } from '../types/message.js';
import { addMessage, generateMessageId, addActivity, updateTaskInList } from '../utils/queue.js';
import { notifyRole } from '../utils/wezterm.js';
import { getCurrentRole, validateMemberOnly } from '../utils/permission.js';
import { validateRequiredString } from '../utils/validation.js';
import { info, error } from '../utils/logger.js';
import { getTaskWithValidation } from '../utils/task-manager.js';

export interface SubmitPlanParams {
    task_id: string;           // 対象タスクID
    summary: string;           // タスクの理解
    approach: string;          // 実装方針
    files_to_change: string[]; // 変更予定ファイル
    files_to_create: string[]; // 新規作成ファイル
    test_plan: string;         // テスト計画
}

export interface SubmitPlanResult {
    success: boolean;
    error?: string;
    notified: boolean;
}

export async function submitPlan(params: SubmitPlanParams): Promise<SubmitPlanResult> {
    const from = getCurrentRole();

    // Validate that caller is a member
    const memberCheck = validateMemberOnly(from, 'submit_plan');
    if (!memberCheck.allowed) {
        return { success: false, error: memberCheck.reason, notified: false };
    }

    // Validate required fields
    for (const [field, value] of [['task_id', params.task_id], ['summary', params.summary], ['approach', params.approach], ['test_plan', params.test_plan]] as const) {
        const check = validateRequiredString(value, field);
        if (!check.valid) {
            return { success: false, error: check.error, notified: false };
        }
    }

    // Validate files arrays
    const filesToChange = Array.isArray(params.files_to_change) ? params.files_to_change : [];
    const filesToCreate = Array.isArray(params.files_to_create) ? params.files_to_create : [];

    if (filesToChange.length === 0 && filesToCreate.length === 0) {
        return {
            success: false,
            error: 'files_to_changeまたはfiles_to_createのいずれかは1つ以上必要です',
            notified: false,
        };
    }

    try {
        // Get and validate task (assignee check)
        const { task, error: validationError } = await getTaskWithValidation(params.task_id, {
            expectedAssignee: from as Role,
        });

        if (validationError || !task) {
            return {
                success: false,
                error: validationError || 'タスクの取得に失敗しました',
                notified: false,
            };
        }

        // Validate task is in 'planning' phase (allows undefined phase)
        if (task.phase && task.phase !== 'planning') {
            return {
                success: false,
                error: `タスクのフェーズが'planning'ではありません。現在のフェーズ: ${task.phase}`,
                notified: false,
            };
        }

        // Create plan object
        const plan: TaskPlan = {
            summary: params.summary,
            approach: params.approach,
            filesToChange,
            filesToCreate,
            testPlan: params.test_plan,
            submittedAt: new Date().toISOString(),
        };

        // Update task with plan and change phase
        await updateTaskInList(params.task_id, {
            phase: 'awaiting_approval',
            plan,
        });

        // Send notification to leader
        const messageContent = formatPlanContent(task.title, plan, task.acceptanceCriteria);
        const messageId = generateMessageId();
        const message: Message = {
            id: messageId,
            type: 'question',
            from: from as Role,
            to: 'leader',
            subject: `計画承認依頼: ${task.title}`,
            content: messageContent,
            timestamp: new Date().toISOString(),
            read: false,
        };

        await addMessage('leader', message);

        // Log activity
        await addActivity({
            role: from as Role,
            action: 'submit_plan',
            details: `Submitted plan for task: ${task.title}`,
        });

        info(`Plan submitted by ${from}`, { taskId: params.task_id });

        // Notify leader via WezTerm
        let notified = false;
        try {
            notified = await notifyRole('leader', `Plan submitted by ${from}`);
        } catch (err) {
            error('Failed to notify leader', err);
        }

        return {
            success: true,
            notified,
        };
    } catch (err) {
        error('Failed to submit plan', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
            notified: false,
        };
    }
}

function formatPlanContent(taskTitle: string, plan: TaskPlan, acceptanceCriteria?: string[]): string {
    let content = `## 計画承認依頼: ${taskTitle}\n\n`;
    content += `### タスクの理解\n${plan.summary}\n\n`;
    content += `### 実装方針\n${plan.approach}\n\n`;

    if (plan.filesToChange.length > 0) {
        content += `### 変更予定ファイル\n`;
        for (const file of plan.filesToChange) {
            content += `- ${file}\n`;
        }
        content += `\n`;
    }

    if (plan.filesToCreate.length > 0) {
        content += `### 新規作成ファイル\n`;
        for (const file of plan.filesToCreate) {
            content += `- ${file}\n`;
        }
        content += `\n`;
    }

    content += `### テスト計画\n${plan.testPlan}\n\n`;

    if (acceptanceCriteria && acceptanceCriteria.length > 0) {
        content += `### 完了条件（確認用）\n`;
        for (const criteria of acceptanceCriteria) {
            content += `- [ ] ${criteria}\n`;
        }
        content += `\n`;
    }

    content += `---\n`;
    content += `この計画でよければ \`approve_plan\` で承認してください。\n`;
    content += `問題があれば \`reject_plan\` で却下し、修正指示を出してください。`;

    return content;
}

export function formatSubmitPlanResult(result: SubmitPlanResult): string {
    if (!result.success) {
        return `❌ 計画提出に失敗しました: ${result.error}`;
    }

    let output = `✅ 計画を提出しました。\n`;
    output += `Phase: awaiting_approval（承認待ち）\n`;
    output += result.notified
        ? `📢 leaderに通知しました。`
        : `⚠️ leaderへの通知に失敗しました。`;
    output += `\n\n**重要**: leaderからの承認が下りるまで実装を開始しないでください。`;

    return output;
}
