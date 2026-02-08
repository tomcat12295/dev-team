import { jest, describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));

describe('CLI', () => {

    describe('CLIバージョン', () => {
        it('CLIバージョンがpackage.jsonと一致する', async () => {
            const { CLI_VERSION } = await import('../cli.js');
            expect(CLI_VERSION).toBe(pkg.version);
        });
    });

    describe('コマンド定義', () => {
        it('programがエクスポートされている', async () => {
            const cliModule = await import('../cli.js');
            expect(cliModule.program).toBeDefined();
        });

        it('startコマンドが定義されている', async () => {
            const { program } = await import('../cli.js');
            const startCommand = program.commands.find(cmd => cmd.name() === 'start');
            expect(startCommand).toBeDefined();
            expect(startCommand?.description()).toContain('Start');
        });

        it('stopコマンドが定義されている', async () => {
            const { program } = await import('../cli.js');
            const stopCommand = program.commands.find(cmd => cmd.name() === 'stop');
            expect(stopCommand).toBeDefined();
            expect(stopCommand?.description()).toContain('Stop');
        });

        it('startコマンドはprojectPath引数を持つ', async () => {
            const { program } = await import('../cli.js');
            const startCommand = program.commands.find(cmd => cmd.name() === 'start');
            // commanderでは最初の引数はargs[0]
            const args = startCommand?.registeredArguments;
            expect(args).toBeDefined();
            expect(args?.length).toBeGreaterThanOrEqual(1);
            expect(args?.[0].name()).toBe('projectPath');
            expect(args?.[0].required).toBe(true);
        });

        it('stopコマンドはprojectPath引数を持つ', async () => {
            const { program } = await import('../cli.js');
            const stopCommand = program.commands.find(cmd => cmd.name() === 'stop');
            const args = stopCommand?.registeredArguments;
            expect(args).toBeDefined();
            expect(args?.length).toBeGreaterThanOrEqual(1);
            expect(args?.[0].name()).toBe('projectPath');
            expect(args?.[0].required).toBe(true);
        });

        it('stopコマンドに--delete-queueオプションがある', async () => {
            const { program } = await import('../cli.js');
            const stopCommand = program.commands.find(cmd => cmd.name() === 'stop');
            const options = stopCommand?.options;
            const deleteQueueOption = options?.find(
                opt => opt.long === '--delete-queue'
            );
            expect(deleteQueueOption).toBeDefined();
        });

        it('remove-memberコマンドが定義されている', async () => {
            const { program } = await import('../cli.js');
            const removeMemberCommand = program.commands.find(cmd => cmd.name() === 'remove-member');
            expect(removeMemberCommand).toBeDefined();
            expect(removeMemberCommand?.description()).toContain('Remove');
        });

        it('remove-memberコマンドはprojectPath引数を持つ', async () => {
            const { program } = await import('../cli.js');
            const removeMemberCommand = program.commands.find(cmd => cmd.name() === 'remove-member');
            const args = removeMemberCommand?.registeredArguments;
            expect(args).toBeDefined();
            expect(args?.length).toBeGreaterThanOrEqual(1);
            expect(args?.[0].name()).toBe('projectPath');
            expect(args?.[0].required).toBe(true);
        });

        it('remove-memberコマンドに--countオプションがある', async () => {
            const { program } = await import('../cli.js');
            const removeMemberCommand = program.commands.find(cmd => cmd.name() === 'remove-member');
            const options = removeMemberCommand?.options;
            const countOption = options?.find(
                opt => opt.long === '--count'
            );
            expect(countOption).toBeDefined();
        });

        it('initコマンドが定義されている', async () => {
            const { program } = await import('../cli.js');
            const initCommand = program.commands.find(cmd => cmd.name() === 'init');
            expect(initCommand).toBeDefined();
            expect(initCommand?.description()).toContain('Init');
        });

        it('initコマンドはprojectPath引数がオプショナルである', async () => {
            const { program } = await import('../cli.js');
            const initCommand = program.commands.find(cmd => cmd.name() === 'init');
            const args = initCommand?.registeredArguments;
            expect(args).toBeDefined();
            expect(args?.length).toBeGreaterThanOrEqual(1);
            expect(args?.[0].name()).toBe('projectPath');
            expect(args?.[0].required).toBe(false);
        });

        it('initコマンドに--forceオプションがある', async () => {
            const { program } = await import('../cli.js');
            const initCommand = program.commands.find(cmd => cmd.name() === 'init');
            const options = initCommand?.options;
            const forceOption = options?.find(
                opt => opt.long === '--force'
            );
            expect(forceOption).toBeDefined();
        });
    });
});
