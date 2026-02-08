import * as fs from 'fs';
import * as path from 'path';
import { debug } from '../utils/logger.js';

export interface MemberPermissionTemplate {
    canSendTo: string[];
    canRequestApproval: boolean;
    canProcessApproval: boolean;
    canUpdateDashboard: boolean;
}

export interface TeamConfig {
    version: string;
    team: {
        fixedRoles: string[];
        members: {
            count: number;
            prefix: string;
            startIndex: number;
        };
    };
    permissionTemplates: {
        member: MemberPermissionTemplate;
    };
}

const DEFAULT_CONFIG: TeamConfig = {
    version: '1.0',
    team: {
        fixedRoles: ['pm', 'leader'],
        members: {
            count: 2,
            prefix: 'member-',
            startIndex: 1,
        },
    },
    permissionTemplates: {
        member: {
            canSendTo: ['leader'],
            canRequestApproval: false,
            canProcessApproval: false,
            canUpdateDashboard: false,
        },
    },
};

function isValidConfig(config: unknown): config is TeamConfig {
    if (typeof config !== 'object' || config === null) {
        return false;
    }

    const c = config as TeamConfig;

    if (
        !c.team ||
        !c.team.members ||
        typeof c.team.members.count !== 'number' ||
        typeof c.team.members.startIndex !== 'number'
    ) {
        return false;
    }

    if (c.team.members.count <= 0) {
        return false;
    }

    if (c.team.members.startIndex < 0) {
        return false;
    }

    return true;
}

export function getTeamConfig(): TeamConfig {
    const projectPath = process.env.DEV_TEAM_PROJECT_PATH;

    if (!projectPath) {
        debug('DEV_TEAM_PROJECT_PATH not set, using default config');
        return DEFAULT_CONFIG;
    }

    const configPath = path.join(projectPath, '.dev-team', 'config', 'team.json');

    if (!fs.existsSync(configPath)) {
        debug(`Config file not found: ${configPath}, using default config`);
        return DEFAULT_CONFIG;
    }

    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(content);

        if (!isValidConfig(parsed)) {
            debug('Config validation failed, using default config');
            return DEFAULT_CONFIG;
        }

        return parsed;
    } catch {
        debug('Failed to read/parse config, using default config');
        return DEFAULT_CONFIG;
    }
}

function generateMemberRoles(config: TeamConfig): string[] {
    const { prefix, count, startIndex } = config.team.members;
    const members: string[] = [];

    for (let i = 0; i < count; i++) {
        const index = startIndex + i;
        const paddedIndex = index.toString().padStart(2, '0');
        members.push(`${prefix}${paddedIndex}`);
    }

    return members;
}

export function getAllRoles(): string[] {
    const config = getTeamConfig();
    const fixedRoles = config.team.fixedRoles;
    const memberRoles = generateMemberRoles(config);

    return [...fixedRoles, ...memberRoles];
}

export function getMemberRoles(): string[] {
    const config = getTeamConfig();
    return generateMemberRoles(config);
}

export function getFixedRoles(): string[] {
    const config = getTeamConfig();
    return [...config.team.fixedRoles];
}

export function isValidRole(role: string): boolean {
    if (!role) {
        return false;
    }
    const allRoles = getAllRoles();
    return allRoles.includes(role);
}

export function isMemberRole(role: string): boolean {
    const memberRoles = getMemberRoles();
    return memberRoles.includes(role);
}

export function getMemberCount(): number {
    const config = getTeamConfig();
    return config.team.members.count;
}
