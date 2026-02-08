export type Role = 'pm' | 'leader' | `member-${string}`;

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';

export type TaskPriority = 'high' | 'medium' | 'low';

// タスクフェーズ（計画モード用）
export type TaskPhase =
    | 'planning'           // 計画作成中
    | 'awaiting_approval'  // 承認待ち
    | 'test_review'        // テストレビュー待ち（strictモード用）
    | 'implementing'       // 実装中
    | 'completed';         // 完了

// タスク種別
export type TaskType =
    | 'investigation'      // 調査
    | 'implementation'     // 実装
    | 'review'             // レビュー
    | 'documentation'      // ドキュメント
    | 'plan'               // プラン/設計
    | 'test_plan'          // テストプラン/テスト設計
    | 'test_implementation'; // テスト実装

// 計画情報
export interface TaskPlan {
    summary: string;           // タスクの理解
    approach: string;          // 実装方針
    filesToChange: string[];   // 変更予定ファイル
    filesToCreate: string[];   // 新規作成ファイル
    testPlan: string;          // テスト計画
    submittedAt: string;
    approvedAt?: string;
    rejectionHistory?: {       // 却下履歴
        reason: string;
        feedback: string;
        rejectedAt: string;
    }[];
}

export interface Task {
    id: string;
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    assignee: Role;
    createdBy: Role;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
    parentTaskId?: string;
    subtaskIds?: string[];
    tags?: string[];
}

export interface TaskQueue {
    role: Role;
    tasks: Task[];
    lastUpdated: string;
}

// メンバーステータス
export interface MemberStatus {
    currentTask?: {
        id: string;
        title: string;
        startedAt: string;
    };
    status: 'idle' | 'working' | 'waiting' | 'offline';
    lastActivity?: string;
    hasReceivedTaskThisSession?: boolean;  // 今回のセッションでタスクを受け取ったか
}

// タスクサマリー
export interface TaskSummary {
    id: string;
    title: string;
    status: TaskStatus;
    assignee: Role;
    priority: TaskPriority;
    createdAt: string;
    // Phase 1で追加: タスクライフサイクル追跡用
    startedAt?: string;      // 着手日時
    completedAt?: string;    // 完了日時
    parentMessageId?: string; // 元メッセージID（トレース用）
    // 計画モード用フィールド
    phase?: TaskPhase;                 // タスクフェーズ
    description?: string;              // タスク詳細説明
    acceptanceCriteria?: string[];     // 完了条件
    allowedFiles?: string[];           // 変更許可ファイル
    forbiddenFiles?: string[];         // 禁止ファイル
    plan?: TaskPlan;                   // 提出された計画
    // 親子関係用フィールド
    parentTaskId?: string;             // 親タスクID
    childTaskIds?: string[];           // 子タスクID一覧
    // タスク種別
    taskType?: TaskType;               // タスク種別（デフォルト: implementation）
}

// タスク集計値の型
export interface TaskCounts {
    pending: number;
    inProgress: number;
    completed: number;
    blocked: number;
    total: number;
}

export interface Dashboard {
    projectName: string;
    lastUpdated: string;
    currentPhase: 'planning' | 'design' | 'implementation' | 'testing' | 'review' | 'completed';
    tasks: {
        pending: number;
        inProgress: number;
        completed: number;
        blocked: number;
        total: number;
    };
    recentActivity: ActivityLog[];
    pendingApprovals: ApprovalRequest[];
    memberStatus: Record<string, MemberStatus>;
    taskList: TaskSummary[];
    nextTaskId?: number;
}

export interface ActivityLog {
    timestamp: string;
    role: Role;
    action: string;
    details: string;
}

export interface ApprovalRequest {
    id: string;
    title: string;
    description: string;
    requestedBy: Role;
    requestedAt: string;
    type: 'design' | 'implementation' | 'skill' | 'member_increase' | 'member_decrease' | 'task_split' | 'other';
    status: 'pending' | 'approved' | 'rejected';
    approvedAt?: string;
    rejectedAt?: string;
    comments?: string;
    metadata?: Record<string, unknown>;
}
