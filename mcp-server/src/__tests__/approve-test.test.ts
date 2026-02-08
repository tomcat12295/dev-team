import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import type { TaskSummary, TaskPhase, Dashboard, Role } from '../types/task.js';
import { createMockDashboard, createMockTaskSummary } from './helpers/mock-factories.js';

// ESMモジュールのモック
const mockGetCurrentRole = jest.fn<() => Role>();
const mockGetDashboard = jest.fn<() => Promise<Dashboard>>();
const mockGenerateId = jest.fn<() => Promise<string>>();
const mockAddMessage = jest.fn<(to: Role, message: any) => Promise<void>>();
const mockAddActivity = jest.fn<(activity: any) => Promise<void>>();
const mockUpdateTaskInList = jest.fn<(taskId: string, updates: any) => Promise<boolean>>();
const mockUpdateMemberStatus = jest.fn<(role: Role, status: any) => Promise<void>>();
const mockNotifyRole = jest.fn<(role: Role, message: string) => Promise<boolean>>();

jest.unstable_mockModule('../utils/permission.js', () => ({
    getCurrentRole: mockGetCurrentRole,
    validateLeaderOnly: (role: string, toolName: string) => {
        if (role !== 'leader') return { allowed: false, reason: `${toolName}はleaderのみ使用可能です。現在の役割: ${role}` };
        return { allowed: true };
    },
}));

jest.unstable_mockModule('../utils/queue.js', () => ({
    getDashboard: mockGetDashboard,
    generateId: mockGenerateId,
    addMessage: mockAddMessage,
    addActivity: mockAddActivity,
    updateTaskInList: mockUpdateTaskInList,
    updateMemberStatus: mockUpdateMemberStatus,
}));

jest.unstable_mockModule('../utils/wezterm.js', () => ({
    notifyRole: mockNotifyRole,
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
}));

// 動的インポート（モック設定後）
const { approveTest } = await import('../tools/approve-test.js');

describe('approveTest', () => {
    const mockTaskId = 'T-001';
    const mockAssignee = 'member-01' as Role;

    const createMockTask = (overrides?: Partial<TaskSummary>): TaskSummary => createMockTaskSummary({
        id: mockTaskId,
        title: 'Test Task',
        assignee: mockAssignee,
        createdAt: '2026-02-05T10:00:00.000Z',
        phase: 'test_review' as TaskPhase,
        ...overrides,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetCurrentRole.mockReturnValue('leader');
        mockGenerateId.mockResolvedValue('M-001');
        mockAddMessage.mockResolvedValue(undefined);
        mockAddActivity.mockResolvedValue(undefined);
        mockUpdateTaskInList.mockResolvedValue(true);
        mockUpdateMemberStatus.mockResolvedValue(undefined);
        mockNotifyRole.mockResolvedValue(true);
    });

    describe('権限チェック', () => {
        it('leader以外は使用不可', async () => {
            mockGetCurrentRole.mockReturnValue('member-01');

            const result = await approveTest({ task_id: mockTaskId });

            expect(result.success).toBe(false);
            expect(result.error).toContain('leaderのみ使用可能');
        });

        it('leaderは使用可能', async () => {
            const task = createMockTask();
            mockGetDashboard.mockResolvedValue(createMockDashboard({ memberStatus: {}, tasks: { pending: 1, inProgress: 0, completed: 0, blocked: 0, total: 1 }, taskList: [task] }));

            const result = await approveTest({ task_id: mockTaskId });

            expect(result.success).toBe(true);
        });
    });

    describe('バリデーション', () => {
        it('task_idが必須', async () => {
            const result = await approveTest({ task_id: '' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('task_id は空にできません');
        });

        it('存在しないタスクはエラー', async () => {
            mockGetDashboard.mockResolvedValue(createMockDashboard({ memberStatus: {}, tasks: { pending: 1, inProgress: 0, completed: 0, blocked: 0, total: 1 }, taskList: [createMockTask({ id: 'other-task' })] }));

            const result = await approveTest({ task_id: mockTaskId });

            expect(result.success).toBe(false);
            expect(result.error).toContain('タスクが見つかりません');
        });

        it('test_reviewフェーズ以外はエラー', async () => {
            const task = createMockTask({ phase: 'implementing' as TaskPhase });
            mockGetDashboard.mockResolvedValue(createMockDashboard({ memberStatus: {}, tasks: { pending: 1, inProgress: 0, completed: 0, blocked: 0, total: 1 }, taskList: [task] }));

            const result = await approveTest({ task_id: mockTaskId });

            expect(result.success).toBe(false);
            expect(result.error).toContain('テストレビュー待ちではありません');
        });
    });

    describe('タスク更新', () => {
        it('phaseがimplementingに更新される', async () => {
            const task = createMockTask();
            mockGetDashboard.mockResolvedValue(createMockDashboard({ memberStatus: {}, tasks: { pending: 1, inProgress: 0, completed: 0, blocked: 0, total: 1 }, taskList: [task] }));

            await approveTest({ task_id: mockTaskId });

            expect(mockUpdateTaskInList).toHaveBeenCalledWith(
                mockTaskId,
                expect.objectContaining({
                    phase: 'implementing',
                })
            );
        });

        it('statusがin_progressに更新される', async () => {
            const task = createMockTask();
            mockGetDashboard.mockResolvedValue(createMockDashboard({ memberStatus: {}, tasks: { pending: 1, inProgress: 0, completed: 0, blocked: 0, total: 1 }, taskList: [task] }));

            await approveTest({ task_id: mockTaskId });

            expect(mockUpdateTaskInList).toHaveBeenCalledWith(
                mockTaskId,
                expect.objectContaining({
                    status: 'in_progress',
                })
            );
        });

        it('startedAtが設定される', async () => {
            const task = createMockTask();
            mockGetDashboard.mockResolvedValue(createMockDashboard({ memberStatus: {}, tasks: { pending: 1, inProgress: 0, completed: 0, blocked: 0, total: 1 }, taskList: [task] }));

            const beforeTime = new Date().toISOString();
            await approveTest({ task_id: mockTaskId });
            const afterTime = new Date().toISOString();

            expect(mockUpdateTaskInList).toHaveBeenCalledWith(
                mockTaskId,
                expect.objectContaining({
                    startedAt: expect.any(String),
                })
            );

            // startedAtが適切な時刻範囲内であることを確認
            const call = mockUpdateTaskInList.mock.calls[0] as [string, { startedAt: string }];
            const updateData = call[1];
            expect(updateData.startedAt >= beforeTime).toBe(true);
            expect(updateData.startedAt <= afterTime).toBe(true);
        });
    });

    describe('成功時の結果', () => {
        it('成功時にphaseがimplementingを返す', async () => {
            const task = createMockTask();
            mockGetDashboard.mockResolvedValue(createMockDashboard({ memberStatus: {}, tasks: { pending: 1, inProgress: 0, completed: 0, blocked: 0, total: 1 }, taskList: [task] }));

            const result = await approveTest({ task_id: mockTaskId });

            expect(result.success).toBe(true);
            expect(result.taskId).toBe(mockTaskId);
            expect(result.phase).toBe('implementing');
            expect(result.assignee).toBe(mockAssignee);
        });

        it('メンバーにメッセージが送信される', async () => {
            const task = createMockTask();
            mockGetDashboard.mockResolvedValue(createMockDashboard({ memberStatus: {}, tasks: { pending: 1, inProgress: 0, completed: 0, blocked: 0, total: 1 }, taskList: [task] }));

            await approveTest({ task_id: mockTaskId, comments: 'テスト承認コメント' });

            expect(mockAddMessage).toHaveBeenCalledWith(
                mockAssignee,
                expect.objectContaining({
                    type: 'notification',
                    from: 'leader',
                    to: mockAssignee,
                    subject: expect.stringContaining('テスト承認'),
                })
            );
        });

        it('アクティビティログが記録される', async () => {
            const task = createMockTask();
            mockGetDashboard.mockResolvedValue(createMockDashboard({ memberStatus: {}, tasks: { pending: 1, inProgress: 0, completed: 0, blocked: 0, total: 1 }, taskList: [task] }));

            await approveTest({ task_id: mockTaskId });

            expect(mockAddActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    role: 'leader',
                    action: 'approve_test',
                })
            );
        });

        it('メンバーに通知される', async () => {
            const task = createMockTask();
            mockGetDashboard.mockResolvedValue(createMockDashboard({ memberStatus: {}, tasks: { pending: 1, inProgress: 0, completed: 0, blocked: 0, total: 1 }, taskList: [task] }));

            await approveTest({ task_id: mockTaskId });

            expect(mockNotifyRole).toHaveBeenCalledWith(
                mockAssignee,
                expect.any(String)
            );
        });

        it('leaderのステータスがidleに戻る', async () => {
            const task = createMockTask();
            mockGetDashboard.mockResolvedValue(createMockDashboard({ memberStatus: {}, tasks: { pending: 1, inProgress: 0, completed: 0, blocked: 0, total: 1 }, taskList: [task] }));

            await approveTest({ task_id: mockTaskId });

            expect(mockUpdateMemberStatus).toHaveBeenCalledWith(
                'leader',
                expect.objectContaining({
                    status: 'idle',
                    currentTask: undefined,
                })
            );
        });
    });
});
