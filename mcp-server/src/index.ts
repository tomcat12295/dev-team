#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ErrorCode,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { checkQueue, formatQueueResult } from './tools/check-queue.js';
import { sendTask, formatSendResult } from './tools/send-task.js';
import { requestApproval, formatApprovalRequest } from './tools/request-approval.js';
import { processApproval, formatProcessApprovalResult } from './tools/process-approval.js';
import { getDashboardInfo, formatDashboard } from './tools/get-dashboard.js';
import { updateTaskStatus, formatUpdateResult } from './tools/update-task-status.js';
import { healthCheck, formatHealthCheck } from './tools/health-check.js';
import { addBacklog, formatAddBacklogResult } from './tools/add-backlog.js';
import { getBacklog, formatGetBacklogResult } from './tools/get-backlog.js';
import { updateBacklog, formatUpdateBacklogResult } from './tools/update-backlog.js';
import { requestMemberIncrease, formatMemberIncreaseResult } from './tools/request-member-increase.js';
import { requestMemberDecrease, formatMemberDecreaseResult } from './tools/request-member-decrease.js';
import { assignTask, formatAssignTaskResult } from './tools/assign-task.js';
import { distributeTasks, formatDistributeTasksResult } from './tools/distribute-tasks.js';
import { submitPlan, formatSubmitPlanResult } from './tools/submit-plan.js';
import { approvePlan, formatApprovePlanResult } from './tools/approve-plan.js';
import { rejectPlan, formatRejectPlanResult } from './tools/reject-plan.js';
import { saveMemoryTool, formatSaveMemoryResult } from './tools/save-memory.js';
import { recallMemoryTool, formatRecallMemoryResult } from './tools/recall-memory.js';
import { updateProjectContextTool, formatUpdateProjectContextResult } from './tools/update-project-context.js';
import { getProjectContextTool, formatGetProjectContextResult } from './tools/get-project-context.js';
import { archiveAllTasksTool, formatArchiveAllTasksResult } from './tools/archive-all-tasks.js';
import { compactAgent, formatCompactAgentResult } from './tools/compact-agent.js';
import { clearAgent, formatClearAgentResult } from './tools/clear-agent.js';
import { compactAll, formatCompactAllResult } from './tools/compact-all.js';
import { configureModes, formatConfigureModesResult } from './tools/configure-modes.js';
import { submitTest, formatSubmitTestResult } from './tools/submit-test.js';
import { approveTest, formatApproveTestResult } from './tools/approve-test.js';
import { rejectTest, formatRejectTestResult } from './tools/reject-test.js';
import { ensureDevTeamStructure } from './utils/queue.js';
import { info, error, setLogLevel } from './utils/logger.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

// Set log level from environment
const logLevel = process.env.DEV_TEAM_LOG_LEVEL || 'info';
setLogLevel(logLevel as 'debug' | 'info' | 'warn' | 'error');

const server = new Server(
    {
        name: 'dev-team',
        version: pkg.version,
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'check_queue',
                description: '自分宛のタスクキューを確認します。未読メッセージを取得し、必要に応じて既読にマークします。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        mark_as_read: {
                            type: 'boolean',
                            description: '取得したメッセージを既読にマークするか（デフォルト: true）',
                            default: true,
                        },
                        format: {
                            type: 'string',
                            enum: ['full', 'summary'],
                            description: '出力形式。full=全メッセージ展開、summary=件名一覧のみ（デフォルト: full）',
                            default: 'full',
                        },
                    },
                },
            },
            {
                name: 'send_task',
                description: '他の役割にタスクまたはメッセージを送信します。送信先は役割の権限に基づいて制限されます。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        to: {
                            type: 'string',
                            enum: ['pm', 'leader', 'member-01', 'member-02'],
                            description: '送信先の役割',
                        },
                        subject: {
                            type: 'string',
                            description: 'メッセージの件名',
                        },
                        content: {
                            type: 'string',
                            description: 'メッセージの本文',
                        },
                        type: {
                            type: 'string',
                            enum: ['task', 'report', 'question', 'notification'],
                            description: 'メッセージの種類（デフォルト: task）',
                            default: 'task',
                        },
                    },
                    required: ['to', 'subject', 'content'],
                },
            },
            {
                name: 'request_approval',
                description: '社長（ユーザー）に承認を依頼します。PMのみが使用できます。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        title: {
                            type: 'string',
                            description: '承認依頼のタイトル',
                        },
                        description: {
                            type: 'string',
                            description: '承認依頼の詳細説明',
                        },
                        type: {
                            type: 'string',
                            enum: ['design', 'implementation', 'skill', 'other'],
                            description: '承認の種類',
                        },
                    },
                    required: ['title', 'description', 'type'],
                },
            },
            {
                name: 'process_approval',
                description: '承認依頼を処理します。PMのみが使用できます。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        approval_id: {
                            type: 'string',
                            description: '承認依頼のID',
                        },
                        action: {
                            type: 'string',
                            enum: ['approve', 'reject'],
                            description: '処理アクション',
                        },
                        comments: {
                            type: 'string',
                            description: 'コメント（任意）',
                        },
                    },
                    required: ['approval_id', 'action'],
                },
            },
            {
                name: 'get_dashboard',
                description: 'プロジェクトの進捗ダッシュボードを取得します。タスク状況、承認待ちなどを確認できます。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        mode: {
                            type: 'string',
                            enum: ['full', 'summary', 'tasks_only'],
                            description: '出力モード。full=全情報、summary=タスク数のみ、tasks_only=タスク一覧のみ（デフォルト: full）',
                            default: 'full',
                        },
                    },
                },
            },
            {
                name: 'update_task_status',
                description: 'プロジェクトのタスクステータスを更新します。PMとリーダーのみが使用できます。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        phase: {
                            type: 'string',
                            enum: ['planning', 'design', 'implementation', 'testing', 'review', 'completed'],
                            description: '新しいプロジェクトフェーズ',
                        },
                        pending_delta: {
                            type: 'number',
                            description: '保留中タスク数の増減',
                        },
                        in_progress_delta: {
                            type: 'number',
                            description: '進行中タスク数の増減',
                        },
                        completed_delta: {
                            type: 'number',
                            description: '完了タスク数の増減',
                        },
                        completed_task_id: {
                            type: 'string',
                            description: '完了したタスクID。指定するとtaskListのステータスをcompletedに更新し、current_stateから削除します',
                        },
                        completed_assignee: {
                            type: 'string',
                            description: '完了したタスクの担当者（current_stateから削除）',
                        },
                    },
                },
            },
            {
                name: 'health_check',
                description: 'システムの状態を確認します。環境変数、WezTerm、ペインマッピングなどをチェックします。',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            {
                name: 'add_backlog',
                description: 'バックログにタスクを追加します。PMのみが使用できます。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        title: {
                            type: 'string',
                            description: 'タスクのタイトル',
                        },
                        description: {
                            type: 'string',
                            description: 'タスクの詳細説明',
                        },
                        priority: {
                            type: 'string',
                            enum: ['high', 'medium', 'low'],
                            description: '優先度（デフォルト: medium）',
                            default: 'medium',
                        },
                    },
                    required: ['title', 'description'],
                },
            },
            {
                name: 'get_backlog',
                description: 'バックログのタスク一覧を取得します。',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            {
                name: 'update_backlog',
                description: 'バックログタスクのステータスを更新します。PMのみが使用できます。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        task_id: {
                            type: 'string',
                            description: 'バックログタスクのID',
                        },
                        status: {
                            type: 'string',
                            enum: ['completed', 'cancelled'],
                            description: '新しいステータス',
                        },
                    },
                    required: ['task_id', 'status'],
                },
            },
            {
                name: 'request_member_increase',
                description: 'メンバー増員をPMにリクエストします。リーダーのみが使用できます。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        count: {
                            type: 'number',
                            description: '増員するメンバー数（1-4）',
                            minimum: 1,
                            maximum: 4,
                        },
                        reason: {
                            type: 'string',
                            description: '増員理由',
                        },
                    },
                    required: ['count', 'reason'],
                },
            },
            {
                name: 'request_member_decrease',
                description: 'メンバー減員をPMにリクエストします。リーダーのみが使用できます。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        count: {
                            type: 'number',
                            description: '減員するメンバー数（1-4）',
                            minimum: 1,
                            maximum: 4,
                        },
                        reason: {
                            type: 'string',
                            description: '減員理由',
                        },
                    },
                    required: ['count', 'reason'],
                },
            },
            {
                name: 'assign_task',
                description: '構造化されたタスクをメンバーに割り当てます。リーダーのみが使用できます。完了条件と変更許可ファイルの指定が必須です。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        to: {
                            type: 'string',
                            description: '割り当て先のメンバー（例: member-01, member-02）',
                        },
                        title: {
                            type: 'string',
                            description: 'タスク名',
                        },
                        description: {
                            type: 'string',
                            description: 'タスクの詳細説明',
                        },
                        acceptance_criteria: {
                            type: 'array',
                            items: { type: 'string' },
                            description: '完了条件（1つ以上必須）',
                        },
                        allowed_files: {
                            type: 'array',
                            items: { type: 'string' },
                            description: '変更許可ファイル（1つ以上必須）',
                        },
                        forbidden_files: {
                            type: 'array',
                            items: { type: 'string' },
                            description: '禁止ファイル（他メンバーが作業中など）',
                        },
                        priority: {
                            type: 'string',
                            enum: ['high', 'medium', 'low'],
                            description: '優先度（デフォルト: medium）',
                        },
                        parent_task_id: {
                            type: 'string',
                            description: '親タスクのID。指定すると、新規タスクが親タスクの子として登録される',
                        },
                        task_type: {
                            type: 'string',
                            enum: ['investigation', 'implementation', 'review', 'documentation', 'plan', 'test_plan', 'test_implementation'],
                            description: 'タスク種別（調査/実装/レビュー/ドキュメント/プラン/テストプラン/テスト実装）デフォルト: implementation',
                        },
                        clear_before: {
                            type: 'boolean',
                            description: 'trueなら/clearを送信、falseまたは未指定なら/compactを送信（初回タスク時はスキップ）',
                        },
                    },
                    required: ['to', 'title', 'description', 'acceptance_criteria', 'allowed_files'],
                },
            },
            {
                name: 'distribute_tasks',
                description: '複数のサブタスクを一括でメンバーに分配します。リーダーのみが使用できます。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        parent_task_id: {
                            type: 'string',
                            description: '親タスク（PMからのタスク）のID',
                        },
                        subtasks: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    title: {
                                        type: 'string',
                                        description: 'サブタスク名',
                                    },
                                    description: {
                                        type: 'string',
                                        description: 'サブタスクの詳細説明',
                                    },
                                    acceptance_criteria: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: '完了条件',
                                    },
                                    allowed_files: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: '変更許可ファイル',
                                    },
                                    to: {
                                        type: 'string',
                                        description: '割り当て先メンバー（省略時はエラー、自動割り当ては未実装）',
                                    },
                                    priority: {
                                        type: 'string',
                                        enum: ['high', 'medium', 'low'],
                                        description: '優先度',
                                    },
                                    task_type: {
                                        type: 'string',
                                        enum: ['investigation', 'implementation', 'review', 'documentation', 'plan', 'test_plan', 'test_implementation'],
                                        description: 'タスク種別（デフォルト: implementation）',
                                    },
                                },
                                required: ['title', 'description', 'acceptance_criteria', 'allowed_files'],
                            },
                            description: '分配するサブタスクの配列',
                        },
                    },
                    required: ['parent_task_id', 'subtasks'],
                },
            },
            {
                name: 'submit_plan',
                description: '実装計画を提出します。メンバーのみが使用できます。leaderの承認が下りるまで実装を開始できません。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        task_id: {
                            type: 'string',
                            description: '対象タスクのID',
                        },
                        summary: {
                            type: 'string',
                            description: 'タスクの理解（何をするタスクか）',
                        },
                        approach: {
                            type: 'string',
                            description: '実装方針（どのように実装するか）',
                        },
                        files_to_change: {
                            type: 'array',
                            items: { type: 'string' },
                            description: '変更予定ファイル',
                        },
                        files_to_create: {
                            type: 'array',
                            items: { type: 'string' },
                            description: '新規作成予定ファイル',
                        },
                        test_plan: {
                            type: 'string',
                            description: 'テスト計画',
                        },
                    },
                    required: ['task_id', 'summary', 'approach', 'test_plan'],
                },
            },
            {
                name: 'approve_plan',
                description: 'メンバーの実装計画を承認します。リーダーのみが使用できます。承認後、メンバーは実装を開始できます。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        task_id: {
                            type: 'string',
                            description: '対象タスクのID',
                        },
                        comments: {
                            type: 'string',
                            description: '承認時のコメント（任意）',
                        },
                    },
                    required: ['task_id'],
                },
            },
            {
                name: 'reject_plan',
                description: 'メンバーの実装計画を却下します。リーダーのみが使用できます。却下理由と修正指示が必須です。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        task_id: {
                            type: 'string',
                            description: '対象タスクのID',
                        },
                        reason: {
                            type: 'string',
                            description: '却下理由',
                        },
                        feedback: {
                            type: 'string',
                            description: '修正指示',
                        },
                    },
                    required: ['task_id', 'reason', 'feedback'],
                },
            },
            {
                name: 'save_memory',
                description: '個別の記憶を保存します。決定事項、メモを記録できます。全員が使用できます。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        type: {
                            type: 'string',
                            enum: ['decision', 'note'],
                            description: '記憶の種類（decision: 決定事項・ルール・方針、note: メモ・備忘録）',
                        },
                        title: {
                            type: 'string',
                            description: '記憶のタイトル',
                        },
                        content: {
                            type: 'string',
                            description: '記憶の内容',
                        },
                        tags: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'タグ（任意）',
                        },
                    },
                    required: ['type', 'title', 'content'],
                },
            },
            {
                name: 'recall_memory',
                description: '記憶を検索・取得します。キーワード、タイプ、タグでフィルタリングできます。全員が使用できます。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: '検索キーワード（タイトル、内容、タグを検索）',
                        },
                        type: {
                            type: 'string',
                            enum: ['decision', 'note'],
                            description: '記憶の種類でフィルタ',
                        },
                        tags: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'タグでフィルタ（OR検索）',
                        },
                        limit: {
                            type: 'number',
                            description: '取得件数の上限（デフォルト: 10、最大: 100）',
                            default: 10,
                            minimum: 1,
                            maximum: 100,
                        },
                    },
                },
            },
            {
                name: 'update_project_context',
                description: 'プロジェクトコンテキストの特定セクションを更新します。PMとリーダーのみが使用できます。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        section: {
                            type: 'string',
                            enum: ['what', 'why', 'who', 'constraints', 'current_state', 'decisions', 'notes', 'preferences'],
                            description: '更新するセクション',
                        },
                        content: {
                            type: 'string',
                            description: '新しい内容',
                        },
                        append: {
                            type: 'boolean',
                            description: '既存の内容に追記するか（デフォルト: false、上書き）',
                            default: false,
                        },
                    },
                    required: ['section', 'content'],
                },
            },
            {
                name: 'get_project_context',
                description: 'プロジェクトコンテキストを取得します。セクション指定で特定部分のみ、省略で全体を取得。全員が使用できます。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        section: {
                            type: 'string',
                            enum: ['what', 'why', 'who', 'constraints', 'current_state', 'decisions', 'notes', 'preferences'],
                            description: '取得するセクション（省略時は全セクション）',
                        },
                    },
                },
            },
            {
                name: 'archive_all_tasks',
                description: '全タスクをアーカイブします。PMのみが使用できます。',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            {
                name: 'compact_agent',
                description: '指定ロールに/compactコマンドを送信します。PMとleaderのみが使用できます。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        role: {
                            type: 'string',
                            enum: ['pm', 'leader', 'member-01', 'member-02'],
                            description: '対象ロール',
                        },
                    },
                    required: ['role'],
                },
            },
            {
                name: 'clear_agent',
                description: '指定ロールに/clearコマンドを送信します。PMとleaderのみが使用できます。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        role: {
                            type: 'string',
                            enum: ['pm', 'leader', 'member-01', 'member-02'],
                            description: '対象ロール',
                        },
                    },
                    required: ['role'],
                },
            },
            {
                name: 'compact_all',
                description: '全ロールに/compactコマンドを送信します。PMとleaderのみが使用できます。',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            {
                name: 'configure_modes',
                description: 'モード設定を行います。PMのみが使用できます。reviewModeとtaskSplitApprovalを設定できます。パラメータなしで現在の設定を表示します。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        reviewMode: {
                            type: 'string',
                            enum: ['normal', 'strict'],
                            description: 'レビューモード。normal=leaderレビューで完了、strict=テストファーストレビュー（実装前にテストをレビュー）',
                        },
                        taskSplitApproval: {
                            type: 'string',
                            enum: ['auto', 'required'],
                            description: 'タスク分割承認。auto=承認不要（leader一任）、required=PM承認が必要',
                        },
                    },
                },
            },
            {
                name: 'submit_test',
                description: 'テストコードを提出します。memberのみが使用できます。strictモードでの実装前テストレビュー用です。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        task_id: {
                            type: 'string',
                            description: '対象タスクのID',
                        },
                        test_files: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'テストファイルのパス一覧',
                        },
                        test_summary: {
                            type: 'string',
                            description: 'テストの概要説明',
                        },
                    },
                    required: ['task_id', 'test_files', 'test_summary'],
                },
            },
            {
                name: 'approve_test',
                description: 'テストコードを承認します。leaderのみが使用できます。承認後、memberは実装を開始できます。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        task_id: {
                            type: 'string',
                            description: '対象タスクのID',
                        },
                        comments: {
                            type: 'string',
                            description: '承認時のコメント（任意）',
                        },
                    },
                    required: ['task_id'],
                },
            },
            {
                name: 'reject_test',
                description: 'テストコードを却下します。leaderのみが使用できます。却下理由と修正指示が必須です。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        task_id: {
                            type: 'string',
                            description: '対象タスクのID',
                        },
                        reason: {
                            type: 'string',
                            description: '却下理由',
                        },
                        feedback: {
                            type: 'string',
                            description: '修正指示',
                        },
                    },
                    required: ['task_id', 'reason', 'feedback'],
                },
            },
        ],
    };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        switch (name) {
            case 'check_queue': {
                const markAsRead = (args?.mark_as_read as boolean) ?? true;
                const format = (args?.format as 'full' | 'summary') ?? 'full';
                const result = await checkQueue(markAsRead, format);
                return {
                    content: [
                        {
                            type: 'text',
                            text: formatQueueResult(result),
                        },
                    ],
                };
            }

            case 'send_task': {
                // Validate required string parameters
                if (typeof args?.to !== 'string' || typeof args?.subject !== 'string' || typeof args?.content !== 'string') {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (to, subject, content) は文字列で指定してください。',
                        }],
                    };
                }
                const params = {
                    to: args.to,
                    subject: args.subject,
                    content: args.content,
                    type: typeof args?.type === 'string' ? args.type as 'task' | 'report' | 'question' | 'notification' : undefined,
                };
                const result = await sendTask(params);
                return {
                    content: [
                        {
                            type: 'text',
                            text: formatSendResult(result),
                        },
                    ],
                };
            }

            case 'request_approval': {
                // Validate required string parameters
                if (typeof args?.title !== 'string' || typeof args?.description !== 'string' || typeof args?.type !== 'string') {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (title, description, type) は文字列で指定してください。',
                        }],
                    };
                }
                const params = {
                    title: args.title,
                    description: args.description,
                    type: args.type as 'design' | 'implementation' | 'skill' | 'other',
                };
                const result = await requestApproval(params);
                return {
                    content: [
                        {
                            type: 'text',
                            text: formatApprovalRequest(result, params),
                        },
                    ],
                };
            }

            case 'process_approval': {
                // Validate required string parameters
                if (typeof args?.approval_id !== 'string' || typeof args?.action !== 'string') {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (approval_id, action) は文字列で指定してください。',
                        }],
                    };
                }
                const processParams = {
                    approval_id: args.approval_id,
                    action: args.action as 'approve' | 'reject',
                    comments: typeof args?.comments === 'string' ? args.comments : undefined,
                };
                const processResult = await processApproval(processParams);
                return {
                    content: [
                        {
                            type: 'text',
                            text: formatProcessApprovalResult(processResult),
                        },
                    ],
                };
            }

            case 'get_dashboard': {
                const mode = (args?.mode as 'full' | 'summary' | 'tasks_only') ?? 'full';
                const result = await getDashboardInfo({ mode });
                return {
                    content: [
                        {
                            type: 'text',
                            text: formatDashboard(result),
                        },
                    ],
                };
            }

            case 'update_task_status': {
                const params = {
                    phase: args?.phase as 'planning' | 'design' | 'implementation' | 'testing' | 'review' | 'completed' | undefined,
                    pendingDelta: args?.pending_delta as number | undefined,
                    inProgressDelta: args?.in_progress_delta as number | undefined,
                    completedDelta: args?.completed_delta as number | undefined,
                    completed_task_id: args?.completed_task_id as string | undefined,
                    completed_assignee: args?.completed_assignee as string | undefined,
                };
                const result = await updateTaskStatus(params);
                return {
                    content: [
                        {
                            type: 'text',
                            text: formatUpdateResult(result),
                        },
                    ],
                };
            }

            case 'health_check': {
                const result = await healthCheck();
                return {
                    content: [
                        {
                            type: 'text',
                            text: formatHealthCheck(result),
                        },
                    ],
                };
            }

            case 'add_backlog': {
                // Validate required string parameters
                if (typeof args?.title !== 'string' || typeof args?.description !== 'string') {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (title, description) は文字列で指定してください。',
                        }],
                    };
                }
                const result = await addBacklog({
                    title: args.title,
                    description: args.description,
                    priority: typeof args?.priority === 'string' ? args.priority as 'high' | 'medium' | 'low' : undefined,
                });
                return {
                    content: [
                        {
                            type: 'text',
                            text: formatAddBacklogResult(result),
                        },
                    ],
                };
            }

            case 'get_backlog': {
                const result = await getBacklog();
                return { content: [{ type: 'text', text: formatGetBacklogResult(result) }] };
            }

            case 'update_backlog': {
                // Validate required string parameters
                if (typeof args?.task_id !== 'string' || typeof args?.status !== 'string') {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (task_id, status) は文字列で指定してください。',
                        }],
                    };
                }
                const result = await updateBacklog({
                    task_id: args.task_id,
                    status: args.status as 'completed' | 'cancelled',
                });
                return {
                    content: [{
                        type: 'text',
                        text: formatUpdateBacklogResult(result),
                    }],
                };
            }

            case 'request_member_increase': {
                // Validate required parameters
                if (typeof args?.count !== 'number' || typeof args?.reason !== 'string') {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (count, reason) を正しく指定してください。countは数値、reasonは文字列です。',
                        }],
                    };
                }
                const result = await requestMemberIncrease({
                    count: args.count,
                    reason: args.reason,
                });
                return {
                    content: [{
                        type: 'text',
                        text: formatMemberIncreaseResult(result),
                    }],
                };
            }

            case 'request_member_decrease': {
                // Validate required parameters
                if (typeof args?.count !== 'number' || typeof args?.reason !== 'string') {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (count, reason) を正しく指定してください。countは数値、reasonは文字列です。',
                        }],
                    };
                }
                const decreaseResult = await requestMemberDecrease({
                    count: args.count,
                    reason: args.reason,
                });
                return {
                    content: [{
                        type: 'text',
                        text: formatMemberDecreaseResult(decreaseResult),
                    }],
                };
            }

            case 'assign_task': {
                // Validate required parameters
                if (typeof args?.to !== 'string' || typeof args?.title !== 'string' ||
                    typeof args?.description !== 'string' ||
                    !Array.isArray(args?.acceptance_criteria) ||
                    !Array.isArray(args?.allowed_files)) {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (to, title, description, acceptance_criteria, allowed_files) を正しく指定してください。',
                        }],
                    };
                }
                const assignResult = await assignTask({
                    to: args.to,
                    title: args.title,
                    description: args.description,
                    acceptance_criteria: args.acceptance_criteria as string[],
                    allowed_files: args.allowed_files as string[],
                    forbidden_files: Array.isArray(args?.forbidden_files) ? args.forbidden_files as string[] : undefined,
                    priority: typeof args?.priority === 'string' ? args.priority as 'high' | 'medium' | 'low' : undefined,
                    parent_task_id: typeof args?.parent_task_id === 'string' ? args.parent_task_id : undefined,
                    task_type: typeof args?.task_type === 'string' ? args.task_type as 'investigation' | 'implementation' | 'review' | 'documentation' : undefined,
                    clear_before: typeof args?.clear_before === 'boolean' ? args.clear_before : undefined,
                });
                return {
                    content: [{
                        type: 'text',
                        text: formatAssignTaskResult(assignResult),
                    }],
                };
            }

            case 'distribute_tasks': {
                // Validate required parameters
                if (typeof args?.parent_task_id !== 'string' || !Array.isArray(args?.subtasks)) {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (parent_task_id, subtasks) を正しく指定してください。',
                        }],
                    };
                }
                const distributeResult = await distributeTasks({
                    parent_task_id: args.parent_task_id,
                    subtasks: args.subtasks as Array<{
                        title: string;
                        description: string;
                        acceptance_criteria: string[];
                        allowed_files: string[];
                        to?: string;
                        priority?: 'high' | 'medium' | 'low';
                        task_type?: 'investigation' | 'implementation' | 'review' | 'documentation' | 'plan' | 'test_plan' | 'test_implementation';
                    }>,
                });
                return {
                    content: [{
                        type: 'text',
                        text: formatDistributeTasksResult(distributeResult),
                    }],
                };
            }

            case 'submit_plan': {
                // Validate required parameters
                if (typeof args?.task_id !== 'string' || typeof args?.summary !== 'string' ||
                    typeof args?.approach !== 'string' || typeof args?.test_plan !== 'string') {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (task_id, summary, approach, test_plan) を正しく指定してください。',
                        }],
                    };
                }
                const submitResult = await submitPlan({
                    task_id: args.task_id,
                    summary: args.summary,
                    approach: args.approach,
                    files_to_change: Array.isArray(args?.files_to_change) ? args.files_to_change as string[] : [],
                    files_to_create: Array.isArray(args?.files_to_create) ? args.files_to_create as string[] : [],
                    test_plan: args.test_plan,
                });
                return {
                    content: [{
                        type: 'text',
                        text: formatSubmitPlanResult(submitResult),
                    }],
                };
            }

            case 'approve_plan': {
                // Validate required parameters
                if (typeof args?.task_id !== 'string') {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (task_id) を正しく指定してください。',
                        }],
                    };
                }
                const approveResult = await approvePlan({
                    task_id: args.task_id,
                    comments: typeof args?.comments === 'string' ? args.comments : undefined,
                });
                return {
                    content: [{
                        type: 'text',
                        text: formatApprovePlanResult(approveResult),
                    }],
                };
            }

            case 'reject_plan': {
                // Validate required parameters
                if (typeof args?.task_id !== 'string' || typeof args?.reason !== 'string' ||
                    typeof args?.feedback !== 'string') {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (task_id, reason, feedback) を正しく指定してください。',
                        }],
                    };
                }
                const rejectResult = await rejectPlan({
                    task_id: args.task_id,
                    reason: args.reason,
                    feedback: args.feedback,
                });
                return {
                    content: [{
                        type: 'text',
                        text: formatRejectPlanResult(rejectResult),
                    }],
                };
            }

            case 'save_memory': {
                // Validate required parameters
                if (typeof args?.type !== 'string' || typeof args?.title !== 'string' ||
                    typeof args?.content !== 'string') {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (type, title, content) を正しく指定してください。',
                        }],
                    };
                }
                const saveMemoryParams = {
                    type: args.type as 'decision' | 'note',
                    title: args.title,
                    content: args.content,
                    tags: Array.isArray(args?.tags) ? args.tags as string[] : undefined,
                };
                const saveMemoryResult = await saveMemoryTool(saveMemoryParams);
                return {
                    content: [{
                        type: 'text',
                        text: formatSaveMemoryResult(saveMemoryResult, saveMemoryParams),
                    }],
                };
            }

            case 'recall_memory': {
                const recallMemoryParams = {
                    query: typeof args?.query === 'string' ? args.query : undefined,
                    type: typeof args?.type === 'string' ? args.type as 'decision' | 'note' : undefined,
                    tags: Array.isArray(args?.tags) ? args.tags as string[] : undefined,
                    limit: typeof args?.limit === 'number' ? args.limit : undefined,
                };
                const recallMemoryResult = await recallMemoryTool(recallMemoryParams);
                return {
                    content: [{
                        type: 'text',
                        text: formatRecallMemoryResult(recallMemoryResult, recallMemoryParams),
                    }],
                };
            }

            case 'update_project_context': {
                // Validate required parameters
                if (typeof args?.section !== 'string' || typeof args?.content !== 'string') {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (section, content) を正しく指定してください。',
                        }],
                    };
                }
                const updateContextParams = {
                    section: args.section as 'what' | 'why' | 'who' | 'constraints' | 'current_state' | 'decisions' | 'notes' | 'preferences',
                    content: args.content,
                    append: typeof args?.append === 'boolean' ? args.append : undefined,
                };
                const updateContextResult = await updateProjectContextTool(updateContextParams);
                return {
                    content: [{
                        type: 'text',
                        text: formatUpdateProjectContextResult(updateContextResult, updateContextParams),
                    }],
                };
            }

            case 'get_project_context': {
                const getContextParams = {
                    section: typeof args?.section === 'string' ? args.section as 'what' | 'why' | 'who' | 'constraints' | 'current_state' | 'decisions' | 'notes' | 'preferences' : undefined,
                };
                const getContextResult = await getProjectContextTool(getContextParams);
                return {
                    content: [{
                        type: 'text',
                        text: formatGetProjectContextResult(getContextResult),
                    }],
                };
            }

            case 'archive_all_tasks': {
                const archiveResult = await archiveAllTasksTool();
                return {
                    content: [{
                        type: 'text',
                        text: formatArchiveAllTasksResult(archiveResult),
                    }],
                };
            }

            case 'compact_agent': {
                if (typeof args?.role !== 'string') {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (role) を正しく指定してください。',
                        }],
                    };
                }
                const compactResult = await compactAgent(args.role);
                return {
                    content: [{
                        type: 'text',
                        text: formatCompactAgentResult(compactResult),
                    }],
                };
            }

            case 'clear_agent': {
                if (typeof args?.role !== 'string') {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (role) を正しく指定してください。',
                        }],
                    };
                }
                const clearResult = await clearAgent(args.role);
                return {
                    content: [{
                        type: 'text',
                        text: formatClearAgentResult(clearResult),
                    }],
                };
            }

            case 'compact_all': {
                const compactAllResult = await compactAll();
                return {
                    content: [{
                        type: 'text',
                        text: formatCompactAllResult(compactAllResult),
                    }],
                };
            }

            case 'configure_modes': {
                const configureModesResult = await configureModes({
                    reviewMode: typeof args?.reviewMode === 'string' ? args.reviewMode as 'normal' | 'strict' : undefined,
                    taskSplitApproval: typeof args?.taskSplitApproval === 'string' ? args.taskSplitApproval as 'auto' | 'required' : undefined,
                });
                return {
                    content: [{
                        type: 'text',
                        text: formatConfigureModesResult(configureModesResult),
                    }],
                };
            }

            case 'submit_test': {
                if (typeof args?.task_id !== 'string' ||
                    !Array.isArray(args?.test_files) ||
                    typeof args?.test_summary !== 'string') {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (task_id, test_files, test_summary) を正しく指定してください。',
                        }],
                    };
                }
                const submitTestResult = await submitTest({
                    task_id: args.task_id,
                    test_files: args.test_files as string[],
                    test_summary: args.test_summary,
                });
                return {
                    content: [{
                        type: 'text',
                        text: formatSubmitTestResult(submitTestResult),
                    }],
                };
            }

            case 'approve_test': {
                if (typeof args?.task_id !== 'string') {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (task_id) を正しく指定してください。',
                        }],
                    };
                }
                const approveTestResult = await approveTest({
                    task_id: args.task_id,
                    comments: typeof args?.comments === 'string' ? args.comments : undefined,
                });
                return {
                    content: [{
                        type: 'text',
                        text: formatApproveTestResult(approveTestResult),
                    }],
                };
            }

            case 'reject_test': {
                if (typeof args?.task_id !== 'string' || typeof args?.reason !== 'string' ||
                    typeof args?.feedback !== 'string') {
                    return {
                        content: [{
                            type: 'text',
                            text: '❌ 必須パラメータ (task_id, reason, feedback) を正しく指定してください。',
                        }],
                    };
                }
                const rejectTestResult = await rejectTest({
                    task_id: args.task_id,
                    reason: args.reason,
                    feedback: args.feedback,
                });
                return {
                    content: [{
                        type: 'text',
                        text: formatRejectTestResult(rejectTestResult),
                    }],
                };
            }

            default:
                throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
    } catch (err) {
        error(`Tool ${name} failed`, err);
        if (err instanceof McpError) {
            throw err;
        }
        throw new McpError(
            ErrorCode.InternalError,
            err instanceof Error ? err.message : 'Unknown error'
        );
    }
});

// Initialize and start server
async function main() {
    info('Starting dev-team MCP server');

    // Initialize dev team structure if project path is set
    if (process.env.DEV_TEAM_PROJECT_PATH) {
        try {
            await ensureDevTeamStructure();
            info('Dev team structure initialized');
        } catch (err) {
            error('Failed to initialize dev team structure', err);
        }
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);

    info('Dev-team MCP server running');
}

main().catch((err) => {
    error('Server failed to start', err);
    process.exit(1);
});
