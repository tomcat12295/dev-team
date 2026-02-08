import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import type { Message } from '../../types/message.js';
import type { Role } from '../../types/task.js';

describe('Queue Integration Tests', () => {
    let testDir: string;

    beforeAll(async () => {
        // Create temporary directory
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-team-test-'));
        process.env.DEV_TEAM_PROJECT_PATH = testDir;

        // Create necessary directory structure
        await fs.mkdir(path.join(testDir, '.dev-team', 'queue'), { recursive: true });
        await fs.mkdir(path.join(testDir, '.dev-team', 'status'), { recursive: true });
    });

    afterAll(async () => {
        // Cleanup
        await fs.rm(testDir, { recursive: true, force: true });
        delete process.env.DEV_TEAM_PROJECT_PATH;
    });

    beforeEach(() => {
        // Clear module cache between tests
        jest.resetModules();
    });

    function createTestMessage(overrides: Partial<Message> = {}): Message {
        return {
            id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'task',
            from: 'pm',
            to: 'leader',
            subject: 'Test Message',
            content: 'Test content',
            timestamp: new Date().toISOString(),
            read: false,
            ...overrides,
        };
    }

    describe('addMessage and readQueue integration', () => {
        it('should add message and read it back', async () => {
            const queueModule = await import('../../utils/queue.js');
            await queueModule.ensureDevTeamStructure();

            const message = createTestMessage({
                id: 'integration-test-msg-1',
                subject: 'Integration Test Message',
            });

            await queueModule.addMessage('leader', message);

            const queue = await queueModule.readQueue('leader');

            expect(queue.role).toBe('leader');
            expect(queue.messages.some(m => m.id === 'integration-test-msg-1')).toBe(true);
            const foundMessage = queue.messages.find(m => m.id === 'integration-test-msg-1');
            expect(foundMessage?.subject).toBe('Integration Test Message');
        });

        it('should preserve message order', async () => {
            const queueModule = await import('../../utils/queue.js');
            await queueModule.ensureDevTeamStructure();

            const message1 = createTestMessage({
                id: 'order-test-1',
                subject: 'First Message',
            });
            const message2 = createTestMessage({
                id: 'order-test-2',
                subject: 'Second Message',
            });
            const message3 = createTestMessage({
                id: 'order-test-3',
                subject: 'Third Message',
            });

            await queueModule.addMessage('member-01', message1);
            await queueModule.addMessage('member-01', message2);
            await queueModule.addMessage('member-01', message3);

            const queue = await queueModule.readQueue('member-01');

            const orderTestMessages = queue.messages.filter(m => m.id.startsWith('order-test-'));
            expect(orderTestMessages.length).toBeGreaterThanOrEqual(3);

            const idx1 = queue.messages.findIndex(m => m.id === 'order-test-1');
            const idx2 = queue.messages.findIndex(m => m.id === 'order-test-2');
            const idx3 = queue.messages.findIndex(m => m.id === 'order-test-3');

            expect(idx1).toBeLessThan(idx2);
            expect(idx2).toBeLessThan(idx3);
        });
    });

    describe('markMessageRead persistence', () => {
        it('should persist read status across module reloads', async () => {
            // First module load: add message
            const queueModule1 = await import('../../utils/queue.js');
            await queueModule1.ensureDevTeamStructure();

            const message = createTestMessage({
                id: 'read-persistence-test',
                subject: 'Persistence Test',
            });

            await queueModule1.addMessage('leader', message);
            await queueModule1.markMessageRead('leader', 'read-persistence-test');

            // Reset modules
            jest.resetModules();

            // Second module load: verify read status persisted
            const queueModule2 = await import('../../utils/queue.js');
            const queue = await queueModule2.readQueue('leader');

            const foundMessage = queue.messages.find(m => m.id === 'read-persistence-test');
            expect(foundMessage).toBeDefined();
            expect(foundMessage?.read).toBe(true);
        });

        it('should not affect other messages', async () => {
            const queueModule = await import('../../utils/queue.js');
            await queueModule.ensureDevTeamStructure();

            const message1 = createTestMessage({
                id: 'affect-test-1',
                subject: 'Will be read',
            });
            const message2 = createTestMessage({
                id: 'affect-test-2',
                subject: 'Will stay unread',
            });

            await queueModule.addMessage('member-02', message1);
            await queueModule.addMessage('member-02', message2);

            // Mark only first message as read
            await queueModule.markMessageRead('member-02', 'affect-test-1');

            const queue = await queueModule.readQueue('member-02');

            const msg1 = queue.messages.find(m => m.id === 'affect-test-1');
            const msg2 = queue.messages.find(m => m.id === 'affect-test-2');

            expect(msg1?.read).toBe(true);
            expect(msg2?.read).toBe(false);
        });
    });

    describe('clearReadMessages with real I/O', () => {
        it('should remove only read messages and persist changes', async () => {
            const queueModule = await import('../../utils/queue.js');
            await queueModule.ensureDevTeamStructure();

            const readMsg1 = createTestMessage({
                id: 'clear-read-1',
                subject: 'Read 1',
            });
            const readMsg2 = createTestMessage({
                id: 'clear-read-2',
                subject: 'Read 2',
            });
            const unreadMsg = createTestMessage({
                id: 'clear-unread-1',
                subject: 'Unread 1',
            });

            await queueModule.addMessage('pm', readMsg1);
            await queueModule.addMessage('pm', readMsg2);
            await queueModule.addMessage('pm', unreadMsg);

            // Mark some as read
            await queueModule.markMessageRead('pm', 'clear-read-1');
            await queueModule.markMessageRead('pm', 'clear-read-2');

            // Clear read messages
            const clearedCount = await queueModule.clearReadMessages('pm');

            expect(clearedCount).toBe(2);

            // Reset modules and verify persistence
            jest.resetModules();

            const queueModule2 = await import('../../utils/queue.js');
            const queue = await queueModule2.readQueue('pm');

            expect(queue.messages.find(m => m.id === 'clear-read-1')).toBeUndefined();
            expect(queue.messages.find(m => m.id === 'clear-read-2')).toBeUndefined();
            expect(queue.messages.find(m => m.id === 'clear-unread-1')).toBeDefined();
        });

        it('should keep unread messages intact', async () => {
            const queueModule = await import('../../utils/queue.js');
            await queueModule.ensureDevTeamStructure();

            const unreadMsg1 = createTestMessage({
                id: 'keep-unread-1',
                subject: 'Keep Me 1',
            });
            const unreadMsg2 = createTestMessage({
                id: 'keep-unread-2',
                subject: 'Keep Me 2',
            });

            await queueModule.addMessage('leader', unreadMsg1);
            await queueModule.addMessage('leader', unreadMsg2);

            // Clear without marking any as read
            const clearedCount = await queueModule.clearReadMessages('leader');

            // Should clear 0 since none are read (among the new messages)
            // Note: clearedCount may include previously read messages from other tests

            const queue = await queueModule.readQueue('leader');

            expect(queue.messages.find(m => m.id === 'keep-unread-1')).toBeDefined();
            expect(queue.messages.find(m => m.id === 'keep-unread-2')).toBeDefined();
        });
    });

    describe('queue isolation between roles', () => {
        it('should maintain separate queues for leader, member-01, member-02', async () => {
            const queueModule = await import('../../utils/queue.js');
            await queueModule.ensureDevTeamStructure();

            const leaderMsg = createTestMessage({
                id: 'isolation-leader',
                to: 'leader',
                subject: 'For Leader Only',
            });
            const member01Msg = createTestMessage({
                id: 'isolation-member-01',
                to: 'member-01',
                subject: 'For Member 01 Only',
            });
            const member02Msg = createTestMessage({
                id: 'isolation-member-02',
                to: 'member-02',
                subject: 'For Member 02 Only',
            });

            await queueModule.addMessage('leader', leaderMsg);
            await queueModule.addMessage('member-01', member01Msg);
            await queueModule.addMessage('member-02', member02Msg);

            const leaderQueue = await queueModule.readQueue('leader');
            const member01Queue = await queueModule.readQueue('member-01');
            const member02Queue = await queueModule.readQueue('member-02');

            // Each queue should have its own message
            expect(leaderQueue.messages.find(m => m.id === 'isolation-leader')).toBeDefined();
            expect(member01Queue.messages.find(m => m.id === 'isolation-member-01')).toBeDefined();
            expect(member02Queue.messages.find(m => m.id === 'isolation-member-02')).toBeDefined();

            // Queues should not have other roles' messages
            expect(leaderQueue.messages.find(m => m.id === 'isolation-member-01')).toBeUndefined();
            expect(leaderQueue.messages.find(m => m.id === 'isolation-member-02')).toBeUndefined();
            expect(member01Queue.messages.find(m => m.id === 'isolation-leader')).toBeUndefined();
            expect(member01Queue.messages.find(m => m.id === 'isolation-member-02')).toBeUndefined();
            expect(member02Queue.messages.find(m => m.id === 'isolation-leader')).toBeUndefined();
            expect(member02Queue.messages.find(m => m.id === 'isolation-member-01')).toBeUndefined();
        });

        it('should not cross-contaminate messages between roles', async () => {
            const queueModule = await import('../../utils/queue.js');
            await queueModule.ensureDevTeamStructure();

            // Add multiple messages to different roles
            const roles: Role[] = ['leader', 'member-01', 'member-02', 'pm'];

            for (const role of roles) {
                const msg = createTestMessage({
                    id: `contamination-test-${role}`,
                    to: role,
                    subject: `Message for ${role}`,
                });
                await queueModule.addMessage(role, msg);
            }

            // Verify each role only sees its own message
            for (const role of roles) {
                const queue = await queueModule.readQueue(role);

                // Should have own message
                expect(queue.messages.find(m => m.id === `contamination-test-${role}`)).toBeDefined();

                // Should not have other roles' messages
                for (const otherRole of roles) {
                    if (otherRole !== role) {
                        expect(queue.messages.find(m => m.id === `contamination-test-${otherRole}`)).toBeUndefined();
                    }
                }
            }
        });
    });
});
