import * as fs from 'fs/promises';
import * as path from 'path';
import { getDevTeamPath } from '../utils/queue.js';
import { BacklogTask } from './add-backlog.js';
import { info, error } from '../utils/logger.js';

export interface GetBacklogResult {
    success: boolean;
    tasks: BacklogTask[];
    error?: string;
}

interface BacklogFile {
    tasks: BacklogTask[];
    lastUpdated: string;
}

function getBacklogPath(): string {
    return path.join(getDevTeamPath(), 'backlog.json');
}

const priorityOrder: Record<string, number> = {
    high: 0,
    medium: 1,
    low: 2,
};

export async function getBacklog(): Promise<GetBacklogResult> {
    try {
        const backlogPath = getBacklogPath();

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
            // File doesn't exist or is invalid
            backlog = { tasks: [], lastUpdated: new Date().toISOString() };
        }

        // Sort by priority: high → medium → low
        const sortedTasks = [...backlog.tasks].sort((a, b) => {
            return (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1);
        });

        info(`Backlog retrieved: ${sortedTasks.length} tasks`);

        return {
            success: true,
            tasks: sortedTasks,
        };
    } catch (err) {
        error('Failed to get backlog', err);
        return {
            success: false,
            tasks: [],
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export function formatGetBacklogResult(result: GetBacklogResult): string {
    if (!result.success) {
        return `❌ バックログの取得に失敗しました: ${result.error}`;
    }

    if (result.tasks.length === 0) {
        return '📋 バックログは空です。';
    }

    let output = `📋 バックログ: ${result.tasks.length}件\n\n`;

    for (const task of result.tasks) {
        output += `[${task.priority}] ${task.title}\n`;
        output += `  ${task.description}\n`;
        output += `  ID: ${task.id}\n\n`;
    }

    return output.trim();
}
