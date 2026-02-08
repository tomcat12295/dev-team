import type { Dashboard, TaskSummary } from '../../types/task.js';

export function createMockDashboard(overrides?: Partial<Dashboard>): Dashboard {
    return {
        projectName: 'test-project',
        lastUpdated: '2026-01-31T12:00:00Z',
        currentPhase: 'implementation',
        tasks: { pending: 0, inProgress: 0, completed: 0, blocked: 0, total: 0 },
        recentActivity: [],
        pendingApprovals: [],

        memberStatus: {
            leader: { status: 'working' },
            'member-01': { status: 'idle' },
            'member-02': { status: 'offline' },
        },
        taskList: [],
        ...overrides,
    };
}

export function createMockTaskSummary(overrides?: Partial<TaskSummary>): TaskSummary {
    return {
        id: 'T-001',
        title: 'テストタスク',
        status: 'pending',
        assignee: 'member-01',
        priority: 'medium',
        createdAt: '2026-01-31T09:00:00Z',
        ...overrides,
    };
}
