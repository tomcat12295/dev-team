import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Dashboard, TaskSummary } from '../types/task.js';

// Mock permission module
jest.unstable_mockModule('../utils/permission.js', () => ({
    getCurrentRole: jest.fn<() => string>(),
    validateLeaderOnly: (role: string, toolName: string) => {
        if (role !== 'leader') return { allowed: false, reason: `${toolName}はleaderのみ使用可能です。現在の役割: ${role}` };
        return { allowed: true };
    },
}));

// Mock queue module
jest.unstable_mockModule('../utils/queue.js', () => ({
    addMessage: jest.fn<() => Promise<void>>(),
    generateMessageId: jest.fn<() => string>(),
    addActivity: jest.fn<() => Promise<void>>(),
    updateTaskInList: jest.fn<() => Promise<void>>(),
    updateMemberStatus: jest.fn<() => Promise<void>>(),
}));

// Mock wezterm module
jest.unstable_mockModule('../utils/wezterm.js', () => ({
    notifyRole: jest.fn<() => Promise<boolean>>(),
}));

// Mock task-manager module
jest.unstable_mockModule('../utils/task-manager.js', () => ({
    getTaskWithValidation: jest.fn<() => Promise<{ task?: TaskSummary; error?: string }>>(),
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
}));

describe('reject-test', () => {
    let rejectTest: typeof import('../tools/reject-test.js').rejectTest;
    let formatRejectTestResult: typeof import('../tools/reject-test.js').formatRejectTestResult;

    let mockGetCurrentRole: jest.MockedFunction<() => string>;
    let mockAddMessage: jest.MockedFunction<() => Promise<void>>;
    let mockGenerateMessageId: jest.MockedFunction<() => string>;
    let mockAddActivity: jest.MockedFunction<() => Promise<void>>;
    let mockUpdateTaskInList: jest.MockedFunction<() => Promise<void>>;
    let mockUpdateMemberStatus: jest.MockedFunction<() => Promise<void>>;
    let mockNotifyRole: jest.MockedFunction<() => Promise<boolean>>;
    let mockGetTaskWithValidation: jest.MockedFunction<() => Promise<{ task?: TaskSummary; error?: string }>>;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Get mocked modules
        const permissionModule = await import('../utils/permission.js');
        const queueModule = await import('../utils/queue.js');
        const weztermModule = await import('../utils/wezterm.js');
        const taskManagerModule = await import('../utils/task-manager.js');

        mockGetCurrentRole = permissionModule.getCurrentRole as typeof mockGetCurrentRole;
        mockAddMessage = (queueModule as any).addMessage as typeof mockAddMessage;
        mockGenerateMessageId = (queueModule as any).generateMessageId as typeof mockGenerateMessageId;
        mockAddActivity = (queueModule as any).addActivity as typeof mockAddActivity;
        mockUpdateTaskInList = (queueModule as any).updateTaskInList as typeof mockUpdateTaskInList;
        mockUpdateMemberStatus = (queueModule as any).updateMemberStatus as typeof mockUpdateMemberStatus;
        mockNotifyRole = (weztermModule as any).notifyRole as typeof mockNotifyRole;
        mockGetTaskWithValidation = (taskManagerModule as any).getTaskWithValidation as typeof mockGetTaskWithValidation;

        // Import the module under test
        const rejectTestModule = await import('../tools/reject-test.js');
        rejectTest = rejectTestModule.rejectTest;
        formatRejectTestResult = rejectTestModule.formatRejectTestResult;
    });


    describe('permission checks', () => {
        it('should fail when called by member', async () => {
            mockGetCurrentRole.mockReturnValue('member-01');

            const result = await rejectTest({
                task_id: 'T-001',
                reason: 'テストが不十分',
                feedback: '境界値テストを追加してください',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('leaderのみ使用可能');
        });

        it('should fail when called by pm', async () => {
            mockGetCurrentRole.mockReturnValue('pm');

            const result = await rejectTest({
                task_id: 'T-001',
                reason: 'テストが不十分',
                feedback: '境界値テストを追加してください',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('leaderのみ使用可能');
        });
    });

    describe('validation', () => {
        beforeEach(() => {
            mockGetCurrentRole.mockReturnValue('leader');
        });

        it('should fail when task_id is missing', async () => {
            const result = await rejectTest({
                task_id: '',
                reason: 'テストが不十分',
                feedback: '境界値テストを追加してください',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('task_id は空にできません');
        });

        it('should fail when reason is missing', async () => {
            const result = await rejectTest({
                task_id: 'T-001',
                reason: '',
                feedback: '境界値テストを追加してください',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('reason は空にできません');
        });

        it('should fail when feedback is missing', async () => {
            const result = await rejectTest({
                task_id: 'T-001',
                reason: 'テストが不十分',
                feedback: '',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('feedback は空にできません');
        });
    });

    describe('phase validation', () => {
        beforeEach(() => {
            mockGetCurrentRole.mockReturnValue('leader');
        });

        it('should fail when task is not in test_review phase', async () => {
            mockGetTaskWithValidation.mockResolvedValue({
                error: "タスクのフェーズが'test_review'ではありません。現在のフェーズ: implementing",
            });

            const result = await rejectTest({
                task_id: 'T-001',
                reason: 'テストが不十分',
                feedback: '境界値テストを追加してください',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('test_review');
        });

        it('should fail when task is not found', async () => {
            mockGetTaskWithValidation.mockResolvedValue({
                error: 'タスクが見つかりません: T-999',
            });

            const result = await rejectTest({
                task_id: 'T-999',
                reason: 'テストが不十分',
                feedback: '境界値テストを追加してください',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('タスクが見つかりません');
        });
    });

    describe('successful rejection', () => {
        const mockTask: TaskSummary = {
            id: 'T-001',
            title: 'テスト機能の実装',
            status: 'in_progress',
            assignee: 'member-01',
            priority: 'medium',
            createdAt: '2026-01-31T00:00:00.000Z',
            phase: 'test_review',
        };

        beforeEach(() => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockGetTaskWithValidation.mockResolvedValue({ task: mockTask });
            mockGenerateMessageId.mockReturnValue('M-123');
            mockAddMessage.mockResolvedValue();
            mockAddActivity.mockResolvedValue();
            mockUpdateTaskInList.mockResolvedValue();
            mockUpdateMemberStatus.mockResolvedValue();
            mockNotifyRole.mockResolvedValue(true);
        });

        it('should reject test and change phase to planning', async () => {
            const result = await rejectTest({
                task_id: 'T-001',
                reason: 'テストが不十分',
                feedback: '境界値テストを追加してください',
            });

            expect(result.success).toBe(true);
            expect(result.notified).toBe(true);

            // フェーズがplanningに戻されることを確認
            expect(mockUpdateTaskInList).toHaveBeenCalledWith('T-001', {
                phase: 'planning',
            });
        });

        it('should send message to assignee', async () => {
            await rejectTest({
                task_id: 'T-001',
                reason: 'テストが不十分',
                feedback: '境界値テストを追加してください',
            });

            expect(mockAddMessage).toHaveBeenCalledWith(
                'member-01',
                expect.objectContaining({
                    type: 'task',
                    from: 'leader',
                    to: 'member-01',
                    subject: expect.stringContaining('テスト却下'),
                })
            );
        });

        it('should log activity', async () => {
            await rejectTest({
                task_id: 'T-001',
                reason: 'テストが不十分',
                feedback: '境界値テストを追加してください',
            });

            expect(mockAddActivity).toHaveBeenCalledWith({
                role: 'leader',
                action: 'reject_test',
                details: expect.stringContaining('テスト機能の実装'),
            });
        });

        it('should notify assignee via WezTerm', async () => {
            await rejectTest({
                task_id: 'T-001',
                reason: 'テストが不十分',
                feedback: '境界値テストを追加してください',
            });

            expect(mockNotifyRole).toHaveBeenCalledWith(
                'member-01',
                expect.stringContaining('rejected')
            );
        });

        it('should update member status', async () => {
            await rejectTest({
                task_id: 'T-001',
                reason: 'テストが不十分',
                feedback: '境界値テストを追加してください',
            });

            expect(mockUpdateMemberStatus).toHaveBeenCalledWith('member-01', {
                status: 'working',
                lastActivity: expect.any(String),
            });
        });
    });

    describe('formatRejectTestResult', () => {
        it('should format success result correctly', () => {
            const result = {
                success: true,
                notified: true,
            };
            const formatted = formatRejectTestResult(result);

            expect(formatted).toContain('テストを却下しました');
            expect(formatted).toContain('planning');
            expect(formatted).toContain('通知しました');
        });

        it('should format success result with notification failure', () => {
            const result = {
                success: true,
                notified: false,
            };
            const formatted = formatRejectTestResult(result);

            expect(formatted).toContain('テストを却下しました');
            expect(formatted).toContain('通知に失敗');
        });

        it('should format error result correctly', () => {
            const result = {
                success: false,
                error: 'Permission denied',
                notified: false,
            };
            const formatted = formatRejectTestResult(result);

            expect(formatted).toContain('失敗');
            expect(formatted).toContain('Permission denied');
        });
    });
});
