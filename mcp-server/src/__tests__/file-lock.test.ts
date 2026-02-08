import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock proper-lockfile before importing the module under test
jest.unstable_mockModule('proper-lockfile', () => ({
    lock: jest.fn<() => Promise<() => Promise<void>>>(),
    unlock: jest.fn<() => Promise<void>>(),
    check: jest.fn<() => Promise<boolean>>(),
}));

// Mock fs/promises
jest.unstable_mockModule('fs/promises', () => ({
    access: jest.fn<() => Promise<void>>(),
    mkdir: jest.fn<() => Promise<string | undefined>>(),
    writeFile: jest.fn<() => Promise<void>>(),
}));

// Mock logger to suppress output during tests
jest.unstable_mockModule('../utils/logger.js', () => ({
    debug: jest.fn(),
    error: jest.fn(),
}));

describe('file-lock', () => {
    let ensureFileExists: typeof import('../utils/file-lock.js').ensureFileExists;
    let withFileLock: typeof import('../utils/file-lock.js').withFileLock;
    let isFileLocked: typeof import('../utils/file-lock.js').isFileLocked;
    let mockLock: jest.MockedFunction<() => Promise<() => Promise<void>>>;
    let mockCheck: jest.MockedFunction<() => Promise<boolean>>;
    let mockAccess: jest.MockedFunction<() => Promise<void>>;
    let mockMkdir: jest.MockedFunction<() => Promise<string | undefined>>;
    let mockWriteFile: jest.MockedFunction<() => Promise<void>>;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Get mocked modules
        const lockfileModule = await import('proper-lockfile');
        const fsModule = await import('fs/promises');

        mockLock = lockfileModule.lock as typeof mockLock;
        mockCheck = lockfileModule.check as typeof mockCheck;
        mockAccess = fsModule.access as typeof mockAccess;
        mockMkdir = fsModule.mkdir as typeof mockMkdir;
        mockWriteFile = fsModule.writeFile as typeof mockWriteFile;

        // Import the module under test (after mocks are set up)
        const fileLockModule = await import('../utils/file-lock.js');
        ensureFileExists = fileLockModule.ensureFileExists;
        withFileLock = fileLockModule.withFileLock;
        isFileLocked = fileLockModule.isFileLocked;
    });


    describe('ensureFileExists', () => {
        it('should do nothing if file exists', async () => {
            mockAccess.mockResolvedValueOnce(undefined);

            await ensureFileExists('/path/to/file.json');

            expect(mockAccess).toHaveBeenCalledWith('/path/to/file.json');
            expect(mockMkdir).not.toHaveBeenCalled();
            expect(mockWriteFile).not.toHaveBeenCalled();
        });

        it('should create directory and file if file does not exist', async () => {
            const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
            enoentError.code = 'ENOENT';
            mockAccess.mockRejectedValueOnce(enoentError);
            mockMkdir.mockResolvedValueOnce(undefined);
            mockWriteFile.mockResolvedValueOnce(undefined);

            await ensureFileExists('/path/to/file.json');

            expect(mockAccess).toHaveBeenCalledWith('/path/to/file.json');
            expect(mockMkdir).toHaveBeenCalledWith('/path/to', { recursive: true });
            expect(mockWriteFile).toHaveBeenCalledWith('/path/to/file.json', '{}', 'utf-8');
        });
    });

    describe('withFileLock', () => {
        it('should acquire lock, execute operation, and release lock', async () => {
            const mockRelease = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
            mockAccess.mockResolvedValueOnce(undefined);
            mockLock.mockResolvedValueOnce(mockRelease);

            const operation = jest.fn<() => Promise<string>>().mockResolvedValue('result');

            const result = await withFileLock('/path/to/file.json', operation);

            expect(result).toBe('result');
            expect(mockLock).toHaveBeenCalledWith('/path/to/file.json', expect.any(Object));
            expect(operation).toHaveBeenCalled();
            expect(mockRelease).toHaveBeenCalled();
        });

        it('should release lock even if operation throws', async () => {
            const mockRelease = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
            mockAccess.mockResolvedValueOnce(undefined);
            mockLock.mockResolvedValueOnce(mockRelease);

            const operation = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('Operation failed'));

            await expect(withFileLock('/path/to/file.json', operation)).rejects.toThrow('Operation failed');

            expect(mockRelease).toHaveBeenCalled();
        });

        it('should ensure file exists before acquiring lock', async () => {
            const mockRelease = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
            const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
            enoentError.code = 'ENOENT';
            mockAccess.mockRejectedValueOnce(enoentError);
            mockMkdir.mockResolvedValueOnce(undefined);
            mockWriteFile.mockResolvedValueOnce(undefined);
            mockLock.mockResolvedValueOnce(mockRelease);

            const operation = jest.fn<() => Promise<string>>().mockResolvedValue('result');

            await withFileLock('/path/to/file.json', operation);

            expect(mockAccess).toHaveBeenCalledWith('/path/to/file.json');
            expect(mockMkdir).toHaveBeenCalled();
            expect(mockWriteFile).toHaveBeenCalled();
        });

        it('should throw if lock acquisition fails', async () => {
            mockAccess.mockResolvedValueOnce(undefined);
            mockLock.mockRejectedValueOnce(new Error('Lock failed'));

            const operation = jest.fn<() => Promise<string>>();

            await expect(withFileLock('/path/to/file.json', operation)).rejects.toThrow('Lock failed');

            expect(operation).not.toHaveBeenCalled();
        });
    });

    describe('isFileLocked', () => {
        it('should return true if file is locked', async () => {
            mockAccess.mockResolvedValueOnce(undefined);
            mockCheck.mockResolvedValueOnce(true);

            const result = await isFileLocked('/path/to/file.json');

            expect(result).toBe(true);
            expect(mockCheck).toHaveBeenCalledWith('/path/to/file.json');
        });

        it('should return false if file is not locked', async () => {
            mockAccess.mockResolvedValueOnce(undefined);
            mockCheck.mockResolvedValueOnce(false);

            const result = await isFileLocked('/path/to/file.json');

            expect(result).toBe(false);
        });

        it('should return false if check throws an error', async () => {
            mockAccess.mockResolvedValueOnce(undefined);
            mockCheck.mockRejectedValueOnce(new Error('Check failed'));

            const result = await isFileLocked('/path/to/file.json');

            expect(result).toBe(false);
        });

        it('should ensure file exists before checking lock', async () => {
            const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
            enoentError.code = 'ENOENT';
            mockAccess.mockRejectedValueOnce(enoentError);
            mockMkdir.mockResolvedValueOnce(undefined);
            mockWriteFile.mockResolvedValueOnce(undefined);
            mockCheck.mockResolvedValueOnce(false);

            await isFileLocked('/path/to/file.json');

            expect(mockAccess).toHaveBeenCalled();
            expect(mockMkdir).toHaveBeenCalled();
        });
    });
});
