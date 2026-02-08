# MCPツール詳細リファレンス

dev-teamで使用可能な全MCPツールの詳細説明。

## 目次

1. [基本操作](#基本操作)
2. [タスク管理](#タスク管理)
3. [バックログ管理](#バックログ管理)
4. [メモリ・コンテキスト](#メモリコンテキスト)
5. [承認フロー](#承認フロー)
6. [メンバー管理](#メンバー管理)
7. [エージェント制御](#エージェント制御)

---

## 基本操作

### check_queue

自分宛のタスクキューを確認する。

**使用者:** 全員

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| format | `"full"` \| `"summary"` | No | `"full"` | 出力形式。`full`=全メッセージ展開、`summary`=件名一覧のみ |
| mark_as_read | boolean | No | `true` | 取得したメッセージを既読にするか |

**例:**
```
check_queue()
check_queue(format="summary", mark_as_read=false)
```

**備考:**
- メンバーがタスクを受信すると、ステータスが自動的に更新される
- 未読メッセージがない場合は空のキューを返す

---

### send_task

他の役割にタスクまたはメッセージを送信する。

**使用者:** 全員（宛先制限あり）

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| to | string | Yes | - | 送信先（pm, leader, member-01, member-02） |
| subject | string | Yes | - | 件名 |
| content | string | Yes | - | 本文 |
| type | `"task"` \| `"report"` \| `"question"` \| `"notification"` | No | `"task"` | メッセージ種類 |
| priority | `"high"` \| `"medium"` \| `"low"` | No | `"medium"` | 優先度（type="task"の場合） |

**送信権限マトリクス:**

| 送信元 | 送信可能な宛先 |
|--------|---------------|
| PM | leader |
| Leader | pm, member-01, member-02 |
| Member | leader |

**例:**
```
send_task(to="leader", subject="完了報告", content="タスクT-001を完了しました", type="report")
send_task(to="leader", subject="質問", content="仕様について確認したいです", type="question")
```

**備考:**
- leader→memberへの`type="task"`送信は禁止（`assign_task`を使用）
- `type="report"`送信時、送信者のステータスが`idle`に更新される
- `type="task"`の場合はタスクID（T-XXX）、それ以外はメッセージID（M-XXX）が生成される

---

### get_dashboard

プロジェクトの進捗ダッシュボードを取得する。

**使用者:** 全員

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| mode | `"full"` \| `"summary"` \| `"tasks_only"` | No | `"full"` | 出力モード |

**出力モード:**
- `full`: 全情報（タスク状況、承認待ち、メンバー状況、タスク一覧、アクティビティ）
- `summary`: タスク数と承認待ち件数のみ
- `tasks_only`: タスク一覧表のみ

**例:**
```
get_dashboard()
get_dashboard(mode="summary")
get_dashboard(mode="tasks_only")
```

---

### health_check

システムの状態を確認する。

**使用者:** 全員

**パラメータ:** なし

**戻り値:**
- 役割
- プロジェクトパス
- WezTerm CLI利用可能状態
- 検出ペイン一覧
- ペインマッピング
- 環境変数（DEV_TEAM_ROLE, DEV_TEAM_PROJECT_PATH）
- エラー一覧

**例:**
```
health_check()
```

---

## タスク管理

### assign_task

メンバーに構造化タスクを割り当てる。

**使用者:** Leaderのみ

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| to | string | Yes | - | 割り当て先（member-01, member-02） |
| title | string | Yes | - | タスク名 |
| description | string | Yes | - | 詳細説明 |
| acceptance_criteria | string[] | Yes | - | 完了条件（1つ以上） |
| allowed_files | string[] | Yes | - | 変更許可ファイル（1つ以上） |
| forbidden_files | string[] | No | - | 禁止ファイル |
| priority | `"high"` \| `"medium"` \| `"low"` | No | `"medium"` | 優先度 |
| parent_task_id | string | No | leaderの現在タスク | 親タスクID |
| task_type | TaskType | No | `"implementation"` | タスク種別（下記参照） |
| clear_before | boolean | No | `false` | trueなら/clear、falseなら/compactを事前送信 |

**タスク種別（TaskType）:**

| 種別 | 説明 | 計画提出 | ファイル編集 |
|------|------|---------|-------------|
| `investigation` | 調査タスク | 不要 | 禁止（読み取りのみ） |
| `implementation` | 実装タスク（デフォルト） | 必須 | 許可 |
| `review` | レビュータスク | 必須 | 許可 |
| `documentation` | ドキュメント作成 | 必須 | 許可 |
| `plan` | プラン/設計タスク | 必須 | 許可 |
| `test_plan` | テストプラン/テスト設計 | 必須 | 許可 |
| `test_implementation` | テスト実装タスク | 必須 | 許可 |

**例:**
```
assign_task(
  to="member-01",
  title="ログイン機能の実装",
  description="ユーザー認証機能を実装する",
  acceptance_criteria=["ログインフォームが表示される", "正しい認証情報でログインできる"],
  allowed_files=["src/auth/login.ts", "src/auth/login.test.ts"],
  priority="high"
)
```

**備考:**
- タスクは`phase: planning`で作成される（調査タスクは`implementing`）
- メンバーは`submit_plan`で計画を提出する必要がある（調査タスクは不要）
- **compact自動送信**: 実装タスク（`implementation`または未指定）の場合、タスク割り当て時に自動で`/compact`が送信される。これはメンバーが入力待ち状態で確実に実行されるため

---

### submit_plan

実装計画を提出する。

**使用者:** Memberのみ

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| task_id | string | Yes | - | 対象タスクID |
| summary | string | Yes | - | タスクの理解（何をするか） |
| approach | string | Yes | - | 実装方針（どのように実装するか） |
| files_to_change | string[] | No | `[]` | 変更予定ファイル |
| files_to_create | string[] | No | `[]` | 新規作成予定ファイル |
| test_plan | string | Yes | - | テスト計画 |

**例:**
```
submit_plan(
  task_id="T-123",
  summary="ログインフォームとバリデーションを実装する",
  approach="1. フォームコンポーネントを作成\n2. バリデーションロジックを追加\n3. APIと連携",
  files_to_change=["src/auth/login.ts"],
  files_to_create=["src/auth/login.test.ts"],
  test_plan="ユニットテストでバリデーションを検証"
)
```

**備考:**
- `files_to_change`または`files_to_create`のいずれかは1つ以上必要
- タスクのフェーズが`awaiting_approval`に変更される
- leaderに通知が送信される

---

### approve_plan

メンバーの実装計画を承認する。

**使用者:** Leaderのみ

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| task_id | string | Yes | - | 対象タスクID |
| comments | string | No | - | 承認コメント |

**例:**
```
approve_plan(task_id="T-123", comments="計画承認。実装してください。")
```

**備考:**
- タスクのフェーズが`implementing`に変更される
- メンバーに通知が送信される

---

### distribute_tasks

複数のサブタスクを一括でメンバーに分配する。

**使用者:** Leaderのみ

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| parent_task_id | string | Yes | - | 親タスクID |
| subtasks | SubtaskInput[] | Yes | - | 分配するサブタスクの配列 |

**SubtaskInput:**

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| title | string | Yes | - | サブタスク名 |
| description | string | Yes | - | 詳細説明 |
| acceptance_criteria | string[] | Yes | - | 完了条件（1つ以上） |
| allowed_files | string[] | Yes | - | 変更許可ファイル（1つ以上） |
| to | string | No | - | 割り当て先メンバー（省略時は空きメンバーに自動割り当て） |
| priority | `"high"` \| `"medium"` \| `"low"` | No | `"medium"` | 優先度 |

**例:**
```
distribute_tasks(
  parent_task_id="T-100",
  subtasks=[
    {
      title="ログインUI実装",
      description="ログインフォームのUI部分を実装",
      acceptance_criteria=["フォームが表示される", "バリデーションエラーが表示される"],
      allowed_files=["src/components/LoginForm.tsx"],
      to="member-01"
    },
    {
      title="認証API実装",
      description="バックエンドの認証APIを実装",
      acceptance_criteria=["POST /auth/loginが動作する", "JWTが返却される"],
      allowed_files=["src/api/auth.ts"],
      to="member-02"
    }
  ]
)
```

**備考:**
- 内部的に`assign_task`を各サブタスクに対して実行する
- `to`が省略されたサブタスクは、空きメンバー（status: idle）に自動割り当てされる
- メンバー不足の場合、自動的に増員リクエストが送信される
- 結果には成功/失敗件数と各サブタスクの詳細が含まれる

---

### reject_plan

メンバーの実装計画を却下する。

**使用者:** Leaderのみ

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| task_id | string | Yes | - | 対象タスクID |
| reason | string | Yes | - | 却下理由 |
| feedback | string | Yes | - | 修正指示 |

**例:**
```
reject_plan(
  task_id="T-123",
  reason="テスト計画が不十分",
  feedback="エラーケースのテストも追加してください"
)
```

**備考:**
- タスクのフェーズが`planning`に戻る
- 却下履歴が記録される
- メンバーに通知が送信される

---

### submit_test

テストコードを提出する（strictモード用）。

**使用者:** Memberのみ

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| task_id | string | Yes | - | 対象タスクID |
| test_files | string[] | Yes | - | テストファイルのパス一覧（1つ以上） |
| test_summary | string | Yes | - | テストの概要説明 |

**例:**
```
submit_test(
  task_id="T-123",
  test_files=["src/auth/login.test.ts", "src/auth/validation.test.ts"],
  test_summary="ログイン機能のユニットテスト。正常ケース3件、エラーケース5件を網羅。"
)
```

**備考:**
- strictモードでのみ使用する
- タスクのフェーズが`test_review`（テストレビュー待ち）に変更される
- leaderに通知が送信される
- テストが承認されるまで実装コードを書いてはいけない

---

### approve_test

メンバーのテストコードを承認する。

**使用者:** Leaderのみ

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| task_id | string | Yes | - | 対象タスクID |
| comments | string | No | - | 承認コメント |

**例:**
```
approve_test(task_id="T-123", comments="テストケースが十分です。実装を進めてください。")
```

**備考:**
- 対象タスクのフェーズが`test_review`である必要がある
- 承認するとフェーズが`implementing`に変更される
- メンバーに通知が送信される
- 承認後、メンバーは実装を開始できる

---

### reject_test

メンバーのテストコードを却下する。

**使用者:** Leaderのみ

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| task_id | string | Yes | - | 対象タスクID |
| reason | string | Yes | - | 却下理由 |
| feedback | string | Yes | - | 修正指示 |

**例:**
```
reject_test(
  task_id="T-123",
  reason="エラーケースのテストが不足",
  feedback="null入力時とタイムアウト時の異常系テストを追加してください"
)
```

**備考:**
- 対象タスクのフェーズが`test_review`である必要がある
- 却下するとフェーズが`planning`に戻る
- メンバーに却下理由と修正指示が通知される
- メンバーはテストを修正し、再度`submit_test`で提出する
- `approve_test`と対になるツール

---

### update_task_status

プロジェクトのタスクステータスを更新する。

**使用者:** PM, Leader

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| phase | `"planning"` \| `"design"` \| `"implementation"` \| `"testing"` \| `"review"` \| `"completed"` | No | - | 新しいプロジェクトフェーズ |
| completed_task_id | string | No | - | 完了したタスクID（taskListのステータスをcompletedに更新） |
| completed_assignee | string | No | - | 完了したタスクの担当者（current_stateから削除） |

**例:**
```
update_task_status(phase="implementation")
update_task_status(completed_task_id="T-123", completed_assignee="member-01")
```

**備考:**
- タスク集計値はtaskListから自動計算される
- `completed_task_id`指定時、該当タスクのステータスが`completed`に更新される

---

## バックログ管理

### add_backlog

バックログにタスクを追加する。

**使用者:** PMのみ

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| title | string | Yes | - | タスクのタイトル |
| description | string | Yes | - | タスクの詳細説明 |
| priority | `"high"` \| `"medium"` \| `"low"` | No | `"medium"` | 優先度 |

**例:**
```
add_backlog(
  title="パフォーマンス改善",
  description="ページ読み込み時間を2秒以内にする",
  priority="high"
)
```

---

### get_backlog

バックログのタスク一覧を取得する。

**使用者:** 全員

**パラメータ:** なし

**例:**
```
get_backlog()
```

**備考:**
- 優先度順（high → medium → low）でソートされる

---

### update_backlog

バックログタスクのステータスを更新する。

**使用者:** PMのみ

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| task_id | string | Yes | - | バックログタスクのID |
| status | `"completed"` \| `"cancelled"` | Yes | - | 新しいステータス |

**例:**
```
update_backlog(task_id="backlog-T-456", status="completed")
update_backlog(task_id="backlog-T-789", status="cancelled")
```

---

## メモリ・コンテキスト

### save_memory

個別の記憶を保存する。

**使用者:** 全員

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| type | `"decision"` \| `"note"` | Yes | - | 記憶の種類（decision: 決定事項・ルール・方針、note: メモ・備忘録） |
| title | string | Yes | - | 記憶のタイトル |
| content | string | Yes | - | 記憶の内容 |
| tags | string[] | No | - | タグ |

**例:**
```
save_memory(
  type="decision",
  title="認証方式はJWTを使用",
  content="セッション管理にはJWTを採用することに決定した。理由は...",
  tags=["認証", "設計"]
)
```

---

### recall_memory

記憶を検索・取得する。

**使用者:** 全員

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| query | string | No | - | 検索キーワード（タイトル、内容、タグを検索） |
| type | `"decision"` \| `"note"` | No | - | 記憶の種類でフィルタ |
| tags | string[] | No | - | タグでフィルタ（OR検索） |
| limit | number | No | `10` | 取得件数の上限（1〜100） |

**例:**
```
recall_memory()
recall_memory(query="認証", type="decision", limit=5)
recall_memory(tags=["設計", "API"])
```

---

### get_project_context

プロジェクトコンテキストを取得する。

**使用者:** 全員

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| section | `"what"` \| `"why"` \| `"who"` \| `"constraints"` \| `"current_state"` \| `"decisions"` \| `"notes"` \| `"preferences"` | No | - | 取得するセクション（省略時は全セクション） |

**例:**
```
get_project_context()
get_project_context(section="constraints")
```

---

### update_project_context

プロジェクトコンテキストの特定セクションを更新する。

**使用者:** PM, Leader

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| section | `"what"` \| `"why"` \| `"who"` \| `"constraints"` \| `"current_state"` \| `"decisions"` \| `"notes"` \| `"preferences"` | Yes | - | 更新するセクション |
| content | string | Yes | - | 新しい内容 |
| append | boolean | No | `false` | 既存の内容に追記するか |

**例:**
```
update_project_context(
  section="constraints",
  content="- 外部APIの呼び出しは1秒以内に完了すること",
  append=true
)
```

---

## 承認フロー

### request_approval

社長（ユーザー）に承認を依頼する。

**使用者:** PMのみ

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| title | string | Yes | - | 承認依頼のタイトル |
| description | string | Yes | - | 承認依頼の詳細説明 |
| type | `"design"` \| `"implementation"` \| `"skill"` \| `"other"` | Yes | - | 承認の種類 |

**例:**
```
request_approval(
  title="認証システムの設計承認",
  description="JWT認証を採用した設計案の承認をお願いします",
  type="design"
)
```

---

### process_approval

承認依頼を処理する。

**使用者:** PMのみ

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| approval_id | string | Yes | - | 承認依頼のID |
| action | `"approve"` \| `"reject"` | Yes | - | 処理アクション |
| comments | string | No | - | コメント |

**例:**
```
process_approval(approval_id="A-001", action="approve", comments="承認します")
process_approval(approval_id="A-002", action="reject", comments="再検討が必要")
```

**備考:**
- `member_increase`タイプの承認時、自動的にメンバーが追加される（CLI経由）
- `member_decrease`タイプの承認時、自動的にメンバーが削除される（CLI経由）

---

## メンバー管理

### request_member_increase

メンバー増員をPMにリクエストする。

**使用者:** Leaderのみ

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| count | number | Yes | - | 増員するメンバー数（1-4） |
| reason | string | Yes | - | 増員理由 |

**例:**
```
request_member_increase(count=2, reason="並列タスクが多く、リソースが不足している")
```

---

### request_member_decrease

メンバー減員をPMにリクエストする。

**使用者:** Leaderのみ

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| count | number | Yes | - | 減員するメンバー数（1-4） |
| reason | string | Yes | - | 減員理由 |

**例:**
```
request_member_decrease(count=1, reason="タスクが減少し、リソースが過剰")
```

**備考:**
- 進行中タスクを持つメンバーがいる場合は減員できない
- 最低1名のメンバーは残す必要がある

---

## エージェント制御

### configure_modes

複数のモード設定を一括で確認・変更する。

**使用者:** PMのみ

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| reviewMode | `"normal"` \| `"strict"` | No | - | レビューモード |
| taskSplitApproval | `"auto"` \| `"required"` | No | - | タスク分割時のPM承認要否 |

**設定項目:**

| 設定 | 値 | 説明 |
|------|-----|------|
| `reviewMode` | `normal` | leaderのレビューで完了（デフォルト） |
| `reviewMode` | `strict` | テストファーストレビュー。実装前にテストをレビュー |
| `taskSplitApproval` | `auto` | タスク分割は承認不要、leader一任（デフォルト） |
| `taskSplitApproval` | `required` | タスク分割にPM承認が必要 |

**例:**
```
# 現在の設定を確認（パラメータなし）
configure_modes()

# reviewModeのみ変更
configure_modes(reviewMode="strict")

# taskSplitApprovalのみ変更
configure_modes(taskSplitApproval="required")

# 複数設定を一括変更
configure_modes(reviewMode="strict", taskSplitApproval="required")
```

**備考:**
- パラメータを指定しない場合、現在の設定値を返す
- 指定したパラメータのみ更新され、未指定の設定は維持される
- 設定は`project-context.json`の`preferences`セクションに保存される

---

### compact_agent

指定ロールに/compactコマンドを送信する。

**使用者:** PM, Leader

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| role | `"pm"` \| `"leader"` \| `"member-01"` \| `"member-02"` | Yes | - | 対象ロール |

**例:**
```
compact_agent(role="member-01")
```

---

### clear_agent

指定ロールに/clearコマンドを送信する。

**使用者:** PM, Leader

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| role | `"pm"` \| `"leader"` \| `"member-01"` \| `"member-02"` | Yes | - | 対象ロール |

**例:**
```
clear_agent(role="member-02")
```

---

### compact_all

全ロールに/compactコマンドを送信する。

**使用者:** PM, Leader

**パラメータ:** なし

**例:**
```
compact_all()
```

**備考:**
- 全ロールに並列で送信される

---

### archive_all_tasks

全タスクをアーカイブする。

**使用者:** PMのみ

**パラメータ:** なし

**例:**
```
archive_all_tasks()
```

**備考:**
- タスクリストがクリアされ、アーカイブファイルに保存される
