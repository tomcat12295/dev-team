import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ProjectContext } from '../types/memory.js';

// Mock fs module
jest.unstable_mockModule('fs/promises', () => ({
    readFile: jest.fn<() => Promise<string>>(),
    writeFile: jest.fn<() => Promise<void>>(),
    appendFile: jest.fn<() => Promise<void>>(),
    access: jest.fn<() => Promise<void>>(),
    mkdir: jest.fn<() => Promise<void>>(),
}));

// Mock queue module (for getDevTeamPath, generateMessageId)
jest.unstable_mockModule('../utils/queue.js', () => ({
    getDevTeamPath: jest.fn<() => string>().mockReturnValue('/test/path/.dev-team'),
    generateMessageId: jest.fn<() => string>().mockReturnValue('test-id'),
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
