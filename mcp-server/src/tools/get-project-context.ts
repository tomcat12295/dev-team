import { GetProjectContextParams, ProjectContextSection, ProjectContext } from '../types/memory.js';
import { getProjectContext, getProjectContextSection } from '../utils/memory.js';
import { getCurrentRole } from '../utils/permission.js';
import { info, error } from '../utils/logger.js';

export interface GetProjectContextResult {
    success: boolean;
    context?: ProjectContext;
    section?: string;
    sectionName?: ProjectContextSection;
    error?: string;
}

const VALID_SECTIONS: ProjectContextSection[] = [
    'what',
    'why',
    'who',
    'constraints',
    'current_state',
    'decisions',
    'notes',
    'preferences',
];

export async function getProjectContextTool(
    params: GetProjectContextParams
): Promise<GetProjectContextResult> {
    const role = getCurrentRole();

    // section のバリデーション（指定された場合のみ）
    if (params.section !== undefined && !VALID_SECTIONS.includes(params.section)) {
        return {
            success: false,
            error: `section は ${VALID_SECTIONS.join(', ')} のいずれかを指定してください。`,
        };
    }

    try {
        const context = await getProjectContext();

        // 特定セクションのみ取得
        if (params.section) {
            const sectionContent = getProjectContextSection(context, params.section);
            info(`Project context section retrieved by ${role}`, { section: params.section });
            return {
                success: true,
                section: sectionContent,
                sectionName: params.section,
            };
        }

        // 全セクション取得
        info(`Full project context retrieved by ${role}`);
        return {
            success: true,
            context,
        };
    } catch (err) {
        error('Failed to get project context', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export function formatGetProjectContextResult(result: GetProjectContextResult): string {
    if (!result.success) {
        return `❌ プロジェクトコンテキストの取得に失敗しました: ${result.error}`;
    }

    const sectionLabel: Record<ProjectContextSection, string> = {
        what: 'What（プロジェクト概要）',
        why: 'Why（目的）',
        who: 'Who（ステークホルダー）',
        constraints: 'Constraints（制約）',
        current_state: 'Current State（現在の状態）',
        decisions: 'Decisions（決定事項）',
        notes: 'Notes（備考）',
        preferences: 'Preferences（ユーザー設定）',
    };

    // 特定セクションのみの場合
    if (result.section !== undefined && result.sectionName) {
        let output = `📋 **${sectionLabel[result.sectionName]}**\n\n`;
        output += result.section;
        return output;
    }

    // 全セクションの場合
    const context = result.context!;

    let output = `📋 **プロジェクトコンテキスト**\n`;
    output += `最終更新: ${context.lastUpdated}\n\n`;

    output += `## What（プロジェクト概要）\n${context.what}\n\n`;
    output += `## Why（目的）\n${context.why}\n\n`;
    output += `## Who（ステークホルダー）\n${context.who}\n\n`;
    output += `## Constraints（制約）\n${context.constraints}\n\n`;
    output += `## Current State（現在の状態）\n${context.currentState}\n\n`;
    output += `## Decisions（決定事項）\n${context.decisions}\n\n`;
    output += `## Notes（備考）\n${context.notes}\n\n`;
    output += `## Preferences（ユーザー設定）\n${context.preferences}\n`;

    return output;
}
