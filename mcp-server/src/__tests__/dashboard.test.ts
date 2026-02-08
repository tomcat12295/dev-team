import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Dashboard, MemberStatus, TaskSummary } from '../types/task.js';
import { formatDashboard, GetDashboardResult, formatTimestampJST } from '../tools/get-dashboard.js';
import { ANSI } from '../utils/ansi-table.js';

// Mock team-config for generateDashboardText
const mockGetMemberRoles = jest.fn<() => string[]>();
jest.unstable_mockModule('../config/team-config.js', () => ({
    getAllRoles: jest.fn(() => ['pm', 'leader', 'member-01', 'member-02']),
    getMemberRoles: mockGetMemberRoles,
}));

// テスト用のモックファイルシステム
const mockDashboard: Dashboard = {
    projectName: 'test-project',
    lastUpdated: '2025-01-31T12:00:00Z',
    currentPhase: 'implementation',
    tasks: {
        pending: 2,
        inProgress: 1,
        completed: 3,
        blocked: 0,
        total: 6,
    },
    recentActivity: [],
    pendingApprovals: [],

    memberStatus: {
        leader: { status: 'working', currentTask: { id: 'task-001', title: '設計レビュー', startedAt: '2025-01-31T10:00:00Z' }, lastActivity: '2025-01-31T12:00:00Z' },
        'member-01': { status: 'idle', lastActivity: '2025-01-31T11:50:00Z' },
        'member-02': { status: 'offline' },
    },
    taskList: [
        { id: 'task-001', title: 'API実装', status: 'in_progress', assignee: 'member-01', priority: 'high', createdAt: '2025-01-31T09:00:00Z' },
        { id: 'task-002', title: 'テスト作成', status: 'pending', assignee: 'member-02', priority: 'medium', createdAt: '2025-01-31T10:00:00Z' },
    ],
};

describe('formatDashboard', () => {
    describe('メンバー状況セクション', () => {
        it('メンバー状況が正しく表示される', () => {
            const result: GetDashboardResult = {
                success: true,
                dashboard: mockDashboard,
            };
            const output = formatDashboard(result);

            expect(output).toContain('## 👥 メンバー状況');
            expect(output).toContain('| leader | working | 設計レビュー | 2025-01-31 21:00:00 JST |');
            expect(output).toContain('| member-01 | idle | - | 2025-01-31 20:50:00 JST |');
            expect(output).toContain('| member-02 | offline | - | - |');
        });

        it('currentTask がない場合は - が表示される', () => {
            const dashboardWithoutTask: Dashboard = {
                ...mockDashboard,
                memberStatus: {
                    leader: { status: 'idle' },
                    'member-01': { status: 'offline' },
                    'member-02': { status: 'offline' },
                },
            };
            const result: GetDashboardResult = {
                success: true,
                dashboard: dashboardWithoutTask,
            };
            const output = formatDashboard(result);

            expect(output).toContain('| leader | idle | - | - |');
        });
    });

    describe('タスク一覧セクション', () => {
        it('タスク一覧が正しく表示される', () => {
            const result: GetDashboardResult = {
                success: true,
                dashboard: mockDashboard,
            };
            const output = formatDashboard(result);

            expect(output).toContain('## 📋 タスク一覧');
            expect(output).toContain('| task-001 | API実装 | member-01 | 実装 | in_progress | high |');
            expect(output).toContain('| task-002 | テスト作成 | member-02 | 実装 | pending | medium |');
        });

        it('タスク一覧が空の場合は「タスクはありません」と表示される', () => {
            const emptyTaskList: Dashboard = {
                ...mockDashboard,
                taskList: [],
            };
            const result: GetDashboardResult = {
                success: true,
                dashboard: emptyTaskList,
            };
            const output = formatDashboard(result);

            expect(output).toContain('タスクはありません');
        });

        it('完了タスクは一覧から除外される', () => {
            const dashboardWithCompleted: Dashboard = {
                ...mockDashboard,
                taskList: [
                    { id: 'task-001', title: 'API実装', status: 'in_progress', assignee: 'member-01', priority: 'high', createdAt: '2025-01-31T09:00:00Z' },
                    { id: 'task-002', title: '完了タスク', status: 'completed', assignee: 'member-02', priority: 'medium', createdAt: '2025-01-31T10:00:00Z' },
                    { id: 'task-003', title: '保留タスク', status: 'pending', assignee: 'member-01', priority: 'low', createdAt: '2025-01-31T11:00:00Z' },
                ],
            };
            const result: GetDashboardResult = {
                success: true,
                dashboard: dashboardWithCompleted,
            };
            const output = formatDashboard(result);

            expect(output).toContain('| task-001 | API実装 | member-01 | 実装 | in_progress | high |');
            expect(output).toContain('| task-003 | 保留タスク | member-01 | 実装 | pending | low |');
            expect(output).not.toContain('完了タスク');
            expect(output).not.toContain('task-002');
        });

        it('タスクが10件を超える場合、残り件数が表示される', () => {
            const manyTasks: Dashboard = {
                ...mockDashboard,
                taskList: Array.from({ length: 15 }, (_, i) => ({
                    id: `task-${String(i + 1).padStart(3, '0')}`,
                    title: `タスク${i + 1}`,
                    status: 'pending' as const,
                    assignee: 'member-01',
                    priority: 'medium' as const,
                    createdAt: '2025-01-31T09:00:00Z',
                })),
            };
            const result: GetDashboardResult = {
                success: true,
                dashboard: manyTasks,
            };
            const output = formatDashboard(result);

            // 先頭10件は表示される
            expect(output).toContain('| task-001 | タスク1 |');
            expect(output).toContain('| task-010 | タスク10 |');
            // 11件目以降は表示されない
            expect(output).not.toContain('task-011');
            // 残り件数が表示される
            expect(output).toContain('（他 5 件）');
        });

        it('タスクがちょうど10件の場合、残り件数は表示されない', () => {
            const exactlyTenTasks: Dashboard = {
                ...mockDashboard,
                taskList: Array.from({ length: 10 }, (_, i) => ({
                    id: `task-${String(i + 1).padStart(3, '0')}`,
                    title: `タスク${i + 1}`,
                    status: 'pending' as const,
                    assignee: 'member-01',
                    priority: 'medium' as const,
                    createdAt: '2025-01-31T09:00:00Z',
                })),
            };
            const result: GetDashboardResult = {
                success: true,
                dashboard: exactlyTenTasks,
            };
            const output = formatDashboard(result);

            expect(output).toContain('| task-010 | タスク10 |');
            expect(output).not.toContain('（他');
        });

        it('全てのタスクが完了している場合は「タスクはありません」と表示される', () => {
            const allCompleted: Dashboard = {
                ...mockDashboard,
                taskList: [
                    { id: 'task-001', title: '完了タスク1', status: 'completed', assignee: 'member-01', priority: 'high', createdAt: '2025-01-31T09:00:00Z' },
                    { id: 'task-002', title: '完了タスク2', status: 'completed', assignee: 'member-02', priority: 'medium', createdAt: '2025-01-31T10:00:00Z' },
                ],
            };
            const result: GetDashboardResult = {
                success: true,
                dashboard: allCompleted,
            };
            const output = formatDashboard(result);

            expect(output).toContain('タスクはありません');
        });
    });

    describe('エラーケース', () => {
        it('失敗時はエラーメッセージが表示される', () => {
            const result: GetDashboardResult = {
                success: false,
                error: 'ファイルが見つかりません',
            };
            const output = formatDashboard(result);

            expect(output).toContain('❌ ダッシュボードの取得に失敗しました');
            expect(output).toContain('ファイルが見つかりません');
        });
    });
});

describe('既存データ互換性', () => {
    it('memberStatus がない古い形式のデータでもデフォルト値で補完される', () => {
        // 古い形式のダッシュボード（memberStatus/taskList がない）
        const oldFormatDashboard = {
            projectName: 'old-project',
            lastUpdated: '2025-01-31T12:00:00Z',
            currentPhase: 'implementation' as const,
            tasks: {
                pending: 0,
                inProgress: 0,
                completed: 0,
                blocked: 0,
                total: 0,
            },
            recentActivity: [],
            pendingApprovals: [],
        
        };

        // 互換性補完をシミュレート（getDashboard の処理を再現）
        const dashboard: Dashboard = {
            ...oldFormatDashboard,
            memberStatus: (oldFormatDashboard as any).memberStatus ?? {
                leader: { status: 'offline' as const },
                'member-01': { status: 'offline' as const },
                'member-02': { status: 'offline' as const },
            },
            taskList: (oldFormatDashboard as any).taskList ?? [],
        };

        expect(dashboard.memberStatus).toBeDefined();
        expect(dashboard.memberStatus.leader.status).toBe('offline');
        expect(dashboard.memberStatus['member-01'].status).toBe('offline');
        expect(dashboard.memberStatus['member-02'].status).toBe('offline');
        expect(dashboard.taskList).toEqual([]);
    });

    it('taskList がない古い形式のデータでもデフォルト値で補完される', () => {
        const oldFormatDashboard = {
            projectName: 'old-project',
            lastUpdated: '2025-01-31T12:00:00Z',
            currentPhase: 'implementation' as const,
            tasks: {
                pending: 0,
                inProgress: 0,
                completed: 0,
                blocked: 0,
                total: 0,
            },
            recentActivity: [],
            pendingApprovals: [],
        
            memberStatus: {
                leader: { status: 'working' as const },
                'member-01': { status: 'idle' as const },
                'member-02': { status: 'offline' as const },
            },
            // taskList がない
        };

        const dashboard: Dashboard = {
            ...oldFormatDashboard,
            memberStatus: (oldFormatDashboard as any).memberStatus ?? {
                leader: { status: 'offline' as const },
                'member-01': { status: 'offline' as const },
                'member-02': { status: 'offline' as const },
            },
            taskList: (oldFormatDashboard as any).taskList ?? [],
        };

        expect(dashboard.taskList).toEqual([]);
        expect(dashboard.memberStatus.leader.status).toBe('working');
    });
});

describe('MemberStatus 型', () => {
    it('currentTask は optional', () => {
        const status: MemberStatus = {
            status: 'idle',
        };
        expect(status.currentTask).toBeUndefined();
    });

    it('lastActivity は optional', () => {
        const status: MemberStatus = {
            status: 'working',
            currentTask: {
                id: 'task-001',
                title: 'テスト',
                startedAt: '2025-01-31T12:00:00Z',
            },
        };
        expect(status.lastActivity).toBeUndefined();
    });
});

describe('TaskSummary 型', () => {
    it('必須フィールドが正しく設定される', () => {
        const task: TaskSummary = {
            id: 'task-001',
            title: 'テストタスク',
            status: 'pending',
            assignee: 'member-01',
            priority: 'high',
            createdAt: '2025-01-31T12:00:00Z',
        };

        expect(task.id).toBe('task-001');
        expect(task.title).toBe('テストタスク');
        expect(task.status).toBe('pending');
        expect(task.assignee).toBe('member-01');
        expect(task.priority).toBe('high');
        expect(task.createdAt).toBe('2025-01-31T12:00:00Z');
    });
});

describe('タスク一覧のソート', () => {
    it('優先度順 > 作成日時順（新しい順）でソートされる', () => {
        const tasks: TaskSummary[] = [
            { id: '1', title: 'Low Task', status: 'pending', assignee: 'member-01', priority: 'low', createdAt: '2025-01-31T10:00:00Z' },
            { id: '2', title: 'High Task 1', status: 'pending', assignee: 'member-01', priority: 'high', createdAt: '2025-01-31T09:00:00Z' },
            { id: '3', title: 'Medium Task', status: 'pending', assignee: 'member-01', priority: 'medium', createdAt: '2025-01-31T11:00:00Z' },
            { id: '4', title: 'High Task 2', status: 'pending', assignee: 'member-01', priority: 'high', createdAt: '2025-01-31T12:00:00Z' },
        ];

        const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        const sorted = [...tasks].sort((a, b) => {
            const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (priorityDiff !== 0) return priorityDiff;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        // high が先
        expect(sorted[0].priority).toBe('high');
        expect(sorted[1].priority).toBe('high');
        // high 内では新しい順
        expect(sorted[0].id).toBe('4'); // 12:00
        expect(sorted[1].id).toBe('2'); // 09:00
        // medium が次
        expect(sorted[2].priority).toBe('medium');
        // low が最後
        expect(sorted[3].priority).toBe('low');
    });
});

describe('formatTimestampJST', () => {
    it('UTC時刻をJSTに変換する', () => {
        expect(formatTimestampJST('2025-01-31T12:00:00Z')).toBe('2025-01-31 21:00:00 JST');
    });

    it('ミリ秒付きのISO形式も正しく変換する', () => {
        expect(formatTimestampJST('2025-01-31T12:00:00.000Z')).toBe('2025-01-31 21:00:00 JST');
    });

    it('空文字列の場合は - を返す', () => {
        expect(formatTimestampJST('')).toBe('-');
    });

    it('undefinedの場合は - を返す', () => {
        expect(formatTimestampJST(undefined)).toBe('-');
    });

    it('無効な文字列の場合は - を返す', () => {
        expect(formatTimestampJST('invalid-date')).toBe('-');
    });

    it('タイムゾーンなしのISO形式も変換する', () => {
        // タイムゾーンなしはローカル時刻として解釈されるが、JSTで出力される
        const result = formatTimestampJST('2025-01-31T12:00:00');
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} JST$/);
    });
});

describe('generateDashboardText (ANSI output)', () => {
    beforeEach(() => {
        mockGetMemberRoles.mockReturnValue(['member-01', 'member-02']);
    });

    afterEach(() => {
        jest.resetModules();
    });

    const baseDashboard: Dashboard = {
        projectName: 'test-project',
        lastUpdated: '2025-01-31T12:00:00Z',
        currentPhase: 'implementation',
        tasks: {
            pending: 2,
            inProgress: 1,
            completed: 3,
            blocked: 0,
            total: 6,
        },
        recentActivity: [],
        pendingApprovals: [],
    
        memberStatus: {
            leader: { status: 'working', currentTask: { id: 'task-001', title: '設計レビュー', startedAt: '2025-01-31T10:00:00Z' }, lastActivity: '2025-01-31T12:00:00Z' },
            'member-01': { status: 'idle', lastActivity: '2025-01-31T11:50:00Z' },
            'member-02': { status: 'offline' },
        },
        taskList: [
            { id: 'task-001', title: 'API実装', status: 'in_progress', assignee: 'member-01', priority: 'high', createdAt: '2025-01-31T09:00:00Z' },
            { id: 'task-002', title: 'テスト作成', status: 'pending', assignee: 'member-02', priority: 'medium', createdAt: '2025-01-31T10:00:00Z' },
        ],
    };

    it('Markdown形式のテーブルが含まれる', async () => {
        const { generateDashboardText } = await import('../utils/queue.js');
        const output = generateDashboardText(baseDashboard);

        expect(output).toContain('|');
        expect(output).toContain('|--------|');
        expect(output).toContain('## Tasks');
        expect(output).toContain('## Member Status');
    });

    it('Markdownヘッダーとプロジェクト情報が含まれる', async () => {
        const { generateDashboardText } = await import('../utils/queue.js');
        const output = generateDashboardText(baseDashboard);

        expect(output).toContain('# Dev Team Dashboard');
        expect(output).toContain('**Project:**');
    });

    it('メンバーステータスがテーブルに含まれる', async () => {
        const { generateDashboardText } = await import('../utils/queue.js');
        const output = generateDashboardText(baseDashboard);

        expect(output).toContain('working');
        expect(output).toContain('idle');
    });

    it('プロジェクト情報が含まれる', async () => {
        const { generateDashboardText } = await import('../utils/queue.js');
        const output = generateDashboardText(baseDashboard);

        expect(output).toContain('test-project');
        expect(output).toContain('implementation');
    });

    it('タスクがない場合は No active tasks が表示される', async () => {
        const { generateDashboardText } = await import('../utils/queue.js');
        const emptyDashboard: Dashboard = {
            ...baseDashboard,
            taskList: [],
        };
        const output = generateDashboardText(emptyDashboard);

        expect(output).toContain('No active tasks.');
    });

    it('承認待ちがある場合にMarkdownで表示される', async () => {
        const { generateDashboardText } = await import('../utils/queue.js');
        const withApproval: Dashboard = {
            ...baseDashboard,
            pendingApprovals: [{
                id: 'approval-1',
                title: 'テスト承認',
                description: '説明',
                requestedBy: 'leader',
                requestedAt: '2025-01-31T12:00:00Z',
                type: 'design',
                status: 'pending',
            }],
        };
        const output = generateDashboardText(withApproval);

        expect(output).toContain('## Pending Approvals');
        expect(output).toContain('**テスト承認**');
    });
});
