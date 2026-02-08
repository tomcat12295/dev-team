import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Role, Dashboard, TaskSummary } from '../types/task.js';
import { createMockDashboard } from './helpers/mock-factories.js';

// Mock queue module
jest.unstable_mockModule('../utils/queue.js', () => ({
    addMessage: jest.fn<() => Promise<void>>(),
    generateId: jest.fn<() => Promise<string>>(),
    addActivity: jest.fn<() => Promise<void>>(),
    addTaskToList: jest.fn<() => Promise<void>>(),
    updateMemberStatus: jest.fn<() => Promise<void>>(),
    getDashboard: jest.fn<() => Promise<Dashboard>>(),
    linkParentChild: jest.fn<() => Promise<void>>(),
}));

// Mock task-manager module
jest.unstable_mockModule('../utils/task-manager.js', () => ({
    recalculateDashboardTasks: jest.fn<() => Promise<Dashboard>>(),
}));

// Mock wezterm module
jest.unstable_mockModule('../utils/wezterm.js', () => ({
    notifyRole: jest.fn<() => Promise<boolean>>(),
    sendTextToPane: jest.fn<() => Promise<void>>(),
}));

// Mock permission module
jest.unstable_mockModule('../utils/permission.js', () => ({
    getCurrentRole: jest.fn<() => Role>(),
    isValidRole: jest.fn<() => boolean>(),
    validateLeaderOnly: (role: string, toolName: string) => {
        if (role !== 'leader') return { allowed: false, reason: `${toolName}はleaderのみ使用可能です。現在の役割: ${role}` };
        return { allowed: true };
    },
}));

// Mock team-config module
jest.unstable_mockModule('../config/team-config.js', () => ({
    isMemberRole: jest.fn<() => boolean>(),
}));

// Mock memory module
jest.unstable_mockModule('../utils/memory.js', () => ({
    getProjectContext: jest.fn<() => Promise<any>>(),
    updateProjectContext: jest.fn<() => Promise<any>>(),
    parseCurrentStateSections: jest.fn<() => Record<string, any>>(),
    generateCurrentStateMarkdown: jest.fn<() => string>(),
    getReviewMode: jest.fn<() => Promise<'normal' | 'strict'>>(),
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

const mockDashboard: Dashboard = createMockDashboard();

describe('assign-task', () => {
    let assignTask: typeof import('../tools/assign-task.js').assignTask;
    let formatAssignTaskResult: typeof import('../tools/assign-task.js').formatAssignTaskResult;

    let mockAddMessage: jest.MockedFunction<() => Promise<void>>;
    let mockGenerateId: jest.MockedFunction<() => Promise<string>>;
    let mockAddActivity: jest.MockedFunction<() => Promise<void>>;
    let mockAddTaskToList: jest.MockedFunction<() => Promise<void>>;
    let mockUpdateMemberStatus: jest.MockedFunction<() => Promise<void>>;
    let mockGetDashboard: jest.MockedFunction<() => Promise<Dashboard>>;
    let mockLinkParentChild: jest.MockedFunction<() => Promise<void>>;
    let mockRecalculateDashboardTasks: jest.MockedFunction<() => Promise<Dashboard>>;
    let mockNotifyRole: jest.MockedFunction<() => Promise<boolean>>;
    let mockSendTextToPane: jest.MockedFunction<() => Promise<void>>;
    let mockGetCurrentRole: jest.MockedFunction<() => Role>;
    let mockIsValidRole: jest.MockedFunction<() => boolean>;
    let mockIsMemberRole: jest.MockedFunction<() => boolean>;
    let mockGetProjectContext: jest.MockedFunction<() => Promise<any>>;
    let mockUpdateProjectContext: jest.MockedFunction<() => Promise<any>>;
    let mockGetReviewMode: jest.MockedFunction<() => Promise<'normal' | 'strict'>>;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Get mocked modules
        const queueModule = await import('../utils/queue.js');
        const taskManagerModule = await import('../utils/task-manager.js');
        const weztermModule = await import('../utils/wezterm.js');
        const permissionModule = await import('../utils/permission.js');
        const teamConfigModule = await import('../config/team-config.js');
        const memoryModule = await import('../utils/memory.js');

        mockAddMessage = queueModule.addMessage as unknown as typeof mockAddMessage;
        mockGenerateId = queueModule.generateId as unknown as typeof mockGenerateId;
        mockAddActivity = queueModule.addActivity as unknown as typeof mockAddActivity;
        mockAddTaskToList = queueModule.addTaskToList as unknown as typeof mockAddTaskToList;
        mockUpdateMemberStatus = queueModule.updateMemberStatus as unknown as typeof mockUpdateMemberStatus;
        mockGetDashboard = (queueModule as any).getDashboard as unknown as typeof mockGetDashboard;
        mockLinkParentChild = (queueModule as any).linkParentChild as unknown as typeof mockLinkParentChild;
        mockRecalculateDashboardTasks = taskManagerModule.recalculateDashboardTasks as unknown as typeof mockRecalculateDashboardTasks;
        mockNotifyRole = weztermModule.notifyRole as unknown as typeof mockNotifyRole;
        mockSendTextToPane = (weztermModule as any).sendTextToPane as unknown as typeof mockSendTextToPane;
        mockGetCurrentRole = permissionModule.getCurrentRole as unknown as typeof mockGetCurrentRole;
        mockIsValidRole = permissionModule.isValidRole as unknown as typeof mockIsValidRole;
        mockIsMemberRole = teamConfigModule.isMemberRole as unknown as typeof mockIsMemberRole;
        mockGetProjectContext = memoryModule.getProjectContext as unknown as typeof mockGetProjectContext;
        mockUpdateProjectContext = memoryModule.updateProjectContext as unknown as typeof mockUpdateProjectContext;
        mockGetReviewMode = (memoryModule as any).getReviewMode as unknown as typeof mockGetReviewMode;

        // Set default mock returns
        mockGenerateId.mockResolvedValue('T-001');
        mockAddMessage.mockResolvedValue(undefined);
        mockAddActivity.mockResolvedValue(undefined);
        mockAddTaskToList.mockResolvedValue(undefined);
        mockUpdateMemberStatus.mockResolvedValue(undefined);
        mockGetDashboard.mockResolvedValue(mockDashboard);
        mockLinkParentChild.mockResolvedValue(undefined);
        mockRecalculateDashboardTasks.mockResolvedValue(mockDashboard);
        mockNotifyRole.mockResolvedValue(true);
        mockSendTextToPane.mockResolvedValue(undefined);
        mockGetProjectContext.mockResolvedValue({ currentState: '' });
        mockUpdateProjectContext.mockResolvedValue({});
        (memoryModule.parseCurrentStateSections as jest.Mock).mockReturnValue({});
        (memoryModule.generateCurrentStateMarkdown as jest.Mock).mockReturnValue('');
        mockGetReviewMode.mockResolvedValue('normal');

        // Import the module under test
        const assignTaskModule = await import('../tools/assign-task.js');
        assignTask = assignTaskModule.assignTask;
        formatAssignTaskResult = assignTaskModule.formatAssignTaskResult;
    });

    function setupLeaderRole() {
        mockGetCurrentRole.mockReturnValue('leader' as Role);
        mockIsValidRole.mockReturnValue(true);
        mockIsMemberRole.mockReturnValue(true);
    }

    describe('権限チェック', () => {
        it('leaderのみがassign_taskを使用可能', async () => {
            mockGetCurrentRole.mockReturnValue('member-01' as Role);

            const result = await assignTask({
                to: 'member-02',
                title: 'テストタスク',
                description: '説明',
                acceptance_criteria: ['条件1'],
                allowed_files: ['file.ts'],
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('leaderのみ使用可能');
        });

        it('pmはassign_taskを使用できない', async () => {
            mockGetCurrentRole.mockReturnValue('pm' as Role);

            const result = await assignTask({
                to: 'member-01',
                title: 'テストタスク',
                description: '説明',
                acceptance_criteria: ['条件1'],
                allowed_files: ['file.ts'],
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('leaderのみ使用可能');
        });
    });

    describe('送信先チェック', () => {
        it('無効なロールへの送信は失敗する', async () => {
            mockGetCurrentRole.mockReturnValue('leader' as Role);
            mockIsValidRole.mockReturnValue(false);

            const result = await assignTask({
                to: 'invalid-role',
                title: 'テストタスク',
                description: '説明',
                acceptance_criteria: ['条件1'],
                allowed_files: ['file.ts'],
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('無効な送信先');
        });

        it('member以外への送信は失敗する', async () => {
            mockGetCurrentRole.mockReturnValue('leader' as Role);
            mockIsValidRole.mockReturnValue(true);
            mockIsMemberRole.mockReturnValue(false);

            const result = await assignTask({
                to: 'pm',
                title: 'テストタスク',
                description: '説明',
                acceptance_criteria: ['条件1'],
                allowed_files: ['file.ts'],
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('memberにのみ送信可能');
        });
    });

    describe('必須パラメータのバリデーション', () => {
        beforeEach(() => {
            setupLeaderRole();
        });

        it('titleが空の場合は失敗する', async () => {
            const result = await assignTask({
                to: 'member-01',
                title: '',
                description: '説明',
                acceptance_criteria: ['条件1'],
                allowed_files: ['file.ts'],
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('title は空にできません');
        });

        it('descriptionが空の場合は失敗する', async () => {
            const result = await assignTask({
                to: 'member-01',
                title: 'テストタスク',
                description: '',
                acceptance_criteria: ['条件1'],
                allowed_files: ['file.ts'],
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('description は空にできません');
        });

        it('acceptance_criteriaが空配列の場合は失敗する', async () => {
            const result = await assignTask({
                to: 'member-01',
                title: 'テストタスク',
                description: '説明',
                acceptance_criteria: [],
                allowed_files: ['file.ts'],
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('acceptance_criteria は1つ以上必須');
        });
    });

    describe('allowed_filesのバリデーション', () => {
        beforeEach(() => {
            setupLeaderRole();
        });

        it('通常タスク: allowed_filesが空の場合は失敗する', async () => {
            const result = await assignTask({
                to: 'member-01',
                title: 'テストタスク',
                description: '説明',
                acceptance_criteria: ['条件1'],
                allowed_files: [],
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('allowed_filesは1つ以上の変更許可ファイルが必須');
        });

        it('investigationタスク: allowed_files空配列が許可される', async () => {
            const result = await assignTask({
                to: 'member-01',
                title: '調査タスク',
                description: '調査の説明',
                acceptance_criteria: ['調査条件1'],
                allowed_files: [],
                task_type: 'investigation',
            });

            expect(result.success).toBe(true);
            expect(result.taskId).toBe('T-001');
        });

        it('investigationタスク: allowed_files未指定でも成功する', async () => {
            const result = await assignTask({
                to: 'member-01',
                title: '調査タスク',
                description: '調査の説明',
                acceptance_criteria: ['調査条件1'],
                allowed_files: undefined as any,
                task_type: 'investigation',
            });

            expect(result.success).toBe(true);
        });
    });

    describe('investigationタスクの特別処理', () => {
        beforeEach(() => {
            setupLeaderRole();
        });

        it('investigationタスクはphaseがimplementingで開始される', async () => {
            await assignTask({
                to: 'member-01',
                title: '調査タスク',
                description: '調査の説明',
                acceptance_criteria: ['調査条件1'],
                allowed_files: [],
                task_type: 'investigation',
            });

            // addTaskToListが呼ばれた際の引数を確認
            expect(mockAddTaskToList).toHaveBeenCalledTimes(1);
            const taskSummary = (mockAddTaskToList.mock.calls[0] as unknown[])[0] as TaskSummary;
            expect(taskSummary.phase).toBe('implementing');
            expect(taskSummary.taskType).toBe('investigation');
        });

        it('通常タスクはphaseがplanningで開始される', async () => {
            await assignTask({
                to: 'member-01',
                title: '実装タスク',
                description: '実装の説明',
                acceptance_criteria: ['実装条件1'],
                allowed_files: ['src/file.ts'],
            });

            expect(mockAddTaskToList).toHaveBeenCalledTimes(1);
            const taskSummary = (mockAddTaskToList.mock.calls[0] as unknown[])[0] as TaskSummary;
            expect(taskSummary.phase).toBe('planning');
            expect(taskSummary.taskType).toBe('implementation');
        });
    });

    describe('正常系', () => {
        beforeEach(() => {
            setupLeaderRole();
        });

        it('正常なタスク割り当てが成功する', async () => {
            const result = await assignTask({
                to: 'member-01',
                title: 'テストタスク',
                description: 'タスクの説明',
                acceptance_criteria: ['条件1', '条件2'],
                allowed_files: ['src/file.ts'],
            });

            expect(result.success).toBe(true);
            expect(result.taskId).toBe('T-001');
            expect(result.notified).toBe(true);
            expect(mockAddMessage).toHaveBeenCalledTimes(1);
            expect(mockAddTaskToList).toHaveBeenCalledTimes(1);
            // updateMemberStatusは2回呼ばれる（member + leader）
            expect(mockUpdateMemberStatus).toHaveBeenCalledTimes(2);
        });

        it('優先度が設定される', async () => {
            await assignTask({
                to: 'member-01',
                title: 'テストタスク',
                description: '説明',
                acceptance_criteria: ['条件1'],
                allowed_files: ['file.ts'],
                priority: 'high',
            });

            const taskSummary = (mockAddTaskToList.mock.calls[0] as unknown[])[0] as TaskSummary;
            expect(taskSummary.priority).toBe('high');
        });

        it('forbidden_filesが設定される', async () => {
            await assignTask({
                to: 'member-01',
                title: 'テストタスク',
                description: '説明',
                acceptance_criteria: ['条件1'],
                allowed_files: ['src/file.ts'],
                forbidden_files: ['src/secret.ts'],
            });

            const taskSummary = (mockAddTaskToList.mock.calls[0] as unknown[])[0] as TaskSummary;
            expect(taskSummary.forbiddenFiles).toContain('src/secret.ts');
        });
    });

    describe('leaderステータス更新', () => {
        beforeEach(() => {
            setupLeaderRole();
        });

        it('assign_task成功後にleaderのステータスがidleに更新される', async () => {
            const result = await assignTask({
                to: 'member-01',
                title: 'テストタスク',
                description: 'タスクの説明',
                acceptance_criteria: ['条件1'],
                allowed_files: ['src/file.ts'],
            });

            expect(result.success).toBe(true);

            // updateMemberStatusが2回呼ばれる（member + leader）
            expect(mockUpdateMemberStatus).toHaveBeenCalledTimes(2);

            // 1回目: memberのステータス更新
            expect(mockUpdateMemberStatus).toHaveBeenNthCalledWith(1, 'member-01', expect.objectContaining({
                status: 'working',
            }));

            // 2回目: leaderのステータスをidleに更新
            expect(mockUpdateMemberStatus).toHaveBeenNthCalledWith(2, 'leader', expect.objectContaining({
                status: 'idle',
                currentTask: undefined,
            }));
        });

        it('leaderステータス更新失敗時もタスク割り当ては成功する', async () => {
            // 2回目（leaderのステータス更新）でエラーを投げる
            mockUpdateMemberStatus
                .mockResolvedValueOnce(undefined)  // 1回目: member更新は成功
                .mockRejectedValueOnce(new Error('Leader status update failed'));  // 2回目: leader更新は失敗

            const result = await assignTask({
                to: 'member-01',
                title: 'テストタスク',
                description: 'タスクの説明',
                acceptance_criteria: ['条件1'],
                allowed_files: ['src/file.ts'],
            });

            // タスク割り当て自体は成功する
            expect(result.success).toBe(true);
            expect(result.taskId).toBe('T-001');
        });
    });

    describe('formatAssignTaskResult', () => {
        it('成功時のフォーマット', () => {
            const result = formatAssignTaskResult({
                success: true,
                taskId: 'T-001',
                notified: true,
            });

            expect(result).toContain('✅');
            expect(result).toContain('T-001');
            expect(result).toContain('通知しました');
        });

        it('失敗時のフォーマット', () => {
            const result = formatAssignTaskResult({
                success: false,
                error: 'エラーメッセージ',
                notified: false,
            });

            expect(result).toContain('❌');
            expect(result).toContain('エラーメッセージ');
        });
    });

    describe('/compact送信（taskType条件）', () => {
        beforeEach(() => {
            setupLeaderRole();
        });

        it('taskType=implementation（デフォルト）の場合、/compactが送信される', async () => {
            await assignTask({
                to: 'member-01',
                title: 'テストタスク',
                description: '説明',
                acceptance_criteria: ['条件1'],
                allowed_files: ['file.ts'],
            });

            expect(mockSendTextToPane).toHaveBeenCalledWith('member-01', '/compact');
        });

        it('taskType=implementationを明示的に指定した場合、/compactが送信される', async () => {
            await assignTask({
                to: 'member-01',
                title: 'テストタスク',
                description: '説明',
                acceptance_criteria: ['条件1'],
                allowed_files: ['file.ts'],
                task_type: 'implementation',
            });

            expect(mockSendTextToPane).toHaveBeenCalledWith('member-01', '/compact');
        });

        it('taskType=investigationの場合、/compactが送信されない', async () => {
            await assignTask({
                to: 'member-01',
                title: '調査タスク',
                description: '説明',
                acceptance_criteria: ['条件1'],
                allowed_files: [],
                task_type: 'investigation',
            });

            expect(mockSendTextToPane).not.toHaveBeenCalled();
        });

        it('taskType=reviewの場合、/compactが送信されない', async () => {
            await assignTask({
                to: 'member-01',
                title: 'レビュータスク',
                description: '説明',
                acceptance_criteria: ['条件1'],
                allowed_files: ['file.ts'],
                task_type: 'review',
            });

            expect(mockSendTextToPane).not.toHaveBeenCalled();
        });

        it('taskType=documentationの場合、/compactが送信されない', async () => {
            await assignTask({
                to: 'member-01',
                title: 'ドキュメントタスク',
                description: '説明',
                acceptance_criteria: ['条件1'],
                allowed_files: ['file.ts'],
                task_type: 'documentation',
            });

            expect(mockSendTextToPane).not.toHaveBeenCalled();
        });

        it('sendTextToPaneがエラーでもタスク割り当ては成功する', async () => {
            mockSendTextToPane.mockRejectedValue(new Error('WezTerm error'));

            const result = await assignTask({
                to: 'member-01',
                title: 'テストタスク',
                description: '説明',
                acceptance_criteria: ['条件1'],
                allowed_files: ['file.ts'],
            });

            expect(result.success).toBe(true);
            expect(result.taskId).toBe('T-001');
        });
    });

    describe('hasReceivedTaskThisSessionフラグ更新', () => {
        beforeEach(() => {
            setupLeaderRole();
        });

        it('タスク割り当て後、hasReceivedTaskThisSession=trueでupdateMemberStatusが呼ばれる', async () => {
            await assignTask({
                to: 'member-01',
                title: 'テストタスク',
                description: '説明',
                acceptance_criteria: ['条件1'],
                allowed_files: ['file.ts'],
            });

            // updateMemberStatusがhasReceivedTaskThisSession=trueで呼ばれることを確認
            expect(mockUpdateMemberStatus).toHaveBeenCalledWith('member-01', expect.objectContaining({
                hasReceivedTaskThisSession: true,
            }));
        });
    });
});
