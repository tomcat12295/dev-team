import { describe, it, expect, beforeEach } from '@jest/globals';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

describe('jest.config.js', () => {
    let configContent: string;

    beforeEach(async () => {
        // jest.config.jsのファイル内容を読み込む
        const configPath = resolve(__dirname, '../../../jest.config.js');
        configContent = await readFile(configPath, 'utf-8');
    });

    it('forceExitが設定されていないこと', () => {
        // forceExit: true はテスト完了後に「Force exiting Jest」警告を出す原因となる
        // open handleが存在しない場合でもこの警告が出るため、設定しないのが正しい
        expect(configContent).not.toMatch(/forceExit\s*:/);
    });

    it('testEnvironmentがnodeであること', () => {
        expect(configContent).toMatch(/testEnvironment\s*:\s*['"]node['"]/);
    });

    it('maxWorkersが1であること（runInBand相当）', () => {
        expect(configContent).toMatch(/maxWorkers\s*:\s*1/);
    });
});
