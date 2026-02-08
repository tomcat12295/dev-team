/**
 * task-manager.ts のユニットテスト
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Dashboard, TaskSummary } from '../types/task.js';

// Mock queue module
jest.unstable_mockModule('../utils/queue.js', () => ({
    getDashboard: jest.fn<() => Promise<Dashboard>>(),
    updateDashboard: jest.fn<() => Promise<Dashboard>>(),
    updateTaskInList: jest.fn<() => Promise<void>>(),
    getChildTasks: jest.fn<() => Promise<TaskSummary[]>>(),
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

// Mock wezterm
jest.unstable_mockModule('../utils/wezterm.js', () => ({
    sendTextToPane: jest.fn<() => Promise<void>>(),
    notifyRole: jest.fn<() => Promise<boolean>>(),
}));

// Import after mocking
const { getDashboard, updateTaskInList, getChildTasks } = await import('../utils/queue.js');
const { sendTextToPane } = await import('../utils/wezterm.js');
const { getTaskWithValidation, completeTask } = await import('../utils/task-manager.js');

const mockGetDashboard = getDashboard as jest.MockedFunction<typeof getDashboard>;
const mockUpdateTaskInList = updateTaskInList as jest.MockedFunction<typeof updateTaskInList>;
const mockGetChildTasks = getChildTasks as jest.MockedFunction<typeof getChildTasks>;
const mockSendTextToPane = sendTextToPane as jest.MockedFunction<typeof sendTextToPane>;

describe('getTaskWithValidation', () => {
    const baseTask: TaskSummary = {
        id: 'T-001',
        title: 'Test Task',
        status: 'in_progress',
        assignee: 'member-01',
        priority: 'medium',
        createdAt: '2026-02-04T00:00:00.000Z',
        phase: 'awaiting_approval',
        plan: {
            summary: 'Test summary',
            approach: 'Test approach',
            filesToChange: ['file1.ts'],
            filesToCreate: [],
            testPlan: 'Test plan',
            submittedAt: '2026-02-04T00:00:00.000Z',
        },
    };

    const mockDashboard: Dashboard = {
        projectName: 'Test Project',
        lastUpdated: '2026-02-04T00:00:00.000Z',
        currentPhase: 'implementation',
        tasks: { pending: 0, inProgress: 1, completed: 0, blocked: 0, total: 1 },
        recentActivity: [],
        pendingApprovals: [],

        memberStatus: {},
        taskList: [baseTask],
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetDashboard.mockResolvedValue(mockDashboard);
    });

    describe('正常系', () => {
        it('タスクが見つかる場合、taskを返す', async () => {
            const result = await getTaskWithValidation('T-001');
            expect(result.task).toBeDefined();
            expect(result.task?.id).toBe('T-001');
            expect(result.error).toBeUndefined();
        });

        it('expectedPhaseが一致する場合、taskを返す', async () => {
            const result = await getTaskWithValidation('T-001', { expectedPhase: 'awaiting_approval' });
            expect(result.task).toBeDefined();
            expect(result.error).toBeUndefined();
        });

        it('requirePlan=trueでplanがある場合、taskを返す', async () => {
            const result = await getTaskWithValidation('T-001', { requirePlan: true });
            expect(result.task).toBeDefined();
            expect(result.error).toBeUndefined();
        });

        it('expectedAssigneeが一致する場合、taskを返す', async () => {
            const result = await getTaskWithValidation('T-001', { expectedAssignee: 'member-01' });
            expect(result.task).toBeDefined();
            expect(result.error).toBeUndefined();
        });

        it('全オプションが一致する場合、taskを返す', async () => {
            const result = await getTaskWithValidation('T-001', {
                expectedPhase: 'awaiting_approval',
                requirePlan: true,
                expectedAssignee: 'member-01',
            });
            expect(result.task).toBeDefined();
            expect(result.error).toBeUndefined();
        });
    });

    describe('異常系', () => {
        it('タスクが見つからない場合、エラーを返す', async () => {
            const result = await getTaskWithValidation('T-999');
            expect(result.task).toBeUndefined();
            expect(result.error).toContain('タスクが見つかりません');
        });

        it('expectedPhaseが一致しない場合、エラーを返す', async () => {
            const result = await getTaskWithValidation('T-001', { expectedPhase: 'planning' });
            expect(result.task).toBeUndefined();
            expect(result.error).toContain('フェーズが');
        });

        it('requirePlan=trueでplanがない場合、エラーを返す', async () => {
            const taskWithoutPlan: TaskSummary = { ...baseTask, id: 'T-002', plan: undefined };
            mockGetDashboard.mockResolvedValue({
                ...mockDashboard,
                taskList: [taskWithoutPlan],
            });

            const result = await getTaskWithValidation('T-002', { requirePlan: true });
            expect(result.task).toBeUndefined();
            expect(result.error).toContain('計画が提出されていません');
        });

        it('expectedAssigneeが一致しない場合、エラーを返す', async () => {
            const result = await getTaskWithValidation('T-001', { expectedAssignee: 'member-02' });
            expect(result.task).toBeUndefined();
            expect(result.error).toContain('割り当てられていません');
        });
    });
});

describe('completeTask', () => {
    const inProgressTask: TaskSummary = {
        id: 'T-100',
        title: 'Test Task',
        status: 'in_progress',
        assignee: 'member-01',
        priority: 'medium',
        createdAt: '2026-02-04T00:00:00.000Z',
        phase: 'implementing',
    };

    const mockDashboard: Dashboard = {
        projectName: 'Test Project',
        lastUpdated: '2026-02-04T00:00:00.000Z',
        currentPhase: 'implementation',
        tasks: { pending: 0, inProgress: 1, completed: 0, blocked: 0, total: 1 },
        recentActivity: [],
        pendingApprovals: [],

        memberStatus: {},
        taskList: [inProgressTask],
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetDashboard.mockResolvedValue(mockDashboard);
        mockUpdateTaskInList.mockResolvedValue(true);
        mockGetChildTasks.mockResolvedValue([]);
        mockSendTextToPane.mockResolvedValue(true);
    });

    describe('ステータス遷移', () => {
        it('in_progressのタスクがcompletedに更新される', async () => {
            await completeTask('T-100');

            expect(mockUpdateTaskInList).toHaveBeenCalledWith('T-100', expect.objectContaining({
                status: 'completed',
                completedAt: expect.any(String),
            }));
        });

        it('in_progress以外のタスクは更新されない', async () => {
            const pendingTask: TaskSummary = {
                ...inProgressTask,
                id: 'T-102',
                status: 'pending',
            };
            mockGetDashboard.mockResolvedValue({
                ...mockDashboard,
                taskList: [pendingTask],
            });

            await completeTask('T-102');

            expect(mockUpdateTaskInList).not.toHaveBeenCalled();
            expect(mockSendTextToPane).not.toHaveBeenCalled();
        });

        it('存在しないタスクIDでは何も実行されない', async () => {
            await completeTask('T-999');

            expect(mockUpdateTaskInList).not.toHaveBeenCalled();
            expect(mockSendTextToPane).not.toHaveBeenCalled();
        });
    });
});
