---
name: start-team
description: Dev Teamを起動する
user-invocable: true
---

# /start-team - Dev Team起動コマンド

4ペイン構成のClaude Code開発チーム（PM、Leader、Member×2）を起動します。

## 使い方

```
/start-team [初期タスク]
```

## 引数の解析

ユーザーの入力: $ARGUMENTS

- 引数が空の場合: 初期タスクなしで起動
- 引数がある場合: 初期タスクとしてPMのキューに追加

## 実行手順

### 1. Dev Team起動

以下のコマンドを実行してください：

```bash
npx dev-team start "{{PROJECT_PATH}}" "$ARGUMENTS"
```

- `{{PROJECT_PATH}}`: このプロジェクトのパス
- `$ARGUMENTS`: ユーザーが指定した初期タスク（オプション）

### 2. 起動完了の報告

起動が完了したら、以下を報告してください：

- プロジェクトパス: `{{PROJECT_PATH}}`
- 初期タスク: `$ARGUMENTS`（指定されている場合）
- 4つのペイン（PM, Leader, Member-01, Member-02）が作成されたこと
- ダッシュボード: `{{PROJECT_PATH}}/.dev-team/status/dashboard.md`
- キューディレクトリの場所: `{{PROJECT_PATH}}/.dev-team/queue/`

## 例

```
# 初期タスクを指定して起動
/start-team ユーザー認証機能を実装

# 初期タスクなしで起動
/start-team
```

## 注意事項

- WezTermが必要です
- Node.js 18以上が必要です
- 事前に `npm install && npm run build` が完了していること
