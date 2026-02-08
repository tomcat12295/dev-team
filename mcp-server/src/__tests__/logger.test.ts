import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { log, setLogLevel, debug, info, warn, error } from '../utils/logger.js';

describe('logger', () => {
    let consoleLogSpy: jest.SpiedFunction<typeof console.log>;
    let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>;
    let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

    beforeEach(() => {
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        // Reset to default log level
        setLogLevel('info');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('setLogLevel and log filtering', () => {
        it('should log info level messages when log level is info', () => {
            setLogLevel('info');
            info('test message');
            expect(consoleLogSpy).toHaveBeenCalledTimes(1);
        });

        it('should not log debug messages when log level is info', () => {
            setLogLevel('info');
            debug('debug message');
            expect(consoleLogSpy).not.toHaveBeenCalled();
        });

        it('should log debug messages when log level is debug', () => {
            setLogLevel('debug');
            debug('debug message');
            expect(consoleLogSpy).toHaveBeenCalledTimes(1);
        });

        it('should log all levels when log level is debug', () => {
            setLogLevel('debug');
            debug('debug');
            info('info');
            warn('warn');
            error('error');
            expect(consoleLogSpy).toHaveBeenCalledTimes(2); // debug and info
            expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        });

        it('should only log error when log level is error', () => {
            setLogLevel('error');
            debug('debug');
            info('info');
            warn('warn');
            error('error');
            expect(consoleLogSpy).not.toHaveBeenCalled();
            expect(consoleWarnSpy).not.toHaveBeenCalled();
            expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        });

        it('should log warn and error when log level is warn', () => {
            setLogLevel('warn');
            debug('debug');
            info('info');
            warn('warn');
            error('error');
            expect(consoleLogSpy).not.toHaveBeenCalled();
            expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('log output format', () => {
        it('should format log with timestamp, level, and message', () => {
            setLogLevel('info');
            info('test message');
            expect(consoleLogSpy).toHaveBeenCalledTimes(1);
            const output = consoleLogSpy.mock.calls[0][0] as string;
            // Format: timestamp [LEVEL] message
            expect(output).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\] test message$/);
        });

        it('should include role prefix when role is provided', () => {
            setLogLevel('info');
            info('test message', undefined, 'pm');
            const output = consoleLogSpy.mock.calls[0][0] as string;
            expect(output).toMatch(/\[INFO\] \[pm\] test message/);
        });

        it('should include data when provided', () => {
            setLogLevel('info');
            info('test message', { key: 'value' });
            const output = consoleLogSpy.mock.calls[0][0] as string;
            expect(output).toContain('{"key":"value"}');
        });

        it('should include both role and data when provided', () => {
            setLogLevel('info');
            info('test message', { key: 'value' }, 'leader');
            const output = consoleLogSpy.mock.calls[0][0] as string;
            expect(output).toMatch(/\[leader\] test message {"key":"value"}/);
        });
    });

    describe('log function with different levels', () => {
        beforeEach(() => {
            setLogLevel('debug');
        });

        it('should use console.log for debug level', () => {
            log('debug', 'debug message');
            expect(consoleLogSpy).toHaveBeenCalledTimes(1);
        });

        it('should use console.log for info level', () => {
            log('info', 'info message');
            expect(consoleLogSpy).toHaveBeenCalledTimes(1);
        });

        it('should use console.warn for warn level', () => {
            log('warn', 'warn message');
            expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
        });

        it('should use console.error for error level', () => {
            log('error', 'error message');
            expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('convenience functions', () => {
        beforeEach(() => {
            setLogLevel('debug');
        });

        it('debug() should call log with debug level', () => {
            debug('debug message', { data: 1 }, 'pm');
            const output = consoleLogSpy.mock.calls[0][0] as string;
            expect(output).toContain('[DEBUG]');
            expect(output).toContain('[pm]');
            expect(output).toContain('debug message');
        });

        it('info() should call log with info level', () => {
            info('info message');
            const output = consoleLogSpy.mock.calls[0][0] as string;
            expect(output).toContain('[INFO]');
        });

        it('warn() should call log with warn level', () => {
            warn('warn message');
            const output = consoleWarnSpy.mock.calls[0][0] as string;
            expect(output).toContain('[WARN]');
        });

        it('error() should call log with error level', () => {
            error('error message');
            const output = consoleErrorSpy.mock.calls[0][0] as string;
            expect(output).toContain('[ERROR]');
        });
    });
});
