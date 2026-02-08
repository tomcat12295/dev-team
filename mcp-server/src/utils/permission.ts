import { Role } from '../types/task.js';
import { canSendTo, hasPermission, PermissionConfig, PERMISSIONS } from '../config/permissions.js';
import { isValidRole as isValidRoleFromConfig, getAllRoles, isMemberRole } from '../config/team-config.js';

export function getCurrentRole(): Role {
    const role = process.env.DEV_TEAM_ROLE;
    if (!role) {
        throw new Error('DEV_TEAM_ROLE environment variable is not set');
    }
    if (!isValidRole(role)) {
        throw new Error(`Invalid role: ${role}`);
    }
    return role as Role;
}

export function isValidRole(role: string): role is Role {
    return isValidRoleFromConfig(role);
}

type BooleanPermissionKey = Exclude<keyof PermissionConfig, 'canSendTo'>;

function validatePermission(
    role: Role,
    permission: BooleanPermissionKey,
    reason: string,
): { allowed: boolean; reason?: string } {
    if (!hasPermission(role, permission)) {
        return { allowed: false, reason: `Role '${role}' ${reason}` };
    }
    return { allowed: true };
}

export function validateSendPermission(from: Role, to: Role): { allowed: boolean; reason?: string } {
    if (!canSendTo(from, to)) {
        const allowedTargets = PERMISSIONS[from]?.canSendTo ?? [];
        return {
            allowed: false,
            reason: `Role '${from}' は '${to}' にメッセージを送信できません。送信可能: ${(allowedTargets as string[]).join(', ') || 'なし'}`,
        };
    }
    return { allowed: true };
}

export const validateApprovalPermission = (role: Role) =>
    validatePermission(role, 'canRequestApproval', 'is not allowed to request approvals. Only PM can request approvals.');

export const validateDashboardUpdatePermission = (role: Role) =>
    validatePermission(role, 'canUpdateDashboard', 'is not allowed to update the dashboard. Only PM and Leader can update.');

export const validateProcessApprovalPermission = (role: Role) =>
    validatePermission(role, 'canProcessApproval', 'is not allowed to process approvals. Only PM can process approvals.');

/**
 * leader専用操作のチェック
 */
export function validateLeaderOnly(role: Role | string, toolName: string): { allowed: boolean; reason?: string } {
    if (role !== 'leader') {
        return { allowed: false, reason: `${toolName}はleaderのみ使用可能です。現在の役割: ${role}` };
    }
    return { allowed: true };
}

/**
 * member専用操作のチェック
 */
export function validateMemberOnly(role: Role | string, toolName: string): { allowed: boolean; reason?: string } {
    if (!isMemberRole(role)) {
        return { allowed: false, reason: `${toolName}はmemberのみ使用可能です。現在の役割: ${role}` };
    }
    return { allowed: true };
}
