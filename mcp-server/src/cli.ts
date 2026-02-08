#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { startTeamSession, stopTeamSession, addMember, removeMember } from './utils/team-session.js';
import { initProject } from './utils/init-project.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
export const CLI_VERSION: string = pkg.version;

function parsePositiveInt(value: string, defaultValue: number, min: number, max: number): number {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < min || num > max) {
        console.error(`Invalid number: ${value} (must be ${min}-${max})`);
        process.exit(1);
    }
    return num;
}

export const program = new Command();

program
    .name('dev-team')
    .description('Dev Team CLI')
    .version(CLI_VERSION);

program
    .command('start')
    .description('Start dev team session')
    .argument('<projectPath>', 'Path to the project directory')
    .argument('[initialTask]', 'Initial task for PM')
    .option('-m, --members <count>', 'Number of members (default: 2)', '2')
    .action(async (projectPath: string, initialTask?: string, options?: { members?: string }) => {
        try {
            const absolutePath = path.resolve(projectPath);
            const memberCount = parsePositiveInt(options?.members || '2', 2, 1, 4);

            await startTeamSession({
                projectPath: absolutePath,
                initialTask,
                memberCount,
            });
        } catch (err) {
            console.error('Failed to start dev team session:', err);
            process.exit(1);
        }
    });

program
    .command('stop')
    .description('Stop dev team session')
    .argument('<projectPath>', 'Path to the project directory')
    .option('--delete-queue', 'Delete queue files (default: keep)')
    .action(async (projectPath: string, options?: { deleteQueue?: boolean }) => {
        try {
            const absolutePath = path.resolve(projectPath);

            await stopTeamSession(absolutePath, {
                keepQueue: !options?.deleteQueue,
            });
        } catch (err) {
            console.error('Failed to stop dev team session:', err);
            process.exit(1);
        }
    });

program
    .command('add-member')
    .description('Add members to an existing team session')
    .argument('<projectPath>', 'Path to the project directory')
    .option('-c, --count <count>', 'Number of members to add (default: 1)', '1')
    .action(async (projectPath: string, options?: { count?: string }) => {
        try {
            const absolutePath = path.resolve(projectPath);
            const count = parsePositiveInt(options?.count || '1', 1, 1, 4);

            const result = await addMember({
                projectPath: absolutePath,
                count,
            });

            console.log(`Successfully added ${result.addedRoles.length} member(s)`);
            console.log(`  Previous count: ${result.previousCount}`);
            console.log(`  New count: ${result.newCount}`);
            console.log(`  Added roles: ${result.addedRoles.join(', ')}`);
        } catch (err) {
            console.error('Failed to add members:', err);
            process.exit(1);
        }
    });

program
    .command('remove-member')
    .description('Remove members from an existing team session')
    .argument('<projectPath>', 'Path to the project directory')
    .option('-c, --count <count>', 'Number of members to remove (default: 1)', '1')
    .action(async (projectPath: string, options?: { count?: string }) => {
        try {
            const absolutePath = path.resolve(projectPath);
            const count = parsePositiveInt(options?.count || '1', 1, 1, 4);

            const result = await removeMember(absolutePath, { count });

            console.log(`Successfully removed ${result.removedRoles.length} member(s)`);
            console.log(`  Previous count: ${result.previousCount}`);
            console.log(`  New count: ${result.newCount}`);
            console.log(`  Removed roles: ${result.removedRoles.join(', ')}`);
        } catch (err) {
            console.error('Failed to remove members:', err);
            process.exit(1);
        }
    });

program
    .command('init')
    .description('Init dev team project structure')
    .argument('[projectPath]', 'Path to the project directory', '.')
    .option('-f, --force', 'Overwrite existing files')
    .option('-m, --members <count>', 'Number of members (default: 2)', '2')
    .action(async (projectPath: string, options?: { force?: boolean; members?: string }) => {
        try {
            const absolutePath = path.resolve(projectPath);
            const memberCount = parsePositiveInt(options?.members || '2', 2, 1, 4);

            await initProject(absolutePath, {
                force: options?.force,
                memberCount,
            });

            console.log('Successfully initialized dev team project');
            console.log(`  Project path: ${absolutePath}`);
            console.log('  Created:');
            console.log('    - .dev-team/workspaces/{pm,leader,member-01,member-02}/CLAUDE.md');
            console.log('    - .dev-team/queue/');
            console.log('    - .dev-team/dashboard.json');
            console.log('    - .claude/skills/start-team/SKILL.md');
        } catch (err) {
            console.error('Failed to initialize dev team project:', err);
            process.exit(1);
        }
    });

// Only parse if this file is run directly (not imported for testing)
if (process.argv[1]?.endsWith('cli.js') || process.argv[1]?.endsWith('cli.ts')) {
    program.parse();
}
