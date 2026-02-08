import { archiveAllTasks } from '../utils/task-archive.js';
import { getCurrentRole } from '../utils/permission.js';
import { info, error } from '../utils/logger.js';

export interface ArchiveAllTasksResult {
    success: boolean;
    archivedCount?: number;
    archivePath?: string;
    error?: string;
}

export async function archiveAllTasksTool(): Promise<ArchiveAllTasksResult> {
    const role = getCurrentRole();
    info(`Archive all tasks requested by ${role}`);

    // PM権限チェック
    if (role !== 'pm') {
        return {
            success: false,
            error: 'このツールはPMのみが使用できます。',
        };
    }

    try {
        const result = await archiveAllTasks();
        return {
            success: true,
            archivedCount: result.archivedCount,
            archivePath: result.archivePath,
        };
    } catch (err) {
        error('Failed to archive all tasks', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export function formatArchiveAllTasksResult(result: ArchiveAllTasksResult): string {
    if (!result.success) {
        return `❌ 全タスクのアーカイブに失敗しました: ${result.error}`;
    }

    return `✅ 全タスクをアーカイブしました

アーカイブ件数: ${result.archivedCount}件
保存先: ${result.archivePath}`;
}
