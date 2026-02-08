import { readQueue, markMessageRead, updateMemberStatus, getDashboard, updateTaskInList, withDashboardTransaction } from '../utils/queue.js';
import { getCurrentRole } from '../utils/permission.js';
import { info, error } from '../utils/logger.js';
import { Message } from '../types/message.js';
import { getNextStatus, MemberStatusValue } from '../utils/status-transition.js';
import { recalculateDashboardTasks } from '../utils/task-manager.js';

export type QueueFormat = 'full' | 'summary';

export interface CheckQueueResult {
    role: string;
    unreadCount: number;
    messages: Array<{
        id: string;
        type: string;
        from: string;
        subject: string;
        content: string;
        timestamp: string;
    }>;
    totalMessages: number;
    format?: QueueFormat;
}

export async function checkQueue(markAsRead: boolean = true, format: QueueFormat = 'full'): Promise<CheckQueueResult> {
    const role = getCurrentRole();
    info(`Checking queue for ${role}`);

    const queue = await readQueue(role);
    const unreadMessages = queue.messages.filter(m => !m.read);

    // Update member status using state transition utility (not for pm)
    // Important: working/waiting states should NOT be overwritten by check_queue
    if (role !== 'pm') {
        try {
            // リーダーの場合はquestionタイプ（submit_plan等）も「仕事がある」として扱う
            const workTypes = role === 'leader' ? ['task', 'question'] : ['task'];
            const unreadTasks = unreadMessages.filter(m => workTypes.includes(m.type));
            const latestTask = unreadTasks.length > 0 ? unreadTasks[unreadTasks.length - 1] : null;

            // 1回のトランザクションで全dashboard操作をまとめて実行
            await withDashboardTransaction(async (dashboard) => {
                const currentStatus = (dashboard.memberStatus[role]?.status ?? 'offline') as MemberStatusValue;

                // Determine event based on presence of new tasks
                const event = latestTask ? 'check_queue_with_task' : 'check_queue_empty';
                const newStatus = getNextStatus(currentStatus, event);

                // Phase 3: タスク取得時にtaskListのステータスをin_progressに更新
                if (latestTask) {
                    const taskInList = dashboard.taskList.find(t => t.id === latestTask.id);
                    if (taskInList && taskInList.status === 'pending') {
                        await updateTaskInList(latestTask.id, {
                            status: 'in_progress',
                            startedAt: new Date().toISOString(),
                        }, dashboard);
                        await recalculateDashboardTasks(dashboard);
                        info(`Task ${latestTask.id} started via check_queue by ${role}`);
                    }
                }

                // Only update if there's a valid transition (newStatus !== null)
                if (newStatus !== null) {
                    await updateMemberStatus(role, {
                        status: newStatus,
                        lastActivity: new Date().toISOString(),
                        ...(latestTask ? {
                            currentTask: {
                                id: latestTask.id,
                                title: latestTask.subject,
                                startedAt: new Date().toISOString(),
                            }
                        } : {}),
                    }, dashboard);
                    info(`Member ${role} status transitioned: ${currentStatus} -> ${newStatus} (event: ${event})`);
                } else if (latestTask) {
                    // Even if status doesn't change, update currentTask if there's a new task
                    await updateMemberStatus(role, {
                        lastActivity: new Date().toISOString(),
                        currentTask: {
                            id: latestTask.id,
                            title: latestTask.subject,
                            startedAt: new Date().toISOString(),
                        },
                    }, dashboard);
                    info(`Member ${role} status maintained: ${currentStatus} (event: ${event}), updated currentTask`);
                }
            });
        } catch (err) {
            error('Failed to update member status', err);
        }
    }

    // Optionally mark messages as read
    if (markAsRead) {
        for (const message of unreadMessages) {
            await markMessageRead(role, message.id);
        }
    }

    return {
        role,
        unreadCount: unreadMessages.length,
        messages: unreadMessages.map(m => ({
            id: m.id,
            type: m.type,
            from: m.from,
            subject: m.subject,
            content: m.content,
            timestamp: m.timestamp,
        })),
        totalMessages: queue.messages.length,
        format,
    };
}

export function formatQueueResult(result: CheckQueueResult): string {
    const format = result.format ?? 'full';

    if (result.unreadCount === 0) {
        return `📭 キューは空です。新しいメッセージはありません。\n\n総メッセージ数: ${result.totalMessages}`;
    }

    // Summary mode: 件名一覧のみ
    if (format === 'summary') {
        return formatQueueSummary(result);
    }

    // Full mode: 全メッセージ展開（現行動作）
    return formatQueueFull(result);
}

/**
 * Summary mode: 件名一覧のみ
 */
function formatQueueSummary(result: CheckQueueResult): string {
    let output = `📬 ${result.unreadCount}件の未読メッセージ:\n`;

    for (const msg of result.messages) {
        output += `- [${msg.id}] ${msg.type}: ${msg.subject} (from: ${msg.from})\n`;
    }

    output += `\n詳細を見るには format='full' で再取得してください。`;
    return output;
}

/**
 * Full mode: 全メッセージ展開（現行動作）
 */
function formatQueueFull(result: CheckQueueResult): string {
    let output = `📬 ${result.unreadCount}件の未読メッセージがあります。\n\n`;

    for (const msg of result.messages) {
        output += `---\n`;
        output += `📨 **${msg.subject}**\n`;
        output += `ID: ${msg.id} | From: ${msg.from} | Type: ${msg.type}\n`;
        output += `Time: ${msg.timestamp}\n\n`;
        output += `${msg.content}\n\n`;
    }

    output += `---\n総メッセージ数: ${result.totalMessages}`;
    return output;
}
