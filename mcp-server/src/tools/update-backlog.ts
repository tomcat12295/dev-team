import * as fs from 'fs/promises';
import * as path from 'path';
import { getDevTeamPath, addActivity } from '../utils/queue.js';
import { getCurrentRole } from '../utils/permission.js';
import { withFileLock, ensureFileExists } from '../utils/file-lock.js';
import { info, error } from '../utils/logger.js';

export interface UpdateBacklogParams {
    task_id: string;
    status: 'completed' | 'cancelled';
}

export interface BacklogTask {
    id: string;
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    createdAt: string;
    createdBy: string;
    status?: 'pending' | 'completed' | 'cancelled';
    completedAt?: string;
}

interface BacklogFile {
    tasks: BacklogTask[];
    lastUpdated: string;
}

export interface UpdateBacklogResult {
    success: boolean;
    task?: BacklogTask;
    error?: string;
}

function getBacklogPath(): string {
    return path.join(getDevTeamPath(), 'backlog.json');
}

export async function updateBacklog(params: UpdateBacklogParams): Promise<UpdateBacklogResult> {
    const role = getCurrentRole();

    // Only PM can update backlog
    if (role !== 'pm') {
        return {
            success: false,
            error: 'バックログの更新はPMのみが実行できます。',
        };
    }

    // Validate required parameters
    if (!params.task_id || typeof params.task_id !== 'string') {
        return {
            success: false,
            error: 'task_id は必須です。',
        };
    }
    if (!params.status || !['completed', 'cancelled'].includes(params.status)) {
        return {
            success: false,
            error: 'status は "completed" または "cancelled" を指定してください。',
        };
    }

    try {
        const backlogPath = getBacklogPath();
        await ensureFileExists(backlogPath);

        let updatedTask: BacklogTask | undefined;

        await withFileLock(backlogPath, async () => {
            let backlog: BacklogFile;
            try {
                const content = await fs.readFile(backlogPath, 'utf-8');
                const parsed = JSON.parse(content);
                if (Array.isArray(parsed.tasks)) {
                    backlog = parsed as BacklogFile;
                } else {
                    backlog = { tasks: [], lastUpdated: new Date().toISOString() };
                }
            } catch {
                backlog = { tasks: [], lastUpdated: new Date().toISOString() };
            }

            // Find task by ID
            const taskIndex = backlog.tasks.findIndex(t => t.id === params.task_id);
            if (taskIndex === -1) {
                throw new Error(`タスク "${params.task_id}" が見つかりません。`);
            }

            // Update task
            backlog.tasks[taskIndex].status = params.status;
            backlog.tasks[taskIndex].completedAt = new Date().toISOString();
            updatedTask = backlog.tasks[taskIndex];

            backlog.lastUpdated = new Date().toISOString();

            await fs.writeFile(backlogPath, JSON.stringify(backlog, null, 2), 'utf-8');
        });

        // Log activity
        await addActivity({
            role,
            action: 'update_backlog',
            details: `Updated backlog task: ${updatedTask?.title} -> ${params.status}`,
        });

        info(`Backlog task updated by ${role}`, { taskId: params.task_id, status: params.status });

        return {
            success: true,
            task: updatedTask,
        };
    } catch (err) {
        error('Failed to update backlog task', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export function formatUpdateBacklogResult(result: UpdateBacklogResult): string {
    if (!result.success) {
        return `❌ バックログの更新に失敗しました: ${result.error}`;
    }

    let output = `✅ バックログタスクを更新しました。\n`;
    output += `Task ID: ${result.task?.id}\n`;
    output += `Title: ${result.task?.title}\n`;
    output += `Status: ${result.task?.status}\n`;
    output += `Completed At: ${result.task?.completedAt}\n`;

    return output;
}
