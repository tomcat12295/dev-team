import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock fs/promises
jest.unstable_mockModule('fs/promises', () => ({
    readFile: jest.fn<() => Promise<string>>(),
}));

// Mock queue module
jest.unstable_mockModule('../utils/queue.js', () => ({
    getDevTeamPath: jest.fn<() => string>(),
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
}));

describe('get-backlog', () => {
    let getBacklog: typeof import('../tools/get-backlog.js').getBacklog;
    let formatGetBacklogResult: typeof import('../tools/get-backlog.js').formatGetBacklogResult;

    let mockReadFile: jest.MockedFunction<() => Promise<string>>;
    let mockGetDevTeamPath: jest.MockedFunction<() => string>;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Get mocked modules
        const fsModule = await import('fs/promises');
        const queueModule = await import('../utils/queue.js');

        mockReadFile = fsModule.readFile as unknown as typeof mockReadFile;
        mockGetDevTeamPath = queueModule.getDevTeamPath as unknown as typeof mockGetDevTeamPath;

        // Default mock setup
        mockGetDevTeamPath.mockReturnValue('/test/path/.dev-team');

        // Import the module under test
        const getBacklogModule = await import('../tools/get-backlog.js');
        getBacklog = getBacklogModule.getBacklog;
        formatGetBacklogResult = getBacklogModule.formatGetBacklogResult;
    });


    describe('getBacklog', () => {
        it('should return tasks from backlog file', async () => {
            const mockBacklog = {
                tasks: [
                    {
                        id: 'backlog-1',
                        title: 'Task 1',
                        description: 'Description 1',
                        priority: 'medium',
                        createdAt: '2025-01-01T00:00:00.000Z',
                        createdBy: 'pm',
                    },
                ],
                lastUpdated: '2025-01-01T00:00:00.000Z',
            };
            mockReadFile.mockResolvedValue(JSON.stringify(mockBacklog));

            const result = await getBacklog();

            expect(result.success).toBe(true);
            expect(result.tasks).toHaveLength(1);
            expect(result.tasks[0].id).toBe('backlog-1');
            expect(result.tasks[0].title).toBe('Task 1');
        });

        it('should return empty array when backlog is empty', async () => {
            const mockBacklog = {
                tasks: [],
                lastUpdated: '2025-01-01T00:00:00.000Z',
            };
            mockReadFile.mockResolvedValue(JSON.stringify(mockBacklog));

            const result = await getBacklog();

            expect(result.success).toBe(true);
            expect(result.tasks).toHaveLength(0);
        });

        it('should sort tasks by priority (high -> medium -> low)', async () => {
            const mockBacklog = {
                tasks: [
                    {
                        id: 'backlog-1',
                        title: 'Low Priority',
                        description: 'Desc',
                        priority: 'low',
                        createdAt: '2025-01-01T00:00:00.000Z',
                        createdBy: 'pm',
                    },
                    {
                        id: 'backlog-2',
                        title: 'High Priority',
                        description: 'Desc',
                        priority: 'high',
                        createdAt: '2025-01-01T00:00:00.000Z',
                        createdBy: 'pm',
                    },
                    {
                        id: 'backlog-3',
                        title: 'Medium Priority',
                        description: 'Desc',
                        priority: 'medium',
                        createdAt: '2025-01-01T00:00:00.000Z',
                        createdBy: 'pm',
                    },
                ],
                lastUpdated: '2025-01-01T00:00:00.000Z',
            };
            mockReadFile.mockResolvedValue(JSON.stringify(mockBacklog));

            const result = await getBacklog();

            expect(result.success).toBe(true);
            expect(result.tasks).toHaveLength(3);
            expect(result.tasks[0].priority).toBe('high');
            expect(result.tasks[1].priority).toBe('medium');
            expect(result.tasks[2].priority).toBe('low');
        });

        it('should return empty array when file does not exist', async () => {
            mockReadFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

            const result = await getBacklog();

            expect(result.success).toBe(true);
            expect(result.tasks).toHaveLength(0);
        });
    });

    describe('formatGetBacklogResult', () => {
        it('should format result with tasks', () => {
            const result = formatGetBacklogResult({
                success: true,
                tasks: [
                    {
                        id: 'backlog-1',
                        title: 'Task 1',
                        description: 'Description 1',
                        priority: 'high',
                        createdAt: '2025-01-01T00:00:00.000Z',
                        createdBy: 'pm',
                    },
                    {
                        id: 'backlog-2',
                        title: 'Task 2',
                        description: 'Description 2',
                        priority: 'medium',
                        createdAt: '2025-01-01T00:00:00.000Z',
                        createdBy: 'pm',
                    },
                ],
            });

            expect(result).toContain('バックログ: 2件');
            expect(result).toContain('[high] Task 1');
            expect(result).toContain('Description 1');
            expect(result).toContain('backlog-1');
            expect(result).toContain('[medium] Task 2');
        });

        it('should format empty backlog message', () => {
            const result = formatGetBacklogResult({
                success: true,
                tasks: [],
            });

            expect(result).toContain('バックログは空です');
        });

        it('should format error result', () => {
            const result = formatGetBacklogResult({
                success: false,
                tasks: [],
                error: 'Something went wrong',
            });

            expect(result).toContain('失敗');
            expect(result).toContain('Something went wrong');
        });
    });
});
