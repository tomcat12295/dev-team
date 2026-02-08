import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ApprovalRequest } from '../types/task.js';

// Mock queue module
jest.unstable_mockModule('../utils/queue.js', () => ({
    addApprovalRequest: jest.fn<() => Promise<ApprovalRequest>>(),
    addActivity: jest.fn<() => Promise<void>>(),
    getDashboard: jest.fn<() => Promise<{ memberStatus: Record<string, { currentTask?: string }> }>>(),
}));

// Mock permission module
jest.unstable_mockModule('../utils/permission.js', () => ({
    getCurrentRole: jest.fn<() => string>(),
}));

// Mock permissions config
jest.unstable_mockModule('../config/permissions.js', () => ({
    canRequestMemberDecrease: jest.fn<(role: string) => boolean>(),
}));

// Mock team-config
jest.unstable_mockModule('../config/team-config.js', () => ({
    getMemberCount: jest.fn<() => number>(),
    getMemberRoles: jest.fn<() => string[]>(),
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

describe('request-member-decrease', () => {
    let requestMemberDecrease: typeof import('../tools/request-member-decrease.js').requestMemberDecrease;
    let formatMemberDecreaseResult: typeof import('../tools/request-member-decrease.js').formatMemberDecreaseResult;

    let mockAddApprovalRequest: jest.MockedFunction<() => Promise<ApprovalRequest>>;
    let mockAddActivity: jest.MockedFunction<() => Promise<void>>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockGetDashboard: any;
    let mockGetCurrentRole: jest.MockedFunction<() => string>;
    let mockCanRequestMemberDecrease: jest.MockedFunction<(role: string) => boolean>;
    let mockGetMemberCount: jest.MockedFunction<() => number>;
    let mockGetMemberRoles: jest.MockedFunction<() => string[]>;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Get mocked modules
        const queueModule = await import('../utils/queue.js');
        const permissionModule = await import('../utils/permission.js');
        const permissionsConfigModule = await import('../config/permissions.js');
        const teamConfigModule = await import('../config/team-config.js');

        mockAddApprovalRequest = queueModule.addApprovalRequest as typeof mockAddApprovalRequest;
        mockAddActivity = queueModule.addActivity as typeof mockAddActivity;
        mockGetDashboard = queueModule.getDashboard as jest.Mock;
        mockGetCurrentRole = permissionModule.getCurrentRole as typeof mockGetCurrentRole;
        mockCanRequestMemberDecrease = permissionsConfigModule.canRequestMemberDecrease as typeof mockCanRequestMemberDecrease;
        mockGetMemberCount = teamConfigModule.getMemberCount as typeof mockGetMemberCount;
        mockGetMemberRoles = teamConfigModule.getMemberRoles as typeof mockGetMemberRoles;

        // Default mock setup: no members have tasks
        mockGetMemberRoles.mockReturnValue(['member-01', 'member-02']);
        mockGetDashboard.mockResolvedValue({ memberStatus: {} });

        // Import the module under test
        const memberDecreaseModule = await import('../tools/request-member-decrease.js');
        requestMemberDecrease = memberDecreaseModule.requestMemberDecrease;
        formatMemberDecreaseResult = memberDecreaseModule.formatMemberDecreaseResult;
    });


    describe('permission checks', () => {
        it('should succeed when called by leader', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockCanRequestMemberDecrease.mockReturnValue(true);
            mockGetMemberCount.mockReturnValue(3);
            mockAddApprovalRequest.mockResolvedValue({
                id: 'approval-123',
                title: 'メンバー減員リクエスト: 2名',
                description: 'タスク減少のため',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'member_decrease',
                status: 'pending',
            });
            mockAddActivity.mockResolvedValue(undefined);

            const result = await requestMemberDecrease({ count: 2, reason: 'タスク減少のため' });

            expect(result.success).toBe(true);
            expect(result.approvalId).toBe('approval-123');
            expect(result.currentCount).toBe(3);
            expect(result.requestedCount).toBe(2);
            expect(result.newTotal).toBe(1);
        });

        it('should fail when called by member', async () => {
            mockGetCurrentRole.mockReturnValue('member-01');
            mockCanRequestMemberDecrease.mockReturnValue(false);

            const result = await requestMemberDecrease({ count: 1, reason: 'テスト' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('not allowed');
        });

        it('should fail when called by pm', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockCanRequestMemberDecrease.mockReturnValue(false);

            const result = await requestMemberDecrease({ count: 1, reason: 'テスト' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('not allowed');
        });
    });

    describe('count validation', () => {
        beforeEach(() => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockCanRequestMemberDecrease.mockReturnValue(true);
        });

        it('should fail when count is 0', async () => {
            const result = await requestMemberDecrease({ count: 0, reason: 'テスト' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid count');
        });

        it('should fail when count is negative', async () => {
            const result = await requestMemberDecrease({ count: -1, reason: 'テスト' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid count');
        });

        it('should fail when count is 5', async () => {
            const result = await requestMemberDecrease({ count: 5, reason: 'テスト' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid count');
        });

        it('should succeed when count is 1', async () => {
            mockGetMemberCount.mockReturnValue(2);
            mockAddApprovalRequest.mockResolvedValue({
                id: 'approval-456',
                title: 'メンバー減員リクエスト: 1名',
                description: 'テスト',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'member_decrease',
                status: 'pending',
            });
            mockAddActivity.mockResolvedValue(undefined);

            const result = await requestMemberDecrease({ count: 1, reason: 'テスト' });

            expect(result.success).toBe(true);
            expect(result.requestedCount).toBe(1);
            expect(result.newTotal).toBe(1);
        });

        it('should succeed when count is 4', async () => {
            mockGetMemberCount.mockReturnValue(5);
            mockAddApprovalRequest.mockResolvedValue({
                id: 'approval-789',
                title: 'メンバー減員リクエスト: 4名',
                description: 'テスト',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'member_decrease',
                status: 'pending',
            });
            mockAddActivity.mockResolvedValue(undefined);

            const result = await requestMemberDecrease({ count: 4, reason: 'テスト' });

            expect(result.success).toBe(true);
            expect(result.requestedCount).toBe(4);
            expect(result.newTotal).toBe(1);
        });
    });

    describe('minimum member count check', () => {
        beforeEach(() => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockCanRequestMemberDecrease.mockReturnValue(true);
        });

        it('should fail when decreasing below 0 (current: 2, decrease: 3)', async () => {
            mockGetMemberCount.mockReturnValue(2);

            const result = await requestMemberDecrease({ count: 3, reason: 'テスト' });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should fail when decreasing to 0 (current: 2, decrease: 2)', async () => {
            mockGetMemberCount.mockReturnValue(2);

            const result = await requestMemberDecrease({ count: 2, reason: 'テスト' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('At least 1 member must remain');
        });

        it('should succeed when decreasing to 1 (current: 2, decrease: 1)', async () => {
            mockGetMemberCount.mockReturnValue(2);
            mockAddApprovalRequest.mockResolvedValue({
                id: 'approval-min1',
                title: 'メンバー減員リクエスト: 1名',
                description: 'テスト',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'member_decrease',
                status: 'pending',
            });
            mockAddActivity.mockResolvedValue(undefined);

            const result = await requestMemberDecrease({ count: 1, reason: 'テスト' });

            expect(result.success).toBe(true);
            expect(result.newTotal).toBe(1);
        });

        it('should succeed when decreasing to 1 (current: 3, decrease: 2)', async () => {
            mockGetMemberCount.mockReturnValue(3);
            mockAddApprovalRequest.mockResolvedValue({
                id: 'approval-min2',
                title: 'メンバー減員リクエスト: 2名',
                description: 'テスト',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'member_decrease',
                status: 'pending',
            });
            mockAddActivity.mockResolvedValue(undefined);

            const result = await requestMemberDecrease({ count: 2, reason: 'テスト' });

            expect(result.success).toBe(true);
            expect(result.newTotal).toBe(1);
        });
    });

    describe('approval request creation', () => {
        it('should create approval request with correct metadata', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockCanRequestMemberDecrease.mockReturnValue(true);
            mockGetMemberCount.mockReturnValue(4);
            mockAddApprovalRequest.mockResolvedValue({
                id: 'approval-test',
                title: 'メンバー減員リクエスト: 2名',
                description: 'タスク完了のため',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'member_decrease',
                status: 'pending',
            });
            mockAddActivity.mockResolvedValue(undefined);

            await requestMemberDecrease({ count: 2, reason: 'タスク完了のため' });

            expect(mockAddApprovalRequest).toHaveBeenCalledWith({
                title: 'メンバー減員リクエスト: 2名',
                description: 'タスク完了のため',
                type: 'member_decrease',
                requestedBy: 'leader',
                metadata: {
                    currentCount: 4,
                    requestedCount: 2,
                    newTotal: 2,
                },
            });
        });

        it('should log activity after successful request', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockCanRequestMemberDecrease.mockReturnValue(true);
            mockGetMemberCount.mockReturnValue(3);
            mockAddApprovalRequest.mockResolvedValue({
                id: 'approval-activity',
                title: 'メンバー減員リクエスト: 1名',
                description: 'テスト',
                requestedBy: 'leader',
                requestedAt: '2026-01-31T00:00:00.000Z',
                type: 'member_decrease',
                status: 'pending',
            });
            mockAddActivity.mockResolvedValue(undefined);

            await requestMemberDecrease({ count: 1, reason: 'テスト' });

            expect(mockAddActivity).toHaveBeenCalledWith({
                role: 'leader',
                action: 'request_member_decrease',
                details: 'Requested 1 member decrease. Current: 3, New total: 2',
            });
        });
    });

    describe('formatMemberDecreaseResult', () => {
        it('should format success result correctly', () => {
            const result = {
                success: true,
                approvalId: 'approval-123',
                currentCount: 4,
                requestedCount: 2,
                newTotal: 2,
            };
            const formatted = formatMemberDecreaseResult(result);

            expect(formatted).toContain('減員リクエストを送信しました');
            expect(formatted).toContain('2名');
            expect(formatted).toContain('approval-123');
        });

        it('should format error result correctly', () => {
            const result = {
                success: false,
                error: 'Permission denied',
            };
            const formatted = formatMemberDecreaseResult(result);

            expect(formatted).toContain('失敗');
            expect(formatted).toContain('Permission denied');
        });
    });
});
