import { Role } from '../types/task.js';
import { getMemberRoles, getTeamConfig } from './team-config.js';

export interface PermissionConfig {
    canSendTo: Role[];
    canRequestApproval: boolean;
    canProcessApproval: boolean;
    canUpdateDashboard: boolean;
    canRequestMemberIncrease: boolean;
    canRequestMemberDecrease: boolean;
    // 計画モード用権限
    canAssignTask: boolean;
    canSubmitPlan: boolean;
    canApprovePlan: boolean;
}

function generatePermissions(): Record<string, PermissionConfig> {
    const config = getTeamConfig();
    const memberTemplate = config.permissionTemplates.member;
    const memberRoles = getMemberRoles();

    const permissions: Record<string, PermissionConfig> = {
        pm: {
            canSendTo: ['leader'],
            canRequestApproval: true,
            canProcessApproval: true,
            canUpdateDashboard: true,
            canRequestMemberIncrease: false,
            canRequestMemberDecrease: false,
            canAssignTask: false,
            canSubmitPlan: false,
            canApprovePlan: false,
        },
        leader: {
            canSendTo: ['pm', ...memberRoles] as Role[],
            canRequestApproval: false,
            canProcessApproval: false,
            canUpdateDashboard: true,
            canRequestMemberIncrease: true,
            canRequestMemberDecrease: true,
            canAssignTask: true,
            canSubmitPlan: false,
            canApprovePlan: true,
        },
    };

    // メンバー権限をテンプレートから動的生成
    memberRoles.forEach(role => {
        permissions[role] = {
            canSendTo: memberTemplate.canSendTo as Role[],
            canRequestApproval: memberTemplate.canRequestApproval,
            canProcessApproval: memberTemplate.canProcessApproval,
            canUpdateDashboard: memberTemplate.canUpdateDashboard,
            canRequestMemberIncrease: false,
            canRequestMemberDecrease: false,
            canAssignTask: false,
            canSubmitPlan: true,
            canApprovePlan: false,
        };
    });

    return permissions;
}

// Dynamically generate permissions on each access to support member changes at runtime
function getPermissions(): Record<string, PermissionConfig> {
    return generatePermissions();
}

// Backwards-compatible getter (used by tests)
export const PERMISSIONS = new Proxy({} as Record<string, PermissionConfig>, {
    get(_target, prop: string) {
        return getPermissions()[prop];
    },
    ownKeys() {
        return Object.keys(getPermissions());
    },
    getOwnPropertyDescriptor(_target, prop: string) {
        const perms = getPermissions();
        if (prop in perms) {
            return { configurable: true, enumerable: true, value: perms[prop] };
        }
        return undefined;
    },
});

export function canSendTo(from: Role, to: Role): boolean {
    const perms = getPermissions();
    return perms[from]?.canSendTo?.includes(to) ?? false;
}

type BooleanPermissionKey = Exclude<keyof PermissionConfig, 'canSendTo'>;

export function hasPermission(role: Role, permission: BooleanPermissionKey): boolean {
    const perms = getPermissions();
    return perms[role]?.[permission] ?? false;
}

export const canRequestApproval = (role: Role) => hasPermission(role, 'canRequestApproval');
export const canProcessApproval = (role: Role) => hasPermission(role, 'canProcessApproval');
export const canUpdateDashboard = (role: Role) => hasPermission(role, 'canUpdateDashboard');
export const canRequestMemberIncrease = (role: Role) => hasPermission(role, 'canRequestMemberIncrease');
export const canRequestMemberDecrease = (role: Role) => hasPermission(role, 'canRequestMemberDecrease');
export const canAssignTask = (role: Role) => hasPermission(role, 'canAssignTask');
export const canSubmitPlan = (role: Role) => hasPermission(role, 'canSubmitPlan');
export const canApprovePlan = (role: Role) => hasPermission(role, 'canApprovePlan');
