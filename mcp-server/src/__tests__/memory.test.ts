import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ProjectContext, MemoryEntry } from '../types/memory.js';

// Mock fs module
jest.unstable_mockModule('fs/promises', () => ({
    readFile: jest.fn<() => Promise<string>>(),
    writeFile: jest.fn<() => Promise<void>>(),
    appendFile: jest.fn<() => Promise<void>>(),
    access: jest.fn<() => Promise<void>>(),
    mkdir: jest.fn<() => Promise<void>>(),
}));

// Mock queue module (for getDevTeamPath, generateMessageId, addActivity)
jest.unstable_mockModule('../utils/queue.js', () => ({
    getDevTeamPath: jest.fn<() => string>().mockReturnValue('/test/path/.dev-team'),
    generateMessageId: jest.fn<() => string>().mockReturnValue('test-id'),
    addActivity: jest.fn<() => Promise<void>>(),
}));

// Mock file-lock module
jest.unstable_mockModule('../utils/file-lock.js', () => ({
    withFileLock: jest.fn<(path: string, fn: () => Promise<any>) => Promise<any>>()
        .mockImplementation(async (_path: any, fn: any) => fn()),
    ensureFileExists: jest.fn<() => Promise<void>>(),
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

// Mock permission module (for save-memory.ts)
jest.unstable_mockModule('../utils/permission.js', () => ({
    getCurrentRole: jest.fn<() => string>().mockReturnValue('pm'),
}));

// Mock validation module (for save-memory.ts)
jest.unstable_mockModule('../utils/validation.js', () => ({
    validateRequiredString: jest.fn<() => { valid: boolean }>().mockReturnValue({ valid: true }),
}));

describe('memory - getTaskSplitApproval', () => {
    let getTaskSplitApproval: () => Promise<boolean>;
    let mockReadFile: jest.MockedFunction<() => Promise<string>>;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Get mocked modules
        const fsModule = await import('fs/promises');
        mockReadFile = fsModule.readFile as unknown as typeof mockReadFile;

        // Import the module under test
        const memoryModule = await import('../utils/memory.js') as any;
        getTaskSplitApproval = memoryModule.getTaskSplitApproval;
    });


    it('preferencesが「（未設定）」の場合、falseを返す', async () => {
        const projectMd = `# Project Context

## What
テストプロジェクト

## Why
テスト用

## Who
テスター

## Constraints
なし

## Current State
（未設定）

## Decisions
（未設定）

## Notes
（未設定）

## Preferences
（未設定）
`;
        mockReadFile.mockResolvedValue(projectMd);

        const result = await getTaskSplitApproval();

        expect(result).toBe('auto');
    });

    it('preferencesにtaskSplitApproval: requiredがある場合、requiredを返す', async () => {
        const projectMd = `# Project Context

## What
テストプロジェクト

## Why
テスト用

## Who
テスター

## Constraints
なし

## Current State
（未設定）

## Decisions
（未設定）

## Notes
（未設定）

## Preferences
taskSplitApproval: required
reviewMode: normal
`;
        mockReadFile.mockResolvedValue(projectMd);

        const result = await getTaskSplitApproval();

        expect(result).toBe('required');
    });

    it('preferencesにtaskSplitApproval: autoがある場合、autoを返す', async () => {
        const projectMd = `# Project Context

## What
テストプロジェクト

## Why
テスト用

## Who
テスター

## Constraints
なし

## Current State
（未設定）

## Decisions
（未設定）

## Notes
（未設定）

## Preferences
taskSplitApproval: auto
reviewMode: strict
`;
        mockReadFile.mockResolvedValue(projectMd);

        const result = await getTaskSplitApproval();

        expect(result).toBe('auto');
    });

    it('preferencesに他の設定のみある場合（taskSplitApprovalなし）、autoを返す', async () => {
        const projectMd = `# Project Context

## What
テストプロジェクト

## Why
テスト用

## Who
テスター

## Constraints
なし

## Current State
（未設定）

## Decisions
（未設定）

## Notes
（未設定）

## Preferences
reviewMode: strict
otherSetting: value
`;
        mockReadFile.mockResolvedValue(projectMd);

        const result = await getTaskSplitApproval();

        expect(result).toBe('auto');
    });

    it('project.mdが存在しない場合、autoを返す（デフォルト値）', async () => {
        mockReadFile.mockRejectedValue(new Error('ENOENT'));

        const result = await getTaskSplitApproval();

        expect(result).toBe('auto');
    });

    it('旧形式のtrue/falseも正しく解釈される（後方互換）', async () => {
        const projectMd = `# Project Context

## What
テストプロジェクト

## Why
テスト用

## Who
テスター

## Constraints
なし

## Current State
（未設定）

## Decisions
（未設定）

## Notes
（未設定）

## Preferences
taskSplitApproval: true
`;
        mockReadFile.mockResolvedValue(projectMd);

        const result = await getTaskSplitApproval();

        expect(result).toBe('required');
    });
});

describe('memory - saveMemory 重複チェック', () => {
    let saveMemory: (role: string, type: string, title: string, content: string, tags?: string[]) => Promise<{ entry: MemoryEntry; updated: boolean }>;
    let mockReadFile: jest.MockedFunction<() => Promise<string>>;
    let mockWriteFile: jest.MockedFunction<() => Promise<void>>;
    let mockAppendFile: jest.MockedFunction<() => Promise<void>>;
    let mockGenerateMessageId: jest.MockedFunction<() => string>;

    beforeEach(async () => {
        jest.clearAllMocks();

        const fsModule = await import('fs/promises');
        mockReadFile = fsModule.readFile as unknown as typeof mockReadFile;
        mockWriteFile = fsModule.writeFile as unknown as typeof mockWriteFile;
        mockAppendFile = fsModule.appendFile as unknown as typeof mockAppendFile;

        const queueModule = await import('../utils/queue.js');
        mockGenerateMessageId = queueModule.generateMessageId as unknown as typeof mockGenerateMessageId;
        mockGenerateMessageId.mockReturnValue('test-id-new');

        const memoryModule = await import('../utils/memory.js') as any;
        saveMemory = memoryModule.saveMemory;
    });

    it('空のJSONLに新規保存 → updated=false、appendFileで追記', async () => {
        mockReadFile.mockResolvedValue('');

        const result = await saveMemory('pm', 'decision', '新しいルール', '内容です', ['tag1']);

        expect(result.updated).toBe(false);
        expect(result.entry.title).toBe('新しいルール');
        expect(result.entry.id).toBe('memory-test-id-new');
        expect(mockAppendFile).toHaveBeenCalled();
        expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('同一type+titleで2回保存 → 2回目はupdated=true、IDが維持される', async () => {
        const existingEntry: MemoryEntry = {
            id: 'memory-original-id',
            timestamp: '2026-01-01T00:00:00.000Z',
            role: 'pm' as any,
            type: 'decision',
            title: '既存ルール',
            content: '古い内容',
            tags: ['old-tag'],
        };
        mockReadFile.mockResolvedValue(JSON.stringify(existingEntry) + '\n');

        const result = await saveMemory('leader', 'decision', '既存ルール', '新しい内容', ['new-tag']);

        expect(result.updated).toBe(true);
        expect(result.entry.id).toBe('memory-original-id');
        expect(result.entry.content).toBe('新しい内容');
        expect(result.entry.tags).toEqual(['new-tag']);
        expect(result.entry.role).toBe('leader');
        expect(mockWriteFile).toHaveBeenCalled();
        expect(mockAppendFile).not.toHaveBeenCalled();
    });

    it('typeが異なる同一titleは重複にならない（2件とも別エントリ）', async () => {
        const existingEntry: MemoryEntry = {
            id: 'memory-existing-id',
            timestamp: '2026-01-01T00:00:00.000Z',
            role: 'pm' as any,
            type: 'decision',
            title: '同じタイトル',
            content: '決定事項の内容',
        };
        mockReadFile.mockResolvedValue(JSON.stringify(existingEntry) + '\n');

        const result = await saveMemory('pm', 'note', '同じタイトル', 'メモの内容');

        expect(result.updated).toBe(false);
        expect(result.entry.id).toBe('memory-test-id-new');
        expect(mockAppendFile).toHaveBeenCalled();
        expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('titleが異なる同一typeは重複にならない（2件とも別エントリ）', async () => {
        const existingEntry: MemoryEntry = {
            id: 'memory-existing-id',
            timestamp: '2026-01-01T00:00:00.000Z',
            role: 'pm' as any,
            type: 'decision',
            title: 'タイトルA',
            content: '内容A',
        };
        mockReadFile.mockResolvedValue(JSON.stringify(existingEntry) + '\n');

        const result = await saveMemory('pm', 'decision', 'タイトルB', '内容B');

        expect(result.updated).toBe(false);
        expect(result.entry.id).toBe('memory-test-id-new');
        expect(mockAppendFile).toHaveBeenCalled();
        expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('重複保存時にcontent, timestamp, tags, roleが更新されること', async () => {
        const existingEntry: MemoryEntry = {
            id: 'memory-keep-this-id',
            timestamp: '2026-01-01T00:00:00.000Z',
            role: 'pm' as any,
            type: 'note',
            title: '更新対象メモ',
            content: '古い内容',
            tags: ['old'],
        };
        mockReadFile.mockResolvedValue(JSON.stringify(existingEntry) + '\n');

        const result = await saveMemory('member-01', 'note', '更新対象メモ', '新しい内容', ['new', 'updated']);

        expect(result.updated).toBe(true);
        expect(result.entry.id).toBe('memory-keep-this-id');
        expect(result.entry.content).toBe('新しい内容');
        expect(result.entry.tags).toEqual(['new', 'updated']);
        expect(result.entry.role).toBe('member-01');
        expect(result.entry.timestamp).not.toBe('2026-01-01T00:00:00.000Z');

        const writeCall = mockWriteFile.mock.calls[0];
        const writtenContent = (writeCall as unknown as any[])[1] as string;
        const writtenEntry = JSON.parse(writtenContent.trim());
        expect(writtenEntry.id).toBe('memory-keep-this-id');
        expect(writtenEntry.content).toBe('新しい内容');
    });

    it('複数エントリがある場合、正しいエントリのみ更新されること', async () => {
        const entry1: MemoryEntry = {
            id: 'memory-id-1',
            timestamp: '2026-01-01T00:00:00.000Z',
            role: 'pm' as any,
            type: 'decision',
            title: 'ルール1',
            content: '内容1',
        };
        const entry2: MemoryEntry = {
            id: 'memory-id-2',
            timestamp: '2026-01-02T00:00:00.000Z',
            role: 'leader' as any,
            type: 'note',
            title: 'メモ1',
            content: '内容2',
        };
        const entry3: MemoryEntry = {
            id: 'memory-id-3',
            timestamp: '2026-01-03T00:00:00.000Z',
            role: 'pm' as any,
            type: 'decision',
            title: 'ルール2',
            content: '内容3',
        };
        const existingData = [entry1, entry2, entry3].map(e => JSON.stringify(e)).join('\n') + '\n';
        mockReadFile.mockResolvedValue(existingData);

        const result = await saveMemory('pm', 'note', 'メモ1', '更新された内容2');

        expect(result.updated).toBe(true);
        expect(result.entry.id).toBe('memory-id-2');
        expect(result.entry.content).toBe('更新された内容2');

        const writeCall = mockWriteFile.mock.calls[0];
        const writtenContent = (writeCall as unknown as any[])[1] as string;
        const writtenLines = writtenContent.trim().split('\n');
        expect(writtenLines).toHaveLength(3);

        const written1 = JSON.parse(writtenLines[0]);
        const written3 = JSON.parse(writtenLines[2]);
        expect(written1.content).toBe('内容1');
        expect(written3.content).toBe('内容3');

        const written2 = JSON.parse(writtenLines[1]);
        expect(written2.id).toBe('memory-id-2');
        expect(written2.content).toBe('更新された内容2');
    });
});

describe('save-memory - formatSaveMemoryResult 更新表示', () => {
    let formatSaveMemoryResult: (result: any, params: any) => string;

    beforeEach(async () => {
        jest.clearAllMocks();

        const saveMemoryModule = await import('../tools/save-memory.js') as any;
        formatSaveMemoryResult = saveMemoryModule.formatSaveMemoryResult;
    });

    it('updated=falseの場合「保存しました」メッセージ', () => {
        const result = { success: true, memoryId: 'memory-123', updated: false };
        const params = { type: 'decision', title: 'テスト', content: '内容', tags: [] };

        const output = formatSaveMemoryResult(result, params);

        expect(output).toContain('保存しました');
        expect(output).not.toContain('更新しました');
    });

    it('updated=trueの場合「更新しました」メッセージ', () => {
        const result = { success: true, memoryId: 'memory-123', updated: true };
        const params = { type: 'note', title: 'テストメモ', content: '内容', tags: [] };

        const output = formatSaveMemoryResult(result, params);

        expect(output).toContain('更新しました');
    });

    it('エラーの場合は従来通りエラーメッセージ', () => {
        const result = { success: false, error: 'エラーが発生しました' };
        const params = { type: 'decision', title: 'テスト', content: '内容' };

        const output = formatSaveMemoryResult(result, params);

        expect(output).toContain('失敗しました');
        expect(output).toContain('エラーが発生しました');
    });
});
