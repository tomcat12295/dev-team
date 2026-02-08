import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Role } from '../types/task.js';
import { info, error, debug } from './logger.js';
import { getAllRoles } from '../config/team-config.js';

const execAsync = promisify(exec);

// Create default pane mapping dynamically from team config
function createDefaultPaneMapping(): Record<string, string> {
    const mapping: Record<string, string> = {};
    const roles = getAllRoles();
    roles.forEach((role, index) => {
        mapping[role] = String(index);
    });
    return mapping;
}

// Pane ID mapping - will be loaded from panes.json
let paneMapping: Record<string, string> = createDefaultPaneMapping();

// Load pane mapping from panes.json
async function loadPaneMappingFromFile(): Promise<Record<string, string> | null> {
    const projectPath = process.env.DEV_TEAM_PROJECT_PATH;
    if (!projectPath) {
        return null;
    }

    const panesJsonPath = path.join(projectPath, '.dev-team', 'panes.json');
    try {
        const content = await fs.readFile(panesJsonPath, 'utf-8');
        const data = JSON.parse(content);

        // Map panes.json keys to Role keys dynamically
        const mapping: Record<string, string> = {};
        const roles = getAllRoles();
        for (const role of roles) {
            // Support both formats: member-01 and member01
            const keyWithoutHyphen = role.replace('-', '');
            mapping[role] = String(data[keyWithoutHyphen] ?? data[role] ?? String(roles.indexOf(role)));
        }

        debug('Loaded pane mapping from panes.json', mapping);
        return mapping;
    } catch (err) {
        debug('Failed to load panes.json, using default mapping', err);
        return null;
    }
}

// Get current pane mapping, loading from file if needed
async function getCurrentPaneMapping(): Promise<Record<string, string>> {
    const fileMapping = await loadPaneMappingFromFile();
    if (fileMapping) {
        paneMapping = fileMapping;
    }
    return paneMapping;
}

export function setPaneMapping(mapping: Record<string, string>): void {
    paneMapping = mapping;
    info('Pane mapping updated', mapping);
}

export function getPaneMapping(): Record<string, string> {
    return { ...paneMapping };
}

export async function sendTextToPane(role: Role, text: string): Promise<boolean> {
    // Load current pane mapping from panes.json
    const currentMapping = await getCurrentPaneMapping();
    const paneId = currentMapping[role];
    if (!paneId) {
        error(`No pane ID found for role: ${role}`);
        return false;
    }

    try {
        // Send the text with --no-paste to avoid bracketed paste mode
        // (bracketed paste causes Enter to be interpreted as newline instead of submit)
        await execAsync(`wezterm cli send-text --pane-id ${paneId} --no-paste -- "${escapeForCmd(text)}"`);
        debug(`Text sent to ${role} (pane ${paneId}): ${text}`);

        // Send Enter key via PowerShell (Windows cmd.exe doesn't interpret \r as carriage return)
        // PowerShell uses $([char]13) for carriage return
        const enterCmd = `powershell -Command "wezterm cli send-text --pane-id ${paneId} --no-paste \\"$([char]13)\\""`;
        await execAsync(enterCmd);
        debug(`Enter sent to ${role} (pane ${paneId})`);

        return true;
    } catch (err) {
        error(`Failed to send text to ${role}`, err);
        return false;
    }
}

/**
 * Check if a pane's prompt is idle (no user input in progress).
 * Looks for the ❯ prompt character and checks if there's text after it.
 */
export async function isPaneInputIdle(paneId: string): Promise<boolean> {
    try {
        const { stdout } = await execAsync(
            `wezterm cli get-text --pane-id ${paneId} --start-line -5`
        );
        const lines = stdout.split('\n');
        // Find the last line containing the ❯ prompt
        for (let i = lines.length - 1; i >= 0; i--) {
            const promptIndex = lines[i].indexOf('❯');
            if (promptIndex !== -1) {
                const afterPrompt = lines[i].substring(promptIndex + 1).trim();
                return afterPrompt.length === 0; // Empty means idle
            }
        }
        // No prompt found = Claude Code is processing = safe to send
        return true;
    } catch {
        // On error, assume idle and try to send
        return true;
    }
}

/**
 * Send notification to PM with retry logic.
 * If PM pane has user input in progress, wait and retry.
 */
async function notifyPmWithRetry(message: string, retriesLeft = 5): Promise<boolean> {
    const currentMapping = await getCurrentPaneMapping();
    const paneId = currentMapping['pm'];
    if (!paneId) {
        error('No pane ID found for role: pm');
        return false;
    }

    const idle = await isPaneInputIdle(paneId);
    if (idle) {
        const notification = `[${message}] Please run check_queue MCP tool to check incoming messages.`;
        return sendTextToPane('pm' as Role, notification);
    }

    if (retriesLeft <= 0) {
        // Last resort: send bell to notify without disrupting input
        try {
            await execAsync(`wezterm cli send-text --pane-id ${paneId} --no-paste -- "\\x07"`);
            info('PM notification: sent bell after max retries');
        } catch { /* ignore */ }
        return false;
    }

    // Retry after delay
    debug(`PM pane busy, retrying in 3s (${retriesLeft} retries left)`);
    return new Promise(resolve => {
        setTimeout(() => resolve(notifyPmWithRetry(message, retriesLeft - 1)), 3000);
    });
}

export async function notifyRole(role: Role, message: string): Promise<boolean> {
    if (role === 'pm') {
        return notifyPmWithRetry(message);
    }
    // Send a notification message to trigger the agent to check their queue
    const notification = `[${message}] Please run check_queue MCP tool to check incoming messages.`;
    return sendTextToPane(role, notification);
}

export async function listPanes(): Promise<Array<{ paneId: string; title: string }>> {
    try {
        const { stdout } = await execAsync('wezterm cli list --format json');
        const panes = JSON.parse(stdout);
        return panes.map((p: { pane_id: number; title: string }) => ({
            paneId: String(p.pane_id),
            title: p.title,
        }));
    } catch (err) {
        error('Failed to list panes', err);
        return [];
    }
}

export async function healthCheck(): Promise<{
    wezterm: boolean;
    panes: Array<{ paneId: string; title: string }>;
    mapping: Record<string, string>;
}> {
    let weztermAvailable = false;
    let panes: Array<{ paneId: string; title: string }> = [];

    try {
        await execAsync('wezterm --version');
        weztermAvailable = true;
        panes = await listPanes();
    } catch {
        weztermAvailable = false;
    }

    // Load current mapping from panes.json
    const currentMapping = await getCurrentPaneMapping();

    return {
        wezterm: weztermAvailable,
        panes,
        mapping: currentMapping,
    };
}

function escapeForCmd(text: string): string {
    // Escape special characters for Windows cmd
    return text
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$');
}
