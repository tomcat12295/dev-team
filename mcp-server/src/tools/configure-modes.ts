import { getCurrentRole } from '../utils/permission.js';
import { getProjectContext, updateProjectContext, getReviewMode, getTaskSplitApproval } from '../utils/memory.js';
import { info, error } from '../utils/logger.js';

export type ReviewMode = 'normal' | 'strict';
export type TaskSplitApproval = 'auto' | 'required';

export interface ModeSettings {
    reviewMode: ReviewMode;
    taskSplitApproval: TaskSplitApproval;
}

export interface ConfigureModesParams {
    reviewMode?: ReviewMode;
    taskSplitApproval?: TaskSplitApproval;
}

export interface ConfigureModesResult {
    success: boolean;
    currentSettings?: ModeSettings;
    settings?: ModeSettings;
    error?: string;
}

export async function configureModes(params: ConfigureModesParams): Promise<ConfigureModesResult> {
    const role = getCurrentRole();

    // PMのみ使用可能
    if (role !== 'pm') {
        return {
            success: false,
            error: `configure_modesはPMのみ使用可能です。現在の役割: ${role}`,
        };
    }

    try {
        // 現在の設定を取得
        const currentReviewMode = await getReviewMode();
        const currentTaskSplitApproval = await getTaskSplitApproval();

        const currentSettings: ModeSettings = {
            reviewMode: currentReviewMode,
            taskSplitApproval: currentTaskSplitApproval,
        };

        // パラメータがない場合は現在の設定のみ返す
        if (params.reviewMode === undefined && params.taskSplitApproval === undefined) {
            info('Returning current mode settings', { currentSettings });
            return {
                success: true,
                currentSettings,
                settings: currentSettings,
            };
        }

        // 新しい設定値を決定
        const newReviewMode = params.reviewMode ?? currentReviewMode;
        const newTaskSplitApproval = params.taskSplitApproval ?? currentTaskSplitApproval;

        // reviewModeのバリデーション
        if (params.reviewMode !== undefined && params.reviewMode !== 'normal' && params.reviewMode !== 'strict') {
            return {
                success: false,
                error: `無効なreviewModeです: ${params.reviewMode}。'normal' または 'strict' を指定してください。`,
            };
        }

        // preferencesを更新
        const context = await getProjectContext();
        let newPreferences: string;

        // 新しいpreferences内容を構築
        const preferencesLines: string[] = [];
        preferencesLines.push(`reviewMode: ${newReviewMode}`);
        preferencesLines.push(`taskSplitApproval: ${newTaskSplitApproval}`);

        // 既存のpreferencesから上記以外の設定を保持
        if (context.preferences && context.preferences !== '（未設定）') {
            const existingLines = context.preferences.split('\n');
            for (const line of existingLines) {
                const trimmedLine = line.trim();
                if (trimmedLine &&
                    !trimmedLine.startsWith('reviewMode:') &&
                    !trimmedLine.startsWith('taskSplitApproval:')) {
                    preferencesLines.push(trimmedLine);
                }
            }
        }

        newPreferences = preferencesLines.join('\n');

        await updateProjectContext('preferences', newPreferences, false);

        const newSettings: ModeSettings = {
            reviewMode: newReviewMode,
            taskSplitApproval: newTaskSplitApproval,
        };

        info('Mode settings updated', { currentSettings, newSettings });

        return {
            success: true,
            currentSettings,
            settings: newSettings,
        };
    } catch (err) {
        error('Failed to configure modes', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export function formatConfigureModesResult(result: ConfigureModesResult): string {
    if (!result.success) {
        return `❌ モード設定に失敗しました: ${result.error}`;
    }

    let output = `✅ モード設定\n\n`;

    // 変更前の設定を表示
    if (result.currentSettings) {
        output += `## 現在の設定\n`;
        output += `- **reviewMode**: ${result.currentSettings.reviewMode}\n`;
        output += `  - normal: leaderのレビューで完了\n`;
        output += `  - strict: テストファーストレビュー（実装前にテストをレビュー）\n`;
        output += `- **taskSplitApproval**: ${result.currentSettings.taskSplitApproval}\n`;
        output += `  - auto: タスク分割は承認不要（leader一任）\n`;
        output += `  - required: タスク分割にPM承認が必要\n\n`;
    }

    // 変更後の設定を表示（変更があった場合）
    if (result.settings &&
        result.currentSettings &&
        (result.settings.reviewMode !== result.currentSettings.reviewMode ||
         result.settings.taskSplitApproval !== result.currentSettings.taskSplitApproval)) {
        output += `## 更新後の設定\n`;
        output += `- **reviewMode**: ${result.settings.reviewMode}`;
        if (result.settings.reviewMode !== result.currentSettings.reviewMode) {
            output += ` ← 変更`;
        }
        output += `\n`;
        output += `- **taskSplitApproval**: ${result.settings.taskSplitApproval}`;
        if (result.settings.taskSplitApproval !== result.currentSettings.taskSplitApproval) {
            output += ` ← 変更`;
        }
        output += `\n`;
    }

    return output;
}
