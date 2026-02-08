import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock fs/promises
jest.unstable_mockModule('fs/promises', () => ({
    mkdir: jest.fn<(path: string, options?: { recursive?: boolean }) => Promise<string | undefined>>(),
    writeFile: jest.fn<(path: string, data: string) => Promise<void>>(),
    readFile: jest.fn<(path: string, encoding?: string) => Promise<string>>(),
    access: jest.fn<(path: string) => Promise<void>>(),
}));

describe('init-project', () => {
    let initProject: (projectPath: string, options?: { force?: boolean }) => Promise<void>;
    let mockMkdir: jest.MockedFunction<(path: string, options?: { recursive?: boolean }) => Promise<string | undefined>>;
    let mockWriteFile: jest.MockedFunction<(path: string, data: string) => Promise<void>>;
    let mockReadFile: jest.MockedFunction<(path: string, encoding?: string) => Promise<string>>;
    let mockAccess: jest.MockedFunction<(path: string) => Promise<void>>;

    const TEMPLATE_CONTENT = `---
name: start-team
---
# /start-team
npx dev-team start "{{PROJECT_PATH}}"
`;

    const PM_PROMPT = '# PM\nPM instructions';
    const LEADER_PROMPT = '# Leader\nLeader instructions';
    const MEMBER_PROMPT = '# Member\nMember instructions';
    const SKILL_CONTENT = '# Skill\nSkill content';

    beforeEach(async () => {
        jest.clearAllMocks();

        const fsModule = await import('fs/promises');
        mockMkdir = fsModule.mkdir as unknown as typeof mockMkdir;
        mockWriteFile = fsModule.writeFile as unknown as typeof mockWriteFile;
        mockReadFile = fsModule.readFile as unknown as typeof mockReadFile;
        mockAccess = fsModule.access as unknown as typeof mockAccess;

        // Default mock implementations
        mockMkdir.mockResolvedValue(undefined);
        mockWriteFile.mockResolvedValue(undefined);

        // Mock readFile to return different content based on path
        mockReadFile.mockImplementation(async (filePath: string) => {
            if (filePath.includes('start-team-skill.md')) {
                return TEMPLATE_CONTENT;
            }
            if (filePath.includes('pm.md')) {
                return PM_PROMPT;
            }
            if (filePath.includes('leader.md')) {
                return LEADER_PROMPT;
            }
            if (filePath.includes('member.md')) {
                return MEMBER_PROMPT;
            }
            // Skill template files
            if (filePath.includes('skills/') || filePath.includes('skills\\')) {
                return SKILL_CONTENT;
            }
            throw new Error(`ENOENT: no such file: ${filePath}`);
        });

        // Default: project directory exists, .dev-team does not exist
        mockAccess.mockImplementation(async (filePath: string) => {
            if (filePath.endsWith('.dev-team') || filePath.includes('.claude')) {
                throw new Error('ENOENT');
            }
            // Project directory exists
            return undefined;
        });

        const initProjectModule = await import('../utils/init-project.js');
        initProject = initProjectModule.initProject;
    });


    describe('ディレクトリ構造の作成', () => {
        it('.dev-team/workspaces/構造が正しく作成される', async () => {
            const projectPath = '/test/project';

            await initProject(projectPath);

            // Check mkdir calls for workspaces
            const mkdirCalls = mockMkdir.mock.calls.map(call => call[0]);
            expect(mkdirCalls).toContainEqual(expect.stringContaining('.dev-team'));
            expect(mkdirCalls).toContainEqual(expect.stringContaining('workspaces'));
        });

        it('.dev-team/queue/ディレクトリが作成される', async () => {
            const projectPath = '/test/project';

            await initProject(projectPath);

            const mkdirCalls = mockMkdir.mock.calls.map(call => call[0]);
            expect(mkdirCalls).toContainEqual(expect.stringContaining('queue'));
        });

        it('.claude/skills/start-team/ディレクトリが作成される', async () => {
            const projectPath = '/test/project';

            await initProject(projectPath);

            const mkdirCalls = mockMkdir.mock.calls.map(call => call[0]);
            expect(mkdirCalls).toContainEqual(expect.stringContaining('.claude'));
            expect(mkdirCalls).toContainEqual(expect.stringContaining('start-team'));
        });
    });

    describe('CLAUDE.mdのコピー', () => {
        it('pm.mdがworkspaces/pm/CLAUDE.mdにコピーされる', async () => {
            const projectPath = '/test/project';

            await initProject(projectPath);

            const writeFileCalls = mockWriteFile.mock.calls;
            const pmWrite = writeFileCalls.find(call =>
                String(call[0]).includes('workspaces') &&
                String(call[0]).includes('pm') &&
                String(call[0]).includes('CLAUDE.md')
            );
            expect(pmWrite).toBeDefined();
            expect(pmWrite?.[1]).toBe(PM_PROMPT);
        });

        it('leader.mdがworkspaces/leader/CLAUDE.mdにコピーされる', async () => {
            const projectPath = '/test/project';

            await initProject(projectPath);

            const writeFileCalls = mockWriteFile.mock.calls;
            const leaderWrite = writeFileCalls.find(call =>
                String(call[0]).includes('workspaces') &&
                String(call[0]).includes('leader') &&
                String(call[0]).includes('CLAUDE.md')
            );
            expect(leaderWrite).toBeDefined();
            expect(leaderWrite?.[1]).toBe(LEADER_PROMPT);
        });

        it('member.mdがworkspaces/member-01/CLAUDE.mdにコピーされる', async () => {
            const projectPath = '/test/project';

            await initProject(projectPath);

            const writeFileCalls = mockWriteFile.mock.calls;
            const member01Write = writeFileCalls.find(call =>
                String(call[0]).includes('workspaces') &&
                String(call[0]).includes('member-01') &&
                String(call[0]).includes('CLAUDE.md')
            );
            expect(member01Write).toBeDefined();
            expect(member01Write?.[1]).toBe(MEMBER_PROMPT);
        });

        it('member.mdがworkspaces/member-02/CLAUDE.mdにコピーされる', async () => {
            const projectPath = '/test/project';

            await initProject(projectPath);

            const writeFileCalls = mockWriteFile.mock.calls;
            const member02Write = writeFileCalls.find(call =>
                String(call[0]).includes('workspaces') &&
                String(call[0]).includes('member-02') &&
                String(call[0]).includes('CLAUDE.md')
            );
            expect(member02Write).toBeDefined();
            expect(member02Write?.[1]).toBe(MEMBER_PROMPT);
        });
    });

    describe('ロールスキルの配置', () => {
        it('leaderのスキルが.claude/skills/に配置される', async () => {
            const projectPath = '/test/project';

            await initProject(projectPath);

            const mkdirCalls = mockMkdir.mock.calls.map(call => String(call[0]));
            // .claude/skills ディレクトリが作成される
            const leaderSkillsDir = mkdirCalls.find(p =>
                p.includes('leader') && p.includes('.claude') && p.includes('skills')
            );
            expect(leaderSkillsDir).toBeDefined();
        });

        it('memberのスキルが.claude/skills/に配置される', async () => {
            const projectPath = '/test/project';

            await initProject(projectPath);

            const writeFileCalls = mockWriteFile.mock.calls;
            // member-01のスキルファイルが .claude/skills/ に書き込まれる
            const memberSkillWrite = writeFileCalls.find(call =>
                String(call[0]).includes('member-01') &&
                String(call[0]).includes('.claude') &&
                String(call[0]).includes('skills') &&
                String(call[0]).includes('strict-workflow.md')
            );
            expect(memberSkillWrite).toBeDefined();
            expect(memberSkillWrite?.[1]).toBe(SKILL_CONTENT);
        });

        it('スキルが旧パス(skills/)ではなく.claude/skills/に配置される', async () => {
            const projectPath = '/test/project';

            await initProject(projectPath);

            const writeFileCalls = mockWriteFile.mock.calls;
            // スキルファイルのパスに .claude/skills/ が含まれることを確認
            const skillWrites = writeFileCalls.filter(call => {
                const p = String(call[0]);
                return p.includes('skills') && p.endsWith('.md') &&
                    !p.includes('SKILL.md') && !p.includes('CLAUDE.md') &&
                    !p.includes('start-team');
            });
            for (const write of skillWrites) {
                expect(String(write[0])).toContain('.claude');
            }
        });
    });

    describe('SKILL.mdの生成', () => {
        it('.claude/skills/start-team/SKILL.mdが作成される', async () => {
            const projectPath = '/test/project';

            await initProject(projectPath);

            const writeFileCalls = mockWriteFile.mock.calls;
            const skillWrite = writeFileCalls.find(call =>
                String(call[0]).includes('.claude') &&
                String(call[0]).includes('SKILL.md')
            );
            expect(skillWrite).toBeDefined();
        });

        it('{{PROJECT_PATH}}が絶対パスに置換される', async () => {
            const projectPath = '/test/project';

            await initProject(projectPath);

            const writeFileCalls = mockWriteFile.mock.calls;
            const skillWrite = writeFileCalls.find(call =>
                String(call[0]).includes('SKILL.md')
            );
            expect(skillWrite).toBeDefined();
            const content = String(skillWrite?.[1]);
            expect(content).not.toContain('{{PROJECT_PATH}}');
            // Check that path contains 'test' and 'project' (platform agnostic)
            expect(content).toMatch(/test.*project/i);
        });
    });

    describe('dashboard.jsonの初期化', () => {
        it('.dev-team/dashboard.jsonが初期化される', async () => {
            const projectPath = '/test/project';

            await initProject(projectPath);

            const writeFileCalls = mockWriteFile.mock.calls;
            const dashboardWrite = writeFileCalls.find(call =>
                String(call[0]).includes('dashboard.json')
            );
            expect(dashboardWrite).toBeDefined();
        });
    });

    describe('エラーハンドリング', () => {
        it('既存の.dev-teamディレクトリがある場合はエラー（--forceなし）', async () => {
            const projectPath = '/test/project';

            // .dev-team exists
            mockAccess.mockImplementation(async (filePath: string) => {
                if (filePath.endsWith('.dev-team')) {
                    return undefined; // exists
                }
                if (filePath.includes('.claude')) {
                    throw new Error('ENOENT');
                }
                return undefined;
            });

            await expect(initProject(projectPath)).rejects.toThrow();
        });

        it('--forceで既存ディレクトリを上書きできる', async () => {
            const projectPath = '/test/project';

            // .dev-team exists
            mockAccess.mockImplementation(async (filePath: string) => {
                if (filePath.endsWith('.dev-team')) {
                    return undefined; // exists
                }
                if (filePath.includes('.claude')) {
                    throw new Error('ENOENT');
                }
                return undefined;
            });

            await expect(initProject(projectPath, { force: true })).resolves.not.toThrow();
        });

        it('prompts/ファイルが見つからない場合はエラー', async () => {
            const projectPath = '/test/project';

            mockReadFile.mockImplementation(async (filePath: string) => {
                if (filePath.includes('start-team-skill.md')) {
                    return TEMPLATE_CONTENT;
                }
                throw new Error(`ENOENT: no such file: ${filePath}`);
            });

            await expect(initProject(projectPath)).rejects.toThrow();
        });

        it('テンプレートファイルが見つからない場合はエラー', async () => {
            const projectPath = '/test/project';

            mockReadFile.mockImplementation(async (filePath: string) => {
                if (filePath.includes('start-team-skill.md')) {
                    throw new Error('ENOENT: no such file');
                }
                if (filePath.includes('pm.md')) return PM_PROMPT;
                if (filePath.includes('leader.md')) return LEADER_PROMPT;
                if (filePath.includes('member.md')) return MEMBER_PROMPT;
                throw new Error(`ENOENT: no such file: ${filePath}`);
            });

            await expect(initProject(projectPath)).rejects.toThrow();
        });
    });
});
