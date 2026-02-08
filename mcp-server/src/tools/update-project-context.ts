import { UpdateProjectContextParams, ProjectContextSection, ProjectContext } from '../types/memory.js';
import { updateProjectContext } from '../utils/memory.js';
import { getCurrentRole } from '../utils/permission.js';
import { addActivity } from '../utils/queue.js';
import { info, error } from '../utils/logger.js';

export interface UpdateProjectContextResult {
    success: boolean;
    context?: ProjectContext;
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

export async function updateProjectContextTool(
    params: UpdateProjectContextParams
): Promise<UpdateProjectContextResult> {
    const role = getCurrentRole();

    // 権限チェック: PM と Leader のみ
    if (role !== 'pm' && role !== 'leader') {
        return {
            success: false,
            error: 'プロジェクトコンテキストの更新は PM と Leader のみが実行できます。',
        };
    }

    // section のバリデーション
    if (!params.section || !VALID_SECTIONS.includes(params.section)) {
        return {
            success: false,
            error: `section は ${VALID_SECTIONS.join(', ')} のいずれかを指定してください。`,
        };
    }

    // content のバリデーション
    if (!params.content || typeof params.content !== 'string') {
        return {
            success: false,
            error: 'content は必須です。',
        };
    }

    const append = params.append ?? false;

    try {
        const context = await updateProjectContext(params.section, params.content, append);

        // アクティビティログ
        await addActivity({
            role,
            action: 'update_project_context',
            details: `Updated ${params.section}${append ? ' (appended)' : ''}`,
        });

        info(`Project context updated by ${role}`, { section: params.section, append });

        return {
            success: true,
            context,
        };
    } catch (err) {
        error('Failed to update project context', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export function formatUpdateProjectContextResult(
    result: UpdateProjectContextResult,
    params: UpdateProjectContextParams
): string {
    if (!result.success) {
        return `❌ プロジェクトコンテキストの更新に失敗しました: ${result.error}`;
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

    const mode = params.append ? '追記' : '更新';

    let output = `✅ プロジェクトコンテキストを${mode}しました。\n`;
    output += `セクション: ${sectionLabel[params.section]}\n`;
    output += `最終更新: ${result.context?.lastUpdated}\n`;

    return output;
}
