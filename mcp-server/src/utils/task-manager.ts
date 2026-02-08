/**
 * タスクステータス管理ユーティリティ
 *
 * タスクの状態遷移を一元管理し、Dashboard.tasksの集計値を
 * taskListから自動計算する。
 */
import { TaskSummary, TaskCounts, TaskStatus, Dashboard, TaskPhase, Role } from '../types/task.js';
import { getDashboard, updateDashboard, updateTaskInList, getChildTasks } from './queue.js';
import { info, error } from './logger.js';
import { sendTextToPane } from './wezterm.js';

/**
 * getTaskWithValidation のオプション
 */
export interface GetTaskOptions {
    expectedPhase?: TaskPhase;
    requirePlan?: boolean;
    expectedAssignee?: Role;
}

/**
 * getTaskWithValidation の結果
 */
export interface GetTaskResult {
    task?: TaskSummary;
    error?: string;
}

/**
 * タスクを取得し、オプションで指定された条件を検証する
 * 重複していたタスク検索・検証パターンを一元化
 */
export async function getTaskWithValidation(
    taskId: string,
    options?: GetTaskOptions
): Promise<GetTaskResult> {
    const dashboard = await getDashboard();
    const task = dashboard.taskList.find(t => t.id === taskId);

    if (!task) {
        return { error: `タスクが見つかりません: ${taskId}` };
    }

    if (options?.expectedPhase && task.phase !== options.expectedPhase) {
        return {
            error: `タスクのフェーズが'${options.expectedPhase}'ではありません。現在のフェーズ: ${task.phase || 'undefined'}`,
        };
    }

    if (options?.requirePlan && !task.plan) {
        return { error: `タスクに計画が提出されていません` };
    }

    if (options?.expectedAssignee && task.assignee !== options.expectedAssignee) {
        return {
            error: `このタスクはあなたに割り当てられていません。割り当て先: ${task.assignee}`,
        };
    }

    return { task };
}

/**
 * taskListからタスク集計値を計算する
 * Dashboard.tasksの唯一の正として使用
 */
export function calculateTaskCounts(taskList: TaskSummary[]): TaskCounts {
    const counts: TaskCounts = {
        pending: 0,
        inProgress: 0,
        completed: 0,
        blocked: 0,
        total: taskList.length,
    };

    for (const task of taskList) {
        switch (task.status) {
            case 'pending':
                counts.pending++;
                break;
            case 'in_progress':
                counts.inProgress++;
                break;
            case 'completed':
                counts.completed++;
                break;
            case 'blocked':
                counts.blocked++;
                break;
            // 'cancelled' はtotalにはカウントされるが個別カウントなし
        }
    }

    return counts;
}

/**
 * Dashboard.tasksをtaskListから再計算して更新する
 * txDashboard が渡された場合はインメモリ更新のみ（ロック取得なし）
 */
export async function recalculateDashboardTasks(txDashboard?: Dashboard): Promise<Dashboard> {
    if (txDashboard) {
        const newCounts = calculateTaskCounts(txDashboard.taskList);
        txDashboard.tasks = newCounts;
        txDashboard.lastUpdated = new Date().toISOString();
        return txDashboard;
    }

    const dashboard = await getDashboard();
    const newCounts = calculateTaskCounts(dashboard.taskList);

    // 集計値が変わった場合のみ更新
    const currentTasks = dashboard.tasks;
    if (
        currentTasks.pending !== newCounts.pending ||
        currentTasks.inProgress !== newCounts.inProgress ||
        currentTasks.completed !== newCounts.completed ||
        currentTasks.blocked !== newCounts.blocked ||
        currentTasks.total !== newCounts.total
    ) {
        info('Recalculating dashboard tasks from taskList', {
            before: currentTasks,
            after: newCounts,
        });
        return updateDashboard({ tasks: newCounts });
    }

    return dashboard;
}

/**
 * タスクを着手状態に更新する
 * pending -> in_progress
 */
export async function startTask(taskId: string): Promise<void> {
    const dashboard = await getDashboard();
    const task = dashboard.taskList.find(t => t.id === taskId);

    if (!task) {
        error(`Task not found: ${taskId}`);
        return;
    }

    if (task.status !== 'pending') {
        info(`Task ${taskId} is not pending, skipping start`, { currentStatus: task.status });
        return;
    }

    await updateTaskInList(taskId, {
        status: 'in_progress',
        startedAt: new Date().toISOString(),
    });

    await recalculateDashboardTasks();
    info(`Task ${taskId} started`);
}

/**
 * タスクを完了状態に更新する
 * in_progress -> completed
 * 親タスクがあり、全子タスクが完了した場合は親も自動完了
 */
export async function completeTask(taskId: string): Promise<void> {
    const dashboard = await getDashboard();
    const task = dashboard.taskList.find(t => t.id === taskId);

    if (!task) {
        error(`Task not found: ${taskId}`);
        return;
    }

    if (task.status !== 'in_progress') {
        info(`Task ${taskId} is not in_progress, skipping complete`, { currentStatus: task.status });
        return;
    }

    await updateTaskInList(taskId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
    });

    await recalculateDashboardTasks();
    info(`Task ${taskId} completed`);

    // 親タスクの自動完了チェック
    if (task.parentTaskId) {
        await checkAndCompleteParent(task.parentTaskId);
    }
}

/**
 * 親タスクの全子タスクが完了しているか確認し、完了していれば親も完了にする
 * 再帰的に祖先タスクも確認する
 */
async function checkAndCompleteParent(parentTaskId: string): Promise<void> {
    const dashboard = await getDashboard();
    const parentTask = dashboard.taskList.find(t => t.id === parentTaskId);

    if (!parentTask) {
        error(`Parent task not found: ${parentTaskId}`);
        return;
    }

    // 親タスクが既に完了している場合はスキップ
    if (parentTask.status === 'completed') {
        return;
    }

    // 子タスク一覧を取得
    const childTasks = await getChildTasks(parentTaskId);

    if (childTasks.length === 0) {
        // 子タスクがない場合は自動完了しない
        return;
    }

    // 全ての子タスクが完了しているか確認
    const allChildrenCompleted = childTasks.every(child => child.status === 'completed');

    if (allChildrenCompleted) {
        info(`All child tasks of ${parentTaskId} are completed, auto-completing parent task`);

        await updateTaskInList(parentTaskId, {
            status: 'completed',
            completedAt: new Date().toISOString(),
        });

        await recalculateDashboardTasks();
        info(`Parent task ${parentTaskId} auto-completed`);

        // 祖先タスクも再帰的にチェック
        if (parentTask.parentTaskId) {
            await checkAndCompleteParent(parentTask.parentTaskId);
        }
    }
}

/**
 * タスクをブロック状態に更新する
 * in_progress -> blocked
 */
export async function blockTask(taskId: string, _reason?: string): Promise<void> {
    const dashboard = await getDashboard();
    const task = dashboard.taskList.find(t => t.id === taskId);

    if (!task) {
        error(`Task not found: ${taskId}`);
        return;
    }

    await updateTaskInList(taskId, {
        status: 'blocked',
    });

    await recalculateDashboardTasks();
    info(`Task ${taskId} blocked`);
}

/**
 * ブロック解除してタスクを再開する
 * blocked -> in_progress
 */
export async function unblockTask(taskId: string): Promise<void> {
    const dashboard = await getDashboard();
    const task = dashboard.taskList.find(t => t.id === taskId);

    if (!task) {
        error(`Task not found: ${taskId}`);
        return;
    }

    if (task.status !== 'blocked') {
        info(`Task ${taskId} is not blocked, skipping unblock`, { currentStatus: task.status });
        return;
    }

    await updateTaskInList(taskId, {
        status: 'in_progress',
    });

    await recalculateDashboardTasks();
    info(`Task ${taskId} unblocked`);
}

/**
 * 特定のassigneeの現在進行中のタスクを取得する
 */
export async function getCurrentTaskForAssignee(assignee: string): Promise<TaskSummary | undefined> {
    const dashboard = await getDashboard();
    return dashboard.taskList.find(t =>
        t.assignee === assignee && t.status === 'in_progress'
    );
}

/**
 * 特定のassigneeのpendingタスクを取得する
 */
export async function getPendingTasksForAssignee(assignee: string): Promise<TaskSummary[]> {
    const dashboard = await getDashboard();
    return dashboard.taskList.filter(t =>
        t.assignee === assignee && t.status === 'pending'
    );
}
