import { sendTextToPane } from '../utils/wezterm.js';
import { getCurrentRole, isValidRole } from '../utils/permission.js';
import { Role } from '../types/task.js';
import { info, error } from '../utils/logger.js';

export interface ClearAgentResult {
    success: boolean;
    role?: string;
    error?: string;
}

export async function clearAgent(role: string): Promise<ClearAgentResult> {
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
        const sent = await sendTextToPane(role as Role, '/clear');
        if (sent) {
            info(`Clear command sent to ${role}`);
            return {
                success: true,
                role,
            };
        } else {
            return {
                success: false,
                role,
                error: `${role}へのclear送信に失敗しました`,
            };
        }
    } catch (err) {
        error(`Failed to send clear to ${role}`, err);
        return {
            success: false,
            role,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export function formatClearAgentResult(result: ClearAgentResult): string {
    if (!result.success) {
        return `❌ clear送信に失敗しました: ${result.error}`;
    }
    return `✅ ${result.role}に/clearを送信しました。`;
}
