/**
 * タスクアーカイブユーティリティ
 *
 * 完了したタスクを一定期間後にアーカイブファイルに移動する
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { TaskSummary } from '../types/task.js';
import { getDashboard, updateDashboard, getDevTeamPath, addActivity, updateMemberStatus } from './queue.js';
import { withFileLock, ensureFileExists } from './file-lock.js';
import { info, error } from './logger.js';
import { recalculateDashboardTasks } from './task-manager.js';
import { getMemberRoles } from '../config/team-config.js';

interface ArchivedTasks {
    archivedAt: string;
    tasks: TaskSummary[];
}

function formatDateForArchive(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getTaskArchivePath(date: Date): string {
    const dateStr = formatDateForArchive(date);
    return path.join(getDevTeamPath(), 'archive', 'tasks', `${dateStr}.json`);
}

/**
 * 完了タスクをアーカイブする
 * @param olderThanDays 何日前のタスクをアーカイブするか（デフォルト: 7日）
 */
export async function archiveCompletedTasks(olderThanDays: number = 7): Promise<{
    archivedCount: number;
    archivePath: string;
}> {
    const now = new Date();
    const cutoffTime = now.getTime() - olderThanDays * 24 * 60 * 60 * 1000;
    const archivePath = getTaskArchivePath(now);
    let archivedCount = 0;

    // Ensure archive directory exists
    const archiveDir = path.dirname(archivePath);
    await fs.mkdir(archiveDir, { recursive: true });

    // Ensure archive file exists
    await ensureFileExists(archivePath);

    try {
        const dashboard = await getDashboard();

        // Find tasks to archive (completed and older than cutoff)
        const tasksToArchive = dashboard.taskList.filter(t => {
            if (t.status !== 'completed') return false;
            if (!t.completedAt) return false;
            return new Date(t.completedAt).getTime() < cutoffTime;
        });

        if (tasksToArchive.length === 0) {
            info('No tasks to archive');
            return { archivedCount: 0, archivePath };
        }

        // Read existing archive or create new
        await withFileLock(archivePath, async () => {
            let archive: ArchivedTasks;
            try {
                const content = await fs.readFile(archivePath, 'utf-8');
                const parsed = JSON.parse(content);
                if (Array.isArray(parsed.tasks)) {
                    archive = parsed as ArchivedTasks;
                } else {
                    archive = {
                        archivedAt: now.toISOString(),
                        tasks: [],
                    };
                }
            } catch {
                archive = {
                    archivedAt: now.toISOString(),
                    tasks: [],
                };
            }

            // Get existing task IDs for deduplication
            const existingIds = new Set(archive.tasks.map(t => t.id));

            // Add new tasks (skip duplicates)
            for (const task of tasksToArchive) {
                if (!existingIds.has(task.id)) {
                    archive.tasks.push(task);
                    archivedCount++;
                }
            }

            archive.archivedAt = now.toISOString();
            await fs.writeFile(archivePath, JSON.stringify(archive, null, 2), 'utf-8');
        });

        // Remove archived tasks from dashboard.taskList
        if (archivedCount > 0) {
            const archivedIds = new Set(tasksToArchive.map(t => t.id));
            const remainingTasks = dashboard.taskList.filter(t => !archivedIds.has(t.id));
            await updateDashboard({ taskList: remainingTasks });
            await recalculateDashboardTasks();
        }

        info(`Archived ${archivedCount} completed tasks`, { archivePath, olderThanDays });

    } catch (err) {
        error('Failed to archive tasks', err);
        throw err;
    }

    return { archivedCount, archivePath };
}

/**
 * 全タスクをアーカイブする（ステータスを問わず）
 * @returns アーカイブ件数とファイルパス
 */
export async function archiveAllTasks(): Promise<{
    archivedCount: number;
    archivePath: string;
}> {
    const now = new Date();
    const archivePath = getTaskArchivePath(now);
    let archivedCount = 0;

    // Ensure archive directory exists
    const archiveDir = path.dirname(archivePath);
    await fs.mkdir(archiveDir, { recursive: true });

    // Ensure archive file exists
    await ensureFileExists(archivePath);

    try {
        const dashboard = await getDashboard();
        const tasksToArchive = dashboard.taskList;

        if (tasksToArchive.length === 0) {
            info('No tasks to archive');
            return { archivedCount: 0, archivePath };
        }

        // Read existing archive or create new
        await withFileLock(archivePath, async () => {
            let archive: ArchivedTasks;
            try {
                const content = await fs.readFile(archivePath, 'utf-8');
                const parsed = JSON.parse(content);
                if (Array.isArray(parsed.tasks)) {
                    archive = parsed as ArchivedTasks;
                } else {
                    archive = {
                        archivedAt: now.toISOString(),
                        tasks: [],
                    };
                }
            } catch {
                archive = {
                    archivedAt: now.toISOString(),
                    tasks: [],
                };
            }

            // Get existing task IDs for deduplication
            const existingIds = new Set(archive.tasks.map(t => t.id));

            // Add all tasks (skip duplicates)
            for (const task of tasksToArchive) {
                if (!existingIds.has(task.id)) {
                    archive.tasks.push(task);
                    archivedCount++;
                }
            }

            archive.archivedAt = now.toISOString();
            await fs.writeFile(archivePath, JSON.stringify(archive, null, 2), 'utf-8');
        });

        // Clear dashboard.taskList and reset memberStatus
        if (archivedCount > 0) {
            await updateDashboard({ taskList: [] });
            await recalculateDashboardTasks();

            // Reset all member statuses to idle
            for (const role of ['leader', ...getMemberRoles()]) {
                try {
                    await updateMemberStatus(role, {
                        status: 'idle',
                        currentTask: undefined,
                        lastActivity: new Date().toISOString(),
                    });
                } catch (err) {
                    error(`Failed to reset member status for ${role}`, err);
                }
            }

            // Add activity log
            await addActivity({
                role: 'pm',
                action: 'archive_all_tasks',
                details: `Archived ${archivedCount} tasks (all statuses)`,
            });
        }

        info(`Archived ${archivedCount} tasks (all statuses)`, { archivePath });

    } catch (err) {
        error('Failed to archive all tasks', err);
        throw err;
    }

    return { archivedCount, archivePath };
}

/**
 * アーカイブされたタスクを取得する
 * @param date アーカイブ日付（指定しない場合は今日）
 */
export async function getArchivedTasks(date?: Date): Promise<TaskSummary[]> {
    const targetDate = date || new Date();
    const archivePath = getTaskArchivePath(targetDate);

    try {
        const content = await fs.readFile(archivePath, 'utf-8');
        const archive = JSON.parse(content) as ArchivedTasks;
        return archive.tasks || [];
    } catch {
        // ファイルが存在しないか読み込めない場合は空配列を返す
        return [];
    }
}

/**
 * 特定期間のアーカイブタスクを検索する
 * @param startDate 開始日
 * @param endDate 終了日
 */
export async function searchArchivedTasks(
    startDate: Date,
    endDate: Date
): Promise<TaskSummary[]> {
    const tasks: TaskSummary[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
        const dailyTasks = await getArchivedTasks(current);
        tasks.push(...dailyTasks);
        current.setDate(current.getDate() + 1);
    }

    return tasks;
}

/**
 * アーカイブディレクトリ内のファイル一覧を取得
 */
export async function listArchiveFiles(): Promise<string[]> {
    const archiveDir = path.join(getDevTeamPath(), 'archive', 'tasks');

    try {
        await fs.mkdir(archiveDir, { recursive: true });
        const files = await fs.readdir(archiveDir);
        return files.filter(f => f.endsWith('.json')).sort();
    } catch {
        return [];
    }
}
