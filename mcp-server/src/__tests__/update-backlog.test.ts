import { jest, describe, test, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { updateBacklog } from '../tools/update-backlog.js';

// Set up test environment
const TEST_PROJECT_PATH = path.join(process.cwd(), 'test-temp-update-backlog');

beforeAll(async () => {
    process.env.DEV_TEAM_PROJECT_PATH = TEST_PROJECT_PATH;
    process.env.DEV_TEAM_ROLE = 'pm'; // PM only can update backlog
});

beforeEach(async () => {
    // Create fresh test directory structure
    const devTeamPath = path.join(TEST_PROJECT_PATH, '.dev-team');
    await fs.mkdir(path.join(devTeamPath, 'status'), { recursive: true });

    // Initialize dashboard.json for addActivity
    const dashboardPath = path.join(devTeamPath, 'status', 'dashboard.json');
    await fs.writeFile(dashboardPath, JSON.stringify({
        projectName: 'test',
        lastUpdated: new Date().toISOString(),
        currentPhase: 'planning',
        tasks: { pending: 0, inProgress: 0, completed: 0, blocked: 0, total: 0 },
        recentActivity: [],
        pendingApprovals: [],

        memberStatus: {
            leader: { status: 'idle', lastActivity: new Date().toISOString() },
            'member-01': { status: 'idle', lastActivity: new Date().toISOString() },
            'member-02': { status: 'idle', lastActivity: new Date().toISOString() },
        },
        taskList: [],
    }, null, 2), 'utf-8');
});

afterEach(async () => {
    // Clean up test directory
    try {
        await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
    } catch {
        // Ignore cleanup errors
    }
});

interface BacklogTask {
    id: string;
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    createdAt: string;
    createdBy: string;
    status?: string;
    completedAt?: string;
}

interface BacklogFile {
    tasks: BacklogTask[];
    lastUpdated: string;
}

async function writeBacklog(tasks: BacklogTask[]): Promise<void> {
    const backlogPath = path.join(TEST_PROJECT_PATH, '.dev-team', 'backlog.json');
    const backlog: BacklogFile = {
        tasks,
        lastUpdated: new Date().toISOString(),
    };
    await fs.writeFile(backlogPath, JSON.stringify(backlog, null, 2), 'utf-8');
}

async function readBacklog(): Promise<BacklogFile> {
    const backlogPath = path.join(TEST_PROJECT_PATH, '.dev-team', 'backlog.json');
    const content = await fs.readFile(backlogPath, 'utf-8');
    return JSON.parse(content) as BacklogFile;
}

function createTestTask(id: string): BacklogTask {
    return {
        id,
        title: `Task ${id}`,
        description: `Description for ${id}`,
        priority: 'medium',
        createdAt: new Date().toISOString(),
        createdBy: 'pm',
    };
}

describe('updateBacklog', () => {
    test('タスクをcompletedに更新できる', async () => {
        // Setup
        const task = createTestTask('backlog-123');
        await writeBacklog([task]);

        // Execute
        const result = await updateBacklog({
            task_id: 'backlog-123',
            status: 'completed',
        });

        // Verify
        expect(result.success).toBe(true);
        expect(result.task?.status).toBe('completed');
        expect(result.task?.completedAt).toBeDefined();

        // Verify file was updated
        const backlog = await readBacklog();
        expect(backlog.tasks[0].status).toBe('completed');
        expect(backlog.tasks[0].completedAt).toBeDefined();
    });

    test('タスクをcancelledに更新できる', async () => {
        // Setup
        const task = createTestTask('backlog-456');
        await writeBacklog([task]);

        // Execute
        const result = await updateBacklog({
            task_id: 'backlog-456',
            status: 'cancelled',
        });

        // Verify
        expect(result.success).toBe(true);
        expect(result.task?.status).toBe('cancelled');
        expect(result.task?.completedAt).toBeDefined();
    });

    test('存在しないタスクIDでエラーを返す', async () => {
        // Setup
        await writeBacklog([createTestTask('backlog-123')]);
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Execute
        const result = await updateBacklog({
            task_id: 'backlog-nonexistent',
            status: 'completed',
        });

        // Verify
        expect(result.success).toBe(false);
        expect(result.error).toContain('見つかりません');

        // Restore
        consoleSpy.mockRestore();
    });

    test('task_idが空の場合エラーを返す', async () => {
        // Execute
        const result = await updateBacklog({
            task_id: '',
            status: 'completed',
        });

        // Verify
        expect(result.success).toBe(false);
        expect(result.error).toContain('task_id');
    });

    test('statusが無効な場合エラーを返す', async () => {
        // Execute
        const result = await updateBacklog({
            task_id: 'backlog-123',
            status: 'invalid' as 'completed',
        });

        // Verify
        expect(result.success).toBe(false);
        expect(result.error).toContain('status');
    });

    test('PM以外はエラーを返す', async () => {
        // Setup
        process.env.DEV_TEAM_ROLE = 'leader';
        const task = createTestTask('backlog-123');
        await writeBacklog([task]);

        // Execute
        const result = await updateBacklog({
            task_id: 'backlog-123',
            status: 'completed',
        });

        // Verify
        expect(result.success).toBe(false);
        expect(result.error).toContain('PMのみ');

        // Restore
        process.env.DEV_TEAM_ROLE = 'pm';
    });
});
