import { RecallMemoryParams, MemoryEntry, MemoryType } from '../types/memory.js';
import { recallMemory } from '../utils/memory.js';
import { getCurrentRole } from '../utils/permission.js';
import { info, error } from '../utils/logger.js';

export interface RecallMemoryResult {
    success: boolean;
    memories?: MemoryEntry[];
    error?: string;
}

export async function recallMemoryTool(params: RecallMemoryParams): Promise<RecallMemoryResult> {
    const role = getCurrentRole();

    // type のバリデーション
    if (params.type !== undefined && !['decision', 'note'].includes(params.type)) {
        return {
            success: false,
            error: 'type は "decision", "note" のいずれかを指定してください。',
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

    // limit のバリデーション
    const limit = params.limit ?? 10;
    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
        return {
            success: false,
            error: 'limit は 1〜100 の数値で指定してください。',
        };
    }

    try {
        const memories = await recallMemory(
            params.query,
            params.type as MemoryType | undefined,
            params.tags,
            limit
        );

        info(`Memory recalled by ${role}`, {
            query: params.query,
            type: params.type,
            resultCount: memories.length,
        });

        return {
            success: true,
            memories,
        };
    } catch (err) {
        error('Failed to recall memory', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

export function formatRecallMemoryResult(result: RecallMemoryResult, params: RecallMemoryParams): string {
    if (!result.success) {
        return `❌ メモリの検索に失敗しました: ${result.error}`;
    }

    const memories = result.memories || [];

    if (memories.length === 0) {
        let output = `📭 該当するメモリが見つかりませんでした。\n`;
        if (params.query) {
            output += `検索キーワード: ${params.query}\n`;
        }
        if (params.type) {
            output += `タイプ: ${params.type}\n`;
        }
        if (params.tags && params.tags.length > 0) {
            output += `タグ: ${params.tags.join(', ')}\n`;
        }
        return output;
    }

    const typeLabel: Record<string, string> = {
        decision: '決定',
        note: 'メモ',
    };

    let output = `📚 ${memories.length}件のメモリが見つかりました。\n\n`;

    for (const memory of memories) {
        const date = new Date(memory.timestamp).toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });

        output += `---\n`;
        output += `**[${typeLabel[memory.type]}]** ${memory.title}\n`;
        output += `ID: ${memory.id} | 記録者: ${memory.role} | ${date}\n`;
        if (memory.tags && memory.tags.length > 0) {
            output += `タグ: ${memory.tags.join(', ')}\n`;
        }
        output += `\n${memory.content}\n\n`;
    }

    return output;
}
