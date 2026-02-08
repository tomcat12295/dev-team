import * as fs from 'fs/promises';
import * as path from 'path';
import { Role, Task, TaskQueue, Dashboard, ApprovalRequest, ActivityLog, MemberStatus, TaskSummary, TaskType } from '../types/task.js';
import { Message, MessageQueue } from '../types/message.js';
import { withFileLock, ensureFileExists } from './file-lock.js';
import { info, error } from './logger.js';
import { getAllRoles, getMemberRoles } from '../config/team-config.js';
import { ensureMemoryStructure } from './memory.js';
import { formatTimestampJST } from './format.js';


function getProjectPath(): string {
    const projectPath = process.env.DEV_TEAM_PROJECT_PATH;
    if (!projectPath) {
        throw new Error('DEV_TEAM_PROJECT_PATH environment variable is not set');
    }
    return projectPath;
}

function createDefaultMemberStatus(): Dashboard['memberStatus'] {
    const status = {
        leader: { status: 'idle' as const, hasReceivedTaskThisSession: false },
    } as Dashboard['memberStatus'];
    for (const member of getMemberRoles()) {
        (status as Record<string, MemberStatus>)[member] = { status: 'idle' as const, hasReceivedTaskThisSession: false };
    }
    return status;
}

export function getDevTeamPath(): string {
    return path.join(getProjectPath(), '.dev-team');
}

export function getQueuePath(role: Role): string {
    return path.join(getDevTeamPath(), 'queue', `${role}.json`);
}

function getDashboardPath(): string {
    return path.join(getDevTeamPath(), 'status', 'dashboard.json');
}

function getDashboardMdPath(): string {
    return path.join(getDevTeamPath(), 'status', 'dashboard.md');
}

function getApprovalsPath(): string {
    return path.join(getDevTeamPath(), 'status', 'approvals.json');
}

/**
 * タスク種別の短縮ラベルを取得（dashboard.md用）
 */
function getTaskTypeShort(taskType?: TaskType): string {
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

export function generateDashboardText(dashboard: Dashboard): string {
    const lines: string[] = [];

    // Title & Project Info
    lines.push('# Dev Team Dashboard');
    lines.push('');
    lines.push(`- **Project:** ${dashboard.projectName}`);
    lines.push(`- **Phase:** ${dashboard.currentPhase}`);
    lines.push(`- **Updated:** ${formatTimestampJST(dashboard.lastUpdated)}`);
    lines.push('');

    // Tasks summary
    lines.push('## Tasks');
    lines.push('');
    lines.push('| Status | Count |');
    lines.push('|--------|------:|');
    lines.push(`| Pending | ${dashboard.tasks.pending} |`);
    lines.push(`| In Progress | ${dashboard.tasks.inProgress} |`);
    lines.push(`| Blocked | ${dashboard.tasks.blocked} |`);
    lines.push(`| Completed | ${dashboard.tasks.completed} |`);
    lines.push(`| **Total** | **${dashboard.tasks.total}** |`);
    lines.push('');

    // Member status
    lines.push('## Member Status');
    lines.push('');
    lines.push('| Member | Status | Current Task | Last Activity |');
    lines.push('|--------|--------|--------------|---------------|');
    const members = ['leader', ...getMemberRoles()];
    for (const member of members) {
        const status = dashboard.memberStatus[member] ?? { status: 'idle' as const, lastActivity: new Date().toISOString(), currentTask: undefined };
        const currentTask = status.currentTask?.title ?? '-';
        const lastActivity = formatTimestampJST(status.lastActivity);
        lines.push(`| ${member} | ${status.status} | ${currentTask} | ${lastActivity} |`);
    }
    lines.push('');

    // Task list (exclude completed, show up to 5)
    const activeTasks = dashboard.taskList.filter(t => t.status !== 'completed');
    lines.push('## Task List');
    lines.push('');
    if (activeTasks.length === 0) {
        lines.push('*No active tasks.*');
    } else {
        const displayTasks = activeTasks.slice(0, 5);
        lines.push('| ID | Task | Assignee | Type | Status | Priority |');
        lines.push('|----|------|----------|------|--------|----------|');
        for (const task of displayTasks) {
            const taskTypeShort = getTaskTypeShort(task.taskType);
            lines.push(`| ${task.id} | ${task.title} | ${task.assignee} | ${taskTypeShort} | ${task.status} | ${task.priority} |`);
        }
        const remaining = activeTasks.length - 5;
        if (remaining > 0) {
            lines.push(`\n*（他 ${remaining} 件）*`);
        }
    }
    lines.push('');

    // Pending approvals
    const pendingApprovals = dashboard.pendingApprovals.filter(a => a.status === 'pending');
    if (pendingApprovals.length > 0) {
        lines.push('## Pending Approvals');
        lines.push('');
        for (const approval of pendingApprovals) {
            lines.push(`- **${approval.title}** (${approval.type})`);
            lines.push(`  ${approval.description}`);
            lines.push(`  *Requested by:* ${approval.requestedBy} | ${formatTimestampJST(approval.requestedAt)} | \`${approval.id}\``);
        }
        lines.push('');
    }

    // Recent activity
    if (dashboard.recentActivity.length > 0) {
        lines.push('## Recent Activity');
        lines.push('');
        for (const a of dashboard.recentActivity.slice(0, 5)) {
            lines.push(`- \`${formatTimestampJST(a.timestamp)}\` **${a.role}**: ${a.action}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

// Debounce dashboard.md writes to avoid redundant I/O on rapid updates
let dashWriteTimer: ReturnType<typeof setTimeout> | null = null;
let pendingDashboard: Dashboard | null = null;

async function flushDashboard(): Promise<void> {
    if (!pendingDashboard) return;
    const dashboard = pendingDashboard;
    pendingDashboard = null;
    try {
        const mdPath = getDashboardMdPath();
        const text = generateDashboardText(dashboard);
        await fs.writeFile(mdPath, text, 'utf-8');
    } catch (err) {
        error('Failed to write dashboard.md', err);
    }
}

async function writeDashboard(dashboard: Dashboard): Promise<void> {
    pendingDashboard = dashboard;
    if (dashWriteTimer) {
        clearTimeout(dashWriteTimer);
    }
    dashWriteTimer = setTimeout(() => {
        dashWriteTimer = null;
        flushDashboard();
    }, 500);
}

/**
 * Cancel pending dashboard write timer (for clean test teardown)
 */
export function cancelPendingDashboardWrite(): void {
    if (dashWriteTimer) {
        clearTimeout(dashWriteTimer);
        dashWriteTimer = null;
    }
    pendingDashboard = null;
}

export async function ensureDevTeamStructure(): Promise<void> {
    const devTeamPath = getDevTeamPath();
    const dirs = [
        path.join(devTeamPath, 'queue'),
        path.join(devTeamPath, 'status'),

        path.join(devTeamPath, 'memory'),
        ...getMemberRoles().map(member => path.join(devTeamPath, 'workspaces', member)),
    ];

    for (const dir of dirs) {
        await fs.mkdir(dir, { recursive: true });
    }

    // Initialize memory structure (memories.jsonl, project.md)
    await ensureMemoryStructure();

    // Initialize queue files for each role
    const roles = getAllRoles() as Role[];
    for (const role of roles) {
        const queuePath = getQueuePath(role);
        await ensureFileExists(queuePath);
        let needsQueueInit = false;
        try {
            const content = await fs.readFile(queuePath, 'utf-8');
            const parsed = JSON.parse(content);
            // Check if it's a valid MessageQueue (not just empty object)
            if (!parsed.role || !Array.isArray(parsed.messages)) {
                needsQueueInit = true;
            }
        } catch {
            needsQueueInit = true;
        }
        if (needsQueueInit) {
            const initialQueue: MessageQueue = {
                role,
                messages: [],
                lastUpdated: new Date().toISOString(),
            };
            await fs.writeFile(queuePath, JSON.stringify(initialQueue, null, 2), 'utf-8');
        }
    }

    // Initialize dashboard
    const dashboardPath = getDashboardPath();
    await ensureFileExists(dashboardPath);
    let needsInit = false;
    try {
        const content = await fs.readFile(dashboardPath, 'utf-8');
        const parsed = JSON.parse(content);
        // Check if it's a valid Dashboard (not just empty object)
        if (!parsed.projectName || !parsed.tasks) {
            needsInit = true;
        }
    } catch {
        needsInit = true;
    }
    if (needsInit) {
        const initialDashboard: Dashboard = {
            projectName: path.basename(getProjectPath()),
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
            memberStatus: createDefaultMemberStatus(),
            taskList: [],
        };
        await fs.writeFile(dashboardPath, JSON.stringify(initialDashboard, null, 2), 'utf-8');
    }

    // Sync dashboard.md
    try {
        const content = await fs.readFile(dashboardPath, 'utf-8');
        const dashboard = parseDashboard(content);
        const txtPath = getDashboardMdPath();
        await fs.writeFile(txtPath, generateDashboardText(dashboard), 'utf-8');
    } catch {
        // ignore - dashboard.md will be generated on next getDashboard() call
    }

    info('Dev team structure initialized');
}

export async function readQueue(role: Role): Promise<MessageQueue> {
    const queuePath = getQueuePath(role);
    return withFileLock(queuePath, async () => {
        const content = await fs.readFile(queuePath, 'utf-8');
        return JSON.parse(content) as MessageQueue;
    });
}

export async function addMessage(to: Role, message: Message): Promise<void> {
    const queuePath = getQueuePath(to);
    await withFileLock(queuePath, async () => {
        const content = await fs.readFile(queuePath, 'utf-8');
        const queue = JSON.parse(content) as MessageQueue;
        queue.messages.push(message);
        queue.lastUpdated = new Date().toISOString();
        await fs.writeFile(queuePath, JSON.stringify(queue, null, 2), 'utf-8');
    });
    info(`Message added to ${to}'s queue`, { messageId: message.id });
}

export async function markMessageRead(role: Role, messageId: string): Promise<void> {
    const queuePath = getQueuePath(role);
    await withFileLock(queuePath, async () => {
        const content = await fs.readFile(queuePath, 'utf-8');
        const queue = JSON.parse(content) as MessageQueue;
        const message = queue.messages.find(m => m.id === messageId);
        if (message) {
            message.read = true;
            queue.lastUpdated = new Date().toISOString();
            await fs.writeFile(queuePath, JSON.stringify(queue, null, 2), 'utf-8');
        }
    });
}

export async function clearReadMessages(role: Role): Promise<number> {
    const queuePath = getQueuePath(role);
    let clearedCount = 0;
    await withFileLock(queuePath, async () => {
        const content = await fs.readFile(queuePath, 'utf-8');
        const queue = JSON.parse(content) as MessageQueue;
        const originalCount = queue.messages.length;
        queue.messages = queue.messages.filter(m => !m.read);
        clearedCount = originalCount - queue.messages.length;
        queue.lastUpdated = new Date().toISOString();
        await fs.writeFile(queuePath, JSON.stringify(queue, null, 2), 'utf-8');
    });
    return clearedCount;
}

/**
 * dashboardファイルからパースし互換補完するヘルパー（ロック外でも利用可）
 */
function parseDashboard(content: string): Dashboard {
    const parsed = JSON.parse(content);
    const tasks = parsed.tasks ?? { pending: 0, inProgress: 0, completed: 0, blocked: 0, total: 0 };
    return {
        ...parsed,
        memberStatus: parsed.memberStatus ?? createDefaultMemberStatus(),
        taskList: parsed.taskList ?? [],
        tasks: {
            ...tasks,
            blocked: tasks.blocked ?? 0,
        },
    };
}

export async function getDashboard(options?: { readOnly?: boolean }): Promise<Dashboard> {
    const dashboardPath = getDashboardPath();
    return withFileLock(dashboardPath, async () => {
        const content = await fs.readFile(dashboardPath, 'utf-8');
        const dashboard = parseDashboard(content);
        // readOnlyでない場合のみMDファイルを同期（I/O削減）
        if (!options?.readOnly) {
            await writeDashboard(dashboard);
        }
        return dashboard;
    });
}

export async function updateDashboard(updates: Partial<Dashboard>, txDashboard?: Dashboard): Promise<Dashboard> {
    // トランザクション内: インメモリ更新のみ
    if (txDashboard) {
        Object.assign(txDashboard, updates, { lastUpdated: new Date().toISOString() });
        return txDashboard;
    }

    const dashboardPath = getDashboardPath();
    return withFileLock(dashboardPath, async () => {
        const content = await fs.readFile(dashboardPath, 'utf-8');
        const dashboard = parseDashboard(content);
        const updated = {
            ...dashboard,
            ...updates,
            lastUpdated: new Date().toISOString(),
        };
        await fs.writeFile(dashboardPath, JSON.stringify(updated, null, 2), 'utf-8');

        await writeDashboard(updated);
        return updated;
    });
}

/**
 * 複数のdashboard変更を1回のロック内でまとめて実行するトランザクション関数。
 * ロックを1回だけ取得し、callbackにdashboardオブジェクトを渡す。
 * callback内で複数の変更を行い、最後に1回だけ書き込む。
 *
 * callback に渡される dashboard は updateTaskInList, updateMemberStatus,
 * updateDashboard, addActivity の txDashboard 引数として利用可能。
 */
export async function withDashboardTransaction<T>(
    callback: (dashboard: Dashboard) => Promise<T>,
): Promise<{ result: T; dashboard: Dashboard }> {
    const dashboardPath = getDashboardPath();
    return withFileLock(dashboardPath, async () => {
        const content = await fs.readFile(dashboardPath, 'utf-8');
        const dashboard = parseDashboard(content);

        const result = await callback(dashboard);

        // 最終書き込み（1回だけ）
        dashboard.lastUpdated = new Date().toISOString();
        await fs.writeFile(dashboardPath, JSON.stringify(dashboard, null, 2), 'utf-8');
        await writeDashboard(dashboard);

        return { result, dashboard };
    });
}

export async function addActivity(activity: Omit<ActivityLog, 'timestamp'>, txDashboard?: Dashboard): Promise<void> {
    // トランザクション内: インメモリ更新のみ
    if (txDashboard) {
        txDashboard.recentActivity.unshift({
            ...activity,
            timestamp: new Date().toISOString(),
        });
        txDashboard.recentActivity = txDashboard.recentActivity.slice(0, 50);
        txDashboard.lastUpdated = new Date().toISOString();
        return;
    }

    const dashboardPath = getDashboardPath();
    await withFileLock(dashboardPath, async () => {
        const content = await fs.readFile(dashboardPath, 'utf-8');
        const dashboard = JSON.parse(content) as Dashboard;
        dashboard.recentActivity.unshift({
            ...activity,
            timestamp: new Date().toISOString(),
        });
        // Keep only last 50 activities
        dashboard.recentActivity = dashboard.recentActivity.slice(0, 50);
        dashboard.lastUpdated = new Date().toISOString();
        await fs.writeFile(dashboardPath, JSON.stringify(dashboard, null, 2), 'utf-8');

        await writeDashboard(dashboard);
    });
}

export async function addApprovalRequest(request: Omit<ApprovalRequest, 'id' | 'requestedAt' | 'status'>): Promise<ApprovalRequest> {
    const dashboardPath = getDashboardPath();
    const newRequest: ApprovalRequest = {
        ...request,
        id: `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        requestedAt: new Date().toISOString(),
        status: 'pending',
    };

    await withFileLock(dashboardPath, async () => {
        const content = await fs.readFile(dashboardPath, 'utf-8');
        const dashboard = JSON.parse(content) as Dashboard;
        dashboard.pendingApprovals.push(newRequest);
        dashboard.lastUpdated = new Date().toISOString();
        await fs.writeFile(dashboardPath, JSON.stringify(dashboard, null, 2), 'utf-8');

        await writeDashboard(dashboard);
    });

    return newRequest;
}

export async function updateApprovalStatus(
    approvalId: string,
    status: 'approved' | 'rejected',
    comments?: string
): Promise<ApprovalRequest | null> {
    const dashboardPath = getDashboardPath();
    let updatedRequest: ApprovalRequest | null = null;

    await withFileLock(dashboardPath, async () => {
        const content = await fs.readFile(dashboardPath, 'utf-8');
        const dashboard = JSON.parse(content) as Dashboard;
        const request = dashboard.pendingApprovals.find(r => r.id === approvalId);
        if (request) {
            // ステータス更新
            request.status = status;
            request.comments = comments;
            if (status === 'approved') {
                request.approvedAt = new Date().toISOString();
            } else {
                request.rejectedAt = new Date().toISOString();
            }
            updatedRequest = request;

            // クリーンアップ: 処理済みエントリを即座に削除（pendingのみ残す）
            dashboard.pendingApprovals = dashboard.pendingApprovals.filter(a => {
                return a.status === 'pending';
            });

            dashboard.lastUpdated = new Date().toISOString();
            await fs.writeFile(dashboardPath, JSON.stringify(dashboard, null, 2), 'utf-8');
    
            await writeDashboard(dashboard);
        }
    });

    return updatedRequest;
}

export async function generateId(): Promise<string> {
    const dashboardPath = getDashboardPath();
    let newId = '';

    await withFileLock(dashboardPath, async () => {
        const content = await fs.readFile(dashboardPath, 'utf-8');
        const dashboard = JSON.parse(content) as Dashboard;

        // Get next task ID (default to 1 if not set)
        const nextTaskId = dashboard.nextTaskId ?? 1;

        // Generate ID in T-001 format
        newId = `T-${nextTaskId.toString().padStart(3, '0')}`;

        // Increment and save
        dashboard.nextTaskId = nextTaskId + 1;
        dashboard.lastUpdated = new Date().toISOString();

        await fs.writeFile(dashboardPath, JSON.stringify(dashboard, null, 2), 'utf-8');
    });

    return newId;
}

/**
 * メッセージID（タスク以外）を生成する
 * タスクIDとは別の形式で、カウンター管理不要
 * Format: M-{timestamp}-{random5chars}
 */
export function generateMessageId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 7);
    return `M-${timestamp}-${random}`;
}

export async function updateMemberStatus(
    role: string,
    status: Partial<MemberStatus>,
    txDashboard?: Dashboard,
): Promise<void> {
    // トランザクション内: インメモリ更新のみ
    if (txDashboard) {
        const memberStatus = txDashboard.memberStatus as Record<string, MemberStatus>;
        memberStatus[role] = {
            ...memberStatus[role],
            ...status,
        };
        txDashboard.lastUpdated = new Date().toISOString();
        return;
    }

    const dashboardPath = getDashboardPath();
    await withFileLock(dashboardPath, async () => {
        const content = await fs.readFile(dashboardPath, 'utf-8');
        const dashboard = parseDashboard(content);
        const memberStatus = dashboard.memberStatus as Record<string, MemberStatus>;
        memberStatus[role] = {
            ...memberStatus[role],
            ...status,
        };
        dashboard.lastUpdated = new Date().toISOString();
        await fs.writeFile(dashboardPath, JSON.stringify(dashboard, null, 2), 'utf-8');
        await writeDashboard(dashboard);
    });
}

export async function addTaskToList(task: TaskSummary): Promise<void> {
    const dashboardPath = getDashboardPath();
    await withFileLock(dashboardPath, async () => {
        const content = await fs.readFile(dashboardPath, 'utf-8');
        const parsed = JSON.parse(content);
        // 既存データ互換性
        const dashboard: Dashboard = {
            ...parsed,
            memberStatus: parsed.memberStatus ?? createDefaultMemberStatus(),
            taskList: parsed.taskList ?? [],
        };
        dashboard.taskList.push(task);
        // 優先度順 > 作成日時順（新しい順）でソート
        const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        dashboard.taskList.sort((a, b) => {
            const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (priorityDiff !== 0) return priorityDiff;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        dashboard.lastUpdated = new Date().toISOString();
        await fs.writeFile(dashboardPath, JSON.stringify(dashboard, null, 2), 'utf-8');
        await writeDashboard(dashboard);
    });
}

export async function updateTaskInList(taskId: string, updates: Partial<TaskSummary>, txDashboard?: Dashboard): Promise<boolean> {
    // トランザクション内: インメモリ更新のみ
    if (txDashboard) {
        const taskIndex = txDashboard.taskList.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            txDashboard.taskList[taskIndex] = {
                ...txDashboard.taskList[taskIndex],
                ...updates,
            };
            const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
            txDashboard.taskList.sort((a, b) => {
                const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
                if (priorityDiff !== 0) return priorityDiff;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
            txDashboard.lastUpdated = new Date().toISOString();
            info(`Task ${taskId} updated in taskList (tx)`, { updates });
            return true;
        }
        info(`Task ${taskId} not found in taskList (tx, total tasks: ${txDashboard.taskList.length})`);
        return false;
    }

    const dashboardPath = getDashboardPath();
    let updated = false;
    await withFileLock(dashboardPath, async () => {
        const content = await fs.readFile(dashboardPath, 'utf-8');
        const dashboard = parseDashboard(content);
        const taskIndex = dashboard.taskList.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            dashboard.taskList[taskIndex] = {
                ...dashboard.taskList[taskIndex],
                ...updates,
            };
            // 優先度順 > 作成日時順（新しい順）でソート
            const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
            dashboard.taskList.sort((a, b) => {
                const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
                if (priorityDiff !== 0) return priorityDiff;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
            dashboard.lastUpdated = new Date().toISOString();
            await fs.writeFile(dashboardPath, JSON.stringify(dashboard, null, 2), 'utf-8');
            await writeDashboard(dashboard);
            updated = true;
            info(`Task ${taskId} updated in taskList`, { updates });
        } else {
            info(`Task ${taskId} not found in taskList (total tasks: ${dashboard.taskList.length})`, {
                existingTaskIds: dashboard.taskList.map(t => t.id),
            });
        }
    });
    return updated;
}

export async function removeTaskFromList(taskId: string): Promise<void> {
    const dashboardPath = getDashboardPath();
    await withFileLock(dashboardPath, async () => {
        const content = await fs.readFile(dashboardPath, 'utf-8');
        const parsed = JSON.parse(content);
        // 既存データ互換性
        const dashboard: Dashboard = {
            ...parsed,
            memberStatus: parsed.memberStatus ?? createDefaultMemberStatus(),
            taskList: parsed.taskList ?? [],
        };
        dashboard.taskList = dashboard.taskList.filter(t => t.id !== taskId);
        dashboard.lastUpdated = new Date().toISOString();
        await fs.writeFile(dashboardPath, JSON.stringify(dashboard, null, 2), 'utf-8');
        await writeDashboard(dashboard);
    });
}

// Archive types
interface ArchivedQueue {
    role: Role;
    archivedAt: string;
    messages: Message[];
}

function formatDateForArchive(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getArchivePath(role: Role, date: Date): string {
    const dateStr = formatDateForArchive(date);
    return path.join(getDevTeamPath(), 'archive', 'queue', role, `${dateStr}.json`);
}

export async function archiveReadMessages(role: Role): Promise<{
    archivedCount: number;
    archivePath: string;
}> {
    const queuePath = getQueuePath(role);
    const now = new Date();
    const archivePath = getArchivePath(role, now);
    let archivedCount = 0;

    // Ensure archive directory exists
    const archiveDir = path.dirname(archivePath);
    await fs.mkdir(archiveDir, { recursive: true });

    // Ensure archive file exists
    await ensureFileExists(archivePath);

    await withFileLock(queuePath, async () => {
        // Read current queue
        const queueContent = await fs.readFile(queuePath, 'utf-8');
        const queue = JSON.parse(queueContent) as MessageQueue;

        // Extract read messages
        const readMessages = queue.messages.filter(m => m.read);
        if (readMessages.length === 0) {
            return;
        }

        // Lock archive file and merge
        await withFileLock(archivePath, async () => {
            let archive: ArchivedQueue;
            try {
                const archiveContent = await fs.readFile(archivePath, 'utf-8');
                const parsed = JSON.parse(archiveContent);
                if (parsed.role && Array.isArray(parsed.messages)) {
                    archive = parsed as ArchivedQueue;
                } else {
                    archive = {
                        role,
                        archivedAt: now.toISOString(),
                        messages: [],
                    };
                }
            } catch {
                archive = {
                    role,
                    archivedAt: now.toISOString(),
                    messages: [],
                };
            }

            // Get existing message IDs for deduplication
            const existingIds = new Set(archive.messages.map(m => m.id));

            // Add new messages (skip duplicates)
            for (const message of readMessages) {
                if (!existingIds.has(message.id)) {
                    archive.messages.push(message);
                    archivedCount++;
                }
            }

            // Update archivedAt timestamp
            archive.archivedAt = now.toISOString();

            // Write archive file
            await fs.writeFile(archivePath, JSON.stringify(archive, null, 2), 'utf-8');
        });

        // Remove read messages from queue
        queue.messages = queue.messages.filter(m => !m.read);
        queue.lastUpdated = now.toISOString();
        await fs.writeFile(queuePath, JSON.stringify(queue, null, 2), 'utf-8');
    });

    info(`Archived ${archivedCount} messages for ${role}`, { archivePath });

    return {
        archivedCount,
        archivePath,
    };
}

/**
 * 親タスクIDから子タスク一覧を取得する
 */
export async function getChildTasks(parentId: string): Promise<TaskSummary[]> {
    const dashboard = await getDashboard();
    return dashboard.taskList.filter(task => task.parentTaskId === parentId);
}

/**
 * 親子関係を設定する
 * - 子タスクにparentTaskIdを設定
 * - 親タスクのchildTaskIdsに子タスクIDを追加
 */
export async function linkParentChild(parentId: string, childId: string): Promise<void> {
    const dashboardPath = getDashboardPath();
    await withFileLock(dashboardPath, async () => {
        const content = await fs.readFile(dashboardPath, 'utf-8');
        const parsed = JSON.parse(content);
        const dashboard: Dashboard = {
            ...parsed,
            memberStatus: parsed.memberStatus ?? createDefaultMemberStatus(),
            taskList: parsed.taskList ?? [],
        };

        // Find parent and child tasks
        const parentIndex = dashboard.taskList.findIndex(t => t.id === parentId);
        const childIndex = dashboard.taskList.findIndex(t => t.id === childId);

        if (parentIndex === -1) {
            throw new Error(`Parent task not found: ${parentId}`);
        }
        if (childIndex === -1) {
            throw new Error(`Child task not found: ${childId}`);
        }

        // Set parentTaskId on child
        dashboard.taskList[childIndex].parentTaskId = parentId;

        // Add childId to parent's childTaskIds
        const parent = dashboard.taskList[parentIndex];
        if (!parent.childTaskIds) {
            parent.childTaskIds = [];
        }
        if (!parent.childTaskIds.includes(childId)) {
            parent.childTaskIds.push(childId);
        }

        dashboard.lastUpdated = new Date().toISOString();
        await fs.writeFile(dashboardPath, JSON.stringify(dashboard, null, 2), 'utf-8');
        await writeDashboard(dashboard);

        info(`Linked parent-child relationship`, { parentId, childId });
    });
}
