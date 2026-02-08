import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock child_process
jest.unstable_mockModule('child_process', () => ({
    exec: jest.fn(),
}));

// Mock util
jest.unstable_mockModule('util', () => ({
    promisify: jest.fn(() => jest.fn()),
}));

// Mock queue module
jest.unstable_mockModule('../utils/queue.js', () => ({
    addActivity: jest.fn<() => Promise<void>>(),
}));

// Mock permission module
jest.unstable_mockModule('../utils/permission.js', () => ({
    getCurrentRole: jest.fn<() => string>(),
}));

// Mock permissions config
jest.unstable_mockModule('../config/permissions.js', () => ({
    canRequestMemberIncrease: jest.fn<(role: string) => boolean>(),
}));

// Mock team-config
jest.unstable_mockModule('../config/team-config.js', () => ({
    getMemberCount: jest.fn<() => number>(),
    getAllRoles: jest.fn<() => string[]>(() => ['pm', 'leader', 'member-01', 'member-02']),
    getMemberRoles: jest.fn<() => string[]>(() => ['member-01', 'member-02']),
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
}));

describe('request-member-increase', () => {
    let requestMemberIncrease: typeof import('../tools/request-member-increase.js').requestMemberIncrease;
    let formatMemberIncreaseResult: typeof import('../tools/request-member-increase.js').formatMemberIncreaseResult;

    let mockAddActivity: jest.MockedFunction<() => Promise<void>>;
    let mockGetCurrentRole: jest.MockedFunction<() => string>;
    let mockCanRequestMemberIncrease: jest.MockedFunction<(role: string) => boolean>;
    let mockGetMemberCount: jest.MockedFunction<() => number>;

    const originalEnv = process.env;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Set environment variable
        process.env = { ...originalEnv, DEV_TEAM_PROJECT_PATH: 'C:\\test\\project' };

        // Get mocked modules
        const queueModule = await import('../utils/queue.js');
        const permissionModule = await import('../utils/permission.js');
        const permissionsConfigModule = await import('../config/permissions.js');
        const teamConfigModule = await import('../config/team-config.js');

        mockAddActivity = queueModule.addActivity as typeof mockAddActivity;
        mockGetCurrentRole = permissionModule.getCurrentRole as typeof mockGetCurrentRole;
        mockCanRequestMemberIncrease = permissionsConfigModule.canRequestMemberIncrease as typeof mockCanRequestMemberIncrease;
        mockGetMemberCount = teamConfigModule.getMemberCount as typeof mockGetMemberCount;

        // Import the module under test
        const memberIncreaseModule = await import('../tools/request-member-increase.js');
        requestMemberIncrease = memberIncreaseModule.requestMemberIncrease;
        formatMemberIncreaseResult = memberIncreaseModule.formatMemberIncreaseResult;
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('permission checks', () => {
        it('should fail when called by member', async () => {
            mockGetCurrentRole.mockReturnValue('member-01');
            mockCanRequestMemberIncrease.mockReturnValue(false);

            const result = await requestMemberIncrease({ count: 1, reason: 'テスト' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('not allowed');
        });

        it('should fail when called by pm', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockCanRequestMemberIncrease.mockReturnValue(false);

            const result = await requestMemberIncrease({ count: 1, reason: 'テスト' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('not allowed');
        });
    });

    describe('count validation', () => {
        beforeEach(() => {
            mockGetCurrentRole.mockReturnValue('leader');
            mockCanRequestMemberIncrease.mockReturnValue(true);
        });

        it('should fail when count is 0', async () => {
            const result = await requestMemberIncrease({ count: 0, reason: 'テスト' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid count');
        });

        it('should fail when count is negative', async () => {
            const result = await requestMemberIncrease({ count: -1, reason: 'テスト' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid count');
        });

        it('should fail when count is 5', async () => {
            const result = await requestMemberIncrease({ count: 5, reason: 'テスト' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid count');
        });
    });

    describe('environment variable check', () => {
        it('should fail when DEV_TEAM_PROJECT_PATH is not set', async () => {
            // Clear env before re-importing
            const envBackup = process.env.DEV_TEAM_PROJECT_PATH;
            delete process.env.DEV_TEAM_PROJECT_PATH;

            // Use existing mocks (they're still set from beforeEach)
            mockGetCurrentRole.mockReturnValue('leader');
            mockCanRequestMemberIncrease.mockReturnValue(true);

            const result = await requestMemberIncrease({ count: 1, reason: 'テスト' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('DEV_TEAM_PROJECT_PATH');

            // Restore env
            process.env.DEV_TEAM_PROJECT_PATH = envBackup;
        });
    });

    describe('formatMemberIncreaseResult', () => {
        it('should format success result correctly', () => {
            const result = {
                success: true,
                currentCount: 2,
                requestedCount: 2,
                newTotal: 4,
            };
            const formatted = formatMemberIncreaseResult(result);

            expect(formatted).toContain('メンバーを増員しました');
            expect(formatted).toContain('2名');
            expect(formatted).toContain('4名');
        });

        it('should format error result correctly', () => {
            const result = {
                success: false,
                error: 'Permission denied',
            };
            const formatted = formatMemberIncreaseResult(result);

            expect(formatted).toContain('失敗');
            expect(formatted).toContain('Permission denied');
        });
    });
});
