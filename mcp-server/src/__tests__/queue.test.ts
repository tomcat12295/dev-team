import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'path';
import type { MessageQueue } from '../types/message.js';

// Mock fs/promises
jest.unstable_mockModule('fs/promises', () => ({
    readFile: jest.fn<() => Promise<string>>(),
    writeFile: jest.fn<() => Promise<void>>(),
    mkdir: jest.fn<() => Promise<string | undefined>>(),
}));

// Mock file-lock - withFileLock executes callback directly
jest.unstable_mockModule('../utils/file-lock.js', () => ({
    withFileLock: jest.fn(
        async <T>(_path: string, operation: () => Promise<T>) => operation()
    ),
    ensureFileExists: jest.fn<() => Promise<void>>(),
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

describe('queue', () => {
    let addMessage: typeof import('../utils/queue.js').addMessage;
    let readQueue: typeof import('../utils/queue.js').readQueue;
    let markMessageRead: typeof import('../utils/queue.js').markMessageRead;
    let clearReadMessages: typeof import('../utils/queue.js').clearReadMessages;
    let getQueuePath: typeof import('../utils/queue.js').getQueuePath;

    // Use jest.MockedFunction for proper typing
    let mockReadFile: jest.MockedFunction<() => Promise<string>>;
    let mockWriteFile: jest.MockedFunction<() => Promise<void>>;

    const TEST_PROJECT_PATH = '/test/project';

    beforeEach(async () => {
        jest.clearAllMocks();

        // Set environment variable
        process.env.DEV_TEAM_PROJECT_PATH = TEST_PROJECT_PATH;

        // Get mocked modules
        const fsModule = await import('fs/promises');
        mockReadFile = fsModule.readFile as unknown as typeof mockReadFile;
        mockWriteFile = fsModule.writeFile as unknown as typeof mockWriteFile;

        // Import the module under test
        const queueModule = await import('../utils/queue.js');
        addMessage = queueModule.addMessage;
        readQueue = queueModule.readQueue;
        markMessageRead = queueModule.markMessageRead;
        clearReadMessages = queueModule.clearReadMessages;
        getQueuePath = queueModule.getQueuePath;
    });

    afterEach(() => {
        delete process.env.DEV_TEAM_PROJECT_PATH;
    });

    describe('getQueuePath', () => {
        it('should return correct path for role', () => {
            const result = getQueuePath('leader');
            expect(path.normalize(result)).toBe(
                path.normalize('/test/project/.dev-team/queue/leader.json')
            );
        });

        it('should return correct path for member roles', () => {
            expect(path.normalize(getQueuePath('member-01'))).toBe(
                path.normalize('/test/project/.dev-team/queue/member-01.json')
            );
            expect(path.normalize(getQueuePath('member-02'))).toBe(
                path.normalize('/test/project/.dev-team/queue/member-02.json')
            );
        });
    });

    describe('readQueue', () => {
        it('should return queue for role', async () => {
            const mockQueue: MessageQueue = {
                role: 'leader',
                messages: [
                    {
                        id: 'msg-1',
                        type: 'task',
                        from: 'pm',
                        to: 'leader',
                        subject: 'Test',
                        content: 'Test content',
                        timestamp: '2026-01-31T00:00:00.000Z',
                        read: false,
                    },
                ],
                lastUpdated: '2026-01-31T00:00:00.000Z',
            };
            mockReadFile.mockResolvedValueOnce(JSON.stringify(mockQueue));

            const result = await readQueue('leader');

            expect(result).toEqual(mockQueue);
            expect(mockReadFile).toHaveBeenCalled();
        });
    });

    describe('addMessage', () => {
        it('should add message to queue', async () => {
            const existingQueue: MessageQueue = {
                role: 'leader',
                messages: [],
                lastUpdated: '2026-01-30T00:00:00.000Z',
            };
            mockReadFile.mockResolvedValueOnce(JSON.stringify(existingQueue));
            mockWriteFile.mockResolvedValueOnce(undefined);

            const newMessage = {
                id: 'msg-new',
                type: 'task' as const,
                from: 'pm' as const,
                to: 'leader' as const,
                subject: 'New Task',
                content: 'New content',
                timestamp: '2026-01-31T00:00:00.000Z',
                read: false,
            };

            await addMessage('leader', newMessage);

            expect(mockWriteFile).toHaveBeenCalled();
            const writeCall = mockWriteFile.mock.calls[0] as unknown as [string, string];
            const writtenQueue = JSON.parse(writeCall[1]) as MessageQueue;
            expect(writtenQueue.messages).toHaveLength(1);
            expect(writtenQueue.messages[0].id).toBe('msg-new');
        });

        it('should update lastUpdated timestamp', async () => {
            const oldTimestamp = '2026-01-30T00:00:00.000Z';
            const existingQueue: MessageQueue = {
                role: 'leader',
                messages: [],
                lastUpdated: oldTimestamp,
            };
            mockReadFile.mockResolvedValueOnce(JSON.stringify(existingQueue));
            mockWriteFile.mockResolvedValueOnce(undefined);

            const newMessage = {
                id: 'msg-new',
                type: 'task' as const,
                from: 'pm' as const,
                to: 'leader' as const,
                subject: 'New Task',
                content: 'New content',
                timestamp: '2026-01-31T00:00:00.000Z',
                read: false,
            };

            await addMessage('leader', newMessage);

            const writeCall = mockWriteFile.mock.calls[0] as unknown as [string, string];
            const writtenQueue = JSON.parse(writeCall[1]) as MessageQueue;
            expect(writtenQueue.lastUpdated).not.toBe(oldTimestamp);
        });
    });

    describe('markMessageRead', () => {
        it('should mark message as read', async () => {
            const existingQueue: MessageQueue = {
                role: 'leader',
                messages: [
                    {
                        id: 'msg-1',
                        type: 'task',
                        from: 'pm',
                        to: 'leader',
                        subject: 'Test',
                        content: 'Test content',
                        timestamp: '2026-01-31T00:00:00.000Z',
                        read: false,
                    },
                ],
                lastUpdated: '2026-01-31T00:00:00.000Z',
            };
            mockReadFile.mockResolvedValueOnce(JSON.stringify(existingQueue));
            mockWriteFile.mockResolvedValueOnce(undefined);

            await markMessageRead('leader', 'msg-1');

            expect(mockWriteFile).toHaveBeenCalled();
            const writeCall = mockWriteFile.mock.calls[0] as unknown as [string, string];
            const writtenQueue = JSON.parse(writeCall[1]) as MessageQueue;
            expect(writtenQueue.messages[0].read).toBe(true);
        });

        it('should not modify queue if message not found', async () => {
            const existingQueue: MessageQueue = {
                role: 'leader',
                messages: [
                    {
                        id: 'msg-1',
                        type: 'task',
                        from: 'pm',
                        to: 'leader',
                        subject: 'Test',
                        content: 'Test content',
                        timestamp: '2026-01-31T00:00:00.000Z',
                        read: false,
                    },
                ],
                lastUpdated: '2026-01-31T00:00:00.000Z',
            };
            mockReadFile.mockResolvedValueOnce(JSON.stringify(existingQueue));

            await markMessageRead('leader', 'non-existent');

            // writeFile should not be called when message not found
            expect(mockWriteFile).not.toHaveBeenCalled();
        });
    });

    describe('clearReadMessages', () => {
        it('should remove read messages', async () => {
            const existingQueue: MessageQueue = {
                role: 'leader',
                messages: [
                    {
                        id: 'msg-1',
                        type: 'task',
                        from: 'pm',
                        to: 'leader',
                        subject: 'Read Message',
                        content: 'Content',
                        timestamp: '2026-01-31T00:00:00.000Z',
                        read: true,
                    },
                    {
                        id: 'msg-2',
                        type: 'task',
                        from: 'pm',
                        to: 'leader',
                        subject: 'Unread Message',
                        content: 'Content',
                        timestamp: '2026-01-31T00:00:00.000Z',
                        read: false,
                    },
                ],
                lastUpdated: '2026-01-31T00:00:00.000Z',
            };
            mockReadFile.mockResolvedValueOnce(JSON.stringify(existingQueue));
            mockWriteFile.mockResolvedValueOnce(undefined);

            await clearReadMessages('leader');

            const writeCall = mockWriteFile.mock.calls[0] as unknown as [string, string];
            const writtenQueue = JSON.parse(writeCall[1]) as MessageQueue;
            expect(writtenQueue.messages).toHaveLength(1);
            expect(writtenQueue.messages[0].id).toBe('msg-2');
        });

        it('should return count of cleared messages', async () => {
            const existingQueue: MessageQueue = {
                role: 'leader',
                messages: [
                    {
                        id: 'msg-1',
                        type: 'task',
                        from: 'pm',
                        to: 'leader',
                        subject: 'Read 1',
                        content: 'Content',
                        timestamp: '2026-01-31T00:00:00.000Z',
                        read: true,
                    },
                    {
                        id: 'msg-2',
                        type: 'task',
                        from: 'pm',
                        to: 'leader',
                        subject: 'Read 2',
                        content: 'Content',
                        timestamp: '2026-01-31T00:00:00.000Z',
                        read: true,
                    },
                    {
                        id: 'msg-3',
                        type: 'task',
                        from: 'pm',
                        to: 'leader',
                        subject: 'Unread',
                        content: 'Content',
                        timestamp: '2026-01-31T00:00:00.000Z',
                        read: false,
                    },
                ],
                lastUpdated: '2026-01-31T00:00:00.000Z',
            };
            mockReadFile.mockResolvedValueOnce(JSON.stringify(existingQueue));
            mockWriteFile.mockResolvedValueOnce(undefined);

            const clearedCount = await clearReadMessages('leader');

            expect(clearedCount).toBe(2);
        });
    });

    describe('edge cases', () => {
        it('should handle empty queue', async () => {
            const emptyQueue: MessageQueue = {
                role: 'leader',
                messages: [],
                lastUpdated: '2026-01-31T00:00:00.000Z',
            };
            mockReadFile.mockResolvedValueOnce(JSON.stringify(emptyQueue));

            const result = await readQueue('leader');

            expect(result.messages).toHaveLength(0);
            expect(result.role).toBe('leader');
        });

        it('should handle large number of messages (100+)', async () => {
            const messages = Array.from({ length: 150 }, (_, i) => ({
                id: `msg-${i}`,
                type: 'task' as const,
                from: 'pm' as const,
                to: 'leader' as const,
                subject: `Task ${i}`,
                content: `Content ${i}`,
                timestamp: '2026-01-31T00:00:00.000Z',
                read: i < 50, // First 50 are read
            }));
            const largeQueue: MessageQueue = {
                role: 'leader',
                messages,
                lastUpdated: '2026-01-31T00:00:00.000Z',
            };
            mockReadFile.mockResolvedValueOnce(JSON.stringify(largeQueue));

            const result = await readQueue('leader');

            expect(result.messages).toHaveLength(150);
        });

        it('should handle invalid JSON gracefully', async () => {
            mockReadFile.mockResolvedValueOnce('invalid json {{{');

            await expect(readQueue('leader')).rejects.toThrow();
        });

        it('should handle fs.readFile error', async () => {
            mockReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file'));

            await expect(readQueue('leader')).rejects.toThrow('ENOENT');
        });
    });
});

describe('generateMessageId', () => {
    let generateMessageId: typeof import('../utils/queue.js').generateMessageId;

    beforeEach(async () => {
        jest.clearAllMocks();
        const queueModule = await import('../utils/queue.js');
        generateMessageId = queueModule.generateMessageId;
    });

    it('should return ID in M-timestamp-random format', () => {
        const id = generateMessageId();

        // Format: M-{timestamp}-{random5chars}
        expect(id).toMatch(/^M-\d+-[a-z0-9]{5}$/);
    });

    it('should start with M- prefix', () => {
        const id = generateMessageId();

        expect(id.startsWith('M-')).toBe(true);
    });

    it('should generate unique IDs on multiple calls', () => {
        const ids = new Set<string>();
        for (let i = 0; i < 100; i++) {
            ids.add(generateMessageId());
        }

        // All 100 IDs should be unique
        expect(ids.size).toBe(100);
    });

    it('should contain a valid timestamp', () => {
        const before = Date.now();
        const id = generateMessageId();
        const after = Date.now();

        // Extract timestamp from ID
        const parts = id.split('-');
        const timestamp = parseInt(parts[1], 10);

        expect(timestamp).toBeGreaterThanOrEqual(before);
        expect(timestamp).toBeLessThanOrEqual(after);
    });
});

describe('createDefaultMemberStatus', () => {
    let getDashboard: typeof import('../utils/queue.js').getDashboard;
    let mockReadFile: jest.MockedFunction<() => Promise<string>>;
    let mockWriteFile: jest.MockedFunction<() => Promise<void>>;

    const TEST_PROJECT_PATH = '/test/project';

    beforeEach(async () => {
        jest.clearAllMocks();

        // Set environment variable
        process.env.DEV_TEAM_PROJECT_PATH = TEST_PROJECT_PATH;

        // Get mocked modules
        const fsModule = await import('fs/promises');
        mockReadFile = fsModule.readFile as unknown as typeof mockReadFile;
        mockWriteFile = fsModule.writeFile as unknown as typeof mockWriteFile;

        // Import the module under test
        const queueModule = await import('../utils/queue.js');
        getDashboard = queueModule.getDashboard;
    });

    afterEach(() => {
        delete process.env.DEV_TEAM_PROJECT_PATH;
    });

    it('デフォルトステータスがidleになる（memberStatusがない場合）', async () => {
        // memberStatusを含まないダッシュボードデータ
        const dashboardWithoutMemberStatus = {
            projectName: 'test-project',
            lastUpdated: '2026-01-31T12:00:00Z',
            currentPhase: 'implementation',
            tasks: {
                pending: 0,
                inProgress: 0,
                completed: 0,
                blocked: 0,
                total: 0,
            },
            recentActivity: [],
            pendingApprovals: [],

            taskList: [],
            // memberStatus は意図的に省略
        };
        mockReadFile.mockResolvedValueOnce(JSON.stringify(dashboardWithoutMemberStatus));
        mockWriteFile.mockResolvedValueOnce(undefined);

        const result = await getDashboard({ readOnly: true });

        // デフォルトステータスが'idle'であることを確認
        expect(result.memberStatus).toBeDefined();
        expect(result.memberStatus.leader.status).toBe('idle');
        expect(result.memberStatus['member-01'].status).toBe('idle');
        expect(result.memberStatus['member-02'].status).toBe('idle');
    });

    it('既存のmemberStatusがある場合はそのまま使用される', async () => {
        const dashboardWithMemberStatus = {
            projectName: 'test-project',
            lastUpdated: '2026-01-31T12:00:00Z',
            currentPhase: 'implementation',
            tasks: {
                pending: 0,
                inProgress: 0,
                completed: 0,
                blocked: 0,
                total: 0,
            },
            recentActivity: [],
            pendingApprovals: [],

            taskList: [],
            memberStatus: {
                leader: { status: 'working' },
                'member-01': { status: 'working' },
                'member-02': { status: 'offline' },
            },
        };
        mockReadFile.mockResolvedValueOnce(JSON.stringify(dashboardWithMemberStatus));
        mockWriteFile.mockResolvedValueOnce(undefined);

        const result = await getDashboard({ readOnly: true });

        // 既存のステータスがそのまま使用される
        expect(result.memberStatus.leader.status).toBe('working');
        expect(result.memberStatus['member-01'].status).toBe('working');
        expect(result.memberStatus['member-02'].status).toBe('offline');
    });
});
