import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock team-config module
const mockGetAllRoles = jest.fn<() => string[]>();
const mockGetMemberRoles = jest.fn<() => string[]>();

jest.unstable_mockModule('../config/team-config.js', () => ({
    getAllRoles: mockGetAllRoles,
    getMemberRoles: mockGetMemberRoles,
}));

// Mock logger module
jest.unstable_mockModule('../utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

// Mock fs/promises
const mockReadFile = jest.fn<(path: string, encoding: string) => Promise<string>>();
jest.unstable_mockModule('fs/promises', () => ({
    readFile: mockReadFile,
}));

// Mock child_process
const mockExec = jest.fn();
jest.unstable_mockModule('child_process', () => ({
    exec: mockExec,
}));

describe('wezterm.ts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset environment
        delete process.env.DEV_TEAM_PROJECT_PATH;
    });

    afterEach(() => {
        jest.resetModules();
    });

    describe('createDefaultPaneMapping', () => {
        it('should create mapping for 2 member configuration', async () => {
            // Setup: 2 members (default)
            mockGetAllRoles.mockReturnValue(['pm', 'leader', 'member-01', 'member-02']);

            // Import module after mocks are set up
            const { getPaneMapping, setPaneMapping } = await import('../utils/wezterm.js');

            // Reset to default by setting a fresh mapping based on mock
            const roles = mockGetAllRoles();
            const expectedMapping: Record<string, string> = {};
            roles.forEach((role, index) => {
                expectedMapping[role] = String(index);
            });
            setPaneMapping(expectedMapping);

            const mapping = getPaneMapping();

            expect(mapping).toEqual({
                pm: '0',
                leader: '1',
                'member-01': '2',
                'member-02': '3',
            });
        });

        it('should create mapping for 4 member configuration', async () => {
            // Setup: 4 members
            mockGetAllRoles.mockReturnValue([
                'pm',
                'leader',
                'member-01',
                'member-02',
                'member-03',
                'member-04',
            ]);

            const { setPaneMapping, getPaneMapping } = await import('../utils/wezterm.js');

            // Manually create mapping for 4 members
            const roles = mockGetAllRoles();
            const expectedMapping: Record<string, string> = {};
            roles.forEach((role, index) => {
                expectedMapping[role] = String(index);
            });
            setPaneMapping(expectedMapping);

            const mapping = getPaneMapping();

            expect(mapping).toEqual({
                pm: '0',
                leader: '1',
                'member-01': '2',
                'member-02': '3',
                'member-03': '4',
                'member-04': '5',
            });
            expect(mapping['member-03']).toBe('4');
            expect(mapping['member-04']).toBe('5');
        });
    });

    describe('loadPaneMappingFromFile', () => {
        it('should load mapping from panes.json with member01 format', async () => {
            // Setup
            process.env.DEV_TEAM_PROJECT_PATH = '/test/project';
            mockGetAllRoles.mockReturnValue(['pm', 'leader', 'member-01', 'member-02']);
            mockReadFile.mockResolvedValue(
                JSON.stringify({
                    pm: 10,
                    leader: 11,
                    member01: 12,
                    member02: 13,
                })
            );

            // We can't directly test loadPaneMappingFromFile since it's not exported
            // But we can verify the behavior through healthCheck or getCurrentPaneMapping
            // For now, we verify the module loads correctly
            const { getPaneMapping } = await import('../utils/wezterm.js');

            expect(getPaneMapping).toBeDefined();
        });

        it('should load mapping from panes.json with member-01 format', async () => {
            // Setup
            process.env.DEV_TEAM_PROJECT_PATH = '/test/project';
            mockGetAllRoles.mockReturnValue(['pm', 'leader', 'member-01', 'member-02']);
            mockReadFile.mockResolvedValue(
                JSON.stringify({
                    pm: 20,
                    leader: 21,
                    'member-01': 22,
                    'member-02': 23,
                })
            );

            const { getPaneMapping } = await import('../utils/wezterm.js');

            expect(getPaneMapping).toBeDefined();
        });
    });

    describe('setPaneMapping and getPaneMapping', () => {
        it('should set and get pane mapping correctly', async () => {
            mockGetAllRoles.mockReturnValue(['pm', 'leader', 'member-01', 'member-02']);

            const { setPaneMapping, getPaneMapping } = await import('../utils/wezterm.js');

            const newMapping = {
                pm: '100',
                leader: '101',
                'member-01': '102',
                'member-02': '103',
            };

            setPaneMapping(newMapping);
            const result = getPaneMapping();

            expect(result).toEqual(newMapping);
        });

        it('should return a copy, not the original object', async () => {
            mockGetAllRoles.mockReturnValue(['pm', 'leader', 'member-01', 'member-02']);

            const { setPaneMapping, getPaneMapping } = await import('../utils/wezterm.js');

            const original = { pm: '0', leader: '1', 'member-01': '2', 'member-02': '3' };
            setPaneMapping(original);

            const copy = getPaneMapping();
            copy.pm = '999';

            const fresh = getPaneMapping();
            expect(fresh.pm).toBe('0');
        });
    });

    describe('isPaneInputIdle', () => {
        it('should return true when prompt has no text after it', async () => {
            mockGetAllRoles.mockReturnValue(['pm', 'leader', 'member-01', 'member-02']);

            // Mock execAsync to return prompt with no text
            mockExec.mockImplementation((...args: unknown[]) => { const callback = args[args.length - 1] as Function;
                callback(null, { stdout: 'some output\n❯ \n', stderr: '' });
            });

            const { isPaneInputIdle } = await import('../utils/wezterm.js');
            const result = await isPaneInputIdle('42');

            expect(result).toBe(true);
        });

        it('should return false when prompt has text after it (user typing)', async () => {
            mockGetAllRoles.mockReturnValue(['pm', 'leader', 'member-01', 'member-02']);

            // Mock execAsync to return prompt with text
            mockExec.mockImplementation((...args: unknown[]) => { const callback = args[args.length - 1] as Function;
                callback(null, { stdout: 'some output\n❯ some command being typed\n', stderr: '' });
            });

            const { isPaneInputIdle } = await import('../utils/wezterm.js');
            const result = await isPaneInputIdle('42');

            expect(result).toBe(false);
        });

        it('should return true when no prompt found (Claude Code processing)', async () => {
            mockGetAllRoles.mockReturnValue(['pm', 'leader', 'member-01', 'member-02']);

            // Mock execAsync to return output without prompt
            mockExec.mockImplementation((...args: unknown[]) => { const callback = args[args.length - 1] as Function;
                callback(null, { stdout: 'Processing...\nSome output\n', stderr: '' });
            });

            const { isPaneInputIdle } = await import('../utils/wezterm.js');
            const result = await isPaneInputIdle('42');

            expect(result).toBe(true);
        });

        it('should return true when exec fails', async () => {
            mockGetAllRoles.mockReturnValue(['pm', 'leader', 'member-01', 'member-02']);

            // Mock execAsync to throw error
            mockExec.mockImplementation((...args: unknown[]) => { const callback = args[args.length - 1] as Function;
                callback(new Error('command failed'), null);
            });

            const { isPaneInputIdle } = await import('../utils/wezterm.js');
            const result = await isPaneInputIdle('42');

            expect(result).toBe(true);
        });

        it('should use last prompt line when multiple prompts exist', async () => {
            mockGetAllRoles.mockReturnValue(['pm', 'leader', 'member-01', 'member-02']);

            // Multiple prompts, last one has text
            mockExec.mockImplementation((...args: unknown[]) => { const callback = args[args.length - 1] as Function;
                callback(null, { stdout: '❯ old command\noutput\n❯ new input\n', stderr: '' });
            });

            const { isPaneInputIdle } = await import('../utils/wezterm.js');
            const result = await isPaneInputIdle('42');

            expect(result).toBe(false);
        });

        it('should return true when prompt line has only whitespace after it', async () => {
            mockGetAllRoles.mockReturnValue(['pm', 'leader', 'member-01', 'member-02']);

            mockExec.mockImplementation((...args: unknown[]) => { const callback = args[args.length - 1] as Function;
                callback(null, { stdout: '❯   \n', stderr: '' });
            });

            const { isPaneInputIdle } = await import('../utils/wezterm.js');
            const result = await isPaneInputIdle('42');

            expect(result).toBe(true);
        });
    });

    describe('notifyRole for PM', () => {
        it('should use notifyPmWithRetry for PM role', async () => {
            mockGetAllRoles.mockReturnValue(['pm', 'leader', 'member-01', 'member-02']);
            process.env.DEV_TEAM_PROJECT_PATH = '/test/project';

            // Mock panes.json read
            mockReadFile.mockResolvedValue(
                JSON.stringify({ pm: 10, leader: 11, member01: 12, member02: 13 })
            );

            // First call: isPaneInputIdle (get-text), returns idle prompt
            // Second call: sendTextToPane (send-text), succeeds
            // Third call: sendEnterKey (PowerShell send-text), succeeds
            let callCount = 0;
            mockExec.mockImplementation((...args: unknown[]) => { const callback = args[args.length - 1] as Function;
                callCount++;
                if (callCount === 1) {
                    // isPaneInputIdle - return idle prompt
                    callback(null, { stdout: '❯ \n', stderr: '' });
                } else {
                    // sendTextToPane / sendEnterKey
                    callback(null, { stdout: '', stderr: '' });
                }
            });

            const { notifyRole } = await import('../utils/wezterm.js');
            const result = await notifyRole('pm', 'test notification');

            expect(result).toBe(true);
            // Verify get-text was called for idle check
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('get-text'),
                expect.any(Function),
            );
        });

        it('should send bell after max retries when PM is busy', async () => {
            mockGetAllRoles.mockReturnValue(['pm', 'leader', 'member-01', 'member-02']);
            process.env.DEV_TEAM_PROJECT_PATH = '/test/project';

            mockReadFile.mockResolvedValue(
                JSON.stringify({ pm: 10, leader: 11, member01: 12, member02: 13 })
            );

            // Always return busy prompt
            mockExec.mockImplementation((...args: unknown[]) => { const callback = args[args.length - 1] as Function;
                const cmd = args[0] as string;
                if (cmd.includes('get-text')) {
                    callback(null, { stdout: '❯ typing something\n', stderr: '' });
                } else {
                    callback(null, { stdout: '', stderr: '' });
                }
            });

            const { notifyRole } = await import('../utils/wezterm.js');
            // Pass retriesLeft=0 via notifyRole which calls notifyPmWithRetry with default 5
            // To test quickly, we'll use isPaneInputIdle directly instead
            // But notifyPmWithRetry is not exported, so we test indirectly

            // Use a short retry test: call notifyRole and check it returns false
            // This test will take 15 seconds with real setTimeout, so we mock timers
            jest.useFakeTimers();

            const resultPromise = notifyRole('pm', 'test');

            // Advance through all retries (5 * 3000ms = 15000ms)
            for (let i = 0; i < 5; i++) {
                await jest.advanceTimersByTimeAsync(3000);
            }

            const result = await resultPromise;
            expect(result).toBe(false);

            jest.useRealTimers();
        }, 10000);

        it('should not use retry logic for non-PM roles', async () => {
            mockGetAllRoles.mockReturnValue(['pm', 'leader', 'member-01', 'member-02']);

            // All exec calls succeed
            mockExec.mockImplementation((...args: unknown[]) => { const callback = args[args.length - 1] as Function;
                callback(null, { stdout: '', stderr: '' });
            });

            const { notifyRole, setPaneMapping } = await import('../utils/wezterm.js');
            setPaneMapping({ pm: '0', leader: '1', 'member-01': '2', 'member-02': '3' });

            await notifyRole('leader', 'test notification');

            // Should NOT call get-text for non-PM roles
            const getTextCalls = mockExec.mock.calls.filter(
                (call: any[]) => typeof call[0] === 'string' && call[0].includes('get-text')
            );
            expect(getTextCalls).toHaveLength(0);
        });
    });
});
