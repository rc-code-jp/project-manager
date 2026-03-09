---
name: draft-plan
description: Generate an initial project schedule and gantt output from validated CSV inputs using rule-based scheduling constraints.
---

# Draft Plan Skill

検証済み CSV から、ルールベースの初稿スケジュールを生成する。

## 目的

- 営業日、依存関係、稼働可能メンバー数、担当者の同時実行 1 タスク制約、メンバー稼働期間に基づく初稿日程を決める
- AI 調整のたたき台として `schedule.csv` を生成する
- AI 担当割当のたたき台として `summary` と `assignee_id` を含む `schedule.csv` を生成する
- 初稿ガント `gantt.mmd` を生成する

## 前提

- 先に `validate` 相当の確認を通しておく
- 入力は通常 `data/<project-name>/`、出力は通常 `output/<project-name>/`
- 入力 CSV は上書きしない

## 実行

```bash
npm run draft -- --project <project-name>
```

## 確認事項

- `output/<project-name>/schedule.csv` が AI 調整の入力になる
- `output/<project-name>/gantt.mmd` は初稿の可視化用である
- 期限超過は `WARNING:` として表示される
