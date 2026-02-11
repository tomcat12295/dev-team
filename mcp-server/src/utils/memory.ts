import * as fs from 'fs/promises';
import * as path from 'path';
import { MemoryEntry, MemoryType, ProjectContext, ProjectContextSection } from '../types/memory.js';
import { getDevTeamPath, generateMessageId } from './queue.js';
import { withFileLock, ensureFileExists } from './file-lock.js';
import { info, error, debug } from './logger.js';
import { Role } from '../types/task.js';

// パス取得関数
export function getMemoryDir(): string {
    return path.join(getDevTeamPath(), 'memory');
}

export function getMemoriesPath(): string {
    return path.join(getMemoryDir(), 'memories.jsonl');
}

export function getProjectContextPath(): string {
    return path.join(getMemoryDir(), 'project.md');
}

// project.md の初期テンプレート
const PROJECT_CONTEXT_TEMPLATE = `# Project Context

## What
（未設定）

## Why
（未設定）

## Who
（未設定）

## Constraints
（未設定）

## Current State
（未設定）

## Decisions
（未設定）

## Notes
（未設定）

## Preferences
（未設定）
`;

// セクション名のマッピング（snake_case -> Markdown見出し）
const SECTION_HEADERS: Record<ProjectContextSection, string> = {
    'what': 'What',
    'why': 'Why',
    'who': 'Who',
    'constraints': 'Constraints',
    'current_state': 'Current State',
    'decisions': 'Decisions',
    'notes': 'Notes',
    'preferences': 'Preferences',
};

// セクションの順序
const SECTION_ORDER: ProjectContextSection[] = [
    'what',
    'why',
    'who',
    'constraints',
    'current_state',
    'decisions',
    'notes',
    'preferences',
];

/**
 * memory ディレクトリと初期ファイルを作成
 */
export async function ensureMemoryStructure(): Promise<void> {
    const memoryDir = getMemoryDir();
    await fs.mkdir(memoryDir, { recursive: true });

    // memories.jsonl の初期化（存在しない場合のみ）
    const memoriesPath = getMemoriesPath();
    try {
        await fs.access(memoriesPath);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            await fs.writeFile(memoriesPath, '', 'utf-8');
            info('Created memories.jsonl');
        } else {
            throw err;
        }
    }

    // project.md の初期化（存在しない場合のみ）
    const projectPath = getProjectContextPath();
    try {
        await fs.access(projectPath);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            await fs.writeFile(projectPath, PROJECT_CONTEXT_TEMPLATE, 'utf-8');
            info('Created project.md with template');
        } else {
            throw err;
        }
    }
}

/**
 * メモリ保存結果
 */
export interface SaveMemoryOutcome {
    entry: MemoryEntry;
    updated: boolean;
}

/**
 * titleを正規化して重複判定に使用する
 * 比較時のみ使用し、保存するtitle自体は元の値を保持
 */
function normalizeTitle(title: string): string {
    return title
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g,
            s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
}

/**
 * メモリを保存（JSONL形式で追記、重複時は上書き更新）
 * 重複判定: type と normalizeTitle(title) が一致
 */
export async function saveMemory(
    role: Role,
    type: MemoryType,
    title: string,
    content: string,
    tags?: string[]
): Promise<SaveMemoryOutcome> {
    const memoriesPath = getMemoriesPath();
    await ensureFileExists(memoriesPath);

    let resultEntry: MemoryEntry;
    let updated = false;

    await withFileLock(memoriesPath, async () => {
        // 既存エントリを読み取り
        const fileContent = await fs.readFile(memoriesPath, 'utf-8');
        const lines = fileContent.trim().split('\n').filter(line => line.length > 0);
        const entries: MemoryEntry[] = [];
        for (const line of lines) {
            try {
                entries.push(JSON.parse(line) as MemoryEntry);
            } catch {
                // パース失敗行はスキップ
            }
        }

        // 重複チェック: type + normalizeTitle(title) が一致
        const normalizedTitle = normalizeTitle(title);
        const duplicateIndex = entries.findIndex(e => e.type === type && normalizeTitle(e.title) === normalizedTitle);

        if (duplicateIndex >= 0) {
            // 重複あり: 既存エントリを上書き更新（IDは維持）
            const existing = entries[duplicateIndex];
            existing.content = content;
            existing.timestamp = new Date().toISOString();
            existing.role = role;
            existing.tags = tags;

            // JSONL全体を再書き込み
            const newContent = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
            await fs.writeFile(memoriesPath, newContent, 'utf-8');

            resultEntry = existing;
            updated = true;
        } else {
            // 重複なし: 新規追記
            const id = generateMessageId();
            resultEntry = {
                id: `memory-${id}`,
                timestamp: new Date().toISOString(),
                role,
                type,
                title,
                content,
                tags,
            };
            const line = JSON.stringify(resultEntry) + '\n';
            await fs.appendFile(memoriesPath, line, 'utf-8');
        }
    });

    info(`Memory ${updated ? 'updated' : 'saved'}: ${resultEntry!.id}`, { type, title, role });
    return { entry: resultEntry!, updated };
}

/**
 * メモリを検索
 */
export async function recallMemory(
    query?: string,
    type?: MemoryType,
    tags?: string[],
    limit: number = 10
): Promise<MemoryEntry[]> {
    const memoriesPath = getMemoriesPath();

    try {
        await fs.access(memoriesPath);
    } catch {
        return [];
    }

    const content = await fs.readFile(memoriesPath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);

    const entries: MemoryEntry[] = [];
    for (const line of lines) {
        try {
            const entry = JSON.parse(line) as MemoryEntry;
            entries.push(entry);
        } catch (err) {
            debug(`Failed to parse memory line: ${line}`, err);
        }
    }

    // フィルタリング
    let filtered = entries;

    // type フィルタ
    if (type) {
        filtered = filtered.filter(e => e.type === type);
    }

    // tags フィルタ（OR検索）
    if (tags && tags.length > 0) {
        filtered = filtered.filter(e => {
            if (!e.tags) return false;
            return tags.some(tag => e.tags!.includes(tag));
        });
    }

    // query フィルタ（title, content を検索）
    if (query) {
        const lowerQuery = query.toLowerCase();
        filtered = filtered.filter(e => {
            const titleMatch = e.title.toLowerCase().includes(lowerQuery);
            const contentMatch = e.content.toLowerCase().includes(lowerQuery);
            const tagMatch = e.tags?.some(t => t.toLowerCase().includes(lowerQuery)) ?? false;
            return titleMatch || contentMatch || tagMatch;
        });
    }

    // 新しい順にソートして上限を適用
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return filtered.slice(0, limit);
}

/**
 * project.md をパースしてProjectContextを取得
 */
export async function getProjectContext(): Promise<ProjectContext> {
    const projectPath = getProjectContextPath();

    let content: string;
    try {
        content = await fs.readFile(projectPath, 'utf-8');
    } catch {
        // ファイルが存在しない場合はデフォルト値を返す
        return {
            what: '（未設定）',
            why: '（未設定）',
            who: '（未設定）',
            constraints: '（未設定）',
            currentState: '（未設定）',
            decisions: '（未設定）',
            notes: '（未設定）',
            preferences: '（未設定）',
            lastUpdated: new Date().toISOString(),
        };
    }

    return parseProjectContext(content);
}

/**
 * Markdown文字列をパースしてProjectContextを生成
 */
function parseProjectContext(markdown: string): ProjectContext {
    const context: ProjectContext = {
        what: '',
        why: '',
        who: '',
        constraints: '',
        currentState: '',
        decisions: '',
        notes: '',
        preferences: '',
        lastUpdated: new Date().toISOString(),
    };

    // セクションごとに分割
    const sectionRegex = /^## (.+)$/gm;
    const sections: { name: string; start: number; end?: number }[] = [];
    let match: RegExpExecArray | null;

    while ((match = sectionRegex.exec(markdown)) !== null) {
        if (sections.length > 0) {
            sections[sections.length - 1].end = match.index;
        }
        sections.push({
            name: match[1].trim(),
            start: match.index + match[0].length,
        });
    }

    if (sections.length > 0) {
        sections[sections.length - 1].end = markdown.length;
    }

    // 各セクションの内容を抽出
    for (const section of sections) {
        const sectionContent = markdown.substring(section.start, section.end).trim();

        // セクション名をキーにマッピング
        const key = Object.entries(SECTION_HEADERS).find(
            ([_, header]) => header.toLowerCase() === section.name.toLowerCase()
        )?.[0] as ProjectContextSection | undefined;

        if (key) {
            switch (key) {
                case 'what':
                    context.what = sectionContent;
                    break;
                case 'why':
                    context.why = sectionContent;
                    break;
                case 'who':
                    context.who = sectionContent;
                    break;
                case 'constraints':
                    context.constraints = sectionContent;
                    break;
                case 'current_state':
                    context.currentState = sectionContent;
                    break;
                case 'decisions':
                    context.decisions = sectionContent;
                    break;
                case 'notes':
                    context.notes = sectionContent;
                    break;
                case 'preferences':
                    context.preferences = sectionContent;
                    break;
            }
        }
    }

    return context;
}

/**
 * プロジェクトコンテキストの特定セクションを更新
 */
export async function updateProjectContext(
    section: ProjectContextSection,
    content: string,
    append: boolean = false
): Promise<ProjectContext> {
    const projectPath = getProjectContextPath();
    await ensureFileExists(projectPath);

    // コンテンツ内の ## を ### に変換して、パース時のセクション検出との衝突を回避
    const sanitizedContent = content.replace(/^## /gm, '### ');

    return withFileLock(projectPath, async () => {
        let markdown: string;
        try {
            markdown = await fs.readFile(projectPath, 'utf-8');
        } catch {
            markdown = PROJECT_CONTEXT_TEMPLATE;
        }

        // 現在のコンテキストをパース
        const context = parseProjectContext(markdown);

        // セクションを更新
        const sectionKey = section === 'current_state' ? 'currentState' : section;
        if (append) {
            const currentValue = context[sectionKey as keyof Omit<ProjectContext, 'lastUpdated'>];
            const separator = currentValue && currentValue !== '（未設定）' ? '\n\n' : '';
            (context as unknown as Record<string, string>)[sectionKey] =
                (currentValue === '（未設定）' ? '' : currentValue) + separator + sanitizedContent;
        } else {
            (context as unknown as Record<string, string>)[sectionKey] = sanitizedContent;
        }
        context.lastUpdated = new Date().toISOString();

        // Markdownを再生成
        const newMarkdown = generateProjectContextMarkdown(context);
        await fs.writeFile(projectPath, newMarkdown, 'utf-8');

        info(`Project context updated: ${section}`, { append });
        return context;
    });
}

/**
 * ProjectContextからMarkdownを生成
 */
function generateProjectContextMarkdown(context: ProjectContext): string {
    const lines: string[] = ['# Project Context', ''];

    for (const section of SECTION_ORDER) {
        const header = SECTION_HEADERS[section];
        lines.push(`## ${header}`);

        // セクションキーを取得
        const key = section === 'current_state' ? 'currentState' : section;
        const content = context[key as keyof Omit<ProjectContext, 'lastUpdated'>] || '（未設定）';
        lines.push(content);
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * プロジェクトコンテキストの特定セクションのみ取得
 */
export function getProjectContextSection(
    context: ProjectContext,
    section: ProjectContextSection
): string {
    const key = section === 'current_state' ? 'currentState' : section;
    return context[key as keyof Omit<ProjectContext, 'lastUpdated'>] || '（未設定）';
}

/**
 * メンバーのタスク情報
 */
export interface MemberTaskInfo {
    taskId: string;
    title: string;
    phase: string;
    startTime: string;
    memo?: string;
}

/**
 * current_stateの内容をパースしてメンバーごとのタスク情報を抽出
 */
export function parseCurrentStateSections(content: string): Record<string, MemberTaskInfo> {
    const sections: Record<string, MemberTaskInfo> = {};

    if (!content || content === '（未設定）') {
        return sections;
    }

    // ### member-XX のセクションを検索
    const memberRegex = /### (member-\d+)\n([\s\S]*?)(?=### member-\d+|## |$)/g;
    let match: RegExpExecArray | null;

    while ((match = memberRegex.exec(content)) !== null) {
        const memberName = match[1];
        const sectionContent = match[2];

        // 各フィールドを抽出
        const taskIdMatch = sectionContent.match(/- タスクID: (T-\d+)/);
        const titleMatch = sectionContent.match(/- タスク名: (.+)/);
        const phaseMatch = sectionContent.match(/- フェーズ: (\w+)/);
        const startMatch = sectionContent.match(/- 開始: (.+)/);
        const memoMatch = sectionContent.match(/- メモ: (.+)/);

        if (taskIdMatch && titleMatch && phaseMatch) {
            sections[memberName] = {
                taskId: taskIdMatch[1],
                title: titleMatch[1].trim(),
                phase: phaseMatch[1],
                startTime: startMatch ? startMatch[1].trim() : new Date().toISOString(),
                memo: memoMatch ? memoMatch[1].trim() : undefined,
            };
        }
    }

    return sections;
}

/**
 * メンバータスク情報からcurrent_state用のMarkdownを生成
 */
export function generateCurrentStateMarkdown(
    sections: Record<string, MemberTaskInfo>,
    lastUpdated: string
): string {
    const memberNames = Object.keys(sections).sort();

    if (memberNames.length === 0) {
        return `## 進行中タスク\n\n（なし）\n\n## 最終更新\n${lastUpdated} by system`;
    }

    let markdown = '## 進行中タスク\n\n';

    for (const memberName of memberNames) {
        const task = sections[memberName];
        markdown += `### ${memberName}\n`;
        markdown += `- タスクID: ${task.taskId}\n`;
        markdown += `- タスク名: ${task.title}\n`;
        markdown += `- フェーズ: ${task.phase}\n`;
        markdown += `- 開始: ${task.startTime}\n`;
        if (task.memo) {
            markdown += `- メモ: ${task.memo}\n`;
        }
        markdown += '\n';
    }

    markdown += `## 最終更新\n${lastUpdated} by system`;

    return markdown;
}

/**
 * レビューモードを取得
 * preferencesセクションからreviewModeを読み取る
 * デフォルトは'normal'
 */
export async function getReviewMode(): Promise<'normal' | 'strict'> {
    const context = await getProjectContext();
    if (!context.preferences || context.preferences === '（未設定）') {
        return 'normal';
    }
    const match = context.preferences.match(/reviewMode:\s*(normal|strict)/);
    return match ? (match[1] as 'normal' | 'strict') : 'normal';
}

/**
 * タスク分割承認モードを取得
 * preferencesセクションからtaskSplitApprovalを読み取る
 * デフォルトはauto（承認不要）
 */
export async function getTaskSplitApproval(): Promise<'auto' | 'required'> {
    const context = await getProjectContext();
    if (!context.preferences || context.preferences === '（未設定）') {
        return 'auto';
    }
    const match = context.preferences.match(/taskSplitApproval:\s*(auto|required|true|false)/);
    if (!match) return 'auto';
    if (match[1] === 'required' || match[1] === 'true') return 'required';
    return 'auto';
}
