import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Role } from '../types/task.js';

// Mock queue module
jest.unstable_mockModule('../utils/queue.js', () => ({
    getDevTeamPath: jest.fn<() => string>(),
    generateId: jest.fn<() => Promise<string>>(),
    addActivity: jest.fn<() => Promise<void>>(),
}));

// Mock permission module
jest.unstable_mockModule('../utils/permission.js', () => ({
    getCurrentRole: jest.fn<() => Role>(),
}));

// Mock file-lock module
jest.unstable_mockModule('../utils/file-lock.js', () => ({
    withFileLock: jest.fn<(path: string, fn: () => Promise<void>) => Promise<void>>(),
    ensureFileExists: jest.fn<() => Promise<void>>(),
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
}));

// Mock fs/promises
jest.unstable_mockModule('fs/promises', () => ({
    readFile: jest.fn<(path: string, encoding: string) => Promise<string>>(),
    writeFile: jest.fn<(path: string, content: string, encoding: string) => Promise<void>>(),
}));

describe('add-backlog', () => {
    let addBacklog: typeof import('../tools/add-backlog.js').addBacklog;
    let formatAddBacklogResult: typeof import('../tools/add-backlog.js').formatAddBacklogResult;

    let mockGetDevTeamPath: jest.MockedFunction<() => string>;
    let mockGenerateId: jest.MockedFunction<() => Promise<string>>;
    let mockAddActivity: jest.MockedFunction<() => Promise<void>>;
    let mockGetCurrentRole: jest.MockedFunction<() => Role>;
    let mockWithFileLock: jest.MockedFunction<(path: string, fn: () => Promise<void>) => Promise<void>>;
    let mockEnsureFileExists: jest.MockedFunction<() => Promise<void>>;
    let mockReadFile: jest.MockedFunction<(path: string, encoding: string) => Promise<string>>;
    let mockWriteFile: jest.MockedFunction<(path: string, content: string, encoding: string) => Promise<void>>;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Get mocked modules
        const queueModule = await import('../utils/queue.js');
        const permissionModule = await import('../utils/permission.js');
        const fileLockModule = await import('../utils/file-lock.js');
        const fsModule = await import('fs/promises');

        mockGetDevTeamPath = queueModule.getDevTeamPath as unknown as typeof mockGetDevTeamPath;
        mockGenerateId = queueModule.generateId as unknown as typeof mockGenerateId;
        mockAddActivity = queueModule.addActivity as unknown as typeof mockAddActivity;
        mockGetCurrentRole = permissionModule.getCurrentRole as unknown as typeof mockGetCurrentRole;
        mockWithFileLock = fileLockModule.withFileLock as unknown as typeof mockWithFileLock;
        mockEnsureFileExists = fileLockModule.ensureFileExists as unknown as typeof mockEnsureFileExists;
        mockReadFile = fsModule.readFile as unknown as typeof mockReadFile;
        mockWriteFile = fsModule.writeFile as unknown as typeof mockWriteFile;

        // Default mock implementations
        mockGetDevTeamPath.mockReturnValue('/test/.dev-team');
        mockGenerateId.mockResolvedValue('1234567890-abc123');
        mockAddActivity.mockResolvedValue(undefined);
        mockEnsureFileExists.mockResolvedValue(undefined);
        mockReadFile.mockResolvedValue(JSON.stringify({ tasks: [], lastUpdated: '' }));
        mockWriteFile.mockResolvedValue(undefined);
        mockWithFileLock.mockImplementation(async (_path, fn) => {
            await fn();
        });

        // Import the module under test
        const addBacklogModule = await import('../tools/add-backlog.js');
        addBacklog = addBacklogModule.addBacklog;
        formatAddBacklogResult = addBacklogModule.formatAddBacklogResult;
    });


    describe('addBacklog', () => {
        it('should add task when called by PM', async () => {
            mockGetCurrentRole.mockReturnValue('pm');

            const result = await addBacklog({
                title: 'Test Task',
                description: 'Test Description',
            });

            expect(result.success).toBe(true);
            expect(result.taskId).toContain('backlog-');
            expect(mockEnsureFileExists).toHaveBeenCalled();
            expect(mockWithFileLock).toHaveBeenCalled();
            expect(mockAddActivity).toHaveBeenCalled();
        });

        it('should add task with specified priority', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            let savedContent = '';
            mockWriteFile.mockImplementation(async (_path, content) => {
                savedContent = content as string;
            });

            const result = await addBacklog({
                title: 'High Priority Task',
                description: 'Urgent task',
                priority: 'high',
            });

            expect(result.success).toBe(true);
            expect(savedContent).toContain('"priority": "high"');
        });

        it('should reject when called by non-PM', async () => {
            mockGetCurrentRole.mockReturnValue('leader');

            const result = await addBacklog({
                title: 'Test Task',
                description: 'Test Description',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('PMのみ');
        });

        it('should reject when title is empty', async () => {
            mockGetCurrentRole.mockReturnValue('pm');

            const result = await addBacklog({
                title: '',
                description: 'Test Description',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('title');
        });

        it('should reject when description is empty', async () => {
            mockGetCurrentRole.mockReturnValue('pm');

            const result = await addBacklog({
                title: 'Test Task',
                description: '',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('description');
        });

        it('should use default priority medium when not specified', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            let savedContent = '';
            mockWriteFile.mockImplementation(async (_path, content) => {
                savedContent = content as string;
            });

            const result = await addBacklog({
                title: 'Default Priority Task',
                description: 'Task without priority',
            });

            expect(result.success).toBe(true);
            expect(savedContent).toContain('"priority": "medium"');
        });
    });

    describe('formatAddBacklogResult', () => {
        it('should format success result', () => {
            const result = formatAddBacklogResult({
                success: true,
                taskId: 'backlog-123',
            });

            expect(result).toContain('追加しました');
            expect(result).toContain('Task ID');
            expect(result).toContain('backlog-123');
        });

        it('should format error result', () => {
            const result = formatAddBacklogResult({
                success: false,
                error: 'PMのみが実行できます',
            });

            expect(result).toContain('失敗');
            expect(result).toContain('PMのみが実行できます');
        });
    });
});
