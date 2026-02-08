import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Dashboard, ApprovalRequest } from '../types/task.js';
import type { AssignTaskResult } from '../tools/assign-task.js';
import { createMockDashboard } from './helpers/mock-factories.js';
import type { RequestMemberIncreaseResult } from '../tools/request-member-increase.js';

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
    getDashboard: jest.fn<() => Promise<Dashboard>>(),
    addApprovalRequest: jest.fn<() => Promise<ApprovalRequest>>(),
}));

// Mock memory module
jest.unstable_mockModule('../utils/memory.js', () => ({
    getTaskSplitApproval: jest.fn<() => Promise<'auto' | 'required'>>(),
}));

// Mock assign-task module
jest.unstable_mockModule('../tools/assign-task.js', () => ({
    assignTask: jest.fn<() => Promise<AssignTaskResult>>(),
}));

// Mock request-member-increase module
jest.unstable_mockModule('../tools/request-member-increase.js', () => ({
    requestMemberIncrease: jest.fn<() => Promise<RequestMemberIncreaseResult>>(),
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));


// Extended result type for testing (includes new fields before implementation)
interface ExtendedDistributeTasksResult {
    success: boolean;
    results: Array<{ title: string; taskId?: string; to?: string; success: boolean; error?: string }>;
    successCount: number;
    failureCount: number;
    error?: string;
    needsMemberIncrease?: boolean;
    memberIncreaseRequested?: number;
    pendingSubtasks?: Array<{ title: string; description: string; acceptance_criteria: string[]; allowed_files: string[] }>;
    awaitingApproval?: boolean;
    approvalId?: string;
}

// Type for formatSplitApprovalDescription function
type FormatSplitApprovalDescriptionFn = (subtasks: Array<{
    title: string;
    description: string;
    acceptance_criteria: string[];
    allowed_files: string[];
    to?: string;
}>) => string;

describe('distribute-tasks', () => {
    let distributeTasks: (params: { parent_task_id: string; subtasks: Array<any> }) => Promise<ExtendedDistributeTasksResult>;
    let formatDistributeTasksResult: (result: ExtendedDistributeTasksResult) => string;
    let formatSplitApprovalDescription: FormatSplitApprovalDescriptionFn;

    let mockGetCurrentRole: jest.MockedFunction<() => string>;
    let mockGetDashboard: jest.MockedFunction<() => Promise<Dashboard>>;
    let mockAssignTask: jest.MockedFunction<() => Promise<AssignTaskResult>>;
    let mockRequestMemberIncrease: jest.MockedFunction<() => Promise<RequestMemberIncreaseResult>>;
    let mockGetTaskSplitApproval: jest.MockedFunction<() => Promise<'auto' | 'required'>>;
    let mockAddApprovalRequest: jest.MockedFunction<() => Promise<ApprovalRequest>>;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Get mocked modules
        const permissionModule = await import('../utils/permission.js');
        const queueModule = await import('../utils/queue.js');
        const assignTaskModule = await import('../tools/assign-task.js');
        const memberIncreaseModule = await import('../tools/request-member-increase.js');
        const memoryModule = await import('../utils/memory.js');

        mockGetCurrentRole = permissionModule.getCurrentRole as typeof mockGetCurrentRole;
        mockGetDashboard = (queueModule as any).getDashboard as typeof mockGetDashboard;
        mockAddApprovalRequest = (queueModule as any).addApprovalRequest as typeof mockAddApprovalRequest;
        mockAssignTask = (assignTaskModule as any).assignTask as typeof mockAssignTask;
        mockRequestMemberIncrease = (memberIncreaseModule as any).requestMemberIncrease as typeof mockRequestMemberIncrease;
        mockGetTaskSplitApproval = (memoryModule as any).getTaskSplitApproval as typeof mockGetTaskSplitApproval;

        // Default: taskSplitApproval is auto (従来の動作)
        mockGetTaskSplitApproval.mockResolvedValue('auto');

        // Import the module under test
        const distributeTasksModule = await import('../tools/distribute-tasks.js');
        distributeTasks = distributeTasksModule.distributeTasks as typeof distributeTasks;
        formatDistributeTasksResult = distributeTasksModule.formatDistributeTasksResult as typeof formatDistributeTasksResult;
        // formatSplitApprovalDescription will be added in implementation
        formatSplitApprovalDescription = (distributeTasksModule as any).formatSplitApprovalDescription ?? (() => '(not implemented)');
    });


    describe('distributeTasks', () => {
        // 1. 権限チェック
        it('should reject non-leader role', async () => {
            mockGetCurrentRole.mockReturnValue('member-01');

            const result = await distributeTasks({
                parent_task_id: 'T-001',
                subtasks: [
                    {
                        title: 'Test Task',
                        description: 'Description',
                        acceptance_criteria: ['Done'],
                        allowed_files: ['file.ts'],
                        to: 'member-01',
                    },
                ],
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('leaderのみ使用可能');
        });

        // 2. バリデーション
        it('should require parent_task_id', async () => {
            mockGetCurrentRole.mockReturnValue('leader');

            const result = await distributeTasks({
                parent_task_id: '',
                subtasks: [
                    {
                        title: 'Test Task',
                        description: 'Description',
                        acceptance_criteria: ['Done'],
                        allowed_files: ['file.ts'],
                        to: 'member-01',
                    },
                ],
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('parent_task_id は空にできません');
        });

        it('should require at least one subtask', async () => {
            mockGetCurrentRole.mockReturnValue('leader');

            const result = await distributeTasks({
                parent_task_id: 'T-001',
                subtasks: [],
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('subtasks は1つ以上必須');
        });

        // 3. 基本機能
        it('should assign subtasks with specified "to"', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockGetDashboard.mockResolvedValue(createMockDashboard({
                memberStatus: { 'member-01': { status: 'idle' }, 'member-02': { status: 'idle' } },
            }));
            mockAssignTask.mockResolvedValue({
                success: true,
                taskId: 'T-100',
                notified: true,
            });

            const result = await distributeTasks({
                parent_task_id: 'T-001',
                subtasks: [
                    {
                        title: 'Test Task 1',
                        description: 'Description 1',
                        acceptance_criteria: ['Done'],
                        allowed_files: ['file1.ts'],
                        to: 'member-01',
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.successCount).toBe(1);
            expect(result.results[0].success).toBe(true);
            expect(result.results[0].to).toBe('member-01');
            expect(mockAssignTask).toHaveBeenCalledTimes(1);
        });

        it('should process multiple subtasks', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockGetDashboard.mockResolvedValue(createMockDashboard({
                memberStatus: { 'member-01': { status: 'idle' }, 'member-02': { status: 'idle' } },
            }));
            mockAssignTask
                .mockResolvedValueOnce({ success: true, taskId: 'T-100', notified: true })
                .mockResolvedValueOnce({ success: true, taskId: 'T-101', notified: true });

            const result = await distributeTasks({
                parent_task_id: 'T-001',
                subtasks: [
                    {
                        title: 'Task 1',
                        description: 'Desc 1',
                        acceptance_criteria: ['Done 1'],
                        allowed_files: ['file1.ts'],
                        to: 'member-01',
                    },
                    {
                        title: 'Task 2',
                        description: 'Desc 2',
                        acceptance_criteria: ['Done 2'],
                        allowed_files: ['file2.ts'],
                        to: 'member-02',
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.successCount).toBe(2);
            expect(result.results).toHaveLength(2);
            expect(mockAssignTask).toHaveBeenCalledTimes(2);
        });

        // 4. 自動割り当て
        it('should auto-assign to idle members when "to" is not specified', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockGetDashboard.mockResolvedValue(createMockDashboard({
                memberStatus: { 'member-01': { status: 'idle' }, 'member-02': { status: 'working' } },
            }));
            mockAssignTask.mockResolvedValue({
                success: true,
                taskId: 'T-100',
                notified: true,
            });

            const result = await distributeTasks({
                parent_task_id: 'T-001',
                subtasks: [
                    {
                        title: 'Auto Assign Task',
                        description: 'Description',
                        acceptance_criteria: ['Done'],
                        allowed_files: ['file.ts'],
                        // to is not specified
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.successCount).toBe(1);
            // assignTaskが呼ばれ、空きメンバーに割り当てられる
            expect(mockAssignTask).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'member-01', // idle member
                })
            );
        });

        it('should use round-robin for multiple auto-assignments', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockGetDashboard.mockResolvedValue(createMockDashboard({
                memberStatus: { 'member-01': { status: 'idle' }, 'member-02': { status: 'idle' } },
            }));
            mockAssignTask.mockResolvedValue({
                success: true,
                taskId: 'T-100',
                notified: true,
            });

            const result = await distributeTasks({
                parent_task_id: 'T-001',
                subtasks: [
                    {
                        title: 'Task 1',
                        description: 'Desc',
                        acceptance_criteria: ['Done'],
                        allowed_files: ['file1.ts'],
                    },
                    {
                        title: 'Task 2',
                        description: 'Desc',
                        acceptance_criteria: ['Done'],
                        allowed_files: ['file2.ts'],
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.successCount).toBe(2);
            // ラウンドロビンで割り当て
            expect(mockAssignTask).toHaveBeenNthCalledWith(1, expect.objectContaining({ to: 'member-01' }));
            expect(mockAssignTask).toHaveBeenNthCalledWith(2, expect.objectContaining({ to: 'member-02' }));
        });

        // 5. メンバー不足時
        it('should return needsMemberIncrease when not enough idle members', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockGetDashboard.mockResolvedValue(createMockDashboard({
                memberStatus: { 'member-01': { status: 'working' }, 'member-02': { status: 'working' } },
            }));
            mockRequestMemberIncrease.mockResolvedValue({
                success: true,
                currentCount: 2,
                requestedCount: 2,
                newTotal: 4,
            });

            const result = await distributeTasks({
                parent_task_id: 'T-001',
                subtasks: [
                    {
                        title: 'Task 1',
                        description: 'Desc',
                        acceptance_criteria: ['Done'],
                        allowed_files: ['file1.ts'],
                        // to is not specified - needs auto-assign
                    },
                    {
                        title: 'Task 2',
                        description: 'Desc',
                        acceptance_criteria: ['Done'],
                        allowed_files: ['file2.ts'],
                        // to is not specified - needs auto-assign
                    },
                ],
            });

            expect(result.success).toBe(false);
            expect(result.needsMemberIncrease).toBe(true);
            expect(result.pendingSubtasks).toHaveLength(2);
            expect(mockRequestMemberIncrease).toHaveBeenCalled();
        });

        it('should handle partial auto-assignment when some members are available', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockGetDashboard.mockResolvedValue(createMockDashboard({
                memberStatus: { 'member-01': { status: 'idle' }, 'member-02': { status: 'working' } },
            }));
            mockRequestMemberIncrease.mockResolvedValue({
                success: true,
                currentCount: 2,
                requestedCount: 1,
                newTotal: 3,
            });

            const result = await distributeTasks({
                parent_task_id: 'T-001',
                subtasks: [
                    {
                        title: 'Task 1',
                        description: 'Desc',
                        acceptance_criteria: ['Done'],
                        allowed_files: ['file1.ts'],
                    },
                    {
                        title: 'Task 2',
                        description: 'Desc',
                        acceptance_criteria: ['Done'],
                        allowed_files: ['file2.ts'],
                    },
                ],
            });

            // 1つの空きメンバーに対して2つのタスク -> 増員リクエスト
            expect(result.success).toBe(false);
            expect(result.needsMemberIncrease).toBe(true);
            expect(mockRequestMemberIncrease).toHaveBeenCalledWith(
                expect.objectContaining({
                    count: 1, // 2 tasks - 1 idle member = 1 needed
                })
            );
        });
    });

    describe('formatDistributeTasksResult', () => {
        it('should format success result', () => {
            const result = formatDistributeTasksResult({
                success: true,
                results: [
                    { title: 'Task 1', taskId: 'T-100', to: 'member-01', success: true },
                    { title: 'Task 2', taskId: 'T-101', to: 'member-02', success: true },
                ],
                successCount: 2,
                failureCount: 0,
            });

            expect(result).toContain('全2件のタスクを分配しました');
            expect(result).toContain('Task 1');
            expect(result).toContain('Task 2');
            expect(result).toContain('member-01');
            expect(result).toContain('member-02');
        });

        it('should format member increase needed result', () => {
            const result = formatDistributeTasksResult({
                success: false,
                results: [],
                successCount: 0,
                failureCount: 0,
                needsMemberIncrease: true,
                memberIncreaseRequested: 2,
                pendingSubtasks: [
                    { title: 'Pending Task 1', description: '', acceptance_criteria: [], allowed_files: [] },
                    { title: 'Pending Task 2', description: '', acceptance_criteria: [], allowed_files: [] },
                ],
            });

            expect(result).toContain('メンバー不足のため増員をリクエスト');
            expect(result).toContain('2名');
            expect(result).toContain('Pending Task 1');
            expect(result).toContain('Pending Task 2');
            expect(result).toContain('再度distribute_tasksを実行');
        });

        it('should format partial failure result', () => {
            const result = formatDistributeTasksResult({
                success: false,
                results: [
                    { title: 'Task 1', taskId: 'T-100', to: 'member-01', success: true },
                    { title: 'Task 2', success: false, error: 'Failed to assign' },
                ],
                successCount: 1,
                failureCount: 1,
            });

            expect(result).toContain('部分的に失敗');
            expect(result).toContain('成功: 1件');
            expect(result).toContain('失敗: 1件');
            expect(result).toContain('Failed to assign');
        });

        it('should format awaiting approval result', () => {
            const result = formatDistributeTasksResult({
                success: true,
                results: [],
                successCount: 0,
                failureCount: 0,
                awaitingApproval: true,
                approvalId: 'approval-123',
            });

            expect(result).toContain('承認待ち');
            expect(result).toContain('approval-123');
        });
    });

    describe('taskSplitApproval', () => {
        // 1. taskSplitApproval=true時、承認リクエストが生成される
        it('should create approval request when taskSplitApproval is true', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockGetTaskSplitApproval.mockResolvedValue('required');
            mockGetDashboard.mockResolvedValue(createMockDashboard({
                memberStatus: { 'member-01': { status: 'idle' }, 'member-02': { status: 'idle' } },
            }));
            mockAddApprovalRequest.mockResolvedValue({
                id: 'approval-test-123',
                title: 'タスク分割承認',
                description: 'test description',
                type: 'task_split',
                status: 'pending',
                requestedBy: 'leader',
                requestedAt: '2026-02-05T00:00:00.000Z',
            });

            const result = await distributeTasks({
                parent_task_id: 'T-001',
                subtasks: [
                    {
                        title: 'Task 1',
                        description: 'Desc 1',
                        acceptance_criteria: ['Done'],
                        allowed_files: ['file1.ts'],
                        to: 'member-01',
                    },
                ],
            });

            expect(result.awaitingApproval).toBe(true);
            expect(result.approvalId).toBe('approval-test-123');
            expect(mockAddApprovalRequest).toHaveBeenCalledTimes(1);
            // タスクは配信されない
            expect(mockAssignTask).not.toHaveBeenCalled();
        });

        // 2. 承認リクエストのmetadataにsubtasks情報が含まれる
        it('should include subtasks in approval request metadata', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockGetTaskSplitApproval.mockResolvedValue('required');
            mockGetDashboard.mockResolvedValue(createMockDashboard({
                memberStatus: { 'member-01': { status: 'idle' } },
            }));
            mockAddApprovalRequest.mockResolvedValue({
                id: 'approval-test-456',
                title: 'タスク分割承認',
                description: 'test',
                type: 'task_split',
                status: 'pending',
                requestedBy: 'leader',
                requestedAt: '2026-02-05T00:00:00.000Z',
            });

            const subtasks = [
                {
                    title: 'Task A',
                    description: 'Description A',
                    acceptance_criteria: ['Criteria A'],
                    allowed_files: ['fileA.ts'],
                    to: 'member-01',
                },
                {
                    title: 'Task B',
                    description: 'Description B',
                    acceptance_criteria: ['Criteria B'],
                    allowed_files: ['fileB.ts'],
                    to: 'member-02',
                },
            ];

            await distributeTasks({
                parent_task_id: 'T-002',
                subtasks,
            });

            expect(mockAddApprovalRequest).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'task_split',
                    metadata: expect.objectContaining({
                        parentTaskId: 'T-002',
                        subtasks: subtasks,
                    }),
                })
            );
        });

        // 3. awaitingApproval=trueで返却、タスクは配信されない
        it('should return awaitingApproval=true and not distribute tasks', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockGetTaskSplitApproval.mockResolvedValue('required');
            mockGetDashboard.mockResolvedValue(createMockDashboard({
                memberStatus: { 'member-01': { status: 'idle' }, 'member-02': { status: 'idle' } },
            }));
            mockAddApprovalRequest.mockResolvedValue({
                id: 'approval-789',
                title: 'タスク分割承認',
                description: 'test',
                type: 'task_split',
                status: 'pending',
                requestedBy: 'leader',
                requestedAt: '2026-02-05T00:00:00.000Z',
            });

            const result = await distributeTasks({
                parent_task_id: 'T-003',
                subtasks: [
                    {
                        title: 'Task 1',
                        description: 'Desc',
                        acceptance_criteria: ['Done'],
                        allowed_files: ['file.ts'],
                        to: 'member-01',
                    },
                    {
                        title: 'Task 2',
                        description: 'Desc',
                        acceptance_criteria: ['Done'],
                        allowed_files: ['file2.ts'],
                        to: 'member-02',
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.awaitingApproval).toBe(true);
            expect(result.results).toHaveLength(0);
            expect(result.successCount).toBe(0);
            expect(mockAssignTask).not.toHaveBeenCalled();
        });

        // 4. taskSplitApproval=false時、従来通り即配信
        it('should distribute tasks immediately when taskSplitApproval is false', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockGetTaskSplitApproval.mockResolvedValue('auto');
            mockGetDashboard.mockResolvedValue(createMockDashboard({
                memberStatus: { 'member-01': { status: 'idle' } },
            }));
            mockAssignTask.mockResolvedValue({
                success: true,
                taskId: 'T-100',
                notified: true,
            });

            const result = await distributeTasks({
                parent_task_id: 'T-004',
                subtasks: [
                    {
                        title: 'Task 1',
                        description: 'Desc',
                        acceptance_criteria: ['Done'],
                        allowed_files: ['file.ts'],
                        to: 'member-01',
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.awaitingApproval).toBeUndefined();
            expect(result.successCount).toBe(1);
            expect(mockAssignTask).toHaveBeenCalledTimes(1);
            expect(mockAddApprovalRequest).not.toHaveBeenCalled();
        });

        // 5. バリデーションはtaskSplitApprovalチェック前に実行される
        it('should validate before checking taskSplitApproval', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockGetTaskSplitApproval.mockResolvedValue('required');

            const result = await distributeTasks({
                parent_task_id: '',
                subtasks: [],
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('parent_task_id は空にできません');
            // taskSplitApprovalは呼ばれない
            expect(mockGetTaskSplitApproval).not.toHaveBeenCalled();
        });
    });

    describe('formatSplitApprovalDescription', () => {
        it('should format subtasks list', () => {
            const subtasks = [
                {
                    title: 'タスク1',
                    description: '説明1',
                    acceptance_criteria: ['条件1'],
                    allowed_files: ['file1.ts'],
                    to: 'member-01',
                },
                {
                    title: 'タスク2',
                    description: '説明2',
                    acceptance_criteria: ['条件2'],
                    allowed_files: ['file2.ts'],
                },
            ];

            const result = formatSplitApprovalDescription(subtasks);

            expect(result).toContain('タスク1');
            expect(result).toContain('タスク2');
            expect(result).toContain('member-01');
            expect(result).toContain('2件');
        });

        it('should handle empty subtasks', () => {
            const result = formatSplitApprovalDescription([]);
            expect(result).toContain('0件');
        });
    });
});
