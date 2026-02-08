import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';

// Mock fs module
jest.unstable_mockModule('fs', () => ({
    existsSync: jest.fn<(path: string) => boolean>(),
    readFileSync: jest.fn<(path: string, encoding: string) => string>(),
}));

describe('team-config', () => {
    let getTeamConfig: typeof import('../../config/team-config.js').getTeamConfig;
    let getAllRoles: typeof import('../../config/team-config.js').getAllRoles;
    let getMemberRoles: typeof import('../../config/team-config.js').getMemberRoles;
    let getFixedRoles: typeof import('../../config/team-config.js').getFixedRoles;
    let isValidRole: typeof import('../../config/team-config.js').isValidRole;
    let isMemberRole: typeof import('../../config/team-config.js').isMemberRole;
    let getMemberCount: typeof import('../../config/team-config.js').getMemberCount;

    let mockExistsSync: jest.MockedFunction<(path: string) => boolean>;
    let mockReadFileSync: jest.MockedFunction<(path: string, encoding: string) => string>;

    const originalEnv = process.env;
    const TEST_PROJECT_PATH = '/test/project';

    interface TeamConfig {
        version: string;
        team: {
            fixedRoles: string[];
            members: {
                count: number;
                prefix: string;
                startIndex: number;
            };
        };
        permissionTemplates: {
            member: {
                canSendTo: string[];
                canRequestApproval: boolean;
                canProcessApproval: boolean;
                canUpdateDashboard: boolean;
            };
        };
    }

    const validConfig: TeamConfig = {
        version: '1.0',
        team: {
            fixedRoles: ['pm', 'leader'],
            members: {
                count: 2,
                prefix: 'member-',
                startIndex: 1,
            },
        },
        permissionTemplates: {
            member: {
                canSendTo: ['leader'],
                canRequestApproval: false,
                canProcessApproval: false,
                canUpdateDashboard: false,
            },
        },
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();
        process.env = { ...originalEnv };
        process.env.DEV_TEAM_PROJECT_PATH = TEST_PROJECT_PATH;

        // Get mocked modules
        const fsModule = await import('fs');
        mockExistsSync = fsModule.existsSync as unknown as typeof mockExistsSync;
        mockReadFileSync = fsModule.readFileSync as unknown as typeof mockReadFileSync;

        // Import the module under test
        const teamConfigModule = await import('../../config/team-config.js');
        getTeamConfig = teamConfigModule.getTeamConfig;
        getAllRoles = teamConfigModule.getAllRoles;
        getMemberRoles = teamConfigModule.getMemberRoles;
        getFixedRoles = teamConfigModule.getFixedRoles;
        isValidRole = teamConfigModule.isValidRole;
        isMemberRole = teamConfigModule.isMemberRole;
        getMemberCount = teamConfigModule.getMemberCount;
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('getTeamConfig', () => {
        it('should load config from file when it exists', () => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));

            const config = getTeamConfig();

            expect(config).toEqual(validConfig);
            expect(mockExistsSync).toHaveBeenCalledWith(
                path.join(TEST_PROJECT_PATH, '.dev-team', 'config', 'team.json')
            );
        });

        it('should return default config when file does not exist', () => {
            mockExistsSync.mockReturnValue(false);

            const config = getTeamConfig();

            expect(config.version).toBe('1.0');
            expect(config.team.fixedRoles).toEqual(['pm', 'leader']);
            expect(config.team.members.count).toBe(2);
            expect(config.team.members.prefix).toBe('member-');
            expect(config.team.members.startIndex).toBe(1);
        });

        it('should return default config when DEV_TEAM_PROJECT_PATH is not set', async () => {
            delete process.env.DEV_TEAM_PROJECT_PATH;
            jest.resetModules();

            const teamConfigModule = await import('../../config/team-config.js');
            const config = teamConfigModule.getTeamConfig();

            expect(config.version).toBe('1.0');
            expect(config.team.members.count).toBe(2);
        });

        it('should return default config when JSON is invalid', () => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue('{ invalid json }');

            const config = getTeamConfig();

            expect(config.version).toBe('1.0');
            expect(config.team.members.count).toBe(2);
        });

        it('should return default config when members.count is 0', () => {
            const invalidConfig = {
                ...validConfig,
                team: {
                    ...validConfig.team,
                    members: { ...validConfig.team.members, count: 0 },
                },
            };
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

            const config = getTeamConfig();

            expect(config.team.members.count).toBe(2);
        });

        it('should return default config when members.count is negative', () => {
            const invalidConfig = {
                ...validConfig,
                team: {
                    ...validConfig.team,
                    members: { ...validConfig.team.members, count: -1 },
                },
            };
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

            const config = getTeamConfig();

            expect(config.team.members.count).toBe(2);
        });

        it('should return default config when members.startIndex is negative', () => {
            const invalidConfig = {
                ...validConfig,
                team: {
                    ...validConfig.team,
                    members: { ...validConfig.team.members, startIndex: -1 },
                },
            };
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

            const config = getTeamConfig();

            expect(config.team.members.startIndex).toBe(1);
        });
    });

    describe('getAllRoles', () => {
        it('should return all roles including fixed roles and members', () => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));

            const roles = getAllRoles();

            expect(roles).toEqual(['pm', 'leader', 'member-01', 'member-02']);
        });

        it('should return roles with 3 members when count is 3', () => {
            const configWith3Members = {
                ...validConfig,
                team: {
                    ...validConfig.team,
                    members: { ...validConfig.team.members, count: 3 },
                },
            };
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(configWith3Members));

            const roles = getAllRoles();

            expect(roles).toEqual(['pm', 'leader', 'member-01', 'member-02', 'member-03']);
        });

        it('should handle startIndex of 0', () => {
            const configWithStartIndex0 = {
                ...validConfig,
                team: {
                    ...validConfig.team,
                    members: { ...validConfig.team.members, startIndex: 0 },
                },
            };
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(configWithStartIndex0));

            const roles = getAllRoles();

            expect(roles).toEqual(['pm', 'leader', 'member-00', 'member-01']);
        });

        it('should handle 10 members', () => {
            const configWith10Members = {
                ...validConfig,
                team: {
                    ...validConfig.team,
                    members: { ...validConfig.team.members, count: 10 },
                },
            };
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(configWith10Members));

            const roles = getAllRoles();

            expect(roles.length).toBe(12); // pm, leader + 10 members
            expect(roles).toContain('member-10');
        });

        it('should handle 100 members', () => {
            const configWith100Members = {
                ...validConfig,
                team: {
                    ...validConfig.team,
                    members: { ...validConfig.team.members, count: 100 },
                },
            };
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(configWith100Members));

            const roles = getAllRoles();

            expect(roles.length).toBe(102); // pm, leader + 100 members
            expect(roles).toContain('member-100');
        });

        it('should return 22 roles for 20 members', () => {
            const configWith20Members = {
                ...validConfig,
                team: {
                    ...validConfig.team,
                    members: { ...validConfig.team.members, count: 20 },
                },
            };
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(configWith20Members));

            const roles = getAllRoles();

            expect(roles.length).toBe(22); // pm, leader + 20 members
            expect(roles).toContain('member-01');
            expect(roles).toContain('member-10');
            expect(roles).toContain('member-20');
        });
    });

    describe('getMemberRoles', () => {
        it('should return only member roles', () => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));

            const members = getMemberRoles();

            expect(members).toEqual(['member-01', 'member-02']);
        });

        it('should return 3 member roles when count is 3', () => {
            const configWith3Members = {
                ...validConfig,
                team: {
                    ...validConfig.team,
                    members: { ...validConfig.team.members, count: 3 },
                },
            };
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(configWith3Members));

            const members = getMemberRoles();

            expect(members).toEqual(['member-01', 'member-02', 'member-03']);
        });

        it('should zero-pad member index correctly for large numbers', () => {
            // startIndex: 99, count: 3 → member-99, member-100, member-101
            const config = {
                ...validConfig,
                team: {
                    ...validConfig.team,
                    members: { count: 3, prefix: 'member-', startIndex: 99 },
                },
            };
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(config));

            const members = getMemberRoles();

            expect(members).toEqual(['member-99', 'member-100', 'member-101']);
        });

        it('should return 10 member roles when count is 10', () => {
            const configWith10Members = {
                ...validConfig,
                team: {
                    ...validConfig.team,
                    members: { ...validConfig.team.members, count: 10 },
                },
            };
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(configWith10Members));

            const members = getMemberRoles();

            expect(members.length).toBe(10);
            expect(members[0]).toBe('member-01');
            expect(members[9]).toBe('member-10');
        });

        it('should return 20 member roles when count is 20', () => {
            const configWith20Members = {
                ...validConfig,
                team: {
                    ...validConfig.team,
                    members: { ...validConfig.team.members, count: 20 },
                },
            };
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(configWith20Members));

            const members = getMemberRoles();

            expect(members.length).toBe(20);
            expect(members[0]).toBe('member-01');
            expect(members[19]).toBe('member-20');
        });

        it('should correctly format member roles with zero-padding for 1-20', () => {
            const configWith20Members = {
                ...validConfig,
                team: {
                    ...validConfig.team,
                    members: { ...validConfig.team.members, count: 20 },
                },
            };
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(configWith20Members));

            const members = getMemberRoles();

            // 1-9はゼロパディング（member-01〜member-09）
            for (let i = 1; i <= 9; i++) {
                expect(members[i - 1]).toBe(`member-0${i}`);
            }
            // 10-20はそのまま（member-10〜member-20）
            for (let i = 10; i <= 20; i++) {
                expect(members[i - 1]).toBe(`member-${i}`);
            }
        });
    });

    describe('getFixedRoles', () => {
        it('should return fixed roles', () => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));

            const fixedRoles = getFixedRoles();

            expect(fixedRoles).toEqual(['pm', 'leader']);
        });
    });

    describe('isValidRole', () => {
        beforeEach(() => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));
        });

        it('should return true for pm', () => {
            expect(isValidRole('pm')).toBe(true);
        });

        it('should return true for leader', () => {
            expect(isValidRole('leader')).toBe(true);
        });

        it('should return true for member-01', () => {
            expect(isValidRole('member-01')).toBe(true);
        });

        it('should return true for member-02', () => {
            expect(isValidRole('member-02')).toBe(true);
        });

        it('should return false for member-03 when count is 2', () => {
            expect(isValidRole('member-03')).toBe(false);
        });

        it('should return false for invalid role', () => {
            expect(isValidRole('invalid')).toBe(false);
        });

        it('should return false for empty string', () => {
            expect(isValidRole('')).toBe(false);
        });
    });

    describe('isMemberRole', () => {
        beforeEach(() => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));
        });

        it('should return true for member-01', () => {
            expect(isMemberRole('member-01')).toBe(true);
        });

        it('should return true for member-02', () => {
            expect(isMemberRole('member-02')).toBe(true);
        });

        it('should return false for pm', () => {
            expect(isMemberRole('pm')).toBe(false);
        });

        it('should return false for leader', () => {
            expect(isMemberRole('leader')).toBe(false);
        });

        it('should return false for member-03 when count is 2', () => {
            expect(isMemberRole('member-03')).toBe(false);
        });
    });

    describe('getMemberCount', () => {
        it('should return member count from config', () => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));

            expect(getMemberCount()).toBe(2);
        });

        it('should return 3 when count is 3', () => {
            const configWith3Members = {
                ...validConfig,
                team: {
                    ...validConfig.team,
                    members: { ...validConfig.team.members, count: 3 },
                },
            };
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(configWith3Members));

            expect(getMemberCount()).toBe(3);
        });

        it('should return default count when file does not exist', () => {
            mockExistsSync.mockReturnValue(false);

            expect(getMemberCount()).toBe(2);
        });
    });
});
