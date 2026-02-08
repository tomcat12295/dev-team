import { addActivity } from '../utils/queue.js';
import { getCurrentRole } from '../utils/permission.js';
import { canRequestMemberIncrease } from '../config/permissions.js';
import { getMemberCount } from '../config/team-config.js';
import { addMember } from '../utils/team-session.js';
import { info, error } from '../utils/logger.js';

export interface RequestMemberIncreaseParams {
    count: number;
    reason: string;
}

export interface RequestMemberIncreaseResult {
    success: boolean;
    currentCount?: number;
    requestedCount?: number;
    newTotal?: number;
    addedRoles?: string[];
    error?: string;
}

export async function requestMemberIncrease(params: RequestMemberIncreaseParams): Promise<RequestMemberIncreaseResult> {
    const role = getCurrentRole();

    // Validate permission (leader only)
    if (!canRequestMemberIncrease(role)) {
        return {
            success: false,
            error: `Role '${role}' is not allowed to request member increase. Only Leader can request member increase.`,
        };
    }

    // Validate count (1-4)
    if (params.count < 1 || params.count > 4) {
        return {
            success: false,
            error: `Invalid count: ${params.count}. Count must be between 1 and 4.`,
        };
    }

    const projectPath = process.env.DEV_TEAM_PROJECT_PATH;

    if (!projectPath) {
        return {
            success: false,
            error: 'DEV_TEAM_PROJECT_PATH environment variable is not set',
        };
    }

    try {
        const currentCount = getMemberCount();
        const requestedCount = params.count;

        info('Adding members via TypeScript CLI', { projectPath, count: requestedCount });

        // Use TypeScript addMember function instead of PowerShell script
        const result = await addMember({
            projectPath,
            count: requestedCount,
        });

        // Log activity
        await addActivity({
            role,
            action: 'member_increase',
            details: `Added ${requestedCount} member(s): ${result.addedRoles.join(', ')}. Previous: ${result.previousCount}, New total: ${result.newCount}`,
        });

        info(`Member increase executed by ${role}`, {
            currentCount: result.previousCount,
            requestedCount,
            newTotal: result.newCount,
            addedRoles: result.addedRoles,
        });

        return {
            success: true,
            currentCount: result.previousCount,
            requestedCount,
            newTotal: result.newCount,
            addedRoles: result.addedRoles,
        };
    } catch (err) {
        error('Failed to increase members', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export function formatMemberIncreaseResult(result: RequestMemberIncreaseResult): string {
    if (!result.success) {
        return `❌ メンバー増員に失敗しました: ${result.error}`;
    }

    let output = `✅ メンバーを増員しました。\n\n`;
    output += `**増員前のメンバー数**: ${result.currentCount}名\n`;
    output += `**増員数**: ${result.requestedCount}名\n`;
    output += `**増員後の合計**: ${result.newTotal}名\n`;
    if (result.addedRoles && result.addedRoles.length > 0) {
        output += `**追加されたロール**: ${result.addedRoles.join(', ')}\n`;
    }
    output += `\n新しいメンバーのペインが追加されました。`;

    return output;
}
