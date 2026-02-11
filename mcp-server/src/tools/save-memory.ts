import { SaveMemoryParams, MemoryEntry, MemoryType } from '../types/memory.js';
import { saveMemory } from '../utils/memory.js';
import { getCurrentRole } from '../utils/permission.js';
import { addActivity } from '../utils/queue.js';
import { info, error } from '../utils/logger.js';
import { validateRequiredString } from '../utils/validation.js';

export interface SaveMemoryResult {
    success: boolean;
    memoryId?: string;
    updated?: boolean;
    error?: string;
}

export async function saveMemoryTool(params: SaveMemoryParams): Promise<SaveMemoryResult> {
    const role = getCurrentRole();

    // バリデーション
    if (!params.type || !['decision', 'note'].includes(params.type)) {
        return {
            success: false,
            error: 'type は "decision", "note" のいずれかを指定してください。',
        };
    }

    const titleValidation = validateRequiredString(params.title, 'title');
    if (!titleValidation.valid) {
        return {
            success: false,
            error: titleValidation.error,
        };
    }

    const contentValidation = validateRequiredString(params.content, 'content');
    if (!contentValidation.valid) {
        return {
            success: false,
            error: contentValidation.error,
        };
    }

    // tags のバリデーション
    if (params.tags !== undefined) {
        if (!Array.isArray(params.tags)) {
            return {
                success: false,
                error: 'tags は配列で指定してください。',
            };
        }
        if (!params.tags.every(t => typeof t === 'string')) {
            return {
                success: false,
                error: 'tags の各要素は文字列である必要があります。',
            };
        }
    }

    try {
        const { entry, updated } = await saveMemory(
            role,
            params.type,
            params.title,
            params.content,
            params.tags
        );

        // アクティビティログ
        await addActivity({
            role,
            action: 'save_memory',
            details: `${updated ? 'Updated' : 'Saved'} ${params.type}: ${params.title}`,
        });

        info(`Memory ${updated ? 'updated' : 'saved'} by ${role}`, { memoryId: entry.id, type: params.type });

        return {
            success: true,
            memoryId: entry.id,
            updated,
        };
    } catch (err) {
        error('Failed to save memory', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export function formatSaveMemoryResult(result: SaveMemoryResult, params: SaveMemoryParams): string {
    if (!result.success) {
        return `❌ メモリの保存に失敗しました: ${result.error}`;
    }

    const typeLabel = {
        decision: '決定事項',
        note: 'メモ',
    }[params.type];

    const actionLabel = result.updated ? '更新しました' : '保存しました';
    let output = `✅ ${typeLabel}を${actionLabel}。\n`;
    output += `ID: ${result.memoryId}\n`;
    output += `タイトル: ${params.title}\n`;
    if (params.tags && params.tags.length > 0) {
        output += `タグ: ${params.tags.join(', ')}\n`;
    }

    return output;
}
