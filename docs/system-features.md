# dev-team システム機能詳細レポート

## 1. 概要

### dev-teamシステムとは

dev-teamは、複数のClaude Codeインスタンスを「開発チーム」として協調動作させるマルチエージェント自動化システムです。実際の組織構造（PM、テックリード、開発メンバー）を再現し、階層的なコミュニケーションと承認フローにより、安全で効率的なソフトウェア開発を実現します。

### 目的・コンセプト

| 課題 | 解決策 |
|------|--------|
| 単一AIでは複雑なタスクに対応しきれない | 複数エージェントによる役割分担 |
| 並列作業ができない | PM、Leader、Memberが同時に異なるタスクを処理 |
| 専門性の欠如 | 各役割が得意分野に集中 |
| 人間の監督が困難 | 社長（ユーザー）による承認フロー |

### 主要な特徴

- **イベント駆動型**: タスクがない間はAPIを消費せず、通知を受けた時のみ処理を開始
- **ファイルベース通信**: JSONファイルを介した通信により、メッセージの永続化と監査が可能
- **役割ベースアクセス制御（RBAC）**: 各役割は許可された相手にのみメッセージを送信可能
- **WezTerm統合**: 各役割が独立したペインで動作し、状況を視覚的に把握可能

---

## 2. システム構成

### ディレクトリ構造

#### 共通設定（dev-team/）
```
dev-team/
├── mcp-server/           # MCPサーバー（ツール提供）
│   ├── src/              # TypeScriptソース
│   │   ├── index.ts      # サーバーエントリポイント
│   │   ├── tools/        # 各ツールの実装
│   │   ├── types/        # 型定義
│   │   └── utils/        # ユーティリティ
│   ├── dist/             # ビルド済みJS
│   └── package.json
├── prompts/              # 役割ごとの指示書
│   ├── pm.md
│   ├── leader.md
│   └── member.md
├── permissions/          # 役割ごとの権限設定
│   ├── pm.json
│   ├── leader.json
│   └── member.json
├── docs/                 # ドキュメント
└── README.md
```

#### プロジェクト内（実行時に自動生成）
```
your-project/
└── .dev-team/
    ├── queue/            # タスクキュー（JSON）
    │   ├── pm.json
    │   ├── leader.json
    │   ├── member-01.json
    │   └── member-02.json
    ├── status/
    │   ├── dashboard.json  # 進捗ダッシュボード（JSON）
    │   └── dashboard.md    # 進捗ダッシュボード（Markdown表示用）
    ├── memory/           # チーム記憶（decision/note）
    ├── archive/          # アーカイブ済みキュー
    ├── config/           # チーム設定
    ├── skills/           # プロジェクト固有スキル
    ├── workspaces/       # 役割ごとのワークスペース
    │   ├── pm/
    │   ├── leader/
    │   ├── member-01/
    │   └── member-02/
    └── panes.json        # WezTermペイン情報
```

### 技術スタック

| 技術 | バージョン/備考 | 用途 |
|------|----------------|------|
| TypeScript | ES2022 | MCPサーバー実装 |
| Model Context Protocol (MCP) SDK | v1.0.0 | Claude Codeとの通信 |
| Node.js | - | ランタイム環境 |
| proper-lockfile | v4.1.2 | ファイルロック制御 |
| Commander.js | v14 | CLI実装 |
| WezTerm | - | ターミナルマルチプレクサ |

---

## 3. 役割（Roles）

### 組織構造

```
┌─────────────────────────────────────┐
│          社長（ユーザー）            │
│      最終承認・重要な意思決定        │
└──────────────┬──────────────────────┘
               │ 承認依頼 / 承認
┌──────────────▼──────────────────────┐
│      PM（Claude Code #1）           │
│  - プロジェクト全体管理              │
│  - 要件の整理・優先順位付け          │
└──────────────┬──────────────────────┘
               │ 指示 / 報告
┌──────────────▼──────────────────────┐
│    Leader（Claude Code #2）         │
│  - 技術的な設計判断                  │
│  - コードレビュー                    │
└──────────────┬──────────────────────┘
               │ 指示 / 上申
┌──────────────▼──────────────────────┐
│  Member-01, Member-02               │
│  （Claude Code #3, #4）             │
│  - 実際のコード実装                  │
│  - テスト作成・実行                  │
└─────────────────────────────────────┘
```

### PM（プロジェクトマネージャー）

#### 責務
- ユーザー（社長）からの質問・要望に対応
- ユーザーへ進捗報告・説明
- タスクを分解してleaderに依頼
- 進捗を管理
- 社長に承認を依頼

#### 禁止事項
- コードを読む/書く
- ファイルを作成・編集
- 技術的な判断をする
- 設計を決める

#### 使用可能なMCPツール
- `check_queue` - タスクキュー確認
- `send_task` - leaderへタスク送信
- `request_approval` - 社長への承認依頼
- `process_approval` - 承認依頼の処理
- `get_dashboard` - 進捗確認
- `update_task_status` - フェーズ・タスク数更新
- `add_backlog` - バックログにタスク追加
- `get_backlog` - バックログ一覧取得
- `update_backlog` - バックログステータス更新
- `save_memory` - 記憶の保存
- `recall_memory` - 記憶の検索
- `get_project_context` - プロジェクトコンテキスト取得
- `update_project_context` - プロジェクトコンテキスト更新
- `configure_modes` - モード設定
- `archive_all_tasks` - 全タスクアーカイブ
- `compact_agent` - 指定ロールにcompact送信
- `clear_agent` - 指定ロールにclear送信
- `compact_all` - 全ロールにcompact送信
- `health_check` - システム状態確認

### Leader（テックリード）

#### 責務
- 技術設計・アーキテクチャ決定
- コードベースの調査（読むだけ）
- memberへのタスク振り分け
- memberの実装計画をレビュー・承認
- コードレビュー（品質を徹底チェック）
- PMへの技術報告
- メンバー管理（競合防止）

#### 禁止事項
- コードを書く
- ファイルを作成・編集
- テストを書く

#### 使用可能なMCPツール
- `check_queue` - タスクキュー確認
- `send_task` - PMへ報告、memberへメッセージ送信
- `get_dashboard` - 進捗確認
- `update_task_status` - タスク数更新
- `assign_task` - メンバーへのタスク割り当て
- `distribute_tasks` - 複数サブタスクの一括分配
- `approve_plan` - 実装計画の承認
- `reject_plan` - 実装計画の却下
- `approve_test` - テストコードの承認（strictモード用）
- `reject_test` - テストコードの却下（strictモード用）
- `request_member_increase` - メンバー増員リクエスト
- `request_member_decrease` - メンバー減員リクエスト
- `compact_agent` - 指定ロールにcompact送信
- `clear_agent` - 指定ロールにclear送信
- `compact_all` - 全ロールにcompact送信

### Member-01, Member-02（開発者）

#### 責務
- 実装計画を立ててleaderの承認を得る
- 承認後、コードを書く
- ファイルを作成・編集
- テストを作成・実行
- leaderに完了報告
- 調査タスク（leaderから指示された場合）

#### 禁止事項
- 承認なしの実装開始
- 許可されていないファイルの変更
- 他memberの作業中ファイルへのアクセス

#### 使用可能なMCPツール
- `check_queue` - タスクキュー確認
- `send_task` - leaderへ報告・質問
- `submit_plan` - 実装計画を提出
- `submit_test` - テストコードを提出（strictモード用）
- `save_memory` - 記憶の保存
- `recall_memory` - 記憶の検索
- `get_project_context` - プロジェクトコンテキスト取得
- `get_dashboard` - 進捗確認
- `get_backlog` - バックログ一覧取得
- `health_check` - システム状態確認

### 権限マトリクス（送信可能な宛先）

| 送信元 | 送信可能な宛先 |
|--------|----------------|
| PM | leader |
| Leader | pm, member-01, member-02 |
| Member-01 | leader |
| Member-02 | leader |

---

## 4. MCPツール一覧

### 4.1 check_queue

#### 概要
自分宛のタスクキューを確認します。未読メッセージを取得し、必要に応じて既読にマークします。

#### パラメータ
| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| mark_as_read | boolean | No | true | 取得したメッセージを既読にマークするか |

#### 使用例
```javascript
// 基本的な使用
check_queue()

// 既読にマークせずに確認
check_queue(mark_as_read=false)
```

#### 出力例
```
📬 2件の未読メッセージがあります。

---
📨 **Hello World関数の実装**
From: leader | Type: task
Time: 2026-01-31T10:00:00.000Z

以下の仕様でHello World関数を実装してください...

---
総メッセージ数: 15
```

#### 使用者
全員（PM, Leader, Member-01, Member-02）

---

### 4.2 send_task

#### 概要
他の役割にタスクまたはメッセージを送信します。送信先は役割の権限に基づいて制限されます。送信後、WezTerm経由で受信者に通知を送ります。

#### パラメータ
| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| to | string | Yes | - | 送信先の役割（pm, leader, member-01, member-02） |
| subject | string | Yes | - | メッセージの件名 |
| content | string | Yes | - | メッセージの本文 |
| type | string | No | task | メッセージの種類（task, report, question, notification） |

#### メッセージタイプ
| タイプ | 用途 |
|--------|------|
| task | タスクの依頼 |
| report | 完了報告や技術報告 |
| question | 質問や承認依頼 |
| notification | 通知（承認完了など） |

#### 使用例
```javascript
// PMからLeaderへタスク送信
send_task(
  to="leader",
  subject="Hello World関数の実装依頼",
  content="Hello World関数を実装してください。技術的な設計・実装方法はお任せします。",
  type="task"
)

// MemberからLeaderへ完了報告
send_task(
  to="leader",
  type="report",
  subject="実装完了: Hello World関数",
  content="## 完了報告\n\n### 実装内容\n- sayHello関数を実装\n\n### テスト\n- 全テストパス"
)
```

#### 出力例
```
✅ タスクを送信しました。
Message ID: 1769855914734-1032gpu3m
📢 受信者に通知しました。
```

#### 使用者
全員（宛先は権限により制限）

---

### 4.3 request_approval

#### 概要
社長（ユーザー）に承認を依頼します。設計完了時や実装完了時など、重要なマイルストーンで使用します。

#### パラメータ
| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| title | string | Yes | - | 承認依頼のタイトル |
| description | string | Yes | - | 承認依頼の詳細説明 |
| type | string | Yes | - | 承認の種類（design, implementation, skill, other） |

#### 承認タイプ
| タイプ | 用途 |
|--------|------|
| design | 設計案の承認 |
| implementation | 実装完了の承認 |
| other | その他 |

#### 使用例
```javascript
request_approval(
  title="ダッシュボード表示強化 設計案",
  description="ダッシュボードに以下の機能を追加する設計案です：\n\n1. メンバー状況表示\n2. タスク一覧表示\n\n変更対象：src/types/task.ts, src/tools/get-dashboard.ts",
  type="design"
)
```

#### 出力例
```
📋 承認依頼を送信しました。

**ダッシュボード表示強化 設計案**
タイプ: design
ID: approval-1769844077621-t4xu6r4e6

社長（ユーザー）がダッシュボードで確認・承認できます。
承認待ち状態です。
```

#### 使用者
PMのみ

---

### 4.4 get_dashboard

#### 概要
プロジェクトの進捗ダッシュボードを取得します。タスク状況、承認待ち、メンバー状況などを確認できます。

#### パラメータ
なし

#### 使用例
```javascript
get_dashboard()
```

#### 出力例
```
# 📊 プロジェクトダッシュボード

**プロジェクト:** dev-team
**現在のフェーズ:** implementation
**最終更新:** 2026-01-31 19:40:26 JST

## タスク状況
| ステータス | 件数 |
|-----------|------|
| 保留中 | 2 |
| 進行中 | 3 |
| 完了 | 5 |
| **合計** | **10** |

## 📋 承認待ち (1件)
- **ダッシュボード表示強化 設計案** (design)
  ダッシュボードに以下の機能を追加...
  申請者: pm | ID: approval-1769844077621-t4xu6r4e6

## 👥 メンバー状況
| メンバー | 状態 | 現在のタスク | 最終活動 |
|---------|------|------------|----------|
| leader | working | - | 2026-01-31 19:40:26 JST |
| member-01 | working | 実装タスクA | 2026-01-31 19:38:24 JST |
| member-02 | working | 実装タスクB | 2026-01-31 19:38:40 JST |

## 📋 タスク一覧
| ID | タスク | 担当 | 状態 | 優先度 |
|----|-------|-----|------|-------|
| 123 | Hello World実装 | member-01 | pending | medium |
```

#### 使用者
全員

---

### 4.6 update_task_status

#### 概要
プロジェクトのタスクステータスを更新します。フェーズの変更やタスク数の増減を記録します。

#### パラメータ
| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| phase | string | No | - | 新しいプロジェクトフェーズ（planning, design, implementation, testing, review, completed） |
| pending_delta | number | No | - | 保留中タスク数の増減 |
| in_progress_delta | number | No | - | 進行中タスク数の増減 |
| completed_delta | number | No | - | 完了タスク数の増減 |

#### フェーズ一覧
| フェーズ | 説明 |
|---------|------|
| planning | 計画中 |
| design | 設計中 |
| implementation | 実装中 |
| testing | テスト中 |
| review | レビュー中 |
| completed | 完了 |

#### 使用例
```javascript
// フェーズを実装中に変更
update_task_status(phase="implementation")

// タスクを1つ進行中に移動
update_task_status(pending_delta=-1, in_progress_delta=+1)

// タスク完了
update_task_status(in_progress_delta=-1, completed_delta=+1)
```

#### 出力例
```
✅ タスクステータスを更新しました。

**現在のフェーズ:** implementation
**タスク状況:** 保留 1 / 進行中 3 / 完了 6
```

#### 使用者
PM, Leaderのみ

---

### 4.7 health_check

#### 概要
システムの状態を確認します。環境変数、WezTerm、ペインマッピングなどをチェックし、問題があれば報告します。

#### パラメータ
なし

#### 使用例
```javascript
health_check()
```

#### 出力例
```
# 🏥 ヘルスチェック結果

✅ **全体ステータス: 正常**

## 環境設定
| 項目 | 値 |
|------|-----|
| 役割 | member-01 |
| プロジェクトパス | C:\dev\my-project |
| DEV_TEAM_ROLE | member-01 |
| DEV_TEAM_PROJECT_PATH | C:\dev\my-project |

## WezTerm
| 項目 | 値 |
|------|-----|
| CLI利用可能 | ✅ Yes |
| 検出ペイン数 | 4 |

### 検出されたペイン
| Pane ID | Title |
|---------|-------|
| 123 | PM |
| 124 | Leader |
| 125 | Member1 |
| 126 | Member2 |

### ペインマッピング
| 役割 | Pane ID |
|------|---------|
| pm | 123 |
| leader | 124 |
| member-01 | 125 |
| member-02 | 126 |
```

#### 使用者
全員

---

## 5. 通信フロー

### メッセージキューの仕組み

#### キューファイル形式
各役割には専用のキューファイル（JSON）が割り当てられています。

```
.dev-team/queue/
├── pm.json
├── leader.json
├── member-01.json
└── member-02.json
```

#### メッセージ構造
```json
{
  "role": "member-01",
  "messages": [
    {
      "id": "1769855914734-1032gpu3m",
      "type": "task",
      "from": "leader",
      "to": "member-01",
      "subject": "Hello World関数の実装",
      "content": "以下の仕様で実装してください...",
      "timestamp": "2026-01-31T10:38:21.063Z",
      "read": false
    }
  ],
  "lastUpdated": "2026-01-31T10:38:21.063Z"
}
```

### 通信シーケンス

```
1. 送信側: send_task() を呼び出し
      ↓
2. MCPサーバー:
   - 権限チェック
   - メッセージIDを生成
   - 受信者のキューファイルにメッセージを追加
   - アクティビティログに記録
   - タスク一覧に追加（type="task"の場合）
      ↓
3. WezTerm通知:
   - wezterm cli send-text で受信者のペインに通知
      ↓
4. 受信側:
   - 通知を受けて check_queue() を実行
   - メッセージを取得・処理
```

### ファイルロック

複数エージェントが同時にキューファイルにアクセスする可能性があるため、`proper-lockfile` パッケージを使用してファイルロックを実装しています。

---

## 6. ダッシュボード

### 表示項目

| 項目 | 説明 |
|------|------|
| プロジェクト名 | 対象プロジェクトの名前 |
| 現在のフェーズ | planning / design / implementation / testing / review / completed |
| 最終更新 | ダッシュボードの最終更新日時（JST表示） |
| タスク状況 | 保留中 / 進行中 / 完了 の件数 |
| 承認待ち | 社長の承認を待っている依頼一覧 |
| メンバー状況 | 各メンバーの状態・現在のタスク・最終活動時刻 |
| タスク一覧 | 全タスクのID・タイトル・担当・状態・優先度 |
| 最近のアクティビティ | 直近のアクション履歴（最大10件） |

### ダッシュボードファイル

```
.dev-team/status/
├── dashboard.json  # データ（JSON形式）
└── dashboard.md    # 表示用（Markdown形式）
```

### 更新の仕組み

1. **自動更新**: `send_task`, `update_task_status`, `request_approval` などのツール実行時に自動更新
2. **アクティビティログ**: 全ての重要なアクションが記録される
3. **メンバーステータス**: `check_queue` 実行時に自動的に lastActivity が更新される

### ダッシュボード表示

`dashboard.md` はMCPツール実行時に自動更新されます。エディタのMarkdownプレビュー機能で閲覧してください。

---

## 7. 管理スクリプト

### 7.1 dev-team start（チーム起動）

#### 概要
開発チームを起動します。WezTermで4ペイン（PM, Leader, Member-01, Member-02）のレイアウトを作成し、各ペインでClaude Codeを起動します。

#### コマンド
```bash
npx dev-team start <projectPath> [initialTask] [options]
```

#### パラメータ
| パラメータ | 必須 | 説明 |
|-----------|------|------|
| projectPath | Yes | 対象プロジェクトのパス |
| initialTask | No | 初期タスク（オプション） |

#### オプション
| オプション | 説明 |
|-----------|------|
| -m, --members \<count\> | メンバー数（デフォルト: 2） |

#### 使用例
```bash
npx dev-team start "C:\dev\my-project" "ユーザー認証機能を実装して"
npx dev-team start "C:\dev\my-project" --members 4
```

#### 処理内容
1. `.dev-team` ディレクトリ構造を作成
2. 初期メッセージをPMのキューに追加
3. 各役割のワークスペースを作成（CLAUDE.md, settings.local.json）
4. WezTermで4ペインのレイアウトを構築
5. 各ペインでClaude Codeを起動（環境変数を設定）
6. PMに `check_queue` の実行を通知

#### ペインレイアウト
```
+----------+----------+
|    PM    |  Leader  |
+----------+----------+
| Member1  | Member2  |
+----------+----------+
```

---

### 7.2 dev-team stop（チーム停止）

#### 概要
開発チームを停止します。各ペインに `/exit` を送信してClaude Codeを終了し、シェルを閉じます。

#### コマンド
```bash
npx dev-team stop <projectPath> [options]
```

#### パラメータ
| パラメータ | 必須 | 説明 |
|-----------|------|------|
| projectPath | Yes | プロジェクトのパス |

#### オプション
| オプション | 説明 |
|-----------|------|
| --delete-queue | キューファイルを削除する（デフォルト: 保持） |

#### 使用例
```bash
# キューを保持して停止
npx dev-team stop "C:\dev\my-project"

# キューを削除して停止
npx dev-team stop "C:\dev\my-project" --delete-queue
```

---

### 7.3 dev-team add-member（メンバー追加）

#### 概要
稼働中のチームにメンバーを追加します。

#### コマンド
```bash
npx dev-team add-member <projectPath> [options]
```

#### オプション
| オプション | 説明 |
|-----------|------|
| -c, --count \<count\> | 追加するメンバー数（デフォルト: 1） |

#### 使用例
```bash
npx dev-team add-member "C:\dev\my-project"
npx dev-team add-member "C:\dev\my-project" --count 2
```

---

### 7.4 dev-team remove-member（メンバー削除）

#### 概要
稼働中のチームからメンバーを削除します。

#### コマンド
```bash
npx dev-team remove-member <projectPath> [options]
```

#### オプション
| オプション | 説明 |
|-----------|------|
| -c, --count \<count\> | 削除するメンバー数（デフォルト: 1） |

#### 使用例
```bash
npx dev-team remove-member "C:\dev\my-project"
```

---

### 7.5 dev-team init（プロジェクト初期化）

#### 概要
プロジェクトの`.dev-team`ディレクトリ構造を初期化します。

#### コマンド
```bash
npx dev-team init [projectPath] [options]
```

#### オプション
| オプション | 説明 |
|-----------|------|
| -f, --force | 既存ファイルを上書き |

#### 使用例
```bash
npx dev-team init "C:\dev\my-project"
npx dev-team init --force
```

---

### 7.6 ステータス確認

#### 概要
開発チームの現在のステータスを確認するには、ダッシュボードファイルを参照します。

#### 確認方法
- **ダッシュボード**: `.dev-team/status/dashboard.md` を参照
- **キュー状態**: `.dev-team/queue/` 配下の各JSONファイルを参照
- **MCPツール**: `get_dashboard()` でプログラム的に取得

---

### 7.7 手動メッセージ送信

#### 概要
デバッグや手動介入時に特定のペインにメッセージを送信するには、WezTerm CLIを直接使用します。

#### 使用例
```bash
# ペインIDを確認
wezterm cli list

# 特定のペインにメッセージを送信
wezterm cli send-text --pane-id <PANE_ID> "check_queue"
```

---

## 8. 追加機能

### 8.1 競合防止ルール

#### 基本思想
- エージェントは毎回別人格のため、罰則による抑止は無意味
- 違反できない仕組みを作る
- 違反したら即交代（ガチャ引き直し）

#### 技術的制約

**制約1: 変更許可制（ホワイトリスト方式）**
- タスク指示で明示されたファイル以外を変更してはならない
- タスク指示には「変更許可ファイル」「禁止ファイル」を明記

**制約2: 計画承認なしの実装禁止**
- 計画を出さずにコードを書いたmemberは即交代

**制約3: 作業領域の物理的分離**
| 状況 | 対応 |
|------|------|
| 独立したファイル | 並列OK |
| 同一ファイル | 1人に集約 or 順次実行 |
| 共通モジュール変更 | 全員停止→1人が変更→再開 |

**注意**: 「領域分割」（同一ファイル内で担当を分ける）は禁止

#### Memberの自己チェックリスト
```
□ leaderから計画の承認を得たか？ → No なら実装するな
□ 変更するファイルは許可リストにあるか？ → No なら触るな
□ 他memberの作業中ファイルを避けているか？ → No なら止まれ
```

---

## 付録: 型定義

### Role
```typescript
type Role = 'pm' | 'leader' | 'member-01' | 'member-02';
```

### TaskStatus
```typescript
type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
```

### TaskPriority
```typescript
type TaskPriority = 'high' | 'medium' | 'low';
```

### Message
```typescript
interface Message {
  id: string;
  type: 'task' | 'report' | 'question' | 'notification';
  from: Role;
  to: Role;
  subject: string;
  content: string;
  timestamp: string;
  read: boolean;
}
```

### Dashboard
```typescript
interface Dashboard {
  projectName: string;
  lastUpdated: string;
  currentPhase: 'planning' | 'design' | 'implementation' | 'testing' | 'review' | 'completed';
  tasks: {
    pending: number;
    inProgress: number;
    completed: number;
    total: number;
  };
  recentActivity: ActivityLog[];
  pendingApprovals: ApprovalRequest[];
  memberStatus: {
    leader: MemberStatus;
    'member-01': MemberStatus;
    'member-02': MemberStatus;
  };
  taskList: TaskSummary[];
}
```

---

*本レポートはdev-teamシステムの現状の実装に基づいて作成されています。*
*最終更新: 2026-02-08*
