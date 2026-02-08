# Claude Code 開発チーム自動化システム

[![npm version](https://img.shields.io/npm/v/dev-team-mcp-server)](https://www.npmjs.com/package/dev-team-mcp-server)
[![CI](https://github.com/tomcat12295/dev-team/actions/workflows/ci.yml/badge.svg)](https://github.com/tomcat12295/dev-team/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

複数のClaude Codeインスタンスを「開発チーム」として動作させ、実際の組織構造を再現するシステムです。

### なぜマルチエージェント開発チームが必要か

現代のソフトウェア開発では、単一のAIアシスタントでは対応しきれない複雑なタスクが増えています。本システムは、複数のClaude Codeインスタンスを役割分担させることで、以下の課題を解決します：

- **並列作業の実現**: PM、リーダー、メンバーが同時に異なるタスクを処理
- **専門性の分離**: 各役割が得意分野に集中することで品質向上
- **スケーラビリティ**: メンバーを追加することで処理能力を拡張可能
- **人間の監督**: 社長（ユーザー）が重要な意思決定を承認するフロー

実際の開発チームのように、階層的なコミュニケーションと承認フローにより、安全で効率的な開発を実現します。

## 特徴

- **イベント駆動型によるAPI消費ゼロ（待機中）**: タスクがない間はAPIを消費せず、通知を受けた時のみ処理を開始
- **ファイルベース通信による信頼性**: JSONファイルを介した通信により、メッセージの永続化と監査が可能
- **役割ベースの権限制御（RBAC）**: 各役割は許可された相手にのみメッセージを送信可能
- **WezTerm統合による視覚的な分離**: 各役割が独立したペインで動作し、状況を一目で把握可能

## 技術スタック

| 技術 | バージョン/備考 | 用途 |
|------|----------------|------|
| TypeScript | ES2022 | MCPサーバー・CLI実装 |
| Model Context Protocol (MCP) SDK | v1.0.0 | Claude Codeとの通信 |
| Node.js | 18以上 | ランタイム環境 |
| proper-lockfile | v4.1.2 | ファイルロック制御 |
| Commander.js | v14 | CLI実装 |
| WezTerm | - | ターミナルマルチプレクサ |

## 構成

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
│    リーダー（Claude Code #2）        │
│  - 技術的な設計判断                  │
│  - コードレビュー                    │
└──────────────┬──────────────────────┘
               │ 指示 / 上申
┌──────────────▼──────────────────────┐
│   メンバー（Claude Code #3, #4）     │
│  - 実際のコード実装                  │
│  - テスト作成・実行                  │
└─────────────────────────────────────┘
```

## 前提条件

- **Node.js 18以上**
- **WezTerm 20230326以降**（推奨: 20240203以降）
- **Claude Code CLI v2.1.0以上**（推奨: v2.1.6以上）
- **Windows OS**

### 確認コマンド

```powershell
node --version      # v18以上
wezterm --version   # バージョン表示
claude --version    # バージョン表示
```

## インストール

### npm 経由（推奨）

```powershell
npm install -g dev-team-mcp-server
```

### ソースから

```powershell
git clone https://github.com/tomcat12295/dev-team.git
cd dev-team/mcp-server
npm install
npm run build
```

## セットアップ

### 1. MCP設定

`~/.mcp.json` に dev-team サーバーを設定（パスは実際のインストール先に置き換えてください）:

```json
{
  "mcpServers": {
    "dev-team": {
      "command": "node",
      "args": ["<インストール先>/mcp-server/dist/index.js"]
    }
  }
}
```

### 3. Claude Codeで初回承認

初回起動時にMCPサーバーの使用許可を求められます。

## クイックスタート

```powershell
# チーム起動
npx dev-team start "C:\dev\my-project" "ユーザー認証機能を実装して"

# メンバー追加（オプション）
npx dev-team add-member "C:\dev\my-project" --count 1

# チーム停止
npx dev-team stop "C:\dev\my-project"
```

## ディレクトリ構造

### 共通設定（この場所）
```
dev-team/
├── docs/                 # ドキュメント
│   ├── design/           # 設計ドキュメント
│   └── tools.md          # MCPツール詳細
├── prompts/              # 役割ごとの指示書
│   ├── pm.md
│   ├── leader.md
│   └── member.md
├── mcp-server/           # MCPサーバー・CLI（ツール提供）
│   ├── src/              # TypeScriptソース
│   │   ├── cli.ts        # CLIエントリポイント
│   │   └── ...
│   ├── dist/             # ビルド済みJS
│   └── package.json
└── README.md
```

### プロジェクト内（実行時に自動生成）
```
your-project/
├── .dev-team/
│   ├── queue/            # タスクキュー（JSON）
│   │   ├── pm.json
│   │   ├── leader.json
│   │   ├── member-01.json
│   │   └── member-02.json
│   ├── status/
│   │   ├── dashboard.json  # 進捗ダッシュボード（JSON）
│   │   └── dashboard.md    # 進捗ダッシュボード（Markdown表示用）
│   ├── memory/           # チーム記憶（decision/note）
│   ├── archive/          # アーカイブ済みキュー
│   ├── config/           # チーム設定
│   ├── skills/           # プロジェクト固有スキル
│   ├── workspaces/       # 役割ごとのワークスペース
│   │   ├── pm/
│   │   ├── leader/
│   │   ├── member-01/
│   │   └── member-02/
│   └── panes.json        # WezTermペイン情報
└── ...
```

## 通信方式

**イベント駆動型**でAPI消費を抑えています。

1. タスク送信側がキューファイル（JSON）を作成
2. `wezterm cli send-text` で受信側に `/check-queue` を送信
3. 受信側がJSONを読み込んでタスクを処理
4. 完了後、同様に報告を送信

待機中はAPI消費ゼロです。

## MCPツール一覧

### 基本ツール
| ツール | 使用者 | 説明 |
|--------|--------|------|
| `check_queue` | 全員 | 自分宛のタスクキューを確認 |
| `send_task` | 全員（宛先制限あり） | 他の役割にタスクを送信 |
| `get_dashboard` | 全員 | ダッシュボードを取得 |
| `health_check` | 全員 | システム状態を確認 |

### タスク管理
| ツール | 使用者 | 説明 |
|--------|--------|------|
| `assign_task` | Leader | メンバーにタスクを割り当て |
| `distribute_tasks` | Leader | 複数サブタスクを一括で分配 |
| `submit_plan` | Member | 実装計画を提出 |
| `approve_plan` | Leader | 実装計画を承認 |
| `reject_plan` | Leader | 実装計画を却下 |
| `submit_test` | Member | テストコードを提出（strictモード用） |
| `approve_test` | Leader | テストコードを承認 |
| `reject_test` | Leader | テストコードを却下 |
| `update_task_status` | PM, Leader | タスクステータスを更新 |

### バックログ
| ツール | 使用者 |
|--------|--------|
| `add_backlog` | PM |
| `get_backlog` | 全員 |
| `update_backlog` | PM |

### メモリ・コンテキスト
| ツール | 使用者 |
|--------|--------|
| `save_memory` | 全員 |
| `recall_memory` | 全員 |
| `get_project_context` | 全員 |
| `update_project_context` | PM, Leader |

### 承認
| ツール | 使用者 | 説明 |
|--------|--------|------|
| `request_approval` | PM | 社長に承認を依頼 |
| `process_approval` | PM | 承認依頼を処理 |

### モード設定
| ツール | 使用者 | 説明 |
|--------|--------|------|
| `configure_modes` | PM | モード設定の確認・一括変更 |

### メンバー管理
| ツール | 使用者 |
|--------|--------|
| `request_member_increase` | Leader |
| `request_member_decrease` | Leader |

### エージェント制御
| ツール | 使用者 |
|--------|--------|
| `compact_agent` | PM, Leader |
| `clear_agent` | PM, Leader |
| `compact_all` | PM, Leader |
| `archive_all_tasks` | PM |

詳細は [docs/tools.md](docs/tools.md) を参照。

### 送信権限マトリクス

| 送信元 | 送信可能な宛先 |
|--------|----------------|
| PM | leader |
| Leader | pm, member-01, member-02 |
| Member | leader |

## 承認フロー

```
タスク開始
    ↓
設計完了 → 【社長承認】
    ↓
実装・テスト
    ↓
実装完了 → 【社長承認】
    ↓
完了
```

社長（ユーザー）はPMペインで承認依頼を確認し、`yes` / `no` / `revise: [内容]` で応答します。

## モード設定

PMは `configure_modes` で開発フローを切り替えられます。

### reviewMode: レビューモード

#### normal（デフォルト）

```
タスク割当 → 計画提出 → Leader承認 → 実装 → 完了報告
```

- Leaderのコードレビューで完了
- 標準的な開発フロー

#### strict（テストファーストレビュー）

```
タスク割当 → 計画提出 → Leader承認 → テスト作成 → テストレビュー → 実装 → 完了報告
```

- 実装前にテストコードをレビュー
- `submit_test` でテストを提出、`approve_test` で承認後に実装開始
- より厳格な品質管理が必要な場合に使用

### taskSplitApproval: タスク分割承認

#### auto（デフォルト）

- Leaderが `distribute_tasks` でタスクを分割する際、PMの承認なしで即分配
- Leader一任で迅速にタスクを割り振れる

#### required

- Leaderが `distribute_tasks` を実行すると、PMに承認依頼が送信される
- PMが承認するまでタスクは分配されない
- 重要な分割判断にPMの関与が必要な場合に使用

### タスク種別（task_type）

`assign_task` で `task_type` を指定してタスクの種類を設定できます。

| 種別 | 説明 | 計画提出 |
|------|------|---------|
| `implementation` | 実装タスク（デフォルト） | 必須 |
| `investigation` | 調査タスク | 不要 |
| `review` | レビュータスク | 必須 |
| `documentation` | ドキュメント作成 | 必須 |
| `plan` | プラン/設計タスク | 必須 |
| `test_plan` | テストプラン/テスト設計 | 必須 |
| `test_implementation` | テスト実装タスク | 必須 |

#### 調査タスク（investigation）の特徴

- **計画提出不要**: `submit_plan` をスキップして即座に調査開始
- **ファイル編集禁止**: 読み取りのみ許可
- **レビューモードの影響なし**: strictモードでもテストレビュー不要
- 完了後は `send_task(type='report')` で結果を報告

#### compact自動送信

実装タスク（`implementation`または未指定）の割り当て時、自動で`/compact`が送信されます。メンバーは入力待ち状態のため確実に実行されます。

## 開発

### 開発モード

watchモードでファイル変更を自動検出してリビルドします：

```powershell
cd mcp-server
npm run dev
```

### ビルドコマンド

```powershell
# 通常ビルド
npm run build

# 型チェックのみ
npx tsc --noEmit

# クリーンビルド
rm -rf dist && npm run build
```

### 新しいMCPツールの追加

1. `mcp-server/src/tools/` にツールファイルを作成
2. `mcp-server/src/index.ts` でツールを登録
3. 必要に応じて権限設定を追加
4. `npm run build` でビルド
5. Claude Codeを再起動して変更を反映

## トラブルシューティング

### ペインが正しく分割されない
- WezTermが最新版か確認
- `wezterm cli list` でペイン一覧を確認

### キューが処理されない
- `.dev-team/status/dashboard.md` でキュー状態を確認
- 手動で `/check-queue` を送信

### Claude Codeが起動しない
- 各ペインで `claude` コマンドが実行可能か確認
- パスが正しく設定されているか確認

## 注意事項

- **WezTerm必須**: ペイン間通信に WezTerm CLI を使用しているため、iTerm2、Terminal.app、Windows Terminal など他のターミナルでは動作しません。バージョン20230326以降が必要です。
- **Windows専用**: macOS/Linux対応予定なし
- **Claude Code CLI必須**: v2.1.0以上が必要です（推奨: v2.1.6以上）

## 参考

- [multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun)
- [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode)
- [claude-flow](https://github.com/ruvnet/claude-flow)

## ライセンス

MIT License
