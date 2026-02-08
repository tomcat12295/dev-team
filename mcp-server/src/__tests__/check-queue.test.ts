import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { MessageQueue } from '../types/message.js';
import type { Dashboard } from '../types/task.js';
import { createMockDashboard } from './helpers/mock-factories.js';

// Mock queue module - withDashboardTransaction はコールバックにdashboardを渡して実行
const mockWithDashboardTransaction = jest.fn<(cb: (db: Dashboard) => Promise<any>) => Promise<{ result: any; dashboard: Dashboard }>>();
jest.unstable_mockModule('../utils/queue.js', () => ({
    readQueue: jest.fn<() => Promise<MessageQueue>>(),
    markMessageRead: jest.fn<() => Promise<void>>(),
    updateMemberStatus: jest.fn<() => Promise<void>>(),
    getDashboard: jest.fn<() => Promise<Dashboard>>(),
    updateTaskInList: jest.fn<() => Promise<void>>(),
    withDashboardTransaction: mockWithDashboardTransaction,
}));

// Mock task-manager module
jest.unstable_mockModule('../utils/task-manager.js', () => ({
    recalculateDashboardTasks: jest.fn<() => Promise<Dashboard>>(),
}));

// Mock permission module
jest.unstable_mockModule('../utils/permission.js', () => ({
    getCurrentRole: jest.fn<() => string>(),
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));


describe('check-queue', () => {
    let checkQueue: typeof import('../tools/check-queue.js').checkQueue;
    let formatQueueResult: typeof import('../tools/check-queue.js').formatQueueResult;

    let mockReadQueue: jest.MockedFunction<() => Promise<MessageQueue>>;
    let mockMarkMessageRead: jest.MockedFunction<() => Promise<void>>;
    let mockUpdateMemberStatus: jest.MockedFunction<() => Promise<void>>;
    let mockGetDashboard: jest.MockedFunction<() => Promise<Dashboard>>;
    let mockRecalculateDashboardTasks: jest.MockedFunction<() => Promise<Dashboard>>;
    let mockGetCurrentRole: jest.MockedFunction<() => string>;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Get mocked modules
        const queueModule = await import('../utils/queue.js');
        const taskManagerModule = await import('../utils/task-manager.js');
        const permissionModule = await import('../utils/permission.js');

        mockReadQueue = queueModule.readQueue as typeof mockReadQueue;
        mockMarkMessageRead = queueModule.markMessageRead as typeof mockMarkMessageRead;
        mockUpdateMemberStatus = (queueModule as any).updateMemberStatus as typeof mockUpdateMemberStatus;
        mockGetDashboard = (queueModule as any).getDashboard as typeof mockGetDashboard;
        mockRecalculateDashboardTasks = taskManagerModule.recalculateDashboardTasks as typeof mockRecalculateDashboardTasks;
        mockGetCurrentRole = permissionModule.getCurrentRole as typeof mockGetCurrentRole;

        // Set default mock returns
        ((queueModule as any).updateTaskInList as jest.MockedFunction<() => Promise<void>>).mockResolvedValue(undefined);
        mockRecalculateDashboardTasks.mockResolvedValue(createMockDashboard({ memberStatus: {} }));

        // withDashboardTransactionのデフォルト実装: mockGetDashboardの値を使ってコールバックを実行
        mockWithDashboardTransaction.mockImplementation(async (cb) => {
            // mockGetDashboardの設定値を取得して利用
            const dashboard = await mockGetDashboard();
            const result = await cb(dashboard);
            return { result, dashboard };
        });

        // Import the module under test
        const checkQueueModule = await import('../tools/check-queue.js');
        checkQueue = checkQueueModule.checkQueue;
        formatQueueResult = checkQueueModule.formatQueueResult;
    });


    describe('checkQueue', () => {
        it('should return unread messages', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            const mockQueue: MessageQueue = {
                role: 'leader',
                messages: [
                    {
                        id: 'msg-1',
                        type: 'task',
                        from: 'pm',
                        to: 'leader',
                        subject: 'Unread Task',
                        content: 'Content 1',
                        timestamp: '2026-01-31T00:00:00.000Z',
                        read: false,
                    },
                    {
                        id: 'msg-2',
                        type: 'task',
                        from: 'pm',
                        to: 'leader',
                        subject: 'Read Task',
                        content: 'Content 2',
                        timestamp: '2026-01-31T00:00:00.000Z',
                        read: true,
                    },
                ],
                lastUpdated: '2026-01-31T00:00:00.000Z',
            };
            mockReadQueue.mockResolvedValueOnce(mockQueue);
            mockMarkMessageRead.mockResolvedValue(undefined);

            const result = await checkQueue(true);

            expect(result.role).toBe('leader');
            expect(result.unreadCount).toBe(1);
            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].subject).toBe('Unread Task');
            expect(result.totalMessages).toBe(2);
        });

        it('should mark messages as read when markAsRead is true', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            const mockQueue: MessageQueue = {
                role: 'leader',
                messages: [
                    {
                        id: 'msg-1',
                        type: 'task',
                        from: 'pm',
                        to: 'leader',
                        subject: 'Unread 1',
                        content: 'Content',
                        timestamp: '2026-01-31T00:00:00.000Z',
                        read: false,
                    },
                    {
                        id: 'msg-2',
                        type: 'task',
                        from: 'pm',
                        to: 'leader',
                        subject: 'Unread 2',
                        content: 'Content',
                        timestamp: '2026-01-31T00:00:00.000Z',
                        read: false,
                    },
                ],
                lastUpdated: '2026-01-31T00:00:00.000Z',
            };
            mockReadQueue.mockResolvedValueOnce(mockQueue);
            mockMarkMessageRead.mockResolvedValue(undefined);

            await checkQueue(true);

            expect(mockMarkMessageRead).toHaveBeenCalledTimes(2);
            expect(mockMarkMessageRead).toHaveBeenCalledWith('leader', 'msg-1');
            expect(mockMarkMessageRead).toHaveBeenCalledWith('leader', 'msg-2');
        });

        it('should not mark messages when markAsRead is false', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            const mockQueue: MessageQueue = {
                role: 'leader',
                messages: [
                    {
                        id: 'msg-1',
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
            mockReadQueue.mockResolvedValueOnce(mockQueue);

            await checkQueue(false);

            expect(mockMarkMessageRead).not.toHaveBeenCalled();
        });

        it('should return empty result when no unread messages', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            const mockQueue: MessageQueue = {
                role: 'leader',
                messages: [
                    {
                        id: 'msg-1',
                        type: 'task',
                        from: 'pm',
                        to: 'leader',
                        subject: 'Read Task',
                        content: 'Content',
                        timestamp: '2026-01-31T00:00:00.000Z',
                        read: true,
                    },
                ],
                lastUpdated: '2026-01-31T00:00:00.000Z',
            };
            mockReadQueue.mockResolvedValueOnce(mockQueue);

            const result = await checkQueue(true);

            expect(result.unreadCount).toBe(0);
            expect(result.messages).toHaveLength(0);
            expect(result.totalMessages).toBe(1);
        });

        it('should update member status from offline to idle when no tasks', async () => {
            mockGetCurrentRole.mockReturnValue('member-01');
            const mockQueue: MessageQueue = {
                role: 'member-01',
                messages: [],
                lastUpdated: '2026-01-31T00:00:00.000Z',
            };
            mockReadQueue.mockResolvedValueOnce(mockQueue);
            mockGetDashboard.mockResolvedValueOnce(createMockDashboard({
                memberStatus: { 'member-01': { status: 'offline' } },
            }));
            mockUpdateMemberStatus.mockResolvedValue(undefined);

            await checkQueue(true);

            expect(mockUpdateMemberStatus).toHaveBeenCalledTimes(1);
            expect(mockUpdateMemberStatus).toHaveBeenCalledWith('member-01', {
                status: 'idle',
                lastActivity: expect.any(String),
            }, expect.anything());
        });

        it('should update member status from idle to working when has tasks', async () => {
            mockGetCurrentRole.mockReturnValue('member-01');
            const mockQueue: MessageQueue = {
                role: 'member-01',
                messages: [
                    {
                        id: 'msg-001',
                        type: 'task',
                        from: 'leader',
                        to: 'member-01',
                        subject: 'テストタスク',
                        content: 'タスクの内容',
                        timestamp: '2026-01-31T12:00:00.000Z',
                        read: false,
                    },
                ],
                lastUpdated: '2026-01-31T00:00:00.000Z',
            };
            mockReadQueue.mockResolvedValueOnce(mockQueue);
            mockGetDashboard.mockResolvedValueOnce(createMockDashboard({
                memberStatus: { 'member-01': { status: 'idle' } },
            }));
            mockUpdateMemberStatus.mockResolvedValue(undefined);

            await checkQueue(true);

            expect(mockUpdateMemberStatus).toHaveBeenCalledTimes(1);
            expect(mockUpdateMemberStatus).toHaveBeenCalledWith('member-01', {
                status: 'working',
                lastActivity: expect.any(String),
                currentTask: {
                    id: 'msg-001',
                    title: 'テストタスク',
                    startedAt: expect.any(String),
                },
            }, expect.anything());
        });

        it('should update leader status to working when receiving question type message', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            const mockQueue: MessageQueue = {
                role: 'leader',
                messages: [
                    {
                        id: 'msg-question-001',
                        type: 'question',
                        from: 'member-01',
                        to: 'leader',
                        subject: 'memberからの質問',
                        content: '質問の内容',
                        timestamp: '2026-01-31T12:00:00.000Z',
                        read: false,
                    },
                ],
                lastUpdated: '2026-01-31T00:00:00.000Z',
            };
            mockReadQueue.mockResolvedValueOnce(mockQueue);
            mockGetDashboard.mockResolvedValueOnce(createMockDashboard({
                memberStatus: { 'leader': { status: 'idle' } },
            }));
            mockUpdateMemberStatus.mockResolvedValue(undefined);
            mockMarkMessageRead.mockResolvedValue(undefined);

            await checkQueue(true);

            // leaderはquestionタイプでもworkingに遷移する
            expect(mockUpdateMemberStatus).toHaveBeenCalledTimes(1);
            expect(mockUpdateMemberStatus).toHaveBeenCalledWith('leader', {
                status: 'working',
                lastActivity: expect.any(String),
                currentTask: {
                    id: 'msg-question-001',
                    title: 'memberからの質問',
                    startedAt: expect.any(String),
                },
            }, expect.anything());
        });

        it('should not update member status to working when receiving only question type message', async () => {
            mockGetCurrentRole.mockReturnValue('member-01');
            const mockQueue: MessageQueue = {
                role: 'member-01',
                messages: [
                    {
                        id: 'msg-question-002',
                        type: 'question',
                        from: 'leader',
                        to: 'member-01',
                        subject: 'leaderからの質問',
                        content: '質問の内容',
                        timestamp: '2026-01-31T12:00:00.000Z',
                        read: false,
                    },
                ],
                lastUpdated: '2026-01-31T00:00:00.000Z',
            };
            mockReadQueue.mockResolvedValueOnce(mockQueue);
            mockGetDashboard.mockResolvedValueOnce(createMockDashboard({
                memberStatus: { 'member-01': { status: 'idle' } },
            }));
            mockUpdateMemberStatus.mockResolvedValue(undefined);
            mockMarkMessageRead.mockResolvedValue(undefined);

            await checkQueue(true);

            // memberはquestionタイプではworkingに遷移しない（taskのみ）
            // idleのままなので、ステータス更新は呼ばれない
            expect(mockUpdateMemberStatus).not.toHaveBeenCalled();
        });

        it('should not update member status when role is pm', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            const mockQueue: MessageQueue = {
                role: 'pm',
                messages: [],
                lastUpdated: '2026-01-31T00:00:00.000Z',
            };
            mockReadQueue.mockResolvedValueOnce(mockQueue);

            await checkQueue(true);

            expect(mockUpdateMemberStatus).not.toHaveBeenCalled();
        });

        it('should continue even if updateMemberStatus fails', async () => {
            mockGetCurrentRole.mockReturnValue('leader');
            const mockQueue: MessageQueue = {
                role: 'leader',
                messages: [
                    {
                        id: 'msg-1',
                        type: 'task',
                        from: 'pm',
                        to: 'leader',
                        subject: 'Test Task',
                        content: 'Content',
                        timestamp: '2026-01-31T00:00:00.000Z',
                        read: false,
                    },
                ],
                lastUpdated: '2026-01-31T00:00:00.000Z',
            };
            mockReadQueue.mockResolvedValueOnce(mockQueue);
            mockGetDashboard.mockResolvedValueOnce(createMockDashboard({
                memberStatus: { 'leader': { status: 'idle' } },
            }));
            mockUpdateMemberStatus.mockRejectedValueOnce(new Error('Update failed'));
            mockMarkMessageRead.mockResolvedValue(undefined);

            const result = await checkQueue(true);

            // Should still return results even if status update failed
            expect(result.unreadCount).toBe(1);
            expect(result.messages).toHaveLength(1);
        });

        it.each(['working', 'waiting'] as const)(
            'should maintain %s status when check_queue with no new tasks',
            async (status) => {
                mockGetCurrentRole.mockReturnValue('member-01');
                const mockQueue: MessageQueue = {
                    role: 'member-01',
                    messages: [], // No unread tasks
                    lastUpdated: '2026-01-31T00:00:00.000Z',
                };
                mockReadQueue.mockResolvedValueOnce(mockQueue);
                mockGetDashboard.mockResolvedValueOnce(createMockDashboard({
                    memberStatus: { 'member-01': { status } },
                }));
                mockUpdateMemberStatus.mockResolvedValue(undefined);

                await checkQueue(true);

                // Should NOT update status (should be maintained)
                expect(mockUpdateMemberStatus).not.toHaveBeenCalled();
            },
        );

        it('should transition waiting to working when new task received', async () => {
            mockGetCurrentRole.mockReturnValue('member-01');
            const mockQueue: MessageQueue = {
                role: 'member-01',
                messages: [
                    {
                        id: 'msg-002',
                        type: 'task',
                        from: 'leader',
                        to: 'member-01',
                        subject: '新しいタスク',
                        content: 'タスクの内容',
                        timestamp: '2026-01-31T12:00:00.000Z',
                        read: false,
                    },
                ],
                lastUpdated: '2026-01-31T00:00:00.000Z',
            };
            mockReadQueue.mockResolvedValueOnce(mockQueue);
            mockGetDashboard.mockResolvedValueOnce(createMockDashboard({
                memberStatus: { 'member-01': { status: 'waiting' } }, // Currently waiting
            }));
            mockUpdateMemberStatus.mockResolvedValue(undefined);

            await checkQueue(true);

            // Should transition to working
            expect(mockUpdateMemberStatus).toHaveBeenCalledTimes(1);
            expect(mockUpdateMemberStatus).toHaveBeenCalledWith('member-01', {
                status: 'working',
                lastActivity: expect.any(String),
                currentTask: {
                    id: 'msg-002',
                    title: '新しいタスク',
                    startedAt: expect.any(String),
                },
            }, expect.anything());
        });

        it('should update currentTask even when working status maintained', async () => {
            mockGetCurrentRole.mockReturnValue('member-01');
            const mockQueue: MessageQueue = {
                role: 'member-01',
                messages: [
                    {
                        id: 'msg-003',
                        type: 'task',
                        from: 'leader',
                        to: 'member-01',
                        subject: '追加タスク',
                        content: 'タスクの内容',
                        timestamp: '2026-01-31T12:00:00.000Z',
                        read: false,
                    },
                ],
                lastUpdated: '2026-01-31T00:00:00.000Z',
            };
            mockReadQueue.mockResolvedValueOnce(mockQueue);
            mockGetDashboard.mockResolvedValueOnce(createMockDashboard({
                memberStatus: { 'member-01': { status: 'working' } }, // Already working
            }));
            mockUpdateMemberStatus.mockResolvedValue(undefined);

            await checkQueue(true);

            // Status stays working (null from getNextStatus), but currentTask should be updated
            expect(mockUpdateMemberStatus).toHaveBeenCalledTimes(1);
            expect(mockUpdateMemberStatus).toHaveBeenCalledWith('member-01', {
                lastActivity: expect.any(String),
                currentTask: {
                    id: 'msg-003',
                    title: '追加タスク',
                    startedAt: expect.any(String),
                },
            }, expect.anything());
        });
    });

    describe('formatQueueResult', () => {
        it('should format empty queue', () => {
            const result = formatQueueResult({
                role: 'leader',
                unreadCount: 0,
                messages: [],
                totalMessages: 5,
            });

            expect(result).toContain('キューは空です');
            expect(result).toContain('総メッセージ数: 5');
        });

        it('should format queue with messages', () => {
            const result = formatQueueResult({
                role: 'leader',
                unreadCount: 2,
                messages: [
                    {
                        id: 'msg-1',
                        type: 'task',
                        from: 'pm',
                        subject: 'Task 1',
                        content: 'Content 1',
                        timestamp: '2026-01-31T00:00:00.000Z',
                    },
                    {
                        id: 'msg-2',
                        type: 'report',
                        from: 'member-01',
                        subject: 'Report 1',
                        content: 'Content 2',
                        timestamp: '2026-01-31T01:00:00.000Z',
                    },
                ],
                totalMessages: 10,
            });

            expect(result).toContain('2件の未読メッセージ');
            expect(result).toContain('Task 1');
            expect(result).toContain('Report 1');
            expect(result).toContain('pm');
            expect(result).toContain('member-01');
            expect(result).toContain('総メッセージ数: 10');
        });
    });
});
