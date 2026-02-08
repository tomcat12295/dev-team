import { addApprovalRequest, addActivity, getDashboard } from '../utils/queue.js';
import { getCurrentRole } from '../utils/permission.js';
import { canRequestMemberDecrease } from '../config/permissions.js';
import { getMemberCount, getMemberRoles } from '../config/team-config.js';
import { info, error } from '../utils/logger.js';

export interface RequestMemberDecreaseParams {
    count: number;
    reason: string;
}

export interface RequestMemberDecreaseResult {
    success: boolean;
    approvalId?: string;
    currentCount?: number;
    requestedCount?: number;
    newTotal?: number;
    error?: string;
}

export async function requestMemberDecrease(params: RequestMemberDecreaseParams): Promise<RequestMemberDecreaseResult> {
    const role = getCurrentRole();

    // Validate permission (leader only)
    if (!canRequestMemberDecrease(role)) {
        return {
            success: false,
            error: `Role '${role}' is not allowed to request member decrease. Only Leader can request member decrease.`,
        };
    }

    // Validate count (1-4)
    if (params.count < 1 || params.count > 4) {
        return {
            success: false,
            error: `Invalid count: ${params.count}. Count must be between 1 and 4.`,
        };
    }

    try {
        const currentCount = getMemberCount();
        const requestedCount = params.count;
        const newTotal = currentCount - requestedCount;

        // Validate that new total is at least 1
        if (newTotal < 1) {
            return {
                success: false,
                error: `Cannot decrease members: current count is ${currentCount}, requested decrease is ${requestedCount}. At least 1 member must remain.`,
            };
        }

        // Check if any members have in-progress tasks
        const dashboard = await getDashboard();
        const memberRoles = getMemberRoles();
        const membersWithTasks: string[] = [];

        for (const member of memberRoles) {
            const status = dashboard.memberStatus[member];
            if (status && status.currentTask) {
                membersWithTasks.push(member);
            }
        }

        if (membersWithTasks.length > 0) {
            return {
                success: false,
                error: `Cannot decrease members: the following members have in-progress tasks: ${membersWithTasks.join(', ')}. Complete or reassign their tasks first.`,
            };
        }

        const approval = await addApprovalRequest({
            title: `メンバー減員リクエスト: ${requestedCount}名`,
            description: params.reason,
            type: 'member_decrease',
            requestedBy: role,
            metadata: {
                currentCount,
                requestedCount,
                newTotal,
            },
        });

        // Log activity
        await addActivity({
            role,
            action: 'request_member_decrease',
            details: `Requested ${requestedCount} member decrease. Current: ${currentCount}, New total: ${newTotal}`,
        });

        info(`Member decrease requested by ${role}`, {
            approvalId: approval.id,
            currentCount,
            requestedCount,
            newTotal
        });

        return {
            success: true,
            approvalId: approval.id,
            currentCount,
            requestedCount,
            newTotal,
        };
    } catch (err) {
        error('Failed to request member decrease', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export function formatMemberDecreaseResult(result: RequestMemberDecreaseResult): string {
    if (!result.success) {
        return `❌ 減員リクエストに失敗しました: ${result.error}`;
    }

    let output = `📉 減員リクエストを送信しました。\n\n`;
    output += `**現在のメンバー数**: ${result.currentCount}名\n`;
    output += `**リクエスト減員数**: ${result.requestedCount}名\n`;
    output += `**承認後の合計**: ${result.newTotal}名\n\n`;
    output += `承認ID: ${result.approvalId}\n`;
    output += `PMの承認待ち状態です。`;

    return output;
}
