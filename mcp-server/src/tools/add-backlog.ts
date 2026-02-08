import * as fs from 'fs/promises';
import * as path from 'path';
import { getDevTeamPath, generateId, addActivity } from '../utils/queue.js';
import { getCurrentRole } from '../utils/permission.js';
import { withFileLock, ensureFileExists } from '../utils/file-lock.js';
import { info, error } from '../utils/logger.js';
import { validateRequiredString } from '../utils/validation.js';

export interface AddBacklogParams {
    title: string;
    description: string;
    priority?: 'high' | 'medium' | 'low';
}

export interface BacklogTask {
    id: string;
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    createdAt: string;
    createdBy: string;
}

interface BacklogFile {
    tasks: BacklogTask[];
    lastUpdated: string;
}

export interface AddBacklogResult {
    success: boolean;
    taskId?: string;
    error?: string;
}

function getBacklogPath(): string {
    return path.join(getDevTeamPath(), 'backlog.json');
}

export async function addBacklog(params: AddBacklogParams): Promise<AddBacklogResult> {
    const role = getCurrentRole();

    // Only PM can add to backlog
    if (role !== 'pm') {
        return {
            success: false,
            error: 'バックログへの追加はPMのみが実行できます。',
        };
    }

    // Validate required parameters
    const titleValidation = validateRequiredString(params.title, 'title');
    if (!titleValidation.valid) {
        return {
            success: false,
            error: titleValidation.error,
        };
    }
    const descriptionValidation = validateRequiredString(params.description, 'description');
    if (!descriptionValidation.valid) {
        return {
            success: false,
            error: descriptionValidation.error,
        };
    }

    try {
        const backlogPath = getBacklogPath();
        await ensureFileExists(backlogPath);

        const taskId = await generateId();
        const newTask: BacklogTask = {
            id: `backlog-${taskId}`,
            title: params.title,
            description: params.description,
            priority: params.priority || 'medium',
            createdAt: new Date().toISOString(),
            createdBy: role,
        };

        await withFileLock(backlogPath, async () => {
            let backlog: BacklogFile;
            try {
                const content = await fs.readFile(backlogPath, 'utf-8');
                const parsed = JSON.parse(content);
                // Validate structure
                if (Array.isArray(parsed.tasks)) {
                    backlog = parsed as BacklogFile;
                } else {
                    backlog = { tasks: [], lastUpdated: new Date().toISOString() };
                }
            } catch {
                // File doesn't exist or is invalid, initialize
                backlog = { tasks: [], lastUpdated: new Date().toISOString() };
            }

            backlog.tasks.push(newTask);
            backlog.lastUpdated = new Date().toISOString();

            await fs.writeFile(backlogPath, JSON.stringify(backlog, null, 2), 'utf-8');
        });

        // Log activity
        await addActivity({
            role,
            action: 'add_backlog',
            details: `Added backlog task: ${params.title} (${params.priority || 'medium'})`,
        });

        info(`Backlog task added by ${role}`, { taskId: newTask.id, title: params.title });

        return {
            success: true,
            taskId: newTask.id,
        };
    } catch (err) {
        error('Failed to add backlog task', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export function formatAddBacklogResult(result: AddBacklogResult): string {
    if (!result.success) {
        return `❌ バックログへの追加に失敗しました: ${result.error}`;
    }

    let output = `✅ バックログにタスクを追加しました。\n`;
    output += `Task ID: ${result.taskId}\n`;

    return output;
}
