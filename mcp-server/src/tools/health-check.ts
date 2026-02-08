import { healthCheck as weztermHealthCheck } from '../utils/wezterm.js';
import { getCurrentRole, isValidRole } from '../utils/permission.js';
import { info } from '../utils/logger.js';

export interface HealthCheckResult {
    success: boolean;
    role: string;
    projectPath: string;
    wezterm: {
        available: boolean;
        panes: Array<{ paneId: string; title: string }>;
        mapping: Record<string, string>;
    };
    environment: {
        DEV_TEAM_ROLE: string | undefined;
        DEV_TEAM_PROJECT_PATH: string | undefined;
    };
    errors: string[];
}

export async function healthCheck(): Promise<HealthCheckResult> {
    const errors: string[] = [];

    // Check environment variables
    const roleEnv = process.env.DEV_TEAM_ROLE;
    const projectPathEnv = process.env.DEV_TEAM_PROJECT_PATH;

    let role = 'unknown';
    if (!roleEnv) {
        errors.push('DEV_TEAM_ROLE environment variable is not set');
    } else if (!isValidRole(roleEnv)) {
        errors.push(`Invalid DEV_TEAM_ROLE: ${roleEnv}`);
    } else {
        role = roleEnv;
    }

    if (!projectPathEnv) {
        errors.push('DEV_TEAM_PROJECT_PATH environment variable is not set');
    }

    // Check WezTerm
    const weztermStatus = await weztermHealthCheck();

    if (!weztermStatus.wezterm) {
        errors.push('WezTerm CLI is not available');
    }

    const success = errors.length === 0;

    info(`Health check completed`, { success, errors });

    return {
        success,
        role,
        projectPath: projectPathEnv || 'not set',
        wezterm: {
            available: weztermStatus.wezterm,
            panes: weztermStatus.panes,
            mapping: weztermStatus.mapping,
        },
        environment: {
            DEV_TEAM_ROLE: roleEnv,
            DEV_TEAM_PROJECT_PATH: projectPathEnv,
        },
        errors,
    };
}

export function formatHealthCheck(result: HealthCheckResult): string {
    let output = `# 🏥 ヘルスチェック結果\n\n`;

    output += result.success
        ? `✅ **全体ステータス: 正常**\n\n`
        : `❌ **全体ステータス: 異常あり**\n\n`;

    output += `## 環境設定\n`;
    output += `| 項目 | 値 |\n`;
    output += `|------|----|\n`;
    output += `| 役割 | ${result.role} |\n`;
    output += `| プロジェクトパス | ${result.projectPath} |\n`;
    output += `| DEV_TEAM_ROLE | ${result.environment.DEV_TEAM_ROLE || 'not set'} |\n`;
    output += `| DEV_TEAM_PROJECT_PATH | ${result.environment.DEV_TEAM_PROJECT_PATH || 'not set'} |\n\n`;

    output += `## WezTerm\n`;
    output += `| 項目 | 値 |\n`;
    output += `|------|----|\n`;
    output += `| CLI利用可能 | ${result.wezterm.available ? '✅ Yes' : '❌ No'} |\n`;
    output += `| 検出ペイン数 | ${result.wezterm.panes.length} |\n\n`;

    if (result.wezterm.panes.length > 0) {
        output += `### 検出されたペイン\n`;
        output += `| Pane ID | Title |\n`;
        output += `|---------|-------|\n`;
        for (const pane of result.wezterm.panes) {
            output += `| ${pane.paneId} | ${pane.title} |\n`;
        }
        output += `\n`;
    }

    output += `### ペインマッピング\n`;
    output += `| 役割 | Pane ID |\n`;
    output += `|------|--------|\n`;
    for (const [r, paneId] of Object.entries(result.wezterm.mapping)) {
        output += `| ${r} | ${paneId} |\n`;
    }
    output += `\n`;

    if (result.errors.length > 0) {
        output += `## ⚠️ エラー\n`;
        for (const err of result.errors) {
            output += `- ${err}\n`;
        }
    }

    return output;
}
