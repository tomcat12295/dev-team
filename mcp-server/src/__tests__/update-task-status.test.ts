import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Dashboard } from '../types/task.js';
import { createMockDashboard } from './helpers/mock-factories.js';

// Mock queue module - withDashboardTransaction はコールバックを実行する
const mockWithDashboardTransaction = jest.fn<(cb: (db: Dashboard) => Promise<any>) => Promise<{ result: any; dashboard: Dashboard }>>();
jest.unstable_mockModule('../utils/queue.js', () => ({
    updateDashboard: jest.fn<() => Promise<Dashboard>>(),
    addActivity: jest.fn<() => Promise<void>>(),
    updateTaskInList: jest.fn<() => Promise<boolean>>(),
    getDashboard: jest.fn<() => Promise<Dashboard>>(),
    updateMemberStatus: jest.fn<() => Promise<void>>(),
    withDashboardTransaction: mockWithDashboardTransaction,
}));

// Mock task-manager module
jest.unstable_mockModule('../utils/task-manager.js', () => ({
    recalculateDashboardTasks: jest.fn<() => Promise<Dashboard>>(),
}));

// Mock permission module
jest.unstable_mockModule('../utils/permission.js', () => ({
    getCurrentRole: jest.fn<() => string>(),
    validateDashboardUpdatePermission: jest.fn<() => { allowed: boolean; reason?: string }>(),
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

// Mock memory module
jest.unstable_mockModule('../utils/memory.js', () => ({
    getProjectContext: jest.fn<() => Promise<{ currentState: string }>>(),
    updateProjectContext: jest.fn<() => Promise<void>>(),
    parseCurrentStateSections: jest.fn<(content: string) => Record<string, unknown>>().mockImplementation((content: string) => {
        // 簡易的なパース実装
        const sections: Record<string, { taskId: string; taskName: string; phase: string }> = {};
        const memberMatch = content.match(/### (member-\d+)\n- タスクID: (T-\d+)/);
        if (memberMatch) {
            sections[memberMatch[1]] = {
                taskId: memberMatch[2],
                taskName: 'テストタスク',
                phase: 'implementing',
            };
        }
        return sections;
    }),
    generateCurrentStateMarkdown: jest.fn<(sections: Record<string, unknown>, timestamp: string) => string>().mockReturnValue(''),
}));

const mockDashboard: Dashboard = createMockDashboard({
    lastUpdated: '2025-01-31T12:00:00Z',
    tasks: { pending: 2, inProgress: 1, completed: 3, blocked: 0, total: 6 },
});

describe('updateTaskStatus', () => {
    let updateTaskStatus: typeof import('../tools/update-task-status.js').updateTaskStatus;
    let formatUpdateResult: typeof import('../tools/update-task-status.js').formatUpdateResult;

    let mockUpdateDashboard: jest.MockedFunction<(updates: Partial<Dashboard>) => Promise<Dashboard>>;
    let mockAddActivity: jest.MockedFunction<() => Promise<void>>;
    let mockUpdateTaskInList: jest.MockedFunction<(taskId: string, updates: Record<string, unknown>) => Promise<boolean>>;
    let mockGetDashboard: jest.MockedFunction<() => Promise<Dashboard>>;
    let mockRecalculateDashboardTasks: jest.MockedFunction<() => Promise<Dashboard>>;
    let mockGetCurrentRole: jest.MockedFunction<() => string>;
    let mockValidatePermission: jest.MockedFunction<() => { allowed: boolean; reason?: string }>;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Get mocked modules
        const queueModule = await import('../utils/queue.js');
        const taskManagerModule = await import('../utils/task-manager.js');
        const permissionModule = await import('../utils/permission.js');
        const memoryModule = await import('../utils/memory.js');

        mockUpdateDashboard = queueModule.updateDashboard as typeof mockUpdateDashboard;
        mockAddActivity = queueModule.addActivity as typeof mockAddActivity;
        mockUpdateTaskInList = queueModule.updateTaskInList as typeof mockUpdateTaskInList;
        mockGetDashboard = (queueModule as any).getDashboard as typeof mockGetDashboard;
        mockRecalculateDashboardTasks = taskManagerModule.recalculateDashboardTasks as typeof mockRecalculateDashboardTasks;
        mockGetCurrentRole = permissionModule.getCurrentRole as typeof mockGetCurrentRole;
        mockValidatePermission = permissionModule.validateDashboardUpdatePermission as typeof mockValidatePermission;

        // Set default mock returns
        mockGetCurrentRole.mockReturnValue('leader');
        mockValidatePermission.mockReturnValue({ allowed: true });
        mockGetDashboard.mockResolvedValue(mockDashboard);
        mockUpdateDashboard.mockResolvedValue(mockDashboard);
        mockUpdateTaskInList.mockResolvedValue(true);
        mockAddActivity.mockResolvedValue(undefined);
        mockRecalculateDashboardTasks.mockResolvedValue(mockDashboard);

        // withDashboardTransaction: コールバックを実行して結果を返す
        mockWithDashboardTransaction.mockImplementation(async (cb: (db: Dashboard) => Promise<any>) => {
            const txDb = JSON.parse(JSON.stringify(mockDashboard)) as Dashboard;
            const result = await cb(txDb);
            return { result, dashboard: txDb };
        });

        // Set default mock returns for memory module
        (memoryModule.getProjectContext as jest.MockedFunction<typeof memoryModule.getProjectContext>).mockResolvedValue({
            what: '', why: '', who: '', constraints: '', currentState: '', preferences: '', lastUpdated: ''
        });
        (memoryModule.updateProjectContext as jest.MockedFunction<typeof memoryModule.updateProjectContext>).mockResolvedValue({
            what: '', why: '', who: '', constraints: '', currentState: '', preferences: '', lastUpdated: ''
        });

        // Import the module under test
        const module = await import('../tools/update-task-status.js');
        updateTaskStatus = module.updateTaskStatus;
        formatUpdateResult = module.formatUpdateResult;
    });

    describe('taskIdとnewStatusパラメータ', () => {
        it('taskIdとnewStatusが両方指定された場合、updateTaskInListが呼ばれる（completedAt付き）', async () => {
            await updateTaskStatus({
                taskId: 'task-001',
                newStatus: 'completed',
            });

            expect(mockUpdateTaskInList).toHaveBeenCalled();
            const call = mockUpdateTaskInList.mock.calls[0];
            expect(call[0]).toBe('task-001');
            expect(call[1]).toMatchObject({ status: 'completed' });
            expect(call[1]).toHaveProperty('completedAt');
        });

        it('taskIdとnewStatus=in_progressが指定された場合、startedAtが付く', async () => {
            await updateTaskStatus({
                taskId: 'task-001',
                newStatus: 'in_progress',
            });

            expect(mockUpdateTaskInList).toHaveBeenCalled();
            const call = mockUpdateTaskInList.mock.calls[0];
            expect(call[0]).toBe('task-001');
            expect(call[1]).toMatchObject({ status: 'in_progress' });
            expect(call[1]).toHaveProperty('startedAt');
        });

        it('taskIdのみ指定された場合、updateTaskInListは呼ばれない', async () => {
            await updateTaskStatus({
                taskId: 'task-001',
            });

            expect(mockUpdateTaskInList).not.toHaveBeenCalled();
        });

        it('newStatusのみ指定された場合、updateTaskInListは呼ばれない', async () => {
            await updateTaskStatus({
                newStatus: 'completed',
            });

            expect(mockUpdateTaskInList).not.toHaveBeenCalled();
        });

        it('アクティビティログにタスクID更新が記録される', async () => {
            await updateTaskStatus({
                taskId: 'task-001',
                newStatus: 'in_progress',
            });

            expect(mockAddActivity).toHaveBeenCalledWith({
                role: 'leader',
                action: 'update_task_status',
                details: 'task task-001: in_progress',
            }, expect.anything());
        });

        it('recalculateDashboardTasksが呼ばれる', async () => {
            await updateTaskStatus({
                taskId: 'task-001',
                newStatus: 'completed',
            });

            expect(mockRecalculateDashboardTasks).toHaveBeenCalled();
        });
    });

    describe('既存機能との併用', () => {
        it('phaseとtaskId/newStatusを同時に指定できる', async () => {
            await updateTaskStatus({
                phase: 'testing',
                taskId: 'task-001',
                newStatus: 'completed',
            });

            expect(mockWithDashboardTransaction).toHaveBeenCalled();
            expect(mockUpdateTaskInList).toHaveBeenCalled();
            const call = mockUpdateTaskInList.mock.calls[0];
            expect(call[0]).toBe('task-001');
            expect(call[1]).toMatchObject({ status: 'completed' });
            expect(mockAddActivity).toHaveBeenCalledWith({
                role: 'leader',
                action: 'update_task_status',
                details: 'phase: testing, task task-001: completed',
            }, expect.anything());
        });

        it('deltaとtaskId/newStatusを同時に指定できる（deltaは非推奨、再計算で上書き）', async () => {
            await updateTaskStatus({
                inProgressDelta: -1,
                completedDelta: 1,
                taskId: 'task-001',
                newStatus: 'completed',
            });

            // delta値は無視され、recalculateDashboardTasksで再計算される
            expect(mockRecalculateDashboardTasks).toHaveBeenCalled();
            expect(mockUpdateTaskInList).toHaveBeenCalled();
            const call = mockUpdateTaskInList.mock.calls[0];
            expect(call[0]).toBe('task-001');
            expect(call[1]).toMatchObject({ status: 'completed' });
        });
    });

    describe('権限チェック', () => {
        it('権限がない場合はエラーを返す', async () => {
            mockValidatePermission.mockReturnValue({
                allowed: false,
                reason: 'Permission denied',
            });

            const result = await updateTaskStatus({ taskId: 'task-001', newStatus: 'completed' });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Permission denied');
            expect(mockUpdateTaskInList).not.toHaveBeenCalled();
        });
    });

    describe('formatUpdateResult', () => {
        it('成功時は更新結果を表示する', () => {
            const result = {
                success: true,
                dashboard: mockDashboard,
            };

            const output = formatUpdateResult(result);

            expect(output).toContain('✅ タスクステータスを更新しました');
            expect(output).toContain('implementation');
        });

        it('失敗時はエラーメッセージを表示する', () => {
            const result = {
                success: false,
                error: 'テストエラー',
            };

            const output = formatUpdateResult(result);

            expect(output).toContain('❌ タスクステータスの更新に失敗しました');
            expect(output).toContain('テストエラー');
        });
    });

    describe('completed_task_idパラメータ', () => {
        it('completed_task_id指定時にupdateTaskInListが正しいパラメータで呼ばれる', async () => {
            await updateTaskStatus({
                completed_task_id: 'T-314',
            });

            expect(mockUpdateTaskInList).toHaveBeenCalled();
            const call = mockUpdateTaskInList.mock.calls[0];
            expect(call[0]).toBe('T-314');
            expect(call[1]).toMatchObject({ status: 'completed' });
            expect(call[1]).toHaveProperty('completedAt');
        });

        it('completed_task_id指定後にrecalculateDashboardTasksが呼ばれる', async () => {
            await updateTaskStatus({
                completed_task_id: 'T-314',
            });

            // updateTaskInListの後にrecalculateDashboardTasksが呼ばれることを確認
            expect(mockRecalculateDashboardTasks).toHaveBeenCalled();
        });

        it('completed_task_idとcompleted_assignee両方指定時の動作', async () => {
            const memoryModule = await import('../utils/memory.js');
            const mockGetProjectContext = memoryModule.getProjectContext as jest.MockedFunction<typeof memoryModule.getProjectContext>;
            const mockUpdateProjectContext = memoryModule.updateProjectContext as jest.MockedFunction<typeof memoryModule.updateProjectContext>;

            // current_stateにタスク情報がある場合
            mockGetProjectContext.mockResolvedValue({
                what: '', why: '', who: '', constraints: '',
                currentState: `### member-01\n- タスクID: T-314\n- タスク名: テストタスク\n- フェーズ: implementing\n`,
                preferences: '', lastUpdated: ''
            });

            await updateTaskStatus({
                completed_task_id: 'T-314',
                completed_assignee: 'member-01',
            });

            // updateTaskInListが呼ばれる
            expect(mockUpdateTaskInList).toHaveBeenCalledWith('T-314', expect.objectContaining({
                status: 'completed',
            }), expect.anything());

            // current_stateの更新が試みられる（parseとupdateが呼ばれる）
            expect(mockGetProjectContext).toHaveBeenCalled();
        });

        it('completed_task_idと他のパラメータを同時に指定できる', async () => {
            await updateTaskStatus({
                phase: 'completed',
                completed_task_id: 'T-314',
            });

            expect(mockWithDashboardTransaction).toHaveBeenCalled();
            expect(mockUpdateTaskInList).toHaveBeenCalledWith('T-314', expect.objectContaining({
                status: 'completed',
            }), expect.anything());
        });
    });

    describe('blockedステータスのサポート', () => {
        it('blockedDeltaは非推奨（recalculateDashboardTasksで再計算される）', async () => {
            await updateTaskStatus({
                blockedDelta: 1,
            });

            // delta値は無視され、recalculateDashboardTasksで再計算される
            expect(mockRecalculateDashboardTasks).toHaveBeenCalled();
        });

        it('タスクをblocked状態に設定できる', async () => {
            await updateTaskStatus({
                taskId: 'task-001',
                newStatus: 'blocked',
            });

            expect(mockUpdateTaskInList).toHaveBeenCalledWith('task-001', { status: 'blocked' }, expect.anything());
        });

        it('blockReasonがアクティビティログに記録される', async () => {
            await updateTaskStatus({
                taskId: 'task-001',
                newStatus: 'blocked',
                blockReason: '依存タスク未完了',
            });

            expect(mockAddActivity).toHaveBeenCalledWith({
                role: 'leader',
                action: 'update_task_status',
                details: 'task task-001: blocked (依存タスク未完了)',
            }, expect.anything());
        });

        it('blockedDeltaと他のdeltaを同時に使用できる（deltaは非推奨）', async () => {
            await updateTaskStatus({
                inProgressDelta: -1,
                blockedDelta: 1,
                taskId: 'task-001',
                newStatus: 'blocked',
                blockReason: 'テスト',
            });

            // delta値は無視され、recalculateDashboardTasksで再計算される
            expect(mockRecalculateDashboardTasks).toHaveBeenCalled();
            expect(mockUpdateTaskInList).toHaveBeenCalledWith('task-001', { status: 'blocked' }, expect.anything());
        });

        it('formatUpdateResultがblockedを表示する', () => {
            const dashboardWithBlocked: Dashboard = {
                ...mockDashboard,
                tasks: {
                    ...mockDashboard.tasks,
                    blocked: 2,
                },
            };
            const result = {
                success: true,
                dashboard: dashboardWithBlocked,
            };

            const output = formatUpdateResult(result);

            expect(output).toContain('ブロック 2');
        });
    });
});
