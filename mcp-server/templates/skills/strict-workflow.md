---
name: strict-workflow
description: strictモードの実装ワークフロー（member用）
---

# /strict-workflow - テストファースト実装手順

## ワークフロー

```
1. タスク受信 → submit_plan（計画提出）
   ↓
2. 計画承認 → テストコードのみ実装
   ↓
3. テストレビュー依頼（submit_test）
   ↓
4. テストレビュー待ち（phase: test_review）
   ↓
5. テスト承認 → 実装コードを書く
   ↓
6. 完了報告
```

## テストレビュー依頼の出し方

テストコードを書いたら、実装前にleaderにレビューを依頼：

```
submit_test(
  task_id: "T-XXX",
  test_files: ["path/to/test1.ts", "path/to/test2.ts"],
  test_summary: "テスト概要の説明"
)
```

## strictモード時の注意

- **テスト承認前に実装コードを書くな**
- テストが承認されるまで `test_review` フェーズで待機
- 承認通知が来たら `check_queue` でphase確認
- `implementing` になったら実装開始

## テスト設計のポイント

- 受け入れ条件から逆算してテストケースを洗い出す
- 正常系・異常系・境界値を網羅
- テスト名は「何をテストしているか」が明確に分かる名前にする
- モックは必要最小限に
