import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import type { Role } from '../types/task.js';
import type { ProjectContext } from '../types/memory.js';

// ESMモジュールのモック
const mockGetCurrentRole = jest.fn<() => Role>();
const mockGetReviewMode = jest.fn<() => Promise<'normal' | 'strict'>>();
const mockGetTaskSplitApproval = jest.fn<() => Promise<'auto' | 'required'>>();
const mockGetProjectContext = jest.fn<() => Promise<ProjectContext>>();
const mockUpdateProjectContext = jest.fn<(section: string, content: string, append: boolean) => Promise<ProjectContext>>();

jest.unstable_mockModule('../utils/permission.js', () => ({
    getCurrentRole: mockGetCurrentRole,
}));

jest.unstable_mockModule('../utils/memory.js', () => ({
    getReviewMode: mockGetReviewMode,
    getTaskSplitApproval: mockGetTaskSplitApproval,
    getProjectContext: mockGetProjectContext,
    updateProjectContext: mockUpdateProjectContext,
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
}));

// 動的インポート（モック設定後）
const { configureModes, formatConfigureModesResult } = await import('../tools/configure-modes.js');

describe('configureModes', () => {
    const createMockContext = (): ProjectContext => ({
        what: '',
        why: '',
        who: '',
        constraints: '',
        currentState: '',
        decisions: '',
        notes: '',
        preferences: '',
        lastUpdated: new Date().toISOString(),
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetProjectContext.mockResolvedValue(createMockContext());
        mockUpdateProjectContext.mockResolvedValue(createMockContext());
    });

    describe('権限チェック', () => {
        it('PM以外が実行した場合にエラーを返す', async () => {
            mockGetCurrentRole.mockReturnValue('leader');

            const result = await configureModes({});

            expect(result.success).toBe(false);
            expect(result.error).toContain('PMのみ使用可能');
        });

        it('PMが実行した場合は成功する', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockGetReviewMode.mockResolvedValue('normal');
            mockGetTaskSplitApproval.mockResolvedValue('auto');

            const result = await configureModes({});

            expect(result.success).toBe(true);
        });
    });

    describe('reviewMode設定', () => {
        beforeEach(() => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockGetTaskSplitApproval.mockResolvedValue('auto');
        });

        it('reviewModeをnormalに設定できる', async () => {
            mockGetReviewMode.mockResolvedValue('strict');

            const result = await configureModes({ reviewMode: 'normal' });

            expect(result.success).toBe(true);
            expect(result.settings?.reviewMode).toBe('normal');
            expect(mockUpdateProjectContext).toHaveBeenCalled();
        });

        it('reviewModeをstrictに設定できる', async () => {
            mockGetReviewMode.mockResolvedValue('normal');

            const result = await configureModes({ reviewMode: 'strict' });

            expect(result.success).toBe(true);
            expect(result.settings?.reviewMode).toBe('strict');
            expect(mockUpdateProjectContext).toHaveBeenCalled();
        });
    });

    describe('taskSplitApproval設定', () => {
        beforeEach(() => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockGetReviewMode.mockResolvedValue('normal');
        });

        it('taskSplitApprovalをrequiredに設定できる', async () => {
            mockGetTaskSplitApproval.mockResolvedValue('auto');

            const result = await configureModes({ taskSplitApproval: 'required' });

            expect(result.success).toBe(true);
            expect(result.settings?.taskSplitApproval).toBe('required');
            expect(mockUpdateProjectContext).toHaveBeenCalled();
        });

        it('taskSplitApprovalをautoに設定できる', async () => {
            mockGetTaskSplitApproval.mockResolvedValue('required');

            const result = await configureModes({ taskSplitApproval: 'auto' });

            expect(result.success).toBe(true);
            expect(result.settings?.taskSplitApproval).toBe('auto');
            expect(mockUpdateProjectContext).toHaveBeenCalled();
        });
    });

    describe('複合設定', () => {
        it('両方のモードを同時に設定できる', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockGetReviewMode.mockResolvedValue('normal');
            mockGetTaskSplitApproval.mockResolvedValue('auto');

            const result = await configureModes({
                reviewMode: 'strict',
                taskSplitApproval: 'required',
            });

            expect(result.success).toBe(true);
            expect(result.settings?.reviewMode).toBe('strict');
            expect(result.settings?.taskSplitApproval).toBe('required');
        });
    });

    describe('現在の設定値表示', () => {
        it('パラメータなしで現在の設定値を取得できる', async () => {
            mockGetCurrentRole.mockReturnValue('pm');
            mockGetReviewMode.mockResolvedValue('strict');
            mockGetTaskSplitApproval.mockResolvedValue('required');

            const result = await configureModes({});

            expect(result.success).toBe(true);
            expect(result.currentSettings?.reviewMode).toBe('strict');
            expect(result.currentSettings?.taskSplitApproval).toBe('required');
        });
    });
});

describe('formatConfigureModesResult', () => {
    it('成功時に設定内容を表示する', () => {
        const result = formatConfigureModesResult({
            success: true,
            currentSettings: {
                reviewMode: 'normal',
                taskSplitApproval: 'auto',
            },
            settings: {
                reviewMode: 'strict',
                taskSplitApproval: 'required',
            },
        });

        expect(result).toContain('✅');
        expect(result).toContain('reviewMode');
        expect(result).toContain('taskSplitApproval');
    });

    it('エラー時にエラーメッセージを表示する', () => {
        const result = formatConfigureModesResult({
            success: false,
            error: 'PMのみ使用可能です',
        });

        expect(result).toContain('❌');
        expect(result).toContain('PMのみ使用可能');
    });
});
