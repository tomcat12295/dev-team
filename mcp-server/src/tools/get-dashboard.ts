import { Dashboard, TaskType } from '../types/task.js';
import { getDashboard } from '../utils/queue.js';
import { getCurrentRole } from '../utils/permission.js';
import { info } from '../utils/logger.js';
import { formatTimestampJST } from '../utils/format.js';

// Re-export for backward compatibility
export { formatTimestampJST } from '../utils/format.js';

export type DashboardMode = 'full' | 'summary' | 'tasks_only';

export interface GetDashboardParams {
    mode?: DashboardMode;
}

export interface GetDashboardResult {
    success: boolean;
    dashboard?: Dashboard;
    mode?: DashboardMode;
    error?: string;
}

export async function getDashboardInfo(params: GetDashboardParams = {}): Promise<GetDashboardResult> {
    const role = getCurrentRole();
    const mode = params.mode ?? 'full';
    info(`Dashboard requested by ${role} (mode: ${mode})`);

    try {
        const dashboard = await getDashboard();
        return {
            success: true,
            dashboard,
            mode,
        };
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export function formatDashboard(result: GetDashboardResult): string {
    if (!result.success || !result.dashboard) {
        return `❌ ダッシュボードの取得に失敗しました: ${result.error}`;
    }

    const d = result.dashboard;
    const mode = result.mode ?? 'full';

    // Summary mode: タスク数+承認待ち件数のみ
    if (mode === 'summary') {
        return formatDashboardSummary(d);
    }

    // Tasks only mode: タスク一覧のみ
    if (mode === 'tasks_only') {
        return formatDashboardTasksOnly(d);
    }

    // Full mode: 全情報（現行動作）
    return formatDashboardFull(d);
}

/**
 * Summary mode: タスク数と承認待ち件数のみ
 */
function formatDashboardSummary(d: Dashboard): string {
    const pendingApprovals = d.pendingApprovals.filter(a => a.status === 'pending').length;

    let output = `📊 タスク: 保留${d.tasks.pending} / 進行中${d.tasks.inProgress} / 完了${d.tasks.completed}\n`;
    output += `🔔 承認待ち: ${pendingApprovals}件`;

    return output;
}

/**
 * Tasks only mode: タスク一覧表のみ
 */
function formatDashboardTasksOnly(d: Dashboard): string {
    let output = `## 📋 タスク一覧\n`;
    const activeTasks = d.taskList.filter(t => t.status !== 'completed');
    if (activeTasks.length === 0) {
        output += `タスクはありません\n`;
    } else {
        const displayTasks = activeTasks.slice(0, 10);
        output += `| ID | タスク | 担当 | 状態 |\n`;
        output += `|----|-------|-----|------|\n`;
        for (const task of displayTasks) {
            output += `| ${task.id} | ${task.title} | ${task.assignee} | ${task.status} |\n`;
        }
        const remaining = activeTasks.length - displayTasks.length;
        if (remaining > 0) {
            output += `（他 ${remaining} 件）\n`;
        }
    }
    return output;
}

/**
 * Full mode: 全情報（現行動作）
 */
function formatDashboardFull(d: Dashboard): string {
    let output = `# 📊 プロジェクトダッシュボード\n\n`;
    output += `**プロジェクト:** ${d.projectName}\n`;
    output += `**現在のフェーズ:** ${d.currentPhase}\n`;
    output += `**最終更新:** ${formatTimestampJST(d.lastUpdated)}\n\n`;

    output += `## タスク状況\n`;
    output += `| ステータス | 件数 |\n`;
    output += `|-----------|------|\n`;
    output += `| 保留中 | ${d.tasks.pending} |\n`;
    output += `| 進行中 | ${d.tasks.inProgress} |\n`;
    output += `| 完了 | ${d.tasks.completed} |\n`;
    output += `| **合計** | **${d.tasks.total}** |\n\n`;

    const pendingApprovals = d.pendingApprovals.filter(a => a.status === 'pending');
    if (pendingApprovals.length > 0) {
        output += `## 🔔 社長判断待ち (${pendingApprovals.length}件)\n`;
        for (const approval of pendingApprovals) {
            output += `- **${approval.title}** (${approval.type})\n`;
            output += `  ${approval.description}\n`;
            output += `  申請者: ${approval.requestedBy} | 登録: ${formatTimestampJST(approval.requestedAt)} | ID: ${approval.id}\n\n`;
        }
    }

    // メンバー状況
    output += `## 👥 メンバー状況\n`;
    output += `| メンバー | 状態 | 現在のタスク | 最終活動 |\n`;
    output += `|---------|------|------------|----------|\n`;
    const members: Array<'leader' | 'member-01' | 'member-02'> = ['leader', 'member-01', 'member-02'];
    for (const member of members) {
        const status = d.memberStatus[member];
        const currentTask = status.currentTask?.title ?? '-';
        const lastActivity = formatTimestampJST(status.lastActivity);
        output += `| ${member} | ${status.status} | ${currentTask} | ${lastActivity} |\n`;
    }
    output += `\n`;

    // タスク一覧
    output += `## 📋 タスク一覧\n`;
    const activeTasks = d.taskList.filter(t => t.status !== 'completed');
    if (activeTasks.length === 0) {
        output += `タスクはありません\n\n`;
    } else {
        const displayTasks = activeTasks.slice(0, 10);
        output += `| ID | タスク | 担当 | 種別 | 状態 | 優先度 |\n`;
        output += `|----|-------|-----|------|------|-------|\n`;
        for (const task of displayTasks) {
            const taskTypeLabel = getTaskTypeLabel(task.taskType);
            output += `| ${task.id} | ${task.title} | ${task.assignee} | ${taskTypeLabel} | ${task.status} | ${task.priority} |\n`;
        }
        const remaining = activeTasks.length - displayTasks.length;
        if (remaining > 0) {
            output += `（他 ${remaining} 件）\n`;
        }
        output += `\n`;
    }

    if (d.recentActivity.length > 0) {
        output += `## 📝 最近のアクティビティ\n`;
        for (const activity of d.recentActivity.slice(0, 10)) {
            output += `- [${formatTimestampJST(activity.timestamp)}] ${activity.role}: ${activity.action} - ${activity.details}\n`;
        }
    }

    return output;
}

/**
 * タスク種別の日本語ラベルを取得
 */
function getTaskTypeLabel(taskType?: TaskType): string {
    const labels: Record<TaskType, string> = {
        investigation: '調査',
        implementation: '実装',
        review: 'レビュー',
        documentation: 'ドキュメント',
        plan: 'プラン',
        test_plan: 'テスト設計',
        test_implementation: 'テスト実装',
    };
    return labels[taskType ?? 'implementation'];
}
