import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { ApprovalRequest } from '../types/task.js';

// Mock team-session module (addMember, removeMember)
jest.unstable_mockModule('../utils/team-session.js', () => ({
    addMember: jest.fn<() => Promise<{ addedRoles: string[]; previousCount: number; newCount: number }>>(),
    removeMember: jest.fn<() => Promise<{ removedRoles: string[]; previousCount: number; newCount: number }>>(),
}));

// Mock queue module
jest.unstable_mockModule('../utils/queue.js', () => ({
    updateApprovalStatus: jest.fn<() => Promise<ApprovalRequest | null>>(),
    addActivity: jest.fn<() => Promise<void>>(),
}));

// Mock assign-task module
jest.unstable_mockModule('../tools/assign-task.js', () => ({
    assignTask: jest.fn<() => Promise<{ success: boolean; taskId?: string; error?: string; notified: boolean }>>(),
    assignTaskCore: jest.fn<() => Promise<{ success: boolean; taskId?: string; error?: string; notified: boolean }>>(),
}));

// Mock send-task module
jest.unstable_mockModule('../tools/send-task.js', () => ({
    sendTask: jest.fn<() => Promise<{ success: boolean; messageId?: string; error?: string; notified: boolean }>>(),
}));

// Mock permission module
jest.unstable_mockModule('../utils/permission.js', () => ({
    getCurrentRole: jest.fn<() => string>(),
    validateProcessApprovalPermission: jest.fn<() => { allowed: boolean; reason?: string }>(),
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
}));

describe('process-approval', () => {
    let processApproval: typeof import('../tools/process-approval.js').processApproval;
    let formatProcessApprovalResult: typeof import('../tools/process-approval.js').formatProcessApprovalResult;

    let mockUpdateApprovalStatus: jest.MockedFunction<() => Promise<ApprovalRequest | null>>;
    let mockAddActivity: jest.MockedFunction<() => Promise<void>>;
    let mockGetCurrentRole: jest.MockedFunction<() => string>;
    let mockValidateProcessApprovalPermission: jest.MockedFunction<() => { allowed: boolean; reason?: string }>;
    let mockWarn: jest.MockedFunction<(...args: unknown[]) => void>;
    let mockInfo: jest.MockedFunction<(...args: unknown[]) => void>;
    let mockAssignTask: jest.MockedFunction<() => Promise<{ success: boolean; taskId?: string; error?: string; notified: boolean }>>;
    let mockAssignTaskCore: jest.MockedFunction<() => Promise<{ success: boolean; taskId?: string; error?: string; notified: boolean }>>;
    let mockSendTask: jest.MockedFunction<() => Promise<{ success: boolean; messageId?: string; error?: string; notified: boolean }>>;
    let mockAddMember: jest.MockedFunction<() => Promise<{ addedRoles: string[]; previousCount: number; newCount: number }>>;
    let mockRemoveMember: jest.MockedFunction<() => Promise<{ removedRoles: string[]; previousCount: number; newCount: number }>>;

    const originalEnv = process.env;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Reset environment
        process.env = { ...originalEnv, DEV_TEAM_PROJECT_PATH: 'C:\\test\\project' };

        // Get mocked modules
        const queueModule = await import('../utils/queue.js');
        const permissionModule = await import('../utils/permission.js');
        const loggerModule = await import('../utils/logger.js');
        const assignTaskModule = await import('../tools/assign-task.js');
        const sendTaskModule = await import('../tools/send-task.js');
        const teamSessionModule = await import('../utils/team-session.js');

        mockUpdateApprovalStatus = queueModule.updateApprovalStatus as typeof mockUpdateApprovalStatus;
        mockAddActivity = queueModule.addActivity as typeof mockAddActivity;
        mockGetCurrentRole = permissionModule.getCurrentRole as typeof mockGetCurrentRole;
        mockValidateProcessApprovalPermission = permissionModule.validateProcessApprovalPermission as typeof mockValidateProcessApprovalPermission;
        mockWarn = loggerModule.warn as typeof mockWarn;
        mockInfo = loggerModule.info as typeof mockInfo;
        mockAssignTask = assignTaskModule.assignTask as typeof mockAssignTask;
        mockAssignTaskCore = assignTaskModule.assignTaskCore as typeof mockAssignTaskCore;
        mockSendTask = sendTaskModule.sendTask as typeof mockSendTask;
        mockAddMember = teamSessionModule.addMember as typeof mockAddMember;
        mockRemoveMember = teamSessionModule.removeMember as typeof mockRemoveMember;

        // Import the module under test
        const approvalModule = await import('../tools/process-approval.js');
        processApproval = approvalModule.processApproval;
        formatProcessApprovalResult = approvalModule.formatProcessApprovalResult;
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('basic approval processing', () => {
        it('should approve a request successfully', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-123',
                title: 'Test Approval',
                description: 'Test',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'design',
                status: 'approved',
            });
            mockAddActivity.mockResolvedValue(undefined);

            const result = await processApproval({ approval_id: 'approval-123', action: 'approve' });

            expect(result.success).toBe(true);
            expect(result.status).toBe('approved');
            expect(result.approvalId).toBe('approval-123');
        });

        it('should reject a request successfully', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-456',
                title: 'Test Approval',
                description: 'Test',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'design',
                status: 'rejected',
            });
            mockAddActivity.mockResolvedValue(undefined);

            const result = await processApproval({ approval_id: 'approval-456', action: 'reject' });

            expect(result.success).toBe(true);
            expect(result.status).toBe('rejected');
        });

        it('should fail when permission is denied', async () => {
            mockGetCurrentRole.mockReturnValue('member-01');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: false, reason: 'Members cannot process approvals' });

            const result = await processApproval({ approval_id: 'approval-123', action: 'approve' });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Members cannot process approvals');
        });

        it('should fail when approval not found', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue(null);

            const result = await processApproval({ approval_id: 'nonexistent', action: 'approve' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });
    });

    describe('member_increase approval handling', () => {
        it('should call addMember when member_increase is approved', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-member',
                title: 'Member Increase',
                description: 'Need more members',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'member_increase',
                status: 'approved',
                metadata: {
                    currentCount: 2,
                    requestedCount: 2,
                    newTotal: 4,
                },
            });
            mockAddActivity.mockResolvedValue(undefined);
            mockAddMember.mockResolvedValue({ addedRoles: ['member-03', 'member-04'], previousCount: 2, newCount: 4 });

            const result = await processApproval({ approval_id: 'approval-member', action: 'approve' });

            expect(result.success).toBe(true);
            expect(mockAddMember).toHaveBeenCalledWith({
                projectPath: 'C:\\test\\project',
                count: 2,
            });
        });

        it('should not call addMember when member_increase is rejected', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-member',
                title: 'Member Increase',
                description: 'Need more members',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'member_increase',
                status: 'rejected',
                metadata: {
                    currentCount: 2,
                    requestedCount: 2,
                    newTotal: 4,
                },
            });
            mockAddActivity.mockResolvedValue(undefined);

            const result = await processApproval({ approval_id: 'approval-member', action: 'reject' });

            expect(result.success).toBe(true);
            expect(mockAddMember).not.toHaveBeenCalled();
        });

        it('should not call addMember for non-member_increase approvals', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-design',
                title: 'Design Approval',
                description: 'Design review',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'design',
                status: 'approved',
            });
            mockAddActivity.mockResolvedValue(undefined);

            const result = await processApproval({ approval_id: 'approval-design', action: 'approve' });

            expect(result.success).toBe(true);
            expect(mockAddMember).not.toHaveBeenCalled();
        });

        it('should succeed even if addMember fails', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-member',
                title: 'Member Increase',
                description: 'Need more members',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'member_increase',
                status: 'approved',
                metadata: {
                    currentCount: 2,
                    requestedCount: 1,
                    newTotal: 3,
                },
            });
            mockAddActivity.mockResolvedValue(undefined);

            // Make addMember fail
            mockAddMember.mockRejectedValue(new Error('Failed to add member'));

            const result = await processApproval({ approval_id: 'approval-member', action: 'approve' });

            // Approval should still succeed
            expect(result.success).toBe(true);
            expect(result.status).toBe('approved');
            // Warning should be logged
            expect(mockWarn).toHaveBeenCalled();
        });

        it('should warn if DEV_TEAM_PROJECT_PATH is not set', async () => {
            process.env.DEV_TEAM_PROJECT_PATH = '';

            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-member',
                title: 'Member Increase',
                description: 'Need more members',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'member_increase',
                status: 'approved',
                metadata: {
                    currentCount: 2,
                    requestedCount: 1,
                    newTotal: 3,
                },
            });
            mockAddActivity.mockResolvedValue(undefined);

            const result = await processApproval({ approval_id: 'approval-member', action: 'approve' });

            expect(result.success).toBe(true);
            expect(mockAddMember).not.toHaveBeenCalled();
            expect(mockWarn).toHaveBeenCalledWith(
                'DEV_TEAM_PROJECT_PATH not set, skipping addMember'
            );
        });

        it('should warn if metadata is missing requestedCount', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-member',
                title: 'Member Increase',
                description: 'Need more members',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'member_increase',
                status: 'approved',
                metadata: {
                    currentCount: 2,
                    // requestedCount is missing
                },
            });
            mockAddActivity.mockResolvedValue(undefined);

            const result = await processApproval({ approval_id: 'approval-member', action: 'approve' });

            expect(result.success).toBe(true);
            expect(mockAddMember).not.toHaveBeenCalled();
            expect(mockWarn).toHaveBeenCalledWith(
                'Invalid metadata for member_increase approval',
                expect.any(Object)
            );
        });
    });

    describe('member_decrease approval handling', () => {
        it('should call removeMember when member_decrease is approved', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-decrease',
                title: 'Member Decrease',
                description: 'Reduce members',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'member_decrease',
                status: 'approved',
                metadata: {
                    currentCount: 4,
                    requestedCount: 2,
                    newTotal: 2,
                },
            });
            mockAddActivity.mockResolvedValue(undefined);
            mockRemoveMember.mockResolvedValue({ removedRoles: ['member-04', 'member-03'], previousCount: 4, newCount: 2 });

            const result = await processApproval({ approval_id: 'approval-decrease', action: 'approve' });

            expect(result.success).toBe(true);
            expect(mockRemoveMember).toHaveBeenCalledWith(
                'C:\\test\\project',
                { count: 2 }
            );
        });

        it('should not call removeMember when member_decrease is rejected', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-decrease',
                title: 'Member Decrease',
                description: 'Reduce members',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'member_decrease',
                status: 'rejected',
                metadata: {
                    currentCount: 4,
                    requestedCount: 2,
                    newTotal: 2,
                },
            });
            mockAddActivity.mockResolvedValue(undefined);

            const result = await processApproval({ approval_id: 'approval-decrease', action: 'reject' });

            expect(result.success).toBe(true);
            expect(mockRemoveMember).not.toHaveBeenCalled();
        });

        it('should not call removeMember for non-member_decrease approvals', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-design',
                title: 'Design Approval',
                description: 'Design review',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'design',
                status: 'approved',
            });
            mockAddActivity.mockResolvedValue(undefined);

            const result = await processApproval({ approval_id: 'approval-design', action: 'approve' });

            expect(result.success).toBe(true);
            expect(mockRemoveMember).not.toHaveBeenCalled();
        });

        it('should succeed even if removeMember fails', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-decrease',
                title: 'Member Decrease',
                description: 'Reduce members',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'member_decrease',
                status: 'approved',
                metadata: {
                    currentCount: 4,
                    requestedCount: 1,
                    newTotal: 3,
                },
            });
            mockAddActivity.mockResolvedValue(undefined);

            mockRemoveMember.mockRejectedValue(new Error('Failed to remove member'));

            const result = await processApproval({ approval_id: 'approval-decrease', action: 'approve' });

            expect(result.success).toBe(true);
            expect(result.status).toBe('approved');
            expect(mockWarn).toHaveBeenCalled();
        });

        it('should warn if DEV_TEAM_PROJECT_PATH is not set for member_decrease', async () => {
            process.env.DEV_TEAM_PROJECT_PATH = '';

            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-decrease',
                title: 'Member Decrease',
                description: 'Reduce members',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'member_decrease',
                status: 'approved',
                metadata: {
                    currentCount: 4,
                    requestedCount: 1,
                    newTotal: 3,
                },
            });
            mockAddActivity.mockResolvedValue(undefined);

            const result = await processApproval({ approval_id: 'approval-decrease', action: 'approve' });

            expect(result.success).toBe(true);
            expect(mockRemoveMember).not.toHaveBeenCalled();
            expect(mockWarn).toHaveBeenCalledWith(
                'DEV_TEAM_PROJECT_PATH not set, skipping removeMember'
            );
        });

        it('should warn if metadata is missing requestedCount for member_decrease', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-decrease',
                title: 'Member Decrease',
                description: 'Reduce members',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'member_decrease',
                status: 'approved',
                metadata: {
                    currentCount: 4,
                    // requestedCount is missing
                },
            });
            mockAddActivity.mockResolvedValue(undefined);

            const result = await processApproval({ approval_id: 'approval-decrease', action: 'approve' });

            expect(result.success).toBe(true);
            expect(mockRemoveMember).not.toHaveBeenCalled();
            expect(mockWarn).toHaveBeenCalledWith(
                'Invalid metadata for member_decrease approval',
                expect.any(Object)
            );
        });
    });

    describe('task_split approval handling', () => {
        it('should call assignTask for each subtask when task_split is approved', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-split',
                title: 'タスク分割承認',
                description: 'タスクを分割して配信',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'task_split',
                status: 'approved',
                metadata: {
                    parentTaskId: 'T-100',
                    subtasks: [
                        {
                            title: 'サブタスク1',
                            description: '詳細1',
                            acceptance_criteria: ['条件1'],
                            allowed_files: ['file1.ts'],
                            to: 'member-01',
                        },
                        {
                            title: 'サブタスク2',
                            description: '詳細2',
                            acceptance_criteria: ['条件2'],
                            allowed_files: ['file2.ts'],
                            to: 'member-02',
                        },
                    ],
                },
            });
            mockAddActivity.mockResolvedValue(undefined);
            mockAssignTaskCore.mockResolvedValue({ success: true, taskId: 'T-101', notified: true });
            mockSendTask.mockResolvedValue({ success: true, messageId: 'M-001', notified: true });

            const result = await processApproval({ approval_id: 'approval-split', action: 'approve' });

            expect(result.success).toBe(true);
            expect(mockAssignTaskCore).toHaveBeenCalledTimes(2);
            // 最初のサブタスク
            expect(mockAssignTaskCore).toHaveBeenCalledWith(expect.objectContaining({
                to: 'member-01',
                title: 'サブタスク1',
                description: '詳細1',
                acceptance_criteria: ['条件1'],
                allowed_files: ['file1.ts'],
                parent_task_id: 'T-100',
            }), 'leader');
            // 2番目のサブタスク
            expect(mockAssignTaskCore).toHaveBeenCalledWith(expect.objectContaining({
                to: 'member-02',
                title: 'サブタスク2',
            }), 'leader');
        });

        it('should send completion notification to leader when task_split is approved', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-split',
                title: 'タスク分割承認',
                description: 'タスクを分割して配信',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'task_split',
                status: 'approved',
                metadata: {
                    parentTaskId: 'T-100',
                    subtasks: [
                        {
                            title: 'サブタスク1',
                            description: '詳細1',
                            acceptance_criteria: ['条件1'],
                            allowed_files: ['file1.ts'],
                            to: 'member-01',
                        },
                    ],
                },
            });
            mockAddActivity.mockResolvedValue(undefined);
            mockAssignTaskCore.mockResolvedValue({ success: true, taskId: 'T-101', notified: true });
            mockSendTask.mockResolvedValue({ success: true, messageId: 'M-001', notified: true });

            await processApproval({ approval_id: 'approval-split', action: 'approve' });

            expect(mockSendTask).toHaveBeenCalledWith(expect.objectContaining({
                to: 'leader',
                type: 'notification',
                subject: expect.stringContaining('タスク分割'),
            }));
        });

        it('should send rejection notification to leader when task_split is rejected', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-split',
                title: 'タスク分割承認',
                description: 'タスクを分割して配信',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'task_split',
                status: 'rejected',
                comments: '分割の粒度が大きすぎます',
                metadata: {
                    parentTaskId: 'T-100',
                    subtasks: [
                        {
                            title: 'サブタスク1',
                            description: '詳細1',
                            acceptance_criteria: ['条件1'],
                            allowed_files: ['file1.ts'],
                            to: 'member-01',
                        },
                    ],
                },
            });
            mockAddActivity.mockResolvedValue(undefined);
            mockSendTask.mockResolvedValue({ success: true, messageId: 'M-001', notified: true });

            const result = await processApproval({ approval_id: 'approval-split', action: 'reject', comments: '分割の粒度が大きすぎます' });

            expect(result.success).toBe(true);
            expect(mockAssignTaskCore).not.toHaveBeenCalled();
            expect(mockSendTask).toHaveBeenCalledWith(expect.objectContaining({
                to: 'leader',
                type: 'notification',
                subject: expect.stringContaining('却下'),
                content: expect.stringContaining('分割の粒度が大きすぎます'),
            }));
        });

        it('should warn if metadata is invalid for task_split approval', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-split',
                title: 'タスク分割承認',
                description: 'タスクを分割して配信',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'task_split',
                status: 'approved',
                metadata: {
                    // subtasks is missing
                    parentTaskId: 'T-100',
                },
            });
            mockAddActivity.mockResolvedValue(undefined);

            const result = await processApproval({ approval_id: 'approval-split', action: 'approve' });

            expect(result.success).toBe(true);
            expect(mockAssignTaskCore).not.toHaveBeenCalled();
            expect(mockWarn).toHaveBeenCalledWith(
                'Invalid metadata for task_split approval',
                expect.any(Object)
            );
        });

        it('should succeed even if some assignTask calls fail', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-split',
                title: 'タスク分割承認',
                description: 'タスクを分割して配信',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'task_split',
                status: 'approved',
                metadata: {
                    parentTaskId: 'T-100',
                    subtasks: [
                        {
                            title: 'サブタスク1',
                            description: '詳細1',
                            acceptance_criteria: ['条件1'],
                            allowed_files: ['file1.ts'],
                            to: 'member-01',
                        },
                        {
                            title: 'サブタスク2',
                            description: '詳細2',
                            acceptance_criteria: ['条件2'],
                            allowed_files: ['file2.ts'],
                            to: 'member-02',
                        },
                    ],
                },
            });
            mockAddActivity.mockResolvedValue(undefined);
            // First call succeeds, second fails
            mockAssignTaskCore
                .mockResolvedValueOnce({ success: true, taskId: 'T-101', notified: true })
                .mockResolvedValueOnce({ success: false, error: 'Failed to assign', notified: false });
            mockSendTask.mockResolvedValue({ success: true, messageId: 'M-001', notified: true });

            const result = await processApproval({ approval_id: 'approval-split', action: 'approve' });

            // Approval should still succeed
            expect(result.success).toBe(true);
            expect(mockAssignTaskCore).toHaveBeenCalledTimes(2);
            // Completion notification should include failure count
            expect(mockSendTask).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('1'),  // 1 success or 1 failure mentioned
            }));
        });

        it('should not call assignTask for non-task_split approvals', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockValidateProcessApprovalPermission.mockReturnValue({ allowed: true });
            mockUpdateApprovalStatus.mockResolvedValue({
                id: 'approval-design',
                title: 'Design Approval',
                description: 'Design review',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'design',
                status: 'approved',
            });
            mockAddActivity.mockResolvedValue(undefined);

            const result = await processApproval({ approval_id: 'approval-design', action: 'approve' });

            expect(result.success).toBe(true);
            expect(mockAssignTaskCore).not.toHaveBeenCalled();
        });
    });

    describe('formatProcessApprovalResult', () => {
        it('should format approved result correctly', () => {
            const result = {
                success: true,
                approvalId: 'approval-123',
                status: 'approved' as const,
            };
            const formatted = formatProcessApprovalResult(result);

            expect(formatted).toContain('✅');
            expect(formatted).toContain('承認');
            expect(formatted).toContain('approval-123');
        });

        it('should format rejected result correctly', () => {
            const result = {
                success: true,
                approvalId: 'approval-456',
                status: 'rejected' as const,
            };
            const formatted = formatProcessApprovalResult(result);

            expect(formatted).toContain('❌');
            expect(formatted).toContain('却下');
        });

        it('should format error result correctly', () => {
            const result = {
                success: false,
                error: 'Permission denied',
            };
            const formatted = formatProcessApprovalResult(result);

            expect(formatted).toContain('❌');
            expect(formatted).toContain('失敗');
            expect(formatted).toContain('Permission denied');
        });
    });
});
