import { ApprovalRequest } from '../types/task.js';
import { addApprovalRequest, addActivity } from '../utils/queue.js';
import { getCurrentRole, validateApprovalPermission } from '../utils/permission.js';
import { info, error } from '../utils/logger.js';

export interface RequestApprovalParams {
    title: string;
    description: string;
    type: 'design' | 'implementation' | 'skill' | 'other';
}

export interface RequestApprovalResult {
    success: boolean;
    approvalId?: string;
    error?: string;
}

export async function requestApproval(params: RequestApprovalParams): Promise<RequestApprovalResult> {
    const role = getCurrentRole();

    // Validate permission
    const permission = validateApprovalPermission(role);
    if (!permission.allowed) {
        return {
            success: false,
            error: permission.reason,
        };
    }

    try {
        const approval = await addApprovalRequest({
            title: params.title,
            description: params.description,
            type: params.type,
            requestedBy: role,
        });

        // Log activity
        await addActivity({
            role,
            action: 'request_approval',
            details: `Requested ${params.type} approval: ${params.title}`,
        });

        info(`Approval requested by ${role}`, { approvalId: approval.id, title: params.title });

        return {
            success: true,
            approvalId: approval.id,
        };
    } catch (err) {
        error('Failed to request approval', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export function formatApprovalRequest(result: RequestApprovalResult, params: RequestApprovalParams): string {
    if (!result.success) {
        return `❌ 承認依頼に失敗しました: ${result.error}`;
    }

    let output = `📋 承認依頼を送信しました。\n\n`;
    output += `**${params.title}**\n`;
    output += `タイプ: ${params.type}\n`;
    output += `ID: ${result.approvalId}\n\n`;
    output += `社長（ユーザー）がダッシュボードで確認・承認できます。\n`;
    output += `承認待ち状態です。`;

    return output;
}
