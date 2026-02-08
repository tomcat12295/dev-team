import { jest, describe, it, expect, beforeEach } from '@jest/globals';

import {
    getEnvCommand,
    getRolePromptFile,
    getRolePermissionFile,
} from '../utils/team-session.js';

// ensureDirectories, initializeQueue, createWorkspaces tests with ESM mocks
describe('team-session (mocked)', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    describe('ensureDirectories', () => {
        it('should create required directories', async () => {
            const mockMkdir = jest.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined);

            jest.unstable_mockModule('fs/promises', () => ({
                mkdir: mockMkdir,
                writeFile: jest.fn<() => Promise<void>>(),
                readFile: jest.fn<() => Promise<string>>(),
                access: jest.fn<() => Promise<void>>(),
                copyFile: jest.fn<() => Promise<void>>(),
                rm: jest.fn<() => Promise<void>>(),
            }));

            jest.unstable_mockModule('../utils/logger.js', () => ({
                info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn(),
            }));

            const { ensureDirectories } = await import('../utils/team-session.js');
            await ensureDirectories('/project/.dev-team');

            expect(mockMkdir).toHaveBeenCalledWith(
                expect.stringContaining('queue'),
                { recursive: true }
            );
            expect(mockMkdir).toHaveBeenCalledWith(
                expect.stringContaining('status'),
                { recursive: true }
            );
            expect(mockMkdir).toHaveBeenCalledWith(
                expect.stringContaining('workspaces'),
                { recursive: true }
            );
        });
    });

    describe('initializeQueue', () => {
        it('should create pm.json with initial task', async () => {
            const mockWriteFile = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

            jest.unstable_mockModule('fs/promises', () => ({
                mkdir: jest.fn<() => Promise<string | undefined>>(),
                writeFile: mockWriteFile,
                readFile: jest.fn<() => Promise<string>>(),
                access: jest.fn<() => Promise<void>>(),
                copyFile: jest.fn<() => Promise<void>>(),
                rm: jest.fn<() => Promise<void>>(),
            }));

            jest.unstable_mockModule('../utils/logger.js', () => ({
                info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn(),
            }));

            const { initializeQueue } = await import('../utils/team-session.js');
            await initializeQueue('/project/.dev-team/queue', 'Initial task content');

            expect(mockWriteFile).toHaveBeenCalledWith(
                expect.stringContaining('pm.json'),
                expect.stringContaining('Initial task content'),
                'utf-8'
            );
        });

        it('should create pm.json with correct structure', async () => {
            const mockWriteFile = jest.fn<(p: string, d: string, e?: string) => Promise<void>>().mockResolvedValue(undefined);

            jest.unstable_mockModule('fs/promises', () => ({
                mkdir: jest.fn<() => Promise<string | undefined>>(),
                writeFile: mockWriteFile,
                readFile: jest.fn<() => Promise<string>>(),
                access: jest.fn<() => Promise<void>>(),
                copyFile: jest.fn<() => Promise<void>>(),
                rm: jest.fn<() => Promise<void>>(),
            }));

            jest.unstable_mockModule('../utils/logger.js', () => ({
                info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn(),
            }));

            const { initializeQueue } = await import('../utils/team-session.js');
            await initializeQueue('/project/.dev-team/queue', 'Test task');

            const writeCall = mockWriteFile.mock.calls[0];
            const content = JSON.parse(writeCall[1]);

            expect(content).toHaveProperty('role', 'pm');
            expect(content).toHaveProperty('messages');
            expect(content.messages).toHaveLength(1);
            expect(content.messages[0]).toMatchObject({
                type: 'task',
                from: 'ceo',
                to: 'pm',
                subject: 'Initial Task',
                read: false,
            });
        });

        it('should create empty pm.json when no initial task', async () => {
            const mockWriteFile = jest.fn<(p: string, d: string, e?: string) => Promise<void>>().mockResolvedValue(undefined);

            jest.unstable_mockModule('fs/promises', () => ({
                mkdir: jest.fn<() => Promise<string | undefined>>(),
                writeFile: mockWriteFile,
                readFile: jest.fn<() => Promise<string>>(),
                access: jest.fn<() => Promise<void>>(),
                copyFile: jest.fn<() => Promise<void>>(),
                rm: jest.fn<() => Promise<void>>(),
            }));

            jest.unstable_mockModule('../utils/logger.js', () => ({
                info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn(),
            }));

            const { initializeQueue } = await import('../utils/team-session.js');
            await initializeQueue('/project/.dev-team/queue');

            const writeCall = mockWriteFile.mock.calls[0];
            const content = JSON.parse(writeCall[1]);

            expect(content.messages).toHaveLength(0);
        });
    });

    describe('createWorkspaces', () => {
        it('should create workspace directories for each role', async () => {
            const mockMkdir = jest.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined);
            const mockCopyFile = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
            const mockAccess = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

            jest.unstable_mockModule('fs/promises', () => ({
                mkdir: mockMkdir,
                writeFile: jest.fn<() => Promise<void>>(),
                readFile: jest.fn<() => Promise<string>>(),
                access: mockAccess,
                copyFile: mockCopyFile,
                rm: jest.fn<() => Promise<void>>(),
            }));

            jest.unstable_mockModule('../utils/logger.js', () => ({
                info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn(),
            }));

            const { createWorkspaces } = await import('../utils/team-session.js');
            const roles = ['pm', 'leader', 'member-01', 'member-02'];
            await createWorkspaces('/project/.dev-team/workspaces', roles);

            // Should create directory for each role
            // pm: workspace + .claude = 2, leader/member-01/member-02: workspace + .claude + .claude/skills = 3 each
            expect(mockMkdir).toHaveBeenCalledTimes(2 + 3 * 3); // 11 total
        });

        it('should copy CLAUDE.md for each role', async () => {
            const mockMkdir = jest.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined);
            const mockCopyFile = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
            const mockAccess = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

            jest.unstable_mockModule('fs/promises', () => ({
                mkdir: mockMkdir,
                writeFile: jest.fn<() => Promise<void>>(),
                readFile: jest.fn<() => Promise<string>>(),
                access: mockAccess,
                copyFile: mockCopyFile,
                rm: jest.fn<() => Promise<void>>(),
            }));

            jest.unstable_mockModule('../utils/logger.js', () => ({
                info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn(),
            }));

            const { createWorkspaces } = await import('../utils/team-session.js');
            const roles = ['pm', 'leader'];
            await createWorkspaces('/project/.dev-team/workspaces', roles);

            expect(mockCopyFile).toHaveBeenCalledWith(
                expect.stringContaining('pm.md'),
                expect.stringContaining('CLAUDE.md')
            );
            expect(mockCopyFile).toHaveBeenCalledWith(
                expect.stringContaining('leader.md'),
                expect.stringContaining('CLAUDE.md')
            );
        });

        it('should copy skill files to .claude/skills/ for leader', async () => {
            const mockMkdir = jest.fn<(p: string, o?: object) => Promise<string | undefined>>().mockResolvedValue(undefined);
            const mockCopyFile = jest.fn<(src: string, dest: string) => Promise<void>>().mockResolvedValue(undefined);
            const mockAccess = jest.fn<(p: string) => Promise<void>>().mockResolvedValue(undefined);

            jest.unstable_mockModule('fs/promises', () => ({
                mkdir: mockMkdir,
                writeFile: jest.fn<() => Promise<void>>(),
                readFile: jest.fn<() => Promise<string>>(),
                access: mockAccess,
                copyFile: mockCopyFile,
                rm: jest.fn<() => Promise<void>>(),
            }));

            jest.unstable_mockModule('../utils/logger.js', () => ({
                info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn(),
            }));

            const { createWorkspaces } = await import('../utils/team-session.js');
            const roles = ['leader'];
            await createWorkspaces('/project/.dev-team/workspaces', roles);

            // .claude/skills/ ディレクトリが作成される
            const mkdirCalls = mockMkdir.mock.calls.map(call => String(call[0]));
            const skillsDir = mkdirCalls.find(p => p.includes('skills'));
            expect(skillsDir).toBeDefined();
            expect(skillsDir).toContain('.claude');

            // スキルファイルがコピーされる
            const copyFileCalls = mockCopyFile.mock.calls.map(call => [String(call[0]), String(call[1])]);
            const skillCopies = copyFileCalls.filter(([, dest]) =>
                dest.includes('skills') && dest.includes('.claude')
            );
            expect(skillCopies.length).toBeGreaterThanOrEqual(3); // strict-review, review-plan, review-code
        });

        it('should copy skill files to .claude/skills/ for member roles', async () => {
            const mockMkdir = jest.fn<(p: string, o?: object) => Promise<string | undefined>>().mockResolvedValue(undefined);
            const mockCopyFile = jest.fn<(src: string, dest: string) => Promise<void>>().mockResolvedValue(undefined);
            const mockAccess = jest.fn<(p: string) => Promise<void>>().mockResolvedValue(undefined);

            jest.unstable_mockModule('fs/promises', () => ({
                mkdir: mockMkdir,
                writeFile: jest.fn<() => Promise<void>>(),
                readFile: jest.fn<() => Promise<string>>(),
                access: mockAccess,
                copyFile: mockCopyFile,
                rm: jest.fn<() => Promise<void>>(),
            }));

            jest.unstable_mockModule('../utils/logger.js', () => ({
                info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn(),
            }));

            const { createWorkspaces } = await import('../utils/team-session.js');
            const roles = ['member-01'];
            await createWorkspaces('/project/.dev-team/workspaces', roles);

            // スキルファイルがコピーされる
            const copyFileCalls = mockCopyFile.mock.calls.map(call => [String(call[0]), String(call[1])]);
            const skillCopies = copyFileCalls.filter(([, dest]) =>
                dest.includes('skills') && dest.includes('.claude')
            );
            expect(skillCopies.length).toBeGreaterThanOrEqual(3); // strict-workflow, tdd, report-template
        });

        it('should not copy skills for pm role', async () => {
            const mockMkdir = jest.fn<(p: string, o?: object) => Promise<string | undefined>>().mockResolvedValue(undefined);
            const mockCopyFile = jest.fn<(src: string, dest: string) => Promise<void>>().mockResolvedValue(undefined);
            const mockAccess = jest.fn<(p: string) => Promise<void>>().mockResolvedValue(undefined);

            jest.unstable_mockModule('fs/promises', () => ({
                mkdir: mockMkdir,
                writeFile: jest.fn<() => Promise<void>>(),
                readFile: jest.fn<() => Promise<string>>(),
                access: mockAccess,
                copyFile: mockCopyFile,
                rm: jest.fn<() => Promise<void>>(),
            }));

            jest.unstable_mockModule('../utils/logger.js', () => ({
                info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn(),
            }));

            const { createWorkspaces } = await import('../utils/team-session.js');
            const roles = ['pm'];
            await createWorkspaces('/project/.dev-team/workspaces', roles);

            // PMにはスキルがコピーされない
            const copyFileCalls = mockCopyFile.mock.calls.map(call => [String(call[0]), String(call[1])]);
            const skillCopies = copyFileCalls.filter(([, dest]) =>
                dest.includes('skills')
            );
            expect(skillCopies.length).toBe(0);
        });

        it('should copy settings.local.json for each role', async () => {
            const mockMkdir = jest.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined);
            const mockCopyFile = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
            const mockAccess = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

            jest.unstable_mockModule('fs/promises', () => ({
                mkdir: mockMkdir,
                writeFile: jest.fn<() => Promise<void>>(),
                readFile: jest.fn<() => Promise<string>>(),
                access: mockAccess,
                copyFile: mockCopyFile,
                rm: jest.fn<() => Promise<void>>(),
            }));

            jest.unstable_mockModule('../utils/logger.js', () => ({
                info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn(),
            }));

            const { createWorkspaces } = await import('../utils/team-session.js');
            const roles = ['pm'];
            await createWorkspaces('/project/.dev-team/workspaces', roles);

            expect(mockCopyFile).toHaveBeenCalledWith(
                expect.stringContaining('pm.json'),
                expect.stringContaining('settings.local.json')
            );
        });
    });
});

// Pure function tests (no mocks needed)
describe('team-session', () => {
    describe('getEnvCommand', () => {
        it('should return PowerShell command for Windows', () => {
            const cmd = getEnvCommand('member-01', '/project', 'win32');

            expect(cmd).toContain('$env:DEV_TEAM_ROLE=');
            expect(cmd).toContain('member-01');
            expect(cmd).toContain('$env:DEV_TEAM_PROJECT_PATH=');
            expect(cmd).toContain('claude');
        });

        it('should return Unix command for Linux/Mac', () => {
            const cmd = getEnvCommand('member-01', '/project', 'linux');

            expect(cmd).toContain('DEV_TEAM_ROLE=');
            expect(cmd).toContain('member-01');
            expect(cmd).toContain('DEV_TEAM_PROJECT_PATH=');
            expect(cmd).toContain('claude');
            expect(cmd).not.toContain('$env:');
        });

        it('should return Unix command for darwin (Mac)', () => {
            const cmd = getEnvCommand('pm', '/project', 'darwin');

            expect(cmd).not.toContain('$env:');
            expect(cmd).toContain('DEV_TEAM_ROLE=');
        });
    });

    describe('getRolePromptFile', () => {
        it('should return member.md for member roles', () => {
            expect(getRolePromptFile('member-01')).toBe('member.md');
            expect(getRolePromptFile('member-02')).toBe('member.md');
            expect(getRolePromptFile('member-05')).toBe('member.md');
        });

        it('should return role-specific file for pm and leader', () => {
            expect(getRolePromptFile('pm')).toBe('pm.md');
            expect(getRolePromptFile('leader')).toBe('leader.md');
        });
    });

    describe('getRolePermissionFile', () => {
        it('should return member.json for member roles', () => {
            expect(getRolePermissionFile('member-01')).toBe('member.json');
            expect(getRolePermissionFile('member-02')).toBe('member.json');
        });

        it('should return role-specific file for pm and leader', () => {
            expect(getRolePermissionFile('pm')).toBe('pm.json');
            expect(getRolePermissionFile('leader')).toBe('leader.json');
        });
    });
});

// stopTeamSession tests - separate describe block with different mocks
describe('stopTeamSession', () => {
    // Reset modules to apply new mocks
    beforeEach(() => {
        jest.resetModules();
    });

    it('panes.jsonが存在しない場合はエラーを投げる', async () => {
        // Mock fs to throw error for access
        jest.unstable_mockModule('fs/promises', () => ({
            readFile: jest.fn<() => Promise<string>>(),
            rm: jest.fn<() => Promise<void>>(),
            access: jest.fn<() => Promise<void>>().mockRejectedValue(new Error('ENOENT: no such file')),
            mkdir: jest.fn<() => Promise<string | undefined>>(),
            writeFile: jest.fn<() => Promise<void>>(),
            copyFile: jest.fn<() => Promise<void>>(),
        }));

        jest.unstable_mockModule('../utils/wezterm.js', () => ({
            sendTextToPane: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
        }));

        jest.unstable_mockModule('../utils/logger.js', () => ({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        }));

        const { stopTeamSession } = await import('../utils/team-session.js');
        await expect(stopTeamSession('/test/project')).rejects.toThrow();
    });

    it('各ペインに/exitコマンドが送信される', async () => {
        const mockSendTextToPane = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
        const mockPanesJson = {
            pm: '1',
            leader: '2',
            member01: '3',
            member02: '4',
            projectPath: '/test/project',
            startTime: '2026-01-01T00:00:00Z',
        };

        jest.unstable_mockModule('fs/promises', () => ({
            readFile: jest.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(mockPanesJson)),
            rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            mkdir: jest.fn<() => Promise<string | undefined>>(),
            writeFile: jest.fn<() => Promise<void>>(),
            copyFile: jest.fn<() => Promise<void>>(),
        }));

        jest.unstable_mockModule('../utils/wezterm.js', () => ({
            sendTextToPane: mockSendTextToPane,
        }));

        jest.unstable_mockModule('../utils/logger.js', () => ({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        }));

        const { stopTeamSession } = await import('../utils/team-session.js');
        await stopTeamSession('/test/project');

        // /exitが各ロールに送信される
        expect(mockSendTextToPane).toHaveBeenCalledWith('pm', '/exit');
        expect(mockSendTextToPane).toHaveBeenCalledWith('leader', '/exit');
        expect(mockSendTextToPane).toHaveBeenCalledWith('member-01', '/exit');
        expect(mockSendTextToPane).toHaveBeenCalledWith('member-02', '/exit');
    });

    it('各ペインにexitコマンドが送信される', async () => {
        const mockSendTextToPane = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
        const mockPanesJson = {
            pm: '1',
            leader: '2',
            member01: '3',
            projectPath: '/test/project',
        };

        jest.unstable_mockModule('fs/promises', () => ({
            readFile: jest.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(mockPanesJson)),
            rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            mkdir: jest.fn<() => Promise<string | undefined>>(),
            writeFile: jest.fn<() => Promise<void>>(),
            copyFile: jest.fn<() => Promise<void>>(),
        }));

        jest.unstable_mockModule('../utils/wezterm.js', () => ({
            sendTextToPane: mockSendTextToPane,
        }));

        jest.unstable_mockModule('../utils/logger.js', () => ({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        }));

        const { stopTeamSession } = await import('../utils/team-session.js');
        await stopTeamSession('/test/project');

        // exitが各ロールに送信される（シェル終了）
        expect(mockSendTextToPane).toHaveBeenCalledWith('pm', 'exit');
        expect(mockSendTextToPane).toHaveBeenCalledWith('leader', 'exit');
        expect(mockSendTextToPane).toHaveBeenCalledWith('member-01', 'exit');
    });

    it('panes.jsonが削除される', async () => {
        const mockRm = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const mockPanesJson = { pm: '1', projectPath: '/test/project' };

        jest.unstable_mockModule('fs/promises', () => ({
            readFile: jest.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(mockPanesJson)),
            rm: mockRm,
            access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            mkdir: jest.fn<() => Promise<string | undefined>>(),
            writeFile: jest.fn<() => Promise<void>>(),
            copyFile: jest.fn<() => Promise<void>>(),
        }));

        jest.unstable_mockModule('../utils/wezterm.js', () => ({
            sendTextToPane: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
        }));

        jest.unstable_mockModule('../utils/logger.js', () => ({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        }));

        const { stopTeamSession } = await import('../utils/team-session.js');
        await stopTeamSession('/test/project');

        // panes.jsonが削除される
        expect(mockRm).toHaveBeenCalledWith(
            expect.stringContaining('panes.json'),
            expect.objectContaining({ force: true })
        );
    });

    it('keepQueue=falseの場合queueディレクトリの内容が削除される', async () => {
        const mockRm = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const mockPanesJson = { pm: '1', projectPath: '/test/project' };

        jest.unstable_mockModule('fs/promises', () => ({
            readFile: jest.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(mockPanesJson)),
            rm: mockRm,
            access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            mkdir: jest.fn<() => Promise<string | undefined>>(),
            writeFile: jest.fn<() => Promise<void>>(),
            copyFile: jest.fn<() => Promise<void>>(),
        }));

        jest.unstable_mockModule('../utils/wezterm.js', () => ({
            sendTextToPane: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
        }));

        jest.unstable_mockModule('../utils/logger.js', () => ({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        }));

        const { stopTeamSession } = await import('../utils/team-session.js');
        await stopTeamSession('/test/project', { keepQueue: false });

        // queueディレクトリが削除される
        expect(mockRm).toHaveBeenCalledWith(
            expect.stringContaining('queue'),
            expect.objectContaining({ recursive: true, force: true })
        );
    });
});

// addMember tests
describe('addMember', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    it('メンバー数が上限(8)を超える場合はエラーを投げる', async () => {
        // 現在6メンバーがいる状態で3人追加しようとする
        const mockPanesJson = {
            pm: '1',
            leader: '2',
            'member-01': '3',
            'member-02': '4',
            'member-03': '5',
            'member-04': '6',
            'member-05': '7',
            'member-06': '8',
            projectPath: '/test/project',
            startTime: '2026-01-01T00:00:00Z',
        };

        jest.unstable_mockModule('fs/promises', () => ({
            readFile: jest.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(mockPanesJson)),
            writeFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            mkdir: jest.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined),
            copyFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        }));

        jest.unstable_mockModule('child_process', () => ({
            exec: jest.fn(),
        }));

        jest.unstable_mockModule('../utils/wezterm.js', () => ({
            sendTextToPane: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
        }));

        jest.unstable_mockModule('../utils/logger.js', () => ({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
        }));

        const { addMember } = await import('../utils/team-session.js');
        await expect(addMember({ projectPath: '/test/project', count: 3 })).rejects.toThrow(/exceed/i);
    });

    it('正常にメンバーを追加できる（ワークスペース作成）', async () => {
        const mockPanesJson = {
            pm: '1',
            leader: '2',
            'member-01': '3',
            'member-02': '4',
            projectPath: '/test/project',
            startTime: '2026-01-01T00:00:00Z',
        };

        const mockMkdir = jest.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined);
        const mockCopyFile = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const mockWriteFile = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

        jest.unstable_mockModule('fs/promises', () => ({
            readFile: jest.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(mockPanesJson)),
            writeFile: mockWriteFile,
            mkdir: mockMkdir,
            copyFile: mockCopyFile,
            access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        }));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mockExec = jest.fn().mockImplementation((cmd: any, callback: any) => {
            if (callback) callback(null, { stdout: '10', stderr: '' });
            return { stdout: '10', stderr: '' };
        });

        jest.unstable_mockModule('child_process', () => ({
            exec: mockExec,
        }));

        jest.unstable_mockModule('../utils/wezterm.js', () => ({
            sendTextToPane: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
        }));

        jest.unstable_mockModule('../utils/logger.js', () => ({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
        }));

        const { addMember } = await import('../utils/team-session.js');
        await addMember({ projectPath: '/test/project', count: 1 });

        // ワークスペースディレクトリが作成される
        expect(mockMkdir).toHaveBeenCalledWith(
            expect.stringContaining('member-03'),
            expect.any(Object)
        );
    });

    it('panes.jsonが新しいメンバーで更新される', async () => {
        const mockPanesJson = {
            pm: '1',
            leader: '2',
            'member-01': '3',
            'member-02': '4',
            projectPath: '/test/project',
            startTime: '2026-01-01T00:00:00Z',
        };

        const mockWriteFile = jest.fn<(path: string, data: string, encoding?: string) => Promise<void>>().mockResolvedValue(undefined);

        jest.unstable_mockModule('fs/promises', () => ({
            readFile: jest.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(mockPanesJson)),
            writeFile: mockWriteFile,
            mkdir: jest.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined),
            copyFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        }));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mockExec = jest.fn().mockImplementation((cmd: any, callback: any) => {
            if (callback) callback(null, { stdout: '10', stderr: '' });
            return { stdout: '10', stderr: '' };
        });

        jest.unstable_mockModule('child_process', () => ({
            exec: mockExec,
        }));

        jest.unstable_mockModule('../utils/wezterm.js', () => ({
            sendTextToPane: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
        }));

        jest.unstable_mockModule('../utils/logger.js', () => ({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
        }));

        const { addMember } = await import('../utils/team-session.js');
        await addMember({ projectPath: '/test/project', count: 1 });

        // panes.jsonが更新される（member-03が追加される）
        const writeCall = mockWriteFile.mock.calls.find(
            (call: [string, string, string?]) => call[0].includes('panes.json')
        );
        expect(writeCall).toBeDefined();
        if (writeCall) {
            const content = JSON.parse(writeCall[1]);
            expect(content).toHaveProperty('member-03');
        }
    });
});

// generateNextMemberRoles tests
describe('generateNextMemberRoles', () => {
    beforeEach(async () => {
        jest.resetModules();
    });

    it('既存メンバーの次の番号からロールを生成する', async () => {
        const { generateNextMemberRoles } = await import('../utils/team-session.js');

        const existingRoles = ['pm', 'leader', 'member-01', 'member-02'];
        const newRoles = generateNextMemberRoles(existingRoles, 2);

        expect(newRoles).toEqual(['member-03', 'member-04']);
    });

    it('メンバーがいない場合はmember-01から開始', async () => {
        const { generateNextMemberRoles } = await import('../utils/team-session.js');

        const existingRoles = ['pm', 'leader'];
        const newRoles = generateNextMemberRoles(existingRoles, 2);

        expect(newRoles).toEqual(['member-01', 'member-02']);
    });
});

// removeMember tests
describe('removeMember', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    it('panes.jsonが存在しない場合はエラーを投げる', async () => {
        jest.unstable_mockModule('fs/promises', () => ({
            readFile: jest.fn<() => Promise<string>>(),
            writeFile: jest.fn<() => Promise<void>>(),
            rm: jest.fn<() => Promise<void>>(),
            access: jest.fn<() => Promise<void>>().mockRejectedValue(new Error('ENOENT')),
            mkdir: jest.fn<() => Promise<string | undefined>>(),
            copyFile: jest.fn<() => Promise<void>>(),
        }));

        jest.unstable_mockModule('child_process', () => ({
            exec: jest.fn(),
        }));

        jest.unstable_mockModule('../utils/logger.js', () => ({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
        }));

        const { removeMember } = await import('../utils/team-session.js');
        await expect(removeMember('/test/project', { count: 1 })).rejects.toThrow();
    });

    it('指定したcount分のメンバーが削除される', async () => {
        const mockPanesJson = {
            pm: '1',
            leader: '2',
            'member-01': '3',
            'member-02': '4',
            'member-03': '5',
            projectPath: '/test/project',
            startTime: '2026-01-01T00:00:00Z',
        };

        const mockWriteFile = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

        jest.unstable_mockModule('fs/promises', () => ({
            readFile: jest.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(mockPanesJson)),
            writeFile: mockWriteFile,
            rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            mkdir: jest.fn<() => Promise<string | undefined>>(),
            copyFile: jest.fn<() => Promise<void>>(),
        }));

        jest.unstable_mockModule('child_process', () => ({
            exec: jest.fn((_cmd: string, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
                callback(null, { stdout: '', stderr: '' });
            }),
        }));

        jest.unstable_mockModule('../utils/logger.js', () => ({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
        }));

        const { removeMember } = await import('../utils/team-session.js');
        await removeMember('/test/project', { count: 1 });

        // panes.jsonが更新される
        expect(mockWriteFile).toHaveBeenCalled();
    });

    it('panes.jsonが更新される（メンバー削除後）', async () => {
        const mockPanesJson = {
            pm: '1',
            leader: '2',
            'member-01': '3',
            'member-02': '4',
            'member-03': '5',
            projectPath: '/test/project',
            startTime: '2026-01-01T00:00:00Z',
        };

        const mockWriteFile = jest.fn<(path: string, data: string, encoding?: string) => Promise<void>>().mockResolvedValue(undefined);

        jest.unstable_mockModule('fs/promises', () => ({
            readFile: jest.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(mockPanesJson)),
            writeFile: mockWriteFile,
            rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            mkdir: jest.fn<() => Promise<string | undefined>>(),
            copyFile: jest.fn<() => Promise<void>>(),
        }));

        jest.unstable_mockModule('child_process', () => ({
            exec: jest.fn((_cmd: string, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
                callback(null, { stdout: '', stderr: '' });
            }),
        }));

        jest.unstable_mockModule('../utils/wezterm.js', () => ({
            sendTextToPane: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
        }));

        jest.unstable_mockModule('../utils/logger.js', () => ({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
        }));

        const { removeMember } = await import('../utils/team-session.js');
        await removeMember('/test/project', { count: 1 });

        // panes.jsonが更新される（member-03が削除されている）
        const writeCall = mockWriteFile.mock.calls.find(
            (call: [string, string, string?]) => call[0].includes('panes.json')
        );
        expect(writeCall).toBeDefined();
        if (writeCall) {
            const content = JSON.parse(writeCall[1]);
            expect(content).not.toHaveProperty('member-03');
        }
    });

    it('最小2メンバー制限が適用される', async () => {
        const mockPanesJson = {
            pm: '1',
            leader: '2',
            'member-01': '3',
            'member-02': '4',
            projectPath: '/test/project',
            startTime: '2026-01-01T00:00:00Z',
        };

        jest.unstable_mockModule('fs/promises', () => ({
            readFile: jest.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(mockPanesJson)),
            writeFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            mkdir: jest.fn<() => Promise<string | undefined>>(),
            copyFile: jest.fn<() => Promise<void>>(),
        }));

        jest.unstable_mockModule('child_process', () => ({
            exec: jest.fn((_cmd: string, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
                callback(null, { stdout: '', stderr: '' });
            }),
        }));

        jest.unstable_mockModule('../utils/logger.js', () => ({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
        }));

        const { removeMember } = await import('../utils/team-session.js');

        // 2メンバーしかいない状態で削除しようとするとエラー
        await expect(removeMember('/test/project', { count: 1 })).rejects.toThrow();
    });

    // Pane close functionality tests (TDD: these tests should fail until implementation is added)
    describe('pane close functionality', () => {
        it('wezterm cli kill-paneが削除されるメンバーのpaneIdで呼び出される', async () => {
            const mockPanesJson = {
                pm: '1',
                leader: '2',
                'member-01': 'pane-member-01-111',
                'member-02': 'pane-member-02-222',
                'member-03': 'pane-member-03-333',
                projectPath: '/test/project',
                startTime: '2026-01-01T00:00:00Z',
            };

            const execCalls: string[] = [];
            const mockExec = jest.fn((cmd: string, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
                execCalls.push(cmd);
                callback(null, { stdout: '', stderr: '' });
            });

            jest.unstable_mockModule('fs/promises', () => ({
                readFile: jest.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(mockPanesJson)),
                writeFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
                rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
                access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
                mkdir: jest.fn<() => Promise<string | undefined>>(),
                copyFile: jest.fn<() => Promise<void>>(),
            }));

            jest.unstable_mockModule('child_process', () => ({
                exec: mockExec,
            }));

            jest.unstable_mockModule('../utils/wezterm.js', () => ({
                sendTextToPane: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
            }));

            jest.unstable_mockModule('../utils/logger.js', () => ({
                info: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
                warn: jest.fn(),
            }));

            const { removeMember } = await import('../utils/team-session.js');
            await removeMember('/test/project', { count: 1 });

            // kill-paneがmember-03のpaneIdで呼び出されることを検証
            const killPaneCalls = execCalls.filter(cmd => cmd.includes('wezterm cli kill-pane'));
            expect(killPaneCalls.length).toBeGreaterThan(0);
            expect(killPaneCalls[0]).toContain('pane-member-03-333');
        });

        it('複数メンバー削除時、全てのペインがクローズされる', async () => {
            const mockPanesJson = {
                pm: '1',
                leader: '2',
                'member-01': 'pane-member-01-111',
                'member-02': 'pane-member-02-222',
                'member-03': 'pane-member-03-333',
                'member-04': 'pane-member-04-444',
                projectPath: '/test/project',
                startTime: '2026-01-01T00:00:00Z',
            };

            const execCalls: string[] = [];
            const mockExec = jest.fn((cmd: string, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
                execCalls.push(cmd);
                callback(null, { stdout: '', stderr: '' });
            });

            jest.unstable_mockModule('fs/promises', () => ({
                readFile: jest.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(mockPanesJson)),
                writeFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
                rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
                access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
                mkdir: jest.fn<() => Promise<string | undefined>>(),
                copyFile: jest.fn<() => Promise<void>>(),
            }));

            jest.unstable_mockModule('child_process', () => ({
                exec: mockExec,
            }));

            jest.unstable_mockModule('../utils/wezterm.js', () => ({
                sendTextToPane: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
            }));

            jest.unstable_mockModule('../utils/logger.js', () => ({
                info: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
                warn: jest.fn(),
            }));

            const { removeMember } = await import('../utils/team-session.js');
            await removeMember('/test/project', { count: 2 });

            // member-03とmember-04のkill-pane呼び出しを検証
            const killPaneCalls = execCalls.filter(cmd => cmd.includes('wezterm cli kill-pane'));
            expect(killPaneCalls.length).toBe(2);
            expect(killPaneCalls.some(cmd => cmd.includes('pane-member-03-333'))).toBe(true);
            expect(killPaneCalls.some(cmd => cmd.includes('pane-member-04-444'))).toBe(true);
        });

        it('kill-paneがエラーでも処理が継続される', async () => {
            const mockPanesJson = {
                pm: '1',
                leader: '2',
                'member-01': 'pane-member-01-111',
                'member-02': 'pane-member-02-222',
                'member-03': 'pane-member-03-333',
                projectPath: '/test/project',
                startTime: '2026-01-01T00:00:00Z',
            };

            const mockExec = jest.fn((cmd: string, callback: (err: Error | null, result: { stdout: string; stderr: string } | null) => void) => {
                if (cmd.includes('kill-pane')) {
                    callback(new Error('Pane not found'), null);
                } else {
                    callback(null, { stdout: '', stderr: '' });
                }
            });

            jest.unstable_mockModule('fs/promises', () => ({
                readFile: jest.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(mockPanesJson)),
                writeFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
                rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
                access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
                mkdir: jest.fn<() => Promise<string | undefined>>(),
                copyFile: jest.fn<() => Promise<void>>(),
            }));

            jest.unstable_mockModule('child_process', () => ({
                exec: mockExec,
            }));

            jest.unstable_mockModule('../utils/wezterm.js', () => ({
                sendTextToPane: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
            }));

            jest.unstable_mockModule('../utils/logger.js', () => ({
                info: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
                warn: jest.fn(),
            }));

            const { removeMember } = await import('../utils/team-session.js');

            // エラーが起きても処理が完了することを検証
            const result = await removeMember('/test/project', { count: 1 });
            expect(result.removedRoles).toContain('member-03');
            expect(result.newCount).toBe(2);
        });

        it('paneIdが空の場合はkill-paneをスキップする', async () => {
            const mockPanesJson = {
                pm: '1',
                leader: '2',
                'member-01': 'pane-member-01-111',
                'member-02': 'pane-member-02-222',
                'member-03': '', // 空のpaneId
                projectPath: '/test/project',
                startTime: '2026-01-01T00:00:00Z',
            };

            const execCalls: string[] = [];
            const mockExec = jest.fn((cmd: string, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
                execCalls.push(cmd);
                callback(null, { stdout: '', stderr: '' });
            });

            jest.unstable_mockModule('fs/promises', () => ({
                readFile: jest.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(mockPanesJson)),
                writeFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
                rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
                access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
                mkdir: jest.fn<() => Promise<string | undefined>>(),
                copyFile: jest.fn<() => Promise<void>>(),
            }));

            jest.unstable_mockModule('child_process', () => ({
                exec: mockExec,
            }));

            jest.unstable_mockModule('../utils/wezterm.js', () => ({
                sendTextToPane: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
            }));

            jest.unstable_mockModule('../utils/logger.js', () => ({
                info: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
                warn: jest.fn(),
            }));

            const { removeMember } = await import('../utils/team-session.js');
            await removeMember('/test/project', { count: 1 });

            // paneIdが空の場合、kill-paneは呼び出されないことを検証
            const killPaneCalls = execCalls.filter(cmd => cmd.includes('wezterm cli kill-pane'));
            expect(killPaneCalls.length).toBe(0);
        });
    });

    // team.json更新のテスト
    describe('team.json member count update', () => {
        it('removeMember完了後にteam.jsonのmembers.countが更新される', async () => {
            const mockPanesJson = {
                pm: '1',
                leader: '2',
                'member-01': '3',
                'member-02': '4',
                'member-03': '5',
                projectPath: '/test/project',
                startTime: '2026-01-01T00:00:00Z',
            };

            const existingTeamJson = {
                version: '1.0',
                team: {
                    fixedRoles: ['pm', 'leader'],
                    members: {
                        count: 3,
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

            const writtenFiles: Record<string, string> = {};
            const mockWriteFile = jest.fn<(path: string, data: string, encoding?: string) => Promise<void>>()
                .mockImplementation(async (filePath: string, data: string) => {
                    writtenFiles[filePath] = data;
                });

            const mockReadFile = jest.fn<(path: string, encoding?: string) => Promise<string>>()
                .mockImplementation(async (filePath: string) => {
                    if (filePath.includes('panes.json')) {
                        return JSON.stringify(mockPanesJson);
                    }
                    if (filePath.includes('team.json')) {
                        return JSON.stringify(existingTeamJson);
                    }
                    throw new Error('File not found');
                });

            jest.unstable_mockModule('fs/promises', () => ({
                readFile: mockReadFile,
                writeFile: mockWriteFile,
                rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
                access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
                mkdir: jest.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined),
                copyFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            }));

            jest.unstable_mockModule('child_process', () => ({
                exec: jest.fn((_cmd: string, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
                    callback(null, { stdout: '', stderr: '' });
                }),
            }));

            jest.unstable_mockModule('../utils/wezterm.js', () => ({
                sendTextToPane: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
            }));

            jest.unstable_mockModule('../utils/logger.js', () => ({
                info: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
                warn: jest.fn(),
            }));

            const { removeMember } = await import('../utils/team-session.js');
            await removeMember('/test/project', { count: 1 });

            // team.jsonが更新されていることを確認
            const teamJsonPath = Object.keys(writtenFiles).find(p => p.includes('team.json'));
            expect(teamJsonPath).toBeDefined();
            if (teamJsonPath) {
                const teamJson = JSON.parse(writtenFiles[teamJsonPath]);
                expect(teamJson.team.members.count).toBe(2);
            }
        });

        it('removeMember時にteam.jsonが存在しない場合は新規作成される', async () => {
            const mockPanesJson = {
                pm: '1',
                leader: '2',
                'member-01': '3',
                'member-02': '4',
                'member-03': '5',
                projectPath: '/test/project',
                startTime: '2026-01-01T00:00:00Z',
            };

            const writtenFiles: Record<string, string> = {};
            const mockWriteFile = jest.fn<(path: string, data: string, encoding?: string) => Promise<void>>()
                .mockImplementation(async (filePath: string, data: string) => {
                    writtenFiles[filePath] = data;
                });

            const mockReadFile = jest.fn<(path: string, encoding?: string) => Promise<string>>()
                .mockImplementation(async (filePath: string) => {
                    if (filePath.includes('panes.json')) {
                        return JSON.stringify(mockPanesJson);
                    }
                    if (filePath.includes('team.json')) {
                        throw new Error('ENOENT: no such file or directory');
                    }
                    throw new Error('File not found');
                });

            jest.unstable_mockModule('fs/promises', () => ({
                readFile: mockReadFile,
                writeFile: mockWriteFile,
                rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
                access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
                mkdir: jest.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined),
                copyFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            }));

            jest.unstable_mockModule('child_process', () => ({
                exec: jest.fn((_cmd: string, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
                    callback(null, { stdout: '', stderr: '' });
                }),
            }));

            jest.unstable_mockModule('../utils/wezterm.js', () => ({
                sendTextToPane: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
            }));

            jest.unstable_mockModule('../utils/logger.js', () => ({
                info: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
                warn: jest.fn(),
            }));

            const { removeMember } = await import('../utils/team-session.js');
            await removeMember('/test/project', { count: 1 });

            // team.jsonが新規作成されていることを確認
            const teamJsonPath = Object.keys(writtenFiles).find(p => p.includes('team.json'));
            expect(teamJsonPath).toBeDefined();
            if (teamJsonPath) {
                const teamJson = JSON.parse(writtenFiles[teamJsonPath]);
                expect(teamJson.version).toBe('1.0');
                expect(teamJson.team.members.count).toBe(2);
                expect(teamJson.team.members.prefix).toBe('member-');
                expect(teamJson.team.fixedRoles).toEqual(['pm', 'leader']);
            }
        });
    });
});

// addMember team.json update tests
describe('addMember team.json update', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    it('addMember完了後にteam.jsonのmembers.countが更新される', async () => {
        const mockPanesJson = {
            pm: '1',
            leader: '2',
            'member-01': '3',
            'member-02': '4',
            projectPath: '/test/project',
            startTime: '2026-01-01T00:00:00Z',
        };

        const existingTeamJson = {
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

        const writtenFiles: Record<string, string> = {};
        const mockWriteFile = jest.fn<(path: string, data: string, encoding?: string) => Promise<void>>()
            .mockImplementation(async (filePath: string, data: string) => {
                writtenFiles[filePath] = data;
            });

        const mockReadFile = jest.fn<(path: string, encoding?: string) => Promise<string>>()
            .mockImplementation(async (filePath: string) => {
                if (filePath.includes('panes.json')) {
                    return JSON.stringify(mockPanesJson);
                }
                if (filePath.includes('team.json')) {
                    return JSON.stringify(existingTeamJson);
                }
                throw new Error('File not found');
            });

        jest.unstable_mockModule('fs/promises', () => ({
            readFile: mockReadFile,
            writeFile: mockWriteFile,
            rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            mkdir: jest.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined),
            copyFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        }));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mockExec = jest.fn().mockImplementation((cmd: any, callback: any) => {
            if (callback) callback(null, { stdout: '10', stderr: '' });
            return { stdout: '10', stderr: '' };
        });

        jest.unstable_mockModule('child_process', () => ({
            exec: mockExec,
        }));

        jest.unstable_mockModule('../utils/wezterm.js', () => ({
            sendTextToPane: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
        }));

        jest.unstable_mockModule('../utils/logger.js', () => ({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
        }));

        const { addMember } = await import('../utils/team-session.js');
        await addMember({ projectPath: '/test/project', count: 1 });

        // team.jsonが更新されていることを確認
        const teamJsonPath = Object.keys(writtenFiles).find(p => p.includes('team.json'));
        expect(teamJsonPath).toBeDefined();
        if (teamJsonPath) {
            const teamJson = JSON.parse(writtenFiles[teamJsonPath]);
            expect(teamJson.team.members.count).toBe(3);
        }
    });

    it('addMember時にteam.jsonが存在しない場合は新規作成される', async () => {
        const mockPanesJson = {
            pm: '1',
            leader: '2',
            'member-01': '3',
            'member-02': '4',
            projectPath: '/test/project',
            startTime: '2026-01-01T00:00:00Z',
        };

        const writtenFiles: Record<string, string> = {};
        const mockWriteFile = jest.fn<(path: string, data: string, encoding?: string) => Promise<void>>()
            .mockImplementation(async (filePath: string, data: string) => {
                writtenFiles[filePath] = data;
            });

        const mockReadFile = jest.fn<(path: string, encoding?: string) => Promise<string>>()
            .mockImplementation(async (filePath: string) => {
                if (filePath.includes('panes.json')) {
                    return JSON.stringify(mockPanesJson);
                }
                if (filePath.includes('team.json')) {
                    throw new Error('ENOENT: no such file or directory');
                }
                throw new Error('File not found');
            });

        jest.unstable_mockModule('fs/promises', () => ({
            readFile: mockReadFile,
            writeFile: mockWriteFile,
            rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            mkdir: jest.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined),
            copyFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        }));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mockExec = jest.fn().mockImplementation((cmd: any, callback: any) => {
            if (callback) callback(null, { stdout: '10', stderr: '' });
            return { stdout: '10', stderr: '' };
        });

        jest.unstable_mockModule('child_process', () => ({
            exec: mockExec,
        }));

        jest.unstable_mockModule('../utils/wezterm.js', () => ({
            sendTextToPane: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
        }));

        jest.unstable_mockModule('../utils/logger.js', () => ({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
        }));

        const { addMember } = await import('../utils/team-session.js');
        await addMember({ projectPath: '/test/project', count: 1 });

        // team.jsonが新規作成されていることを確認
        const teamJsonPath = Object.keys(writtenFiles).find(p => p.includes('team.json'));
        expect(teamJsonPath).toBeDefined();
        if (teamJsonPath) {
            const teamJson = JSON.parse(writtenFiles[teamJsonPath]);
            expect(teamJson.version).toBe('1.0');
            expect(teamJson.team.members.count).toBe(3);
            expect(teamJson.team.members.prefix).toBe('member-');
            expect(teamJson.team.fixedRoles).toEqual(['pm', 'leader']);
        }
    });
});

// updateTeamConfigMemberCount tests
describe('updateTeamConfigMemberCount', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    it('既存のteam.jsonを正しく更新する', async () => {
        const existingTeamJson = {
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

        const writtenFiles: Record<string, string> = {};
        const mockWriteFile = jest.fn<(path: string, data: string, encoding?: string) => Promise<void>>()
            .mockImplementation(async (filePath: string, data: string) => {
                writtenFiles[filePath] = data;
            });

        const mockReadFile = jest.fn<(path: string, encoding?: string) => Promise<string>>()
            .mockImplementation(async (filePath: string) => {
                if (filePath.includes('team.json')) {
                    return JSON.stringify(existingTeamJson);
                }
                throw new Error('File not found');
            });

        jest.unstable_mockModule('fs/promises', () => ({
            readFile: mockReadFile,
            writeFile: mockWriteFile,
            rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            mkdir: jest.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined),
            copyFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        }));

        jest.unstable_mockModule('../utils/logger.js', () => ({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
        }));

        const { updateTeamConfigMemberCount } = await import('../utils/team-session.js');
        await updateTeamConfigMemberCount('/test/project', 5);

        const teamJsonPath = Object.keys(writtenFiles).find(p => p.includes('team.json'));
        expect(teamJsonPath).toBeDefined();
        if (teamJsonPath) {
            const teamJson = JSON.parse(writtenFiles[teamJsonPath]);
            expect(teamJson.team.members.count).toBe(5);
            // 他のフィールドは変更されていない
            expect(teamJson.team.fixedRoles).toEqual(['pm', 'leader']);
            expect(teamJson.permissionTemplates.member.canSendTo).toEqual(['leader']);
        }
    });

    it('team.json新規作成時にデフォルト構造を使用する', async () => {
        const writtenFiles: Record<string, string> = {};
        const mockWriteFile = jest.fn<(path: string, data: string, encoding?: string) => Promise<void>>()
            .mockImplementation(async (filePath: string, data: string) => {
                writtenFiles[filePath] = data;
            });

        const mockReadFile = jest.fn<(path: string, encoding?: string) => Promise<string>>()
            .mockImplementation(async () => {
                throw new Error('ENOENT: no such file or directory');
            });

        jest.unstable_mockModule('fs/promises', () => ({
            readFile: mockReadFile,
            writeFile: mockWriteFile,
            rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            mkdir: jest.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined),
            copyFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        }));

        jest.unstable_mockModule('../utils/logger.js', () => ({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
        }));

        const { updateTeamConfigMemberCount } = await import('../utils/team-session.js');
        await updateTeamConfigMemberCount('/test/project', 4);

        const teamJsonPath = Object.keys(writtenFiles).find(p => p.includes('team.json'));
        expect(teamJsonPath).toBeDefined();
        if (teamJsonPath) {
            const teamJson = JSON.parse(writtenFiles[teamJsonPath]);
            expect(teamJson.version).toBe('1.0');
            expect(teamJson.team.members.count).toBe(4);
            expect(teamJson.team.members.prefix).toBe('member-');
            expect(teamJson.team.members.startIndex).toBe(1);
            expect(teamJson.team.fixedRoles).toEqual(['pm', 'leader']);
            expect(teamJson.permissionTemplates).toBeDefined();
        }
    });

    it('configディレクトリを自動作成する', async () => {
        const createdDirs: string[] = [];
        const mockMkdir = jest.fn<(path: string, options?: { recursive?: boolean }) => Promise<string | undefined>>()
            .mockImplementation(async (dirPath: string) => {
                createdDirs.push(dirPath);
                return undefined;
            });

        const mockReadFile = jest.fn<(path: string, encoding?: string) => Promise<string>>()
            .mockImplementation(async () => {
                throw new Error('ENOENT: no such file or directory');
            });

        jest.unstable_mockModule('fs/promises', () => ({
            readFile: mockReadFile,
            writeFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            rm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            access: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            mkdir: mockMkdir,
            copyFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        }));

        jest.unstable_mockModule('../utils/logger.js', () => ({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
        }));

        const { updateTeamConfigMemberCount } = await import('../utils/team-session.js');
        await updateTeamConfigMemberCount('/test/project', 3);

        // configディレクトリが作成されていることを確認
        const configDirCreated = createdDirs.some(dir => dir.includes('config'));
        expect(configDirCreated).toBe(true);
    });
});
