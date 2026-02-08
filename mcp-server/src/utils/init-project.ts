import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface InitProjectOptions {
    force?: boolean;
}

export async function initProject(
    projectPath: string,
    options: InitProjectOptions = {}
): Promise<void> {
    const absoluteProjectPath = path.resolve(projectPath);
    const devTeamDir = path.join(absoluteProjectPath, '.dev-team');
    const claudeSkillsDir = path.join(absoluteProjectPath, '.claude', 'skills', 'start-team');

    // Check if .dev-team already exists
    if (!options.force) {
        try {
            await fs.access(devTeamDir);
            throw new Error(`.dev-team directory already exists. Use --force to overwrite.`);
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT' &&
                !(err instanceof Error && err.message.includes('ENOENT'))) {
                throw err;
            }
        }
    }

    // Get paths to source files
    const mcpServerRoot = path.resolve(__dirname, '..', '..');
    const promptsDir = path.join(mcpServerRoot, 'prompts');
    const templatesDir = path.join(mcpServerRoot, 'templates');

    // Read template and prompt files first to fail early if missing
    const templateContent = await fs.readFile(
        path.join(templatesDir, 'start-team-skill.md'),
        'utf-8'
    );
    const pmPrompt = await fs.readFile(path.join(promptsDir, 'pm.md'), 'utf-8');
    const leaderPrompt = await fs.readFile(path.join(promptsDir, 'leader.md'), 'utf-8');
    const memberPrompt = await fs.readFile(path.join(promptsDir, 'member.md'), 'utf-8');

    // Read skill templates
    const skillsDir = path.join(templatesDir, 'skills');
    const roleSkills: Record<string, string[]> = {
        'leader': ['strict-review', 'review-plan', 'review-code'],
        'member-01': ['strict-workflow', 'tdd', 'report-template'],
        'member-02': ['strict-workflow', 'tdd', 'report-template'],
    };
    const allSkillNames = [...new Set(Object.values(roleSkills).flat())];
    const skillContents: Record<string, string> = {};
    for (const skillName of allSkillNames) {
        skillContents[skillName] = await fs.readFile(
            path.join(skillsDir, `${skillName}.md`),
            'utf-8'
        );
    }

    // Create directory structure
    const workspaceDirs = ['pm', 'leader', 'member-01', 'member-02'];

    // Create .dev-team directories
    await fs.mkdir(devTeamDir, { recursive: true });
    await fs.mkdir(path.join(devTeamDir, 'queue'), { recursive: true });

    // Create workspace directories and skill directories
    for (const dir of workspaceDirs) {
        await fs.mkdir(path.join(devTeamDir, 'workspaces', dir), { recursive: true });
        if (roleSkills[dir]) {
            const workspaceSkillsDir = path.join(devTeamDir, 'workspaces', dir, '.claude', 'skills');
            await fs.mkdir(workspaceSkillsDir, { recursive: true });
            for (const skillName of roleSkills[dir]) {
                await fs.writeFile(
                    path.join(workspaceSkillsDir, `${skillName}.md`),
                    skillContents[skillName]
                );
            }
        }
    }

    // Create .claude/skills/start-team directory
    await fs.mkdir(claudeSkillsDir, { recursive: true });

    // Copy CLAUDE.md files
    await fs.writeFile(
        path.join(devTeamDir, 'workspaces', 'pm', 'CLAUDE.md'),
        pmPrompt
    );
    await fs.writeFile(
        path.join(devTeamDir, 'workspaces', 'leader', 'CLAUDE.md'),
        leaderPrompt
    );
    await fs.writeFile(
        path.join(devTeamDir, 'workspaces', 'member-01', 'CLAUDE.md'),
        memberPrompt
    );
    await fs.writeFile(
        path.join(devTeamDir, 'workspaces', 'member-02', 'CLAUDE.md'),
        memberPrompt
    );

    // Create SKILL.md with PROJECT_PATH replaced
    const skillContent = templateContent.replace(/\{\{PROJECT_PATH\}\}/g, absoluteProjectPath);
    await fs.writeFile(
        path.join(claudeSkillsDir, 'SKILL.md'),
        skillContent
    );

    // Initialize dashboard.json
    const initialDashboard = {
        projectName: path.basename(absoluteProjectPath),
        lastUpdated: new Date().toISOString(),
        currentPhase: 'planning',
        tasks: {
            pending: 0,
            inProgress: 0,
            completed: 0,
            blocked: 0,
            total: 0,
        },
        recentActivity: [],
        pendingApprovals: [],
        memberStatus: {},
        taskList: [],
    };
    await fs.writeFile(
        path.join(devTeamDir, 'dashboard.json'),
        JSON.stringify(initialDashboard, null, 2)
    );
}
