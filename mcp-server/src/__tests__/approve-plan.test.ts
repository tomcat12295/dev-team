import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { TaskSummary } from '../types/task.js';

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

// Mock memory module
jest.unstable_mockModule('../utils/memory.js', () => ({
    getProjectContext: jest.fn<() => Promise<any>>(),
    updateProjectContext: jest.fn<() => Promise<void>>(),
    parseCurrentStateSections: jest.fn<() => any>(),
    generateCurrentStateMarkdown: jest.fn<() => string>(),
    getReviewMode: jest.fn<() => Promise<'normal' | 'strict'>>(),
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
}));

describe('approve-plan', () => {
    let approvePlan: typeof import('../tools/approve-plan.js').approvePlan;
    let formatApprovePlanResult: typeof import('../tools/approve-plan.js').formatApprovePlanResult;

    let mockGetCurrentRole: jest.MockedFunction<() => string>;
    let mockAddMessage: jest.MockedFunction<() => Promise<void>>;
    let mockGenerateMessageId: jest.MockedFunction<() => string>;
    let mockAddActivity: jest.MockedFunction<() => Promise<void>>;
    let mockUpdateTaskInList: jest.MockedFunction<() => Promise<void>>;
    let mockUpdateMemberStatus: jest.MockedFunction<() => Promise<void>>;
    let mockNotifyRole: jest.MockedFunction<() => Promise<boolean>>;
    let mockGetTaskWithValidation: jest.MockedFunction<() => Promise<{ task?: TaskSummary; error?: string }>>;
    let mockGetProjectContext: jest.MockedFunction<() => Promise<any>>;
    let mockUpdateProjectContext: jest.MockedFunction<() => Promise<void>>;
    let mockGetReviewMode: jest.MockedFunction<() => Promise<'normal' | 'strict'>>;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Get mocked modules
        const permissionModule = await import('../utils/permission.js');
        const queueModule = await import('../utils/queue.js');
        const weztermModule = await import('../utils/wezterm.js');
        const taskManagerModule = await import('../utils/task-manager.js');
        const memoryModule = await import('../utils/memory.js');

        mockGetCurrentRole = permissionModule.getCurrentRole as typeof mockGetCurrentRole;
        mockAddMessage = (queueModule as any).addMessage as typeof mockAddMessage;
        mockGenerateMessageId = (queueModule as any).generateMessageId as typeof mockGenerateMessageId;
        mockAddActivity = (queueModule as any).addActivity as typeof mockAddActivity;
        mockUpdateTaskInList = (queueModule as any).updateTaskInList as typeof mockUpdateTaskInList;
        mockUpdateMemberStatus = (queueModule as any).updateMemberStatus as typeof mockUpdateMemberStatus;
        mockNotifyRole = (weztermModule as any).notifyRole as typeof mockNotifyRole;
        mockGetTaskWithValidation = (taskManagerModule as any).getTaskWithValidation as typeof mockGetTaskWithValidation;
        mockGetProjectContext = (memoryModule as any).getProjectContext as typeof mockGetProjectContext;
        mockUpdateProjectContext = (memoryModule as any).updateProjectContext as typeof mockUpdateProjectContext;
        mockGetReviewMode = (memoryModule as any).getReviewMode as typeof mockGetReviewMode;

        // Import the module under test
        const approvePlanModule = await import('../tools/approve-plan.js');
        approvePlan = approvePlanModule.approvePlan;
        formatApprovePlanResult = approvePlanModule.formatApprovePlanResult;
    });


    describe('permission checks', () => {
        it('should fail when called by member', async () => {
            mockGetCurrentRole.mockReturnValue('member-01');

            const result = await approvePlan({ task_id: 'T-001' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('leaderのみ使用可能');
        });

        it('should fail when called by pm', async () => {
            mockGetCurrentRole.mockReturnValue('pm');

            const result = await approvePlan({ task_id: 'T-001' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('leaderのみ使用可能');
        });
    });

    describe('validation', () => {
        beforeEach(() => {
            mockGetCurrentRole.mockReturnValue('leader');
        });

        it('should fail when task_id is missing', async () => {
            const result = await approvePlan({ task_id: '' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('task_id は空にできません');
        });

        it('should fail when task_id is whitespace only', async () => {
            const result = await approvePlan({ task_id: '   ' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('task_id は空にできません');
        });
    });

    describe('phase validation', () => {
        beforeEach(() => {
            mockGetCurrentRole.mockReturnValue('leader');
        });

        it('should fail when task is not in awaiting_approval phase', async () => {
            mockGetTaskWithValidation.mockResolvedValue({
                error: "タスクのフェーズが'awaiting_approval'ではありません。現在のフェーズ: implementing",
            });

            const result = await approvePlan({ task_id: 'T-001' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('awaiting_approval');
        });

        it('should fail when task is not found', async () => {
            mockGetTaskWithValidation.mockResolvedValue({
                error: 'タスクが見つかりません: T-999',
            });

            const result = await approvePlan({ task_id: 'T-999' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('タスクが見つかりません');
        });

        it('should fail when plan is not submitted', async () => {
            mockGetTaskWithValidation.mockResolvedValue({
                error: '計画が提出されていません',
            });

            const result = await approvePlan({ task_id: 'T-001' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('計画が提出されていません');
        });
    });

    describe('successful approval - normal mode', () => {
        const mockTask: TaskSummary = {
            id: 'T-001',
            title: 'テスト機能の実装',
            status: 'pending',
            assignee: 'member-01',
            priority: 'medium',
            createdAt: '2026-01-31T00:00:00.000Z',
            phase: 'awaiting_approval',
            plan: {
                summary: 'テスト機能を実装する',
                approach: 'ユニットテストを追加',
                filesToChange: ['src/index.ts'],
                filesToCreate: ['src/__tests__/index.test.ts'],
                testPlan: 'ユニットテストを追加',
                submittedAt: '2026-01-31T01:00:00.000Z',
            },
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
            mockGetProjectContext.mockResolvedValue({ currentState: '' });
            mockUpdateProjectContext.mockResolvedValue();
            mockGetReviewMode.mockResolvedValue('normal');
        });

        it('should approve plan and change phase to implementing in normal mode', async () => {
            const result = await approvePlan({ task_id: 'T-001' });

            expect(result.success).toBe(true);
            expect(result.notified).toBe(true);

            // normalモードではimplementingフェーズに遷移
            expect(mockUpdateTaskInList).toHaveBeenCalledWith('T-001', expect.objectContaining({
                phase: 'implementing',
                status: 'in_progress',
            }));
        });

        it('should send message to assignee with implementation instructions', async () => {
            await approvePlan({ task_id: 'T-001' });

            expect(mockAddMessage).toHaveBeenCalledWith(
                'member-01',
                expect.objectContaining({
                    type: 'notification',
                    from: 'leader',
                    to: 'member-01',
                    subject: expect.stringContaining('計画承認'),
                    content: expect.stringContaining('実装を開始'),
                })
            );
        });

        it('should log activity', async () => {
            await approvePlan({ task_id: 'T-001' });

            expect(mockAddActivity).toHaveBeenCalledWith({
                role: 'leader',
                action: 'approve_plan',
                details: expect.stringContaining('テスト機能の実装'),
            });
        });

        it('should notify assignee via WezTerm', async () => {
            await approvePlan({ task_id: 'T-001' });

            expect(mockNotifyRole).toHaveBeenCalledWith(
                'member-01',
                expect.stringContaining('approved')
            );
        });

        it('should update leader status to idle after approval', async () => {
            await approvePlan({ task_id: 'T-001' });

            expect(mockUpdateMemberStatus).toHaveBeenCalledWith('leader', {
                status: 'idle',
                lastActivity: expect.any(String),
                currentTask: undefined,
            });
        });

        it('should include comments in message when provided', async () => {
            await approvePlan({ task_id: 'T-001', comments: '良い計画です' });

            expect(mockAddMessage).toHaveBeenCalledWith(
                'member-01',
                expect.objectContaining({
                    content: expect.stringContaining('良い計画です'),
                })
            );
        });
    });

    describe('successful approval - strict mode', () => {
        const mockTask: TaskSummary = {
            id: 'T-002',
            title: 'strictモード機能の実装',
            status: 'pending',
            assignee: 'member-01',
            priority: 'high',
            createdAt: '2026-01-31T00:00:00.000Z',
            phase: 'awaiting_approval',
            plan: {
                summary: 'strictモード機能を実装する',
                approach: 'テストファーストで実装',
                filesToChange: ['src/tools/approve-plan.ts'],
                filesToCreate: [],
                testPlan: 'strictモードのテストを追加',
                submittedAt: '2026-01-31T01:00:00.000Z',
            },
        };

        beforeEach(() => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockGetTaskWithValidation.mockResolvedValue({ task: mockTask });
            mockGenerateMessageId.mockReturnValue('M-456');
            mockAddMessage.mockResolvedValue();
            mockAddActivity.mockResolvedValue();
            mockUpdateTaskInList.mockResolvedValue();
            mockUpdateMemberStatus.mockResolvedValue();
            mockNotifyRole.mockResolvedValue(true);
            mockGetProjectContext.mockResolvedValue({ currentState: '' });
            mockUpdateProjectContext.mockResolvedValue();
            mockGetReviewMode.mockResolvedValue('strict');
        });

        it('should approve plan and change phase to test_review in strict mode', async () => {
            const result = await approvePlan({ task_id: 'T-002' });

            expect(result.success).toBe(true);
            expect(result.notified).toBe(true);

            // strictモードではtest_reviewフェーズに遷移
            expect(mockUpdateTaskInList).toHaveBeenCalledWith('T-002', expect.objectContaining({
                phase: 'test_review',
            }));
        });

        it('should not set status to in_progress in strict mode', async () => {
            await approvePlan({ task_id: 'T-002' });

            // strictモードではまだin_progressにしない（テストレビュー待ち）
            expect(mockUpdateTaskInList).toHaveBeenCalledWith('T-002', expect.not.objectContaining({
                status: 'in_progress',
            }));
        });

        it('should send message with test-first instructions in strict mode', async () => {
            await approvePlan({ task_id: 'T-002' });

            expect(mockAddMessage).toHaveBeenCalledWith(
                'member-01',
                expect.objectContaining({
                    content: expect.stringContaining('テスト'),
                })
            );
        });

        it('should update member status to working', async () => {
            await approvePlan({ task_id: 'T-002' });

            expect(mockUpdateMemberStatus).toHaveBeenCalledWith('member-01', {
                status: 'working',
                lastActivity: expect.any(String),
            });
        });
    });

    describe('error handling', () => {
        const mockTask: TaskSummary = {
            id: 'T-001',
            title: 'テスト機能の実装',
            status: 'pending',
            assignee: 'member-01',
            priority: 'medium',
            createdAt: '2026-01-31T00:00:00.000Z',
            phase: 'awaiting_approval',
            plan: {
                summary: 'テスト機能を実装する',
                approach: 'ユニットテストを追加',
                filesToChange: ['src/index.ts'],
                filesToCreate: [],
                testPlan: 'ユニットテストを追加',
                submittedAt: '2026-01-31T01:00:00.000Z',
            },
        };

        beforeEach(() => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockGetTaskWithValidation.mockResolvedValue({ task: mockTask });
            mockGenerateMessageId.mockReturnValue('M-123');
            mockGetReviewMode.mockResolvedValue('normal');
            mockGetProjectContext.mockResolvedValue({ currentState: '' });
        });

        it('should handle updateTaskInList failure', async () => {
            mockUpdateTaskInList.mockRejectedValue(new Error('Database error'));

            const result = await approvePlan({ task_id: 'T-001' });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Database error');
        });

        it('should handle notification failure gracefully', async () => {
            mockUpdateTaskInList.mockResolvedValue();
            mockAddMessage.mockResolvedValue();
            mockAddActivity.mockResolvedValue();
            mockUpdateMemberStatus.mockResolvedValue();
            mockNotifyRole.mockRejectedValue(new Error('WezTerm not available'));
            mockUpdateProjectContext.mockResolvedValue();

            const result = await approvePlan({ task_id: 'T-001' });

            // 通知失敗でも承認自体は成功
            expect(result.success).toBe(true);
            expect(result.notified).toBe(false);
        });
    });

    describe('formatApprovePlanResult', () => {
        it('should format success result correctly', () => {
            const result = {
                success: true,
                notified: true,
            };
            const formatted = formatApprovePlanResult(result);

            expect(formatted).toContain('計画を承認しました');
            expect(formatted).toContain('通知しました');
        });

        it('should format success result with notification failure', () => {
            const result = {
                success: true,
                notified: false,
            };
            const formatted = formatApprovePlanResult(result);

            expect(formatted).toContain('計画を承認しました');
            expect(formatted).toContain('通知に失敗');
        });

        it('should format error result correctly', () => {
            const result = {
                success: false,
                error: 'Permission denied',
                notified: false,
            };
            const formatted = formatApprovePlanResult(result);

            expect(formatted).toContain('失敗');
            expect(formatted).toContain('Permission denied');
        });
    });
});
