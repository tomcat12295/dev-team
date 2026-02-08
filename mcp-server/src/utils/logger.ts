import { Role } from '../types/task.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    role?: Role;
    message: string;
    data?: unknown;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

let currentLogLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
    currentLogLevel = level;
}

function shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLogLevel];
}

function formatLog(entry: LogEntry): string {
    const rolePrefix = entry.role ? `[${entry.role}] ` : '';
    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
    return `${entry.timestamp} [${entry.level.toUpperCase()}] ${rolePrefix}${entry.message}${dataStr}`;
}

export function log(level: LogLevel, message: string, data?: unknown, role?: Role): void {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        role,
        message,
        data,
    };

    const formatted = formatLog(entry);

    switch (level) {
        case 'error':
            console.error(formatted);
            break;
        case 'warn':
            console.warn(formatted);
            break;
        default:
            console.log(formatted);
    }
}

export function debug(message: string, data?: unknown, role?: Role): void {
    log('debug', message, data, role);
}

export function info(message: string, data?: unknown, role?: Role): void {
    log('info', message, data, role);
}

export function warn(message: string, data?: unknown, role?: Role): void {
    log('warn', message, data, role);
}

export function error(message: string, data?: unknown, role?: Role): void {
    log('error', message, data, role);
}
