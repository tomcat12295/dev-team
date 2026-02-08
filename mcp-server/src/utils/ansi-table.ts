// ANSI escape codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const FG_RED = '\x1b[31m';
const FG_GREEN = '\x1b[32m';
const FG_YELLOW = '\x1b[33m';
const FG_MAGENTA = '\x1b[35m';
const FG_CYAN = '\x1b[36m';
const FG_WHITE = '\x1b[37m';

export interface TableColumn {
    header: string;
    width: number;
    align?: 'left' | 'right' | 'center';
}

/**
 * Apply ANSI color to text
 */
export function colorize(text: string, color: string): string {
    return `${color}${text}${RESET}`;
}

/**
 * Get ANSI color code for a member status
 */
export function statusColor(status: string): string {
    switch (status) {
        case 'idle': return FG_GREEN;
        case 'working': return FG_YELLOW;
        case 'waiting': return FG_MAGENTA;
        case 'blocked': return FG_RED;
        case 'offline': return DIM;
        default: return FG_WHITE;
    }
}

/**
 * Get ANSI color code for a task priority
 */
export function priorityColor(priority: string): string {
    switch (priority) {
        case 'high': return FG_RED;
        case 'medium': return FG_YELLOW;
        case 'low': return FG_WHITE;
        default: return FG_WHITE;
    }
}

/**
 * Get ANSI color code for a task status
 */
export function taskStatusColor(status: string): string {
    switch (status) {
        case 'completed': return FG_GREEN;
        case 'in_progress': return FG_YELLOW;
        case 'pending': return FG_WHITE;
        case 'blocked': return FG_RED;
        case 'cancelled': return DIM;
        default: return FG_WHITE;
    }
}

/**
 * Render a section header with cyan bold and underline
 */
export function sectionHeader(title: string): string {
    const line = '─'.repeat(title.length + 4);
    return `${BOLD}${FG_CYAN}┌${line}┐${RESET}\n${BOLD}${FG_CYAN}│  ${title}  │${RESET}\n${BOLD}${FG_CYAN}└${line}┘${RESET}`;
}

/**
 * Get the visual width of a string (excluding ANSI escape sequences)
 * CJK characters count as width 2
 */
function visualWidth(text: string): number {
    // Strip ANSI escape sequences
    const stripped = text.replace(/\x1b\[[0-9;]*m/g, '');
    let width = 0;
    for (const ch of stripped) {
        const code = ch.codePointAt(0) ?? 0;
        // CJK Unified Ideographs, Hiragana, Katakana, fullwidth chars
        if (
            (code >= 0x3000 && code <= 0x9FFF) ||
            (code >= 0xF900 && code <= 0xFAFF) ||
            (code >= 0xFF00 && code <= 0xFF60) ||
            (code >= 0xFFE0 && code <= 0xFFE6)
        ) {
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
}

/**
 * Pad text to a given visual width
 */
function padToWidth(text: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
    const vw = visualWidth(text);
    const padding = Math.max(0, width - vw);
    if (align === 'right') {
        return ' '.repeat(padding) + text;
    } else if (align === 'center') {
        const left = Math.floor(padding / 2);
        const right = padding - left;
        return ' '.repeat(left) + text + ' '.repeat(right);
    }
    return text + ' '.repeat(padding);
}

/**
 * Render a table with box-drawing characters
 */
export function renderTable(columns: TableColumn[], rows: string[][]): string {
    const lines: string[] = [];

    // Top border: ┌──────┬──────┐
    const topBorder = '┌' + columns.map(c => '─'.repeat(c.width + 2)).join('┬') + '┐';
    lines.push(topBorder);

    // Header row: │ Header │ Header │
    const headerCells = columns.map(c =>
        ' ' + padToWidth(colorize(c.header, BOLD), c.width, 'center') + ' '
    );
    lines.push('│' + headerCells.join('│') + '│');

    // Header separator: ├──────┼──────┤
    const separator = '├' + columns.map(c => '─'.repeat(c.width + 2)).join('┼') + '┤';
    lines.push(separator);

    // Data rows: │ Data │ Data │
    for (const row of rows) {
        const cells = columns.map((c, i) => {
            const value = row[i] ?? '';
            return ' ' + padToWidth(value, c.width, c.align ?? 'left') + ' ';
        });
        lines.push('│' + cells.join('│') + '│');
    }

    // Bottom border: └──────┴──────┘
    const bottomBorder = '└' + columns.map(c => '─'.repeat(c.width + 2)).join('┴') + '┘';
    lines.push(bottomBorder);

    return lines.join('\n');
}

// Re-export constants for use in tests and other modules
export const ANSI = {
    RESET,
    BOLD,
    DIM,
    FG_RED,
    FG_GREEN,
    FG_YELLOW,
    FG_MAGENTA,
    FG_CYAN,
    FG_WHITE,
};
