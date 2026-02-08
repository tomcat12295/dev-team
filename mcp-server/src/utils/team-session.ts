import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { sendTextToPane } from './wezterm.js';
import { info, error as logError } from './logger.js';
import type { Role } from '../types/task.js';

const execAsync = promisify(exec);

// Get the directory of this module for resolving prompts/permissions paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to package root (relative to dist/utils/)
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

export interface TeamSessionConfig {
    projectPath: string;
    initialTask?: string;
    memberCount?: number;
}

export interface PaneInfo {
    pm: string;
    leader: string;
    dashboard: string;
    projectPath: string;
    startTime: string;
    [key: string]: string;
}

/**
 * Get the prompt file name for a role
 */
export function getRolePromptFile(role: string): string {
    if (role.startsWith('member-')) {
        return 'member.md';
    }
    return `${role}.md`;
}

/**
 * Get the permission file name for a role
 */
export function getRolePermissionFile(role: string): string {
    if (role.startsWith('member-')) {
        return 'member.json';
    }
    return `${role}.json`;
}

/**
 * Get the environment variable command for starting Claude
 */
export function getEnvCommand(role: string, projectPath: string, platform: string = process.platform): string {
    const isWindows = platform === 'win32';

    if (isWindows) {
        return `$env:DEV_TEAM_ROLE='${role}'; $env:DEV_TEAM_PROJECT_PATH='${projectPath}'; claude`;
    } else {
        return `DEV_TEAM_ROLE='${role}' DEV_TEAM_PROJECT_PATH='${projectPath}' claude`;
    }
}

/**
 * Ensure required directories exist
 */
export async function ensureDirectories(devTeamPath: string): Promise<void> {
    const dirs = ['queue', 'status', 'workspaces'];

    for (const dir of dirs) {
        await fs.mkdir(path.join(devTeamPath, dir), { recursive: true });
    }
}

/**
 * Initialize the PM queue with an optional initial task
 */
export async function initializeQueue(queuePath: string, initialTask?: string): Promise<void> {
    const messages: Array<{
        id: string;
        type: string;
        from: string;
        to: string;
        subject: string;
        content: string;
        timestamp: string;
        read: boolean;
    }> = [];

    if (initialTask) {
        messages.push({
            id: randomUUID(),
            type: 'task',
            from: 'ceo',
            to: 'pm',
            subject: 'Initial Task',
            content: initialTask,
            timestamp: new Date().toISOString(),
            read: false,
        });
    }

    const initialQueue = {
        role: 'pm',
        messages,
        lastUpdated: new Date().toISOString(),
    };

    await fs.writeFile(
        path.join(queuePath, 'pm.json'),
        JSON.stringify(initialQueue, null, 2),
        'utf-8'
    );
}

/**
 * Role-to-skills mapping for workspace skill deployment
 */
const ROLE_SKILLS: Record<string, string[]> = {
    'leader': ['strict-review', 'review-plan', 'review-code'],
    'member': ['strict-workflow', 'tdd', 'report-template'],
};

/**
 * Get skills for a given role
 */
function getSkillsForRole(role: string): string[] {
    if (role.startsWith('member-')) {
        return ROLE_SKILLS['member'] ?? [];
    }
    return ROLE_SKILLS[role] ?? [];
}

/**
 * Create workspace directories for each role with CLAUDE.md and settings
 */
export async function createWorkspaces(workspacesPath: string, roles: string[]): Promise<void> {
    const promptsPath = path.join(PACKAGE_ROOT, 'templates', 'prompts');
    const permissionsPath = path.join(PACKAGE_ROOT, 'templates', 'permissions');
    const skillsTemplatePath = path.join(PACKAGE_ROOT, 'templates', 'skills');

    for (const role of roles) {
        const workspacePath = path.join(workspacesPath, role);
        const claudeDir = path.join(workspacePath, '.claude');

        // Create workspace and .claude directories
        await fs.mkdir(workspacePath, { recursive: true });
        await fs.mkdir(claudeDir, { recursive: true });

        // Copy CLAUDE.md
        const promptFile = getRolePromptFile(role);
        const promptSource = path.join(promptsPath, promptFile);
        const claudeMdDest = path.join(workspacePath, 'CLAUDE.md');

        try {
            await fs.access(promptSource);
            await fs.copyFile(promptSource, claudeMdDest);
        } catch {
            console.warn(`Warning: Prompt file not found: ${promptSource}`);
        }

        // Copy settings.local.json
        const permFile = getRolePermissionFile(role);
        const permSource = path.join(permissionsPath, permFile);
        const settingsDest = path.join(claudeDir, 'settings.local.json');

        try {
            await fs.access(permSource);
            await fs.copyFile(permSource, settingsDest);
        } catch {
            console.warn(`Warning: Permission file not found: ${permSource}`);
        }

        // Copy skill files to .claude/skills/
        const skills = getSkillsForRole(role);
        if (skills.length > 0) {
            const skillsDir = path.join(claudeDir, 'skills');
            await fs.mkdir(skillsDir, { recursive: true });

            for (const skillName of skills) {
                const skillSource = path.join(skillsTemplatePath, `${skillName}.md`);
                const skillDest = path.join(skillsDir, `${skillName}.md`);
                try {
                    await fs.access(skillSource);
                    await fs.copyFile(skillSource, skillDest);
                } catch {
                    console.warn(`Warning: Skill template not found: ${skillSource}`);
                }
            }
        }
    }
}

/**
 * Generate role names based on member count
 */
export function generateRoleNames(memberCount: number = 2): string[] {
    const roles = ['pm', 'leader'];
    for (let i = 1; i <= memberCount; i++) {
        roles.push(`member-${i.toString().padStart(2, '0')}`);
    }
    return roles;
}

/**
 * Create WezTerm panes for the team
 */
export async function createPanes(roles: string[]): Promise<PaneInfo> {
    const memberCount = roles.filter(r => r.startsWith('member-')).length;
    const createdPaneIds: string[] = [];

    try {
        // Create new window with PM pane
        const { stdout: pmPane } = await execAsync('wezterm cli spawn --new-window');
        const pmPaneId = pmPane.trim();
        createdPaneIds.push(pmPaneId);

        // Wait a bit for the window to be ready
        await sleep(300);

        // Split right for leader (50% width)
        const { stdout: leaderPane } = await execAsync(
            `wezterm cli split-pane --right --pane-id ${pmPaneId} --percent 50`
        );
        const leaderPaneId = leaderPane.trim();
        createdPaneIds.push(leaderPaneId);

        const paneInfo: PaneInfo = {
            pm: pmPaneId,
            leader: leaderPaneId,
            dashboard: '',
            projectPath: '',
            startTime: new Date().toISOString(),
        };

        // Create member panes
        const leftColumnPanes = [pmPaneId];
        const rightColumnPanes = [leaderPaneId];
        const rowCount = 1 + Math.ceil(memberCount / 2);

        for (let i = 0; i < memberCount; i++) {
            const memberIndex = i + 1;
            const memberRole = `member-${memberIndex.toString().padStart(2, '0')}`;

            let parentPane: string;
            let splitPercent: number;

            if (memberIndex % 2 === 1) {
                // Odd member: split bottom of left column
                parentPane = leftColumnPanes[leftColumnPanes.length - 1];
                splitPercent = Math.floor(100 / (rowCount - leftColumnPanes.length + 1));
                const { stdout } = await execAsync(
                    `wezterm cli split-pane --bottom --pane-id ${parentPane} --percent ${splitPercent}`
                );
                const newPaneId = stdout.trim();
                createdPaneIds.push(newPaneId);
                leftColumnPanes.push(newPaneId);
                paneInfo[memberRole] = newPaneId;
            } else {
                // Even member: split bottom of right column
                parentPane = rightColumnPanes[rightColumnPanes.length - 1];
                splitPercent = Math.floor(100 / (rowCount - rightColumnPanes.length + 1));
                const { stdout } = await execAsync(
                    `wezterm cli split-pane --bottom --pane-id ${parentPane} --percent ${splitPercent}`
                );
                const newPaneId = stdout.trim();
                createdPaneIds.push(newPaneId);
                rightColumnPanes.push(newPaneId);
                paneInfo[memberRole] = newPaneId;
            }
        }

        return paneInfo;
    } catch (err) {
        // Rollback: kill all created panes
        for (const paneId of createdPaneIds) {
            try { await execAsync(`wezterm cli kill-pane --pane-id ${paneId}`); } catch {}
        }
        throw err;
    }
}

/**
 * Start Claude in a specific pane
 */
export async function startClaudeInPane(paneId: string, role: string, projectPath: string): Promise<void> {
    const workspacePath = path.join(projectPath, '.dev-team', 'workspaces', role);
    const isWindows = process.platform === 'win32';

    // Navigate to workspace
    const cdCmd = `cd "${workspacePath}"`;
    await execAsync(`wezterm cli send-text --pane-id ${paneId} --no-paste -- "${escapeForShell(cdCmd)}"`);
    await sleep(50);
    await sendEnterKey(paneId);
    await sleep(300);

    // Start Claude with environment variables
    const envCmd = getEnvCommand(role, projectPath);
    await execAsync(`wezterm cli send-text --pane-id ${paneId} --no-paste -- "${escapeForShell(envCmd)}"`);
    await sleep(50);
    await sendEnterKey(paneId);
}

/**
 * Send Enter key to a pane
 */
async function sendEnterKey(paneId: string): Promise<void> {
    const isWindows = process.platform === 'win32';

    if (isWindows) {
        // PowerShell uses backtick-r for carriage return
        const enterCmd = `powershell -Command "wezterm cli send-text --pane-id ${paneId} --no-paste \\"$([char]13)\\""`;
        await execAsync(enterCmd);
    } else {
        await execAsync(`wezterm cli send-text --pane-id ${paneId} --no-paste $'\\r'`);
    }
}

/**
 * Notify PM to check queue
 */
export async function notifyPmToCheckQueue(paneId: string): Promise<void> {
    const notifyText = 'Please run check_queue MCP tool to check the tasks in the queue.';
    await execAsync(`wezterm cli send-text --pane-id ${paneId} --no-paste -- "${escapeForShell(notifyText)}"`);
    await sleep(500);
    await sendEnterKey(paneId);
}

/**
 * Start a team session
 */
export async function startTeamSession(config: TeamSessionConfig): Promise<void> {
    const { projectPath, initialTask, memberCount = 2 } = config;
    const devTeamPath = path.join(projectPath, '.dev-team');

    console.log(`Starting dev team session for: ${projectPath}`);

    // 1. Ensure directories exist
    console.log('Creating directories...');
    await ensureDirectories(devTeamPath);

    // 2. Initialize queue
    console.log('Initializing queue...');
    await initializeQueue(path.join(devTeamPath, 'queue'), initialTask);

    // 3. Generate roles and create workspaces
    const roles = generateRoleNames(memberCount);
    console.log(`Creating workspaces for ${roles.length} roles...`);
    await createWorkspaces(path.join(devTeamPath, 'workspaces'), roles);

    // 4. Create panes
    console.log('Creating WezTerm panes...');
    const paneInfo = await createPanes(roles);
    paneInfo.projectPath = projectPath;

    // 5. Save pane info
    const panesJsonPath = path.join(devTeamPath, 'panes.json');
    await fs.writeFile(panesJsonPath, JSON.stringify(paneInfo, null, 2), 'utf-8');

    // 6. Start Claude in each pane
    console.log('Starting Claude in each pane...');
    for (const role of roles) {
        console.log(`  Starting ${role}...`);
        await startClaudeInPane(paneInfo[role], role, projectPath);
        await sleep(1000); // Wait for Claude to start
    }

    // 7. Wait for Claude instances to be ready
    console.log('Waiting for Claude instances...');
    await sleep(5000);

    // 8. Notify PM to check queue
    console.log('Notifying PM...');
    await notifyPmToCheckQueue(paneInfo.pm);

    // 9. Focus on PM pane
    await execAsync(`wezterm cli activate-pane --pane-id ${paneInfo.pm}`);

    console.log('');
    console.log('=====================================');
    console.log('Dev Team Started');
    console.log('=====================================');
    console.log(`Project: ${projectPath}`);
    if (initialTask) {
        console.log(`Initial Task: ${initialTask}`);
    }
    console.log('');
    console.log('Pane Layout:');
    console.log(`  PM:        ${paneInfo.pm}`);
    console.log(`  Leader:    ${paneInfo.leader}`);
    for (const role of roles.filter(r => r.startsWith('member-'))) {
        console.log(`  ${role}:   ${paneInfo[role]}`);
    }
    console.log(`  Dashboard: .dev-team/status/dashboard.md (file)`);
    console.log('=====================================');
}

export interface StopTeamSessionOptions {
    keepQueue?: boolean;
}

/**
 * Stop a team session
 */
export async function stopTeamSession(projectPath: string, options: StopTeamSessionOptions = {}): Promise<void> {
    const { keepQueue = true } = options;
    const devTeamPath = path.join(projectPath, '.dev-team');
    const panesJsonPath = path.join(devTeamPath, 'panes.json');

    info('Stopping dev team session...');

    // Check if panes.json exists
    await fs.access(panesJsonPath);

    // Read pane info
    const content = await fs.readFile(panesJsonPath, 'utf-8');
    const paneInfo: PaneInfo = JSON.parse(content);

    // Get all role panes (exclude metadata fields)
    const excludeKeys = ['projectPath', 'startTime', 'dashboard'];
    const rolePanes = Object.entries(paneInfo)
        .filter(([key]) => !excludeKeys.includes(key))
        .map(([key, paneId]) => {
            // Normalize key: member01 -> member-01
            const role = key.match(/^member(\d+)$/) ? `member-${key.slice(6).padStart(2, '0')}` : key;
            return { role, paneId };
        });

    // Send /exit to each pane
    for (const { role } of rolePanes) {
        info(`  Stopping ${role}...`);
        try {
            await sendTextToPane(role as Role, '/exit');
            await sleep(500);

            // Exit shell
            await sendTextToPane(role as Role, 'exit');
        } catch (err) {
            logError(`  Warning: Failed to stop ${role}`, err);
        }
    }

    // Delete queue files if requested
    if (!keepQueue) {
        const queuePath = path.join(devTeamPath, 'queue');
        await fs.rm(queuePath, { recursive: true, force: true });
    }

    // Delete panes.json
    await fs.rm(panesJsonPath, { force: true });

    info('Dev team session stopped');
}

// Helper functions
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeForShell(text: string, platform: string = process.platform): string {
    const isWindows = platform === 'win32';

    if (isWindows) {
        // Windows: escape double quotes and backticks only
        // Do NOT escape $ as PowerShell needs it for $env: variables
        return text
            .replace(/"/g, '\\"')
            .replace(/`/g, '``');
    } else {
        // Unix: escape backslashes, double quotes, backticks, and $
        return text
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/`/g, '\\`')
            .replace(/\$/g, '\\$');
    }
}

// Maximum number of members allowed
const MAX_MEMBERS = 8;
const MIN_MEMBERS = 2;

/**
 * Default TeamConfig structure for creating new team.json
 */
const DEFAULT_TEAM_CONFIG = {
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

/**
 * Update the member count in team.json
 * Creates team.json with default structure if it doesn't exist
 */
export async function updateTeamConfigMemberCount(projectPath: string, newCount: number): Promise<void> {
    const configPath = path.join(projectPath, '.dev-team', 'config');
    const teamJsonPath = path.join(configPath, 'team.json');

    // Ensure config directory exists
    await fs.mkdir(configPath, { recursive: true });

    // Try to read existing team.json
    let teamConfig;
    try {
        const content = await fs.readFile(teamJsonPath, 'utf-8');
        teamConfig = JSON.parse(content);
        // Validate structure, use default if invalid
        if (!teamConfig?.team?.members) {
            teamConfig = JSON.parse(JSON.stringify(DEFAULT_TEAM_CONFIG));
        }
    } catch {
        // If team.json doesn't exist or is invalid, use default config
        teamConfig = JSON.parse(JSON.stringify(DEFAULT_TEAM_CONFIG));
    }

    // Update the member count
    teamConfig.team.members.count = newCount;

    // Write updated team.json
    await fs.writeFile(teamJsonPath, JSON.stringify(teamConfig, null, 2), 'utf-8');
}

export interface AddMemberConfig {
    projectPath: string;
    count: number;
}

export interface AddMemberResult {
    addedRoles: string[];
    previousCount: number;
    newCount: number;
}

/**
 * Generate next member role names based on existing roles
 */
export function generateNextMemberRoles(existingRoles: string[], count: number): string[] {
    // Find the highest existing member number
    const memberNumbers = existingRoles
        .filter(role => role.startsWith('member-'))
        .map(role => parseInt(role.replace('member-', ''), 10))
        .filter(num => !isNaN(num));

    const highestNumber = memberNumbers.length > 0 ? Math.max(...memberNumbers) : 0;

    // Generate new member roles
    const newRoles: string[] = [];
    for (let i = 1; i <= count; i++) {
        const memberNumber = highestNumber + i;
        newRoles.push(`member-${memberNumber.toString().padStart(2, '0')}`);
    }

    return newRoles;
}

/**
 * Add new members to an existing team session
 */
export async function addMember(config: AddMemberConfig): Promise<AddMemberResult> {
    const { projectPath, count } = config;
    const devTeamPath = path.join(projectPath, '.dev-team');
    const panesJsonPath = path.join(devTeamPath, 'panes.json');

    info(`Adding ${count} member(s) to project: ${projectPath}`);

    // Read existing pane info
    const content = await fs.readFile(panesJsonPath, 'utf-8');
    const paneInfo: PaneInfo = JSON.parse(content);

    // Get existing roles
    const excludeKeys = ['projectPath', 'startTime', 'dashboard'];
    const existingRoles = Object.keys(paneInfo).filter(key => !excludeKeys.includes(key));
    const existingMemberCount = existingRoles.filter(role => role.startsWith('member-')).length;

    // Check if adding members would exceed the limit
    if (existingMemberCount + count > MAX_MEMBERS) {
        throw new Error(
            `Cannot add ${count} member(s). Current: ${existingMemberCount}, ` +
            `Requested: ${count}, Max allowed: ${MAX_MEMBERS}. ` +
            `Would exceed maximum member limit.`
        );
    }

    // Generate new member roles
    const newRoles = generateNextMemberRoles(existingRoles, count);

    // Create workspaces for new members
    const workspacesPath = path.join(devTeamPath, 'workspaces');
    await createWorkspaces(workspacesPath, newRoles);

    // Create panes for new members
    // Find parent panes for splitting
    const leftColumnPanes: string[] = [paneInfo.pm];
    const rightColumnPanes: string[] = [paneInfo.leader];

    // Collect existing member panes
    for (let i = 1; i <= existingMemberCount; i++) {
        const memberRole = `member-${i.toString().padStart(2, '0')}`;
        if (paneInfo[memberRole]) {
            if (i % 2 === 1) {
                leftColumnPanes.push(paneInfo[memberRole]);
            } else {
                rightColumnPanes.push(paneInfo[memberRole]);
            }
        }
    }

    // Create new member panes
    const totalMemberCount = existingMemberCount + count;
    const rowCount = 1 + Math.ceil(totalMemberCount / 2);

    for (let i = 0; i < count; i++) {
        const memberIndex = existingMemberCount + i + 1;
        const memberRole = newRoles[i];

        let parentPane: string;
        let splitPercent: number;

        if (memberIndex % 2 === 1) {
            // Odd member: split bottom of left column
            parentPane = leftColumnPanes[leftColumnPanes.length - 1];
            splitPercent = Math.floor(100 / (rowCount - leftColumnPanes.length + 1));
            const { stdout } = await execAsync(
                `wezterm cli split-pane --bottom --pane-id ${parentPane} --percent ${splitPercent}`
            );
            leftColumnPanes.push(stdout.trim());
            paneInfo[memberRole] = stdout.trim();
        } else {
            // Even member: split bottom of right column
            parentPane = rightColumnPanes[rightColumnPanes.length - 1];
            splitPercent = Math.floor(100 / (rowCount - rightColumnPanes.length + 1));
            const { stdout } = await execAsync(
                `wezterm cli split-pane --bottom --pane-id ${parentPane} --percent ${splitPercent}`
            );
            rightColumnPanes.push(stdout.trim());
            paneInfo[memberRole] = stdout.trim();
        }

        // Start Claude in the new pane
        await startClaudeInPane(paneInfo[memberRole], memberRole, projectPath);
        await sleep(1000);
    }

    // Save updated pane info
    await fs.writeFile(panesJsonPath, JSON.stringify(paneInfo, null, 2), 'utf-8');

    // Update team.json member count
    const newMemberCount = existingMemberCount + count;
    await updateTeamConfigMemberCount(projectPath, newMemberCount);

    info(`Successfully added ${count} member(s): ${newRoles.join(', ')}`);

    return {
        addedRoles: newRoles,
        previousCount: existingMemberCount,
        newCount: newMemberCount,
    };
}

export interface RemoveMemberOptions {
    count: number;
}

export interface RemoveMemberResult {
    removedRoles: string[];
    previousCount: number;
    newCount: number;
}

/**
 * Remove members from an existing team session
 */
export async function removeMember(projectPath: string, options: RemoveMemberOptions): Promise<RemoveMemberResult> {
    const { count } = options;
    const devTeamPath = path.join(projectPath, '.dev-team');
    const panesJsonPath = path.join(devTeamPath, 'panes.json');

    info(`Removing ${count} member(s) from project: ${projectPath}`);

    // Check if panes.json exists
    await fs.access(panesJsonPath);

    // Read existing pane info
    const content = await fs.readFile(panesJsonPath, 'utf-8');
    const paneInfo: PaneInfo = JSON.parse(content);

    // Get existing member roles
    const memberRoles = Object.keys(paneInfo)
        .filter(key => key.startsWith('member-'))
        .sort((a, b) => {
            const numA = parseInt(a.replace('member-', ''), 10);
            const numB = parseInt(b.replace('member-', ''), 10);
            return numA - numB;
        });

    const existingMemberCount = memberRoles.length;

    // Check minimum member constraint
    if (existingMemberCount - count < MIN_MEMBERS) {
        throw new Error(
            `Cannot remove ${count} member(s). Current: ${existingMemberCount}, ` +
            `Minimum required: ${MIN_MEMBERS}. ` +
            `Would go below minimum member limit.`
        );
    }

    // Remove members from the end (highest numbered)
    const rolesToRemove = memberRoles.slice(-count);

    // Send /exit to each member being removed and close their panes
    for (const role of rolesToRemove) {
        const paneId = paneInfo[role]; // Save paneId before deletion
        info(`  Stopping ${role}...`);
        try {
            await sendTextToPane(role as any, '/exit');
            await sleep(500);
            await sendTextToPane(role as any, 'exit');
            await sleep(500);
            // Close the WezTerm pane
            if (paneId) {
                await execAsync(`wezterm cli kill-pane --pane-id ${paneId}`);
            }
        } catch (err) {
            logError(`  Warning: Failed to stop ${role} (pane may already be closed)`, err);
        }

        // Remove from pane info (even on failure, pane ID is stale)
        delete paneInfo[role];
    }

    // Save updated pane info
    await fs.writeFile(panesJsonPath, JSON.stringify(paneInfo, null, 2), 'utf-8');

    // Update team.json member count
    const newMemberCount = existingMemberCount - count;
    await updateTeamConfigMemberCount(projectPath, newMemberCount);

    info(`Successfully removed ${count} member(s): ${rolesToRemove.join(', ')}`);

    return {
        removedRoles: rolesToRemove,
        previousCount: existingMemberCount,
        newCount: newMemberCount,
    };
}
