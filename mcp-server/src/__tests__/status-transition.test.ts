import { describe, it, expect } from '@jest/globals';
import {
    getNextStatus,
    isValidTransition,
    getTransitionTable,
    StatusTransitionEvent,
    MemberStatusValue,
} from '../utils/status-transition.js';

describe('status-transition', () => {
    describe('getNextStatus', () => {
        describe('from idle state', () => {
            it('should transition to working on receive_task', () => {
                expect(getNextStatus('idle', 'receive_task')).toBe('working');
            });

            it('should transition to working on check_queue_with_task', () => {
                expect(getNextStatus('idle', 'check_queue_with_task')).toBe('working');
            });

            it('should return null (no change) on check_queue_empty', () => {
                expect(getNextStatus('idle', 'check_queue_empty')).toBeNull();
            });

            it('should transition to offline on kill_member', () => {
                expect(getNextStatus('idle', 'kill_member')).toBe('offline');
            });
        });

        describe('from working state', () => {
            it('should transition to idle on send_report', () => {
                expect(getNextStatus('working', 'send_report')).toBe('idle');
            });

            it('should transition to waiting on send_question', () => {
                expect(getNextStatus('working', 'send_question')).toBe('waiting');
            });

            it('should return null (no change) on check_queue_empty', () => {
                // This is the key fix: working should NOT become idle on check_queue_empty
                expect(getNextStatus('working', 'check_queue_empty')).toBeNull();
            });

            it('should return null (no change) on check_queue_with_task', () => {
                // Already working, stay working
                expect(getNextStatus('working', 'check_queue_with_task')).toBeNull();
            });

            it('should transition to offline on kill_member', () => {
                expect(getNextStatus('working', 'kill_member')).toBe('offline');
            });
        });

        describe('from waiting state', () => {
            it('should transition to working on receive_response', () => {
                expect(getNextStatus('waiting', 'receive_response')).toBe('working');
            });

            it('should transition to working on receive_task', () => {
                expect(getNextStatus('waiting', 'receive_task')).toBe('working');
            });

            it('should transition to working on check_queue_with_task', () => {
                expect(getNextStatus('waiting', 'check_queue_with_task')).toBe('working');
            });

            it('should return null (no change) on check_queue_empty', () => {
                // This is the key fix: waiting should NOT be destroyed by check_queue_empty
                expect(getNextStatus('waiting', 'check_queue_empty')).toBeNull();
            });

            it('should transition to offline on kill_member', () => {
                expect(getNextStatus('waiting', 'kill_member')).toBe('offline');
            });
        });

        describe('from offline state', () => {
            it('should transition to working on receive_task', () => {
                expect(getNextStatus('offline', 'receive_task')).toBe('working');
            });

            it('should transition to working on check_queue_with_task', () => {
                expect(getNextStatus('offline', 'check_queue_with_task')).toBe('working');
            });

            it('should transition to idle on check_queue_empty', () => {
                expect(getNextStatus('offline', 'check_queue_empty')).toBe('idle');
            });
        });

        describe('undefined transitions', () => {
            it('should return null for undefined events', () => {
                // send_report from idle is not defined
                expect(getNextStatus('idle', 'send_report')).toBeNull();
            });
        });
    });

    describe('isValidTransition', () => {
        it('should return true for defined transitions', () => {
            expect(isValidTransition('idle', 'receive_task')).toBe(true);
            expect(isValidTransition('working', 'send_report')).toBe(true);
            expect(isValidTransition('waiting', 'receive_response')).toBe(true);
        });

        it('should return false for undefined transitions', () => {
            // send_report from idle is not defined
            expect(isValidTransition('idle', 'send_report')).toBe(false);
            // receive_response from idle is not defined
            expect(isValidTransition('idle', 'receive_response')).toBe(false);
        });
    });

    describe('getTransitionTable', () => {
        it('should return the transition table', () => {
            const table = getTransitionTable();
            expect(table).toBeDefined();
            expect(table.idle).toBeDefined();
            expect(table.working).toBeDefined();
            expect(table.waiting).toBeDefined();
            expect(table.offline).toBeDefined();
        });

        it('should have correct structure', () => {
            const table = getTransitionTable();
            // Verify key transitions
            expect(table.idle.receive_task).toBe('working');
            expect(table.working.send_report).toBe('idle');
            expect(table.working.send_question).toBe('waiting');
            expect(table.waiting.receive_response).toBe('working');
        });
    });

    describe('state transition scenarios', () => {
        it('should handle full task lifecycle', () => {
            // Start idle
            let status: MemberStatusValue = 'idle';

            // Receive task -> working
            status = getNextStatus(status, 'receive_task') ?? status;
            expect(status).toBe('working');

            // Ask question -> waiting
            status = getNextStatus(status, 'send_question') ?? status;
            expect(status).toBe('waiting');

            // Receive response -> working
            status = getNextStatus(status, 'receive_response') ?? status;
            expect(status).toBe('working');

            // Send report -> idle
            status = getNextStatus(status, 'send_report') ?? status;
            expect(status).toBe('idle');
        });

        it('should preserve working state during check_queue', () => {
            const status: MemberStatusValue = 'working';

            // check_queue with empty queue should NOT change working to idle
            const nextStatus = getNextStatus(status, 'check_queue_empty');
            expect(nextStatus).toBeNull();
            // Status should remain working (since nextStatus is null)
        });

        it('should preserve waiting state during check_queue', () => {
            const status: MemberStatusValue = 'waiting';

            // check_queue with empty queue should NOT destroy waiting
            const nextStatus = getNextStatus(status, 'check_queue_empty');
            expect(nextStatus).toBeNull();
            // Status should remain waiting (since nextStatus is null)
        });
    });
});
