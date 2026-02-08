import { lock, unlock, check } from 'proper-lockfile';
import * as fs from 'fs/promises';
import * as path from 'path';
import { error, debug } from './logger.js';

const LOCK_OPTIONS = {
    retries: {
        retries: 5,
        factor: 2,
        minTimeout: 100,
        maxTimeout: 1000,
    },
    stale: 10000,
};

export async function ensureFileExists(filePath: string): Promise<void> {
    try {
        await fs.access(filePath);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            const dir = path.dirname(filePath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(filePath, '{}', 'utf-8');
        } else {
            throw err;
        }
    }
}

export async function withFileLock<T>(
    filePath: string,
    operation: () => Promise<T>
): Promise<T> {
    await ensureFileExists(filePath);

    let release: (() => Promise<void>) | null = null;

    try {
        debug(`Acquiring lock for ${filePath}`);
        release = await lock(filePath, LOCK_OPTIONS);
        debug(`Lock acquired for ${filePath}`);

        const result = await operation();

        return result;
    } catch (err) {
        error(`Error during locked operation on ${filePath}`, err);
        throw err;
    } finally {
        if (release) {
            try {
                await release();
                debug(`Lock released for ${filePath}`);
            } catch (err) {
                error(`Error releasing lock for ${filePath}`, err);
            }
        }
    }
}

export async function isFileLocked(filePath: string): Promise<boolean> {
    try {
        await ensureFileExists(filePath);
        return await check(filePath);
    } catch {
        return false;
    }
}
