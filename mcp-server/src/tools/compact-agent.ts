import { sendTextToPane } from '../utils/wezterm.js';
import { getCurrentRole, isValidRole } from '../utils/permission.js';
import { Role } from '../types/task.js';
import { info, error } from '../utils/logger.js';

export interface CompactAgentResult {
    success: boolean;
    role?: string;
    error?: string;
}

export async function compactAgent(role: string): Promise<CompactAgentResult> {
    const currentRole = getCurrentRole();

    // Permission check: PM and leader only
    if (currentRole !== 'pm' && currentRole !== 'leader') {
        return {
            success: false,
            error: 'このツールはPMとleaderのみが使用できます',
        };
    }

    // Validate target role
    if (!isValidRole(role)) {
        return {
            success: false,
            error: `無効なロール: ${role}`,
        };
    }

    try {
        const sent = await sendTextToPane(role as Role, '/compact');
        if (sent) {
            info(`Compact command sent to ${role}`);
            return {
                success: true,
                role,
            };
        } else {
            return {
                success: false,
                role,
                error: `${role}へのcompact送信に失敗しました`,
            };
        }
    } catch (err) {
        error(`Failed to send compact to ${role}`, err);
        return {
            success: false,
            role,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export function formatCompactAgentResult(result: CompactAgentResult): string {
    if (!result.success) {
        return `❌ compact送信に失敗しました: ${result.error}`;
    }
    return `✅ ${result.role}に/compactを送信しました。`;
}
