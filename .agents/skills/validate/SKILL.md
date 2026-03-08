---
name: validate
description: Validate tasks.csv, project.csv, and optional holidays.csv against the project template and scheduling rules before draft generation.
---

# Validate Skill

`tasks.csv`、`project.csv`、`members.csv`、`holidays.csv` の妥当性確認を行う。

## 目的

- テンプレート準拠かを確認する
- スケジュール生成前にエラーと警告を分離する
- 依存関係、担当者 ID 参照、メンバー稼働期間、値形式の不整合を早期に止める

## 前提

- 実データは通常 `data/` 配下に置く
- 入力ファイルは読み取り専用として扱う
- `holidays.csv` は任意

## 実行

```bash
npm run validate -- --input-dir data
```

## 確認事項

- `ERROR:` が 1 件でも出たら初稿生成にも AI 調整にも進まない
- `WARNING:` は修正推奨だが、生成自体を止めない
- ヘッダー不一致、循環依存、未定義依存は必ず修正する
- 担当者を固定したタスクは、初稿生成時に同一担当者の並行実行が自動で避けられる前提で扱う
- メンバーの稼働期間外にはタスクを配置できない前提で扱う
