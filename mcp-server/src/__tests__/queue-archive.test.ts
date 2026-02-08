import * as fs from 'fs/promises';
import * as path from 'path';
import { archiveReadMessages, getQueuePath, getDevTeamPath } from '../utils/queue.js';
import { Message, MessageQueue } from '../types/message.js';

// Set up test environment
const TEST_PROJECT_PATH = path.join(process.cwd(), 'test-temp-archive');

beforeAll(async () => {
    process.env.DEV_TEAM_PROJECT_PATH = TEST_PROJECT_PATH;
});

beforeEach(async () => {
    // Create fresh test directory structure
    const devTeamPath = path.join(TEST_PROJECT_PATH, '.dev-team');
    await fs.mkdir(path.join(devTeamPath, 'queue'), { recursive: true });
    await fs.mkdir(path.join(devTeamPath, 'status'), { recursive: true });
});

afterEach(async () => {
    // Clean up test directory
    try {
        await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
    } catch {
        // Ignore cleanup errors
    }
});

function createTestMessage(id: string, read: boolean): Message {
    return {
        id,
        type: 'task',
        from: 'leader',
        to: 'pm',
        subject: `Test message ${id}`,
        content: `Content for ${id}`,
        timestamp: new Date().toISOString(),
        read,
    };
}

async function writeQueue(role: string, messages: Message[]): Promise<void> {
    const queuePath = getQueuePath(role as 'pm');
    const queue: MessageQueue = {
        role: role as 'pm',
        messages,
        lastUpdated: new Date().toISOString(),
    };
    await fs.writeFile(queuePath, JSON.stringify(queue, null, 2), 'utf-8');
}

async function readQueue(role: string): Promise<MessageQueue> {
    const queuePath = getQueuePath(role as 'pm');
    const content = await fs.readFile(queuePath, 'utf-8');
    return JSON.parse(content) as MessageQueue;
}

describe('archiveReadMessages', () => {
    test('既読メッセージが正しくアーカイブされる', async () => {
        // Setup: Create queue with mixed read/unread messages
        const messages = [
            createTestMessage('msg-1', true),  // read
            createTestMessage('msg-2', false), // unread
            createTestMessage('msg-3', true),  // read
        ];
        await writeQueue('pm', messages);

        // Execute
        const result = await archiveReadMessages('pm');

        // Verify
        expect(result.archivedCount).toBe(2);
        // Use path.join for cross-platform compatibility
        expect(result.archivePath).toContain(path.join('.dev-team', 'archive', 'queue', 'pm'));
        expect(result.archivePath).toMatch(/\d{4}-\d{2}-\d{2}\.json$/);

        // Check archive file
        const archiveContent = await fs.readFile(result.archivePath, 'utf-8');
        const archive = JSON.parse(archiveContent);
        expect(archive.role).toBe('pm');
        expect(archive.messages).toHaveLength(2);
        expect(archive.messages.map((m: Message) => m.id)).toContain('msg-1');
        expect(archive.messages.map((m: Message) => m.id)).toContain('msg-3');
    });

    test('アーカイブディレクトリが自動作成される', async () => {
        // Setup
        await writeQueue('pm', [createTestMessage('msg-1', true)]);

        // Execute
        const result = await archiveReadMessages('pm');

        // Verify directory was created
        const archiveDir = path.dirname(result.archivePath);
        const stat = await fs.stat(archiveDir);
        expect(stat.isDirectory()).toBe(true);
    });

    test('同日複数回呼び出しでマージされる', async () => {
        // First archive
        await writeQueue('pm', [createTestMessage('msg-1', true)]);
        const result1 = await archiveReadMessages('pm');
        expect(result1.archivedCount).toBe(1);

        // Second archive (same day)
        await writeQueue('pm', [createTestMessage('msg-2', true)]);
        const result2 = await archiveReadMessages('pm');
        expect(result2.archivedCount).toBe(1);

        // Verify both messages are in the same archive file
        expect(result1.archivePath).toBe(result2.archivePath);
        const archiveContent = await fs.readFile(result2.archivePath, 'utf-8');
        const archive = JSON.parse(archiveContent);
        expect(archive.messages).toHaveLength(2);
        expect(archive.messages.map((m: Message) => m.id)).toContain('msg-1');
        expect(archive.messages.map((m: Message) => m.id)).toContain('msg-2');
    });

    test('重複メッセージは無視される', async () => {
        // First archive
        await writeQueue('pm', [createTestMessage('msg-1', true)]);
        await archiveReadMessages('pm');

        // Try to archive same message ID again
        await writeQueue('pm', [createTestMessage('msg-1', true)]);
        const result = await archiveReadMessages('pm');

        // Verify duplicate was ignored
        expect(result.archivedCount).toBe(0);

        const archiveContent = await fs.readFile(result.archivePath, 'utf-8');
        const archive = JSON.parse(archiveContent);
        expect(archive.messages).toHaveLength(1);
    });

    test('元のキューから既読メッセージが削除される', async () => {
        // Setup
        const messages = [
            createTestMessage('msg-1', true),  // read
            createTestMessage('msg-2', false), // unread
            createTestMessage('msg-3', true),  // read
        ];
        await writeQueue('pm', messages);

        // Execute
        await archiveReadMessages('pm');

        // Verify queue only has unread message
        const queue = await readQueue('pm');
        expect(queue.messages).toHaveLength(1);
        expect(queue.messages[0].id).toBe('msg-2');
        expect(queue.messages[0].read).toBe(false);
    });

    test('既読メッセージがない場合は何もしない', async () => {
        // Setup: Only unread messages
        await writeQueue('pm', [createTestMessage('msg-1', false)]);

        // Execute
        const result = await archiveReadMessages('pm');

        // Verify
        expect(result.archivedCount).toBe(0);
    });
});
