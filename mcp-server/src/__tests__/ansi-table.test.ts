import { describe, it, expect } from '@jest/globals';
import { renderTable, colorize, statusColor, priorityColor, taskStatusColor, sectionHeader, ANSI, TableColumn } from '../utils/ansi-table.js';

describe('ansi-table.ts', () => {
    describe('colorize', () => {
        it('should wrap text with ANSI color code and reset', () => {
            const result = colorize('hello', ANSI.FG_RED);
            expect(result).toBe('\x1b[31mhello\x1b[0m');
        });

        it('should work with bold', () => {
            const result = colorize('title', ANSI.BOLD);
            expect(result).toBe('\x1b[1mtitle\x1b[0m');
        });

        it('should handle empty text', () => {
            const result = colorize('', ANSI.FG_GREEN);
            expect(result).toBe('\x1b[32m\x1b[0m');
        });
    });

    describe('statusColor', () => {
        it('should return green for idle', () => {
            expect(statusColor('idle')).toBe(ANSI.FG_GREEN);
        });

        it('should return yellow for working', () => {
            expect(statusColor('working')).toBe(ANSI.FG_YELLOW);
        });

        it('should return magenta for waiting', () => {
            expect(statusColor('waiting')).toBe(ANSI.FG_MAGENTA);
        });

        it('should return red for blocked', () => {
            expect(statusColor('blocked')).toBe(ANSI.FG_RED);
        });

        it('should return dim for offline', () => {
            expect(statusColor('offline')).toBe(ANSI.DIM);
        });

        it('should return white for unknown status', () => {
            expect(statusColor('unknown')).toBe(ANSI.FG_WHITE);
        });
    });

    describe('priorityColor', () => {
        it('should return red for high', () => {
            expect(priorityColor('high')).toBe(ANSI.FG_RED);
        });

        it('should return yellow for medium', () => {
            expect(priorityColor('medium')).toBe(ANSI.FG_YELLOW);
        });

        it('should return white for low', () => {
            expect(priorityColor('low')).toBe(ANSI.FG_WHITE);
        });

        it('should return white for unknown priority', () => {
            expect(priorityColor('critical')).toBe(ANSI.FG_WHITE);
        });
    });

    describe('taskStatusColor', () => {
        it('should return green for completed', () => {
            expect(taskStatusColor('completed')).toBe(ANSI.FG_GREEN);
        });

        it('should return yellow for in_progress', () => {
            expect(taskStatusColor('in_progress')).toBe(ANSI.FG_YELLOW);
        });

        it('should return white for pending', () => {
            expect(taskStatusColor('pending')).toBe(ANSI.FG_WHITE);
        });

        it('should return red for blocked', () => {
            expect(taskStatusColor('blocked')).toBe(ANSI.FG_RED);
        });

        it('should return dim for cancelled', () => {
            expect(taskStatusColor('cancelled')).toBe(ANSI.DIM);
        });
    });

    describe('sectionHeader', () => {
        it('should render header with box-drawing characters', () => {
            const result = sectionHeader('Tasks');
            expect(result).toContain('┌');
            expect(result).toContain('┘');
            expect(result).toContain('Tasks');
        });

        it('should contain cyan bold ANSI codes', () => {
            const result = sectionHeader('Title');
            expect(result).toContain(ANSI.BOLD);
            expect(result).toContain(ANSI.FG_CYAN);
            expect(result).toContain(ANSI.RESET);
        });

        it('should have three lines', () => {
            const result = sectionHeader('Test');
            const lines = result.split('\n');
            expect(lines).toHaveLength(3);
        });
    });

    describe('renderTable', () => {
        it('should render a simple table with box-drawing characters', () => {
            const columns: TableColumn[] = [
                { header: 'Name', width: 10 },
                { header: 'Value', width: 8 },
            ];
            const rows = [
                ['Alice', '100'],
                ['Bob', '200'],
            ];

            const result = renderTable(columns, rows);

            // Check box-drawing characters
            expect(result).toContain('┌');
            expect(result).toContain('┐');
            expect(result).toContain('├');
            expect(result).toContain('┤');
            expect(result).toContain('└');
            expect(result).toContain('┘');
            expect(result).toContain('┬');
            expect(result).toContain('┼');
            expect(result).toContain('┴');
            expect(result).toContain('│');
            expect(result).toContain('─');

            // Check data
            expect(result).toContain('Alice');
            expect(result).toContain('Bob');
            expect(result).toContain('100');
            expect(result).toContain('200');
        });

        it('should have correct number of lines', () => {
            const columns: TableColumn[] = [
                { header: 'Col1', width: 6 },
            ];
            const rows = [['a'], ['b'], ['c']];

            const result = renderTable(columns, rows);
            const lines = result.split('\n');

            // top border + header + separator + 3 data rows + bottom border = 7
            expect(lines).toHaveLength(7);
        });

        it('should handle empty rows', () => {
            const columns: TableColumn[] = [
                { header: 'Header', width: 8 },
            ];
            const rows: string[][] = [];

            const result = renderTable(columns, rows);
            const lines = result.split('\n');

            // top border + header + separator + bottom border = 4
            expect(lines).toHaveLength(4);
        });

        it('should handle right-aligned columns', () => {
            const columns: TableColumn[] = [
                { header: 'Count', width: 8, align: 'right' },
            ];
            const rows = [['42']];

            const result = renderTable(columns, rows);
            // The value should be right-padded within the cell
            expect(result).toContain('42');
        });

        it('should handle missing cell values gracefully', () => {
            const columns: TableColumn[] = [
                { header: 'A', width: 4 },
                { header: 'B', width: 4 },
            ];
            const rows = [['x']]; // missing second column

            const result = renderTable(columns, rows);
            expect(result).toContain('x');
        });
    });
});
