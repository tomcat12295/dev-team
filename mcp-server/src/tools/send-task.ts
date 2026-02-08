import { Role, TaskSummary, TaskPriority } from '../types/task.js';
import { Message, MessageType } from '../types/message.js';
import { addMessage, generateId, generateMessageId, addActivity, addTaskToList, updateMemberStatus, getDashboard } from '../utils/queue.js';
import { notifyRole } from '../utils/wezterm.js';
import { getCurrentRole, validateSendPermission, isValidRole } from '../utils/permission.js';
import { info, error } from '../utils/logger.js';
import { getAllRoles, isMemberRole } from '../config/team-config.js';
import { recalculateDashboardTasks, completeTask } from '../utils/task-manager.js';
import { validateRequiredString } from '../utils/validation.js';

export interface SendTaskParams {
    to: string;
    subject: string;
    content: string;
    type?: MessageType;
    priority?: TaskPriority;  // 追加: タスク優先度
}

export interface SendTaskResult {
    success: boolean;
    messageId?: string;
    error?: string;
    notified: boolean;
}

export async function sendTask(params: SendTaskParams): Promise<SendTaskResult> {
    // Validate required string parameters
    const subjectValidation = validateRequiredString(params.subject, 'subject');
    if (!subjectValidation.valid) {
        return {
            success: false,
            error: subjectValidation.error,
            notified: false,
        };
    }
    const contentValidation = validateRequiredString(params.content, 'content');
    if (!contentValidation.valid) {
        return {
            success: false,
            error: contentValidation.error,
            notified: false,
        };
    }

    const from = getCurrentRole();

    // Validate target role
    if (!isValidRole(params.to)) {
        return {
            success: false,
            error: `Invalid target role: ${params.to}. Valid roles: ${getAllRoles().join(', ')}`,
            notified: false,
        };
    }

    const to = params.to as Role;

    // Validate permission
    const permission = validateSendPermission(from, to);
    if (!permission.allowed) {
        return {
            success: false,
            error: permission.reason,
            notified: false,
        };
    }

    // leader→memberへのtype='task'送信は禁止（assign_taskを使用すべき）
    const messageType = params.type || 'task';
    if (from === 'leader' && isMemberRole(to) && messageType === 'task') {
        return {
            success: false,
            error: 'memberへのタスク割り当てには assign_task を使用してください。send_taskではreport/question/notificationのみ送信可能です。',
            notified: false,
        };
    }

    try {
        // type='task'の場合はタスクID（T-XXX）、それ以外はメッセージID（M-XXX）を使用
        const messageType = params.type || 'task';
        const messageId = messageType === 'task'
            ? await generateId()
            : generateMessageId();
        const message: Message = {
            id: messageId,
            type: messageType,
            from,
            to,
            subject: params.subject,
            content: params.content,
            timestamp: new Date().toISOString(),
            read: false,
        };

        // Add message to queue
        await addMessage(to, message);

        // Log activity
        await addActivity({
            role: from,
            action: 'send_task',
            details: `Sent ${params.type || 'task'} to ${to}: ${params.subject}`,
        });

        info(`Task sent from ${from} to ${to}`, { messageId, subject: params.subject });

        // Add to task list if type is 'task'
        if (message.type === 'task') {
            try {
                const taskSummary: TaskSummary = {
                    id: messageId,
                    title: params.subject,
                    status: 'pending',
                    assignee: to,
                    priority: params.priority ?? 'medium',  // priorityパラメータを使用
                    createdAt: message.timestamp,
                    parentMessageId: messageId,  // トレース用
                };
                await addTaskToList(taskSummary);
                // 自動再計算: taskListからtasksを計算
                await recalculateDashboardTasks();
            } catch (err) {
                error('Failed to add task to list', err);
            }
        }

        // Update receiver's status to working when task is sent
        if (message.type === 'task' && (to === 'leader' || isMemberRole(to))) {
            try {
                await updateMemberStatus(to, {
                    status: 'working',
                    lastActivity: new Date().toISOString(),
                    currentTask: {
                        id: messageId,
                        title: params.subject,
                        startedAt: message.timestamp,
                    },
                });
            } catch (err) {
                error('Failed to update receiver status to working', err);
            }
        }

        // Update member status to idle when sending report
        // Also complete the current task in taskList
        if (isMemberRole(from) && message.type === 'report') {
            try {
                // Phase 4: レポート送信時に現在のタスクを完了状態に更新
                const dashboard = await getDashboard();
                const currentTaskId = dashboard.memberStatus[from]?.currentTask?.id;
                if (currentTaskId) {
                    await completeTask(currentTaskId);
                    info(`Task ${currentTaskId} completed by ${from} via report`);
                }

                await updateMemberStatus(from, {
                    status: 'idle',
                    lastActivity: new Date().toISOString(),
                    currentTask: undefined,
                });
            } catch (err) {
                error('Failed to update member status to idle', err);
            }
        }

        // Leader also completes task when sending report
        if (from === 'leader' && message.type === 'report') {
            try {
                const dashboard = await getDashboard();
                const currentTaskId = dashboard.memberStatus['leader']?.currentTask?.id;
                if (currentTaskId) {
                    await completeTask(currentTaskId);
                    info(`Task ${currentTaskId} completed by leader via report`);
                }

                await updateMemberStatus('leader', {
                    status: 'idle',
                    lastActivity: new Date().toISOString(),
                    currentTask: undefined,
                });
            } catch (err) {
                error('Failed to update leader status to idle', err);
            }
        }

        // Update member status to waiting when sending question (e.g., plan approval request)
        if (isMemberRole(from) && message.type === 'question') {
            try {
                await updateMemberStatus(from, {
                    status: 'waiting',
                    lastActivity: new Date().toISOString(),
                });
            } catch (err) {
                error('Failed to update member status to waiting', err);
            }
        }

        // Notify the recipient via WezTerm
        let notified = false;
        try {
            notified = await notifyRole(to, `New message from ${from}`);
        } catch (err) {
            // Notification failure is not critical
            error('Failed to notify recipient', err);
        }

        // If notification failed, record it in dashboard activity
        if (!notified) {
            try {
                await addActivity({
                    role: from as Role,
                    action: `⚠️ ${to}への通知失敗 - check_queue待ち`,
                    details: `Subject: ${params.subject}`,
                });
            } catch {
                // ignore
            }
        }

        return {
            success: true,
            messageId,
            notified,
        };
    } catch (err) {
        error('Failed to send task', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
            notified: false,
        };
    }
}

export function formatSendResult(result: SendTaskResult): string {
    if (!result.success) {
        return `❌ タスク送信に失敗しました: ${result.error}`;
    }

    let output = `✅ タスクを送信しました。\n`;
    output += `Message ID: ${result.messageId}\n`;
    output += result.notified
        ? `📢 受信者に通知しました。`
        : `⚠️ 受信者への通知に失敗しました。手動で確認を依頼してください。`;

    return output;
}
