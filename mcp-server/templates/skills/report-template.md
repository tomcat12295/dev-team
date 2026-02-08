---
name: report-template
description: 計画提出・完了報告・質問のテンプレート（member用）
---

# /report-template - 報告テンプレート

## 計画提出

```
submit_plan(
  task_id: "T-XXX",
  summary: "タスクの理解（何をするタスクか）",
  approach: "実装方針（どのように実装するか）",
  files_to_change: ["変更予定ファイル"],
  files_to_create: ["新規作成予定ファイル"],
  test_plan: "テスト計画"
)
```

## 完了報告

```
send_task(
  to: "leader",
  type: "report",
  subject: "完了: [機能名]",
  content: """
worker_id: member-{N}
status: done
result:
  summary: [成果要約]
  files_modified: [ファイル一覧]
  test_result: [結果]
"""
)
```

## 質問

```
send_task(
  to: "leader",
  type: "question",
  subject: "質問: [内容]",
  content: "[背景と質問]"
)
```

## テストレビュー依頼（strictモード）

```
submit_test(
  task_id: "T-XXX",
  test_files: ["テストファイルのパス一覧"],
  test_summary: "テストの概要説明"
)
```
