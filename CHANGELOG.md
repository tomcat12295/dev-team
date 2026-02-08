# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-02-08

### Fixed

- `npm install -g` 後に `dev-team init` / `dev-team start` が失敗する問題を修正
  - `prompts/` と `permissions/` をパッケージ内の `templates/` に移動
  - パス解決を修正（`init-project.ts`、`team-session.ts`）

### Changed

- ビルド時に `dist/` をクリーンアップする `clean` / `prebuild` スクリプトを追加
- パッケージからテストファイル（`*.test.*`）を除外
- CI にパッケージ検証ジョブ（`package-verify`）を追加

## [0.1.0] - 2026-02-04

### Added

- MCPサーバーによるチーム自動化システム
- 役割ベースの権限制御（PM、Leader、Member）
- タスクキュー管理
- WezTerm統合（ペイン間通信）
- ダッシュボード機能
- 計画承認フロー
- メモリ機能（決定事項・メモの保存）
- compact/clearエージェントツール

### Notes

- Windows専用
- WezTerm必須
