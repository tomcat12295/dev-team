import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Role, Dashboard } from '../types/task.js';
import { createMockDashboard } from './helpers/mock-factories.js';

// Mock queue module
jest.unstable_mockModule('../utils/queue.js', () => ({
    addMessage: jest.fn<() => Promise<void>>(),
    generateId: jest.fn<() => Promise<string>>(),
    generateMessageId: jest.fn<() => string>(),
    addActivity: jest.fn<() => Promise<void>>(),
    addTaskToList: jest.fn<() => Promise<void>>(),
    updateMemberStatus: jest.fn<() => Promise<void>>(),
    getDashboard: jest.fn<() => Promise<Dashboard>>(),
}));

// Mock task-manager module
jest.unstable_mockModule('../utils/task-manager.js', () => ({
    recalculateDashboardTasks: jest.fn<() => Promise<Dashboard>>(),
    completeTask: jest.fn<() => Promise<void>>(),
}));

// Mock wezterm module
jest.unstable_mockModule('../utils/wezterm.js', () => ({
    notifyRole: jest.fn<() => Promise<boolean>>(),
}));

// Mock permission module
jest.unstable_mockModule('../utils/permission.js', () => ({
    getCurrentRole: jest.fn<() => Role>(),
    validateSendPermission: jest.fn<() => { allowed: boolean; reason?: string }>(),
    isValidRole: jest.fn<() => boolean>(),
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

const mockDashboard: Dashboard = createMockDashboard({
    lastUpdated: '2025-01-31T12:00:00Z',
    tasks: { pending: 2, inProgress: 1, completed: 3, blocked: 0, total: 6 },
});

describe('send-task', () => {
    let sendTask: typeof import('../tools/send-task.js').sendTask;
    let formatSendResult: typeof import('../tools/send-task.js').formatSendResult;

    // Use jest.MockedFunction for proper typing
    let mockAddMessage: jest.MockedFunction<() => Promise<void>>;
    let mockGenerateId: jest.MockedFunction<() => Promise<string>>;
    let mockGenerateMessageId: jest.MockedFunction<() => string>;
    let mockAddActivity: jest.MockedFunction<() => Promise<void>>;
    let mockAddTaskToList: jest.MockedFunction<() => Promise<void>>;
    let mockGetDashboard: jest.MockedFunction<() => Promise<Dashboard>>;
    let mockRecalculateDashboardTasks: jest.MockedFunction<() => Promise<Dashboard>>;
    let mockCompleteTask: jest.MockedFunction<() => Promise<void>>;
    let mockNotifyRole: jest.MockedFunction<() => Promise<boolean>>;
    let mockGetCurrentRole: jest.MockedFunction<() => Role>;
    let mockValidateSendPermission: jest.MockedFunction<() => { allowed: boolean; reason?: string }>;
    let mockIsValidRole: jest.MockedFunction<() => boolean>;
    let mockUpdateMemberStatus: jest.MockedFunction<() => Promise<void>>;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Get mocked modules
        const queueModule = await import('../utils/queue.js');
        const taskManagerModule = await import('../utils/task-manager.js');
        const weztermModule = await import('../utils/wezterm.js');
        const permissionModule = await import('../utils/permission.js');

        mockAddMessage = queueModule.addMessage as unknown as typeof mockAddMessage;
        mockGenerateId = queueModule.generateId as unknown as typeof mockGenerateId;
        mockGenerateMessageId = (queueModule as any).generateMessageId as unknown as typeof mockGenerateMessageId;
        mockAddActivity = queueModule.addActivity as unknown as typeof mockAddActivity;
        mockAddTaskToList = queueModule.addTaskToList as unknown as typeof mockAddTaskToList;
        mockGetDashboard = (queueModule as any).getDashboard as unknown as typeof mockGetDashboard;
        mockUpdateMemberStatus = queueModule.updateMemberStatus as unknown as typeof mockUpdateMemberStatus;
        mockRecalculateDashboardTasks = taskManagerModule.recalculateDashboardTasks as unknown as typeof mockRecalculateDashboardTasks;
        mockCompleteTask = taskManagerModule.completeTask as unknown as typeof mockCompleteTask;
        mockNotifyRole = weztermModule.notifyRole as unknown as typeof mockNotifyRole;
        mockGetCurrentRole = permissionModule.getCurrentRole as unknown as typeof mockGetCurrentRole;
        mockValidateSendPermission = permissionModule.validateSendPermission as unknown as typeof mockValidateSendPermission;
        mockIsValidRole = permissionModule.isValidRole as unknown as typeof mockIsValidRole;

        // Set default mock returns
        mockGetDashboard.mockResolvedValue(mockDashboard);
        mockRecalculateDashboardTasks.mockResolvedValue(mockDashboard);
        mockCompleteTask.mockResolvedValue(undefined);
        mockUpdateMemberStatus.mockResolvedValue(undefined);

        // Import the module under test
        const sendTaskModule = await import('../tools/send-task.js');
        sendTask = sendTaskModule.sendTask;
        formatSendResult = sendTaskModule.formatSendResult;
    });


    describe('sendTask', () => {
        it('should return error if subject is missing', async () => {
            const result = await sendTask({
                to: 'leader',
                subject: '',
                content: 'Some content',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('subject');
        });

        it('should return error if content is missing', async () => {
            const result = await sendTask({
                to: 'leader',
                subject: 'Test Subject',
                content: '',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('content');
        });

        it('should return error if target role is invalid', async () => {
            mockIsValidRole.mockReturnValue(false);

            const result = await sendTask({
                to: 'invalid-role',
                subject: 'Test Subject',
                content: 'Test content',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid target role');
        });

        it('should return error if permission denied', async () => {
            mockIsValidRole.mockReturnValue(true);
            mockGetCurrentRole.mockReturnValue('member-01');
            mockValidateSendPermission.mockReturnValue({
                allowed: false,
                reason: 'member-01 cannot send to pm',
            });

            const result = await sendTask({
                to: 'pm',
                subject: 'Test Subject',
                content: 'Test content',
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('member-01 cannot send to pm');
        });

        it('should send message successfully', async () => {
            mockIsValidRole.mockReturnValue(true);
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateSendPermission.mockReturnValue({ allowed: true });
            mockGenerateId.mockResolvedValue('test-msg-id');
            mockAddMessage.mockResolvedValue(undefined);
            mockAddActivity.mockResolvedValue(undefined);
            mockNotifyRole.mockResolvedValue(true);

            const result = await sendTask({
                to: 'leader',
                subject: 'Test Subject',
                content: 'Test content',
                type: 'task',
            });

            expect(result.success).toBe(true);
            expect(result.messageId).toBe('test-msg-id');
            expect(result.notified).toBe(true);
            expect(mockAddMessage).toHaveBeenCalled();
            expect(mockAddActivity).toHaveBeenCalled();
        });

        it('should handle notification failure gracefully', async () => {
            mockIsValidRole.mockReturnValue(true);
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateSendPermission.mockReturnValue({ allowed: true });
            mockGenerateId.mockResolvedValue('test-msg-id');
            mockAddMessage.mockResolvedValue(undefined);
            mockAddActivity.mockResolvedValue(undefined);
            mockNotifyRole.mockRejectedValue(new Error('WezTerm not available'));

            const result = await sendTask({
                to: 'leader',
                subject: 'Test Subject',
                content: 'Test content',
            });

            expect(result.success).toBe(true);
            expect(result.messageId).toBe('test-msg-id');
            expect(result.notified).toBe(false);
        });

        it('should use default type "task" when not specified', async () => {
            mockIsValidRole.mockReturnValue(true);
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateSendPermission.mockReturnValue({ allowed: true });
            mockGenerateId.mockResolvedValue('test-msg-id');
            mockAddMessage.mockResolvedValue(undefined);
            mockAddActivity.mockResolvedValue(undefined);
            mockNotifyRole.mockResolvedValue(true);

            await sendTask({
                to: 'leader',
                subject: 'Test Subject',
                content: 'Test content',
            });

            expect(mockAddMessage).toHaveBeenCalled();
            const addMessageCall = mockAddMessage.mock.calls[0] as unknown[];
            const message = addMessageCall[1] as { type: string };
            expect(message.type).toBe('task');
        });

        it('should return error when leader sends task to member (must use assign_task)', async () => {
            mockIsValidRole.mockReturnValue(true);
            mockGetCurrentRole.mockReturnValue('leader');
            mockValidateSendPermission.mockReturnValue({ allowed: true });

            const result = await sendTask({
                to: 'member-01',
                subject: 'Test Subject',
                content: 'Test content',
                type: 'task',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('assign_task');
        });

        it('should return error when leader sends to member with default type (task)', async () => {
            mockIsValidRole.mockReturnValue(true);
            mockGetCurrentRole.mockReturnValue('leader');
            mockValidateSendPermission.mockReturnValue({ allowed: true });

            const result = await sendTask({
                to: 'member-02',
                subject: 'Test Subject',
                content: 'Test content',
                // type not specified, defaults to 'task'
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('assign_task');
        });

        it('should allow leader to send report/question/notification to member', async () => {
            mockIsValidRole.mockReturnValue(true);
            mockGetCurrentRole.mockReturnValue('leader');
            mockValidateSendPermission.mockReturnValue({ allowed: true });
            mockGenerateId.mockResolvedValue('test-msg-id');
            mockAddMessage.mockResolvedValue(undefined);
            mockAddActivity.mockResolvedValue(undefined);
            mockNotifyRole.mockResolvedValue(true);

            // report should be allowed
            const reportResult = await sendTask({
                to: 'member-01',
                subject: 'Report',
                content: 'Report content',
                type: 'report',
            });
            expect(reportResult.success).toBe(true);

            // notification should be allowed
            const notificationResult = await sendTask({
                to: 'member-01',
                subject: 'Notification',
                content: 'Notification content',
                type: 'notification',
            });
            expect(notificationResult.success).toBe(true);
        });
    });

    describe('formatSendResult', () => {
        it('should format success result', () => {
            const result = formatSendResult({
                success: true,
                messageId: 'msg-123',
                notified: true,
            });

            expect(result).toContain('タスクを送信しました');
            expect(result).toContain('msg-123');
            expect(result).toContain('通知しました');
        });

        it('should format success result with notification failure', () => {
            const result = formatSendResult({
                success: true,
                messageId: 'msg-123',
                notified: false,
            });

            expect(result).toContain('タスクを送信しました');
            expect(result).toContain('msg-123');
            expect(result).toContain('通知に失敗');
        });

        it('should format error result', () => {
            const result = formatSendResult({
                success: false,
                error: 'Permission denied',
                notified: false,
            });

            expect(result).toContain('失敗');
            expect(result).toContain('Permission denied');
        });
    });

    describe('edge cases', () => {
        beforeEach(() => {
            // Common setup for edge case tests
            mockIsValidRole.mockReturnValue(true);
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateSendPermission.mockReturnValue({ allowed: true });
            mockGenerateId.mockResolvedValue('test-msg-id');
            mockAddMessage.mockResolvedValue(undefined);
            mockAddActivity.mockResolvedValue(undefined);
            mockNotifyRole.mockResolvedValue(true);
        });

        it('should handle very long subject (1000+ chars)', async () => {
            const longSubject = 'a'.repeat(1001);

            const result = await sendTask({
                to: 'leader',
                subject: longSubject,
                content: 'Test content',
            });

            expect(result.success).toBe(true);
            expect(mockAddMessage).toHaveBeenCalled();
        });

        it('should handle very long content (10000+ chars)', async () => {
            const longContent = 'b'.repeat(10001);

            const result = await sendTask({
                to: 'leader',
                subject: 'Test Subject',
                content: longContent,
            });

            expect(result.success).toBe(true);
            expect(mockAddMessage).toHaveBeenCalled();
        });

        it('should handle special characters in subject', async () => {
            const specialSubject = 'テスト\n\tsubject 🎉';

            const result = await sendTask({
                to: 'leader',
                subject: specialSubject,
                content: 'Test content',
            });

            expect(result.success).toBe(true);
            expect(mockAddMessage).toHaveBeenCalled();
        });

        it('should handle special characters in content', async () => {
            const specialContent = '日本語テスト\n改行\tタブ\r\nCRLF 🚀💻';

            const result = await sendTask({
                to: 'leader',
                subject: 'Test Subject',
                content: specialContent,
            });

            expect(result.success).toBe(true);
            expect(mockAddMessage).toHaveBeenCalled();
        });
    });

    describe('task list integration', () => {
        beforeEach(() => {
            // Common setup for task list tests
            mockIsValidRole.mockReturnValue(true);
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateSendPermission.mockReturnValue({ allowed: true });
            mockGenerateId.mockResolvedValue('test-msg-id');
            mockAddMessage.mockResolvedValue(undefined);
            mockAddActivity.mockResolvedValue(undefined);
            mockAddTaskToList.mockResolvedValue(undefined);
            mockNotifyRole.mockResolvedValue(true);
        });

        it('should add task to task list when type is task', async () => {
            const result = await sendTask({
                to: 'leader',
                subject: 'Implement feature X',
                content: 'Please implement feature X',
                type: 'task',
            });

            expect(result.success).toBe(true);
            expect(mockAddTaskToList).toHaveBeenCalledTimes(1);
            const calls = mockAddTaskToList.mock.calls as unknown[][];
            const taskSummary = calls[0][0] as {
                id: string;
                title: string;
                status: string;
                assignee: string;
                priority: string;
                createdAt: string;
            };
            expect(taskSummary.id).toBe('test-msg-id');
            expect(taskSummary.title).toBe('Implement feature X');
            expect(taskSummary.status).toBe('pending');
            expect(taskSummary.assignee).toBe('leader');
            expect(taskSummary.priority).toBe('medium');
            expect(taskSummary.createdAt).toBeDefined();
        });

        it('should add task to task list when type is not specified (defaults to task)', async () => {
            const result = await sendTask({
                to: 'leader',
                subject: 'Default type task',
                content: 'Content',
            });

            expect(result.success).toBe(true);
            expect(mockAddTaskToList).toHaveBeenCalledTimes(1);
        });

        it.each(['report', 'question', 'notification'] as const)(
            'should not add to task list when type is %s',
            async (type) => {
                const result = await sendTask({
                    to: 'leader',
                    subject: `${type} subject`,
                    content: `${type} content`,
                    type,
                });

                expect(result.success).toBe(true);
                expect(mockAddTaskToList).not.toHaveBeenCalled();
            },
        );

        it('should handle addTaskToList failure gracefully', async () => {
            mockAddTaskToList.mockRejectedValue(new Error('Failed to add task'));

            const result = await sendTask({
                to: 'leader',
                subject: 'Task with list failure',
                content: 'Content',
                type: 'task',
            });

            expect(result.success).toBe(true);
            expect(result.messageId).toBe('test-msg-id');
        });
    });

    describe('message ID generation based on type', () => {
        beforeEach(() => {
            mockIsValidRole.mockReturnValue(true);
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateSendPermission.mockReturnValue({ allowed: true });
            mockGenerateId.mockResolvedValue('T-001');
            mockGenerateMessageId.mockReturnValue('M-1234567890-abc12');
            mockAddMessage.mockResolvedValue(undefined);
            mockAddActivity.mockResolvedValue(undefined);
            mockAddTaskToList.mockResolvedValue(undefined);
            mockNotifyRole.mockResolvedValue(true);
        });

        it('should use generateId (T-XXX) for type=task', async () => {
            const result = await sendTask({
                to: 'leader',
                subject: 'Task Subject',
                content: 'Task content',
                type: 'task',
            });

            expect(result.success).toBe(true);
            expect(result.messageId).toBe('T-001');
            expect(mockGenerateId).toHaveBeenCalledTimes(1);
            expect(mockGenerateMessageId).not.toHaveBeenCalled();
        });

        it.each(['report', 'question', 'notification'] as const)(
            'should use generateMessageId (M-XXX) for type=%s',
            async (type) => {
                const result = await sendTask({
                    to: 'leader',
                    subject: `${type} Subject`,
                    content: `${type} content`,
                    type,
                });

                expect(result.success).toBe(true);
                expect(result.messageId).toBe('M-1234567890-abc12');
                expect(mockGenerateMessageId).toHaveBeenCalledTimes(1);
                expect(mockGenerateId).not.toHaveBeenCalled();
            },
        );

        it('should use generateId for default type (task)', async () => {
            const result = await sendTask({
                to: 'leader',
                subject: 'Default Type Subject',
                content: 'Default type content',
                // type not specified, defaults to 'task'
            });

            expect(result.success).toBe(true);
            expect(result.messageId).toBe('T-001');
            expect(mockGenerateId).toHaveBeenCalledTimes(1);
            expect(mockGenerateMessageId).not.toHaveBeenCalled();
        });
    });
});
