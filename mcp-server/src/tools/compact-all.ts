import { sendTextToPane } from '../utils/wezterm.js';
import { getCurrentRole } from '../utils/permission.js';
import { Role } from '../types/task.js';
import { info, error } from '../utils/logger.js';
import { getAllRoles } from '../config/team-config.js';

export interface CompactAllResult {
    success: boolean;
    results: Array<{ role: string; sent: boolean }>;
    error?: string;
}

export async function compactAll(): Promise<CompactAllResult> {
    const currentRole = getCurrentRole();

    // Permission check: PM and leader only
    if (currentRole !== 'pm' && currentRole !== 'leader') {
        return {
            success: false,
            results: [],
            error: 'このツールはPMとleaderのみが使用できます',
        };
    }

    try {
        const roles = getAllRoles();
        const results: Array<{ role: string; sent: boolean }> = [];

        // Send compact to all roles in parallel
        const promises = roles.map(async (role) => {
            try {
                const sent = await sendTextToPane(role as Role, '/compact');
                return { role, sent };
            } catch (err) {
                error(`Failed to send compact to ${role}`, err);
                return { role, sent: false };
            }
        });

        const settled = await Promise.all(promises);
        results.push(...settled);

        const allSuccess = results.every(r => r.sent);
        info(`Compact all completed`, { results });

        return {
            success: allSuccess,
            results,
        };
    } catch (err) {
        error('Failed to compact all', err);
        return {
            success: false,
            results: [],
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export function formatCompactAllResult(result: CompactAllResult): string {
    if (result.error) {
        return `❌ compact_allに失敗しました: ${result.error}`;
    }

    let output = `## compact_all 結果\n\n`;
    output += `| ロール | 結果 |\n`;
    output += `|--------|------|\n`;
    for (const r of result.results) {
        output += `| ${r.role} | ${r.sent ? '✅' : '❌'} |\n`;
    }

    const successCount = result.results.filter(r => r.sent).length;
    output += `\n**送信成功:** ${successCount}/${result.results.length}`;

    return output;
}
