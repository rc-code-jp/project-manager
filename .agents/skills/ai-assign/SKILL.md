---
name: ai-assign
description: Assign task owners by matching task summaries to member specialties and update schedule.csv with assignee_id values.
---

# AI Assign Skill

`members.csv` の得意分野とタスク概要をもとに、担当者 ID を `schedule.csv` に反映する。

## 目的

- 同名メンバーがいても `member_id` で一意に担当を管理する
- タスク概要と担当者の得意分野をもとに AI が `assignee_id` を割り振る
- 割当理由を必要に応じて `output/assignment_notes.md` に残す

## 前提

- `data/members.csv` が存在する
- `output/schedule.csv` が生成済みである
- `schedule.csv` のヘッダーは維持する

## 実行フロー

1. `data/members.csv` の `member_id`、`name`、`specialties` を確認する
2. `output/schedule.csv` の `title`、`summary`、`priority`、`due_date` を確認する
3. 各タスクに最も適した `assignee_id` を埋める
4. 判断が迷うタスクや根拠は `output/assignment_notes.md` に残す

## 判断ルール

- 同名でも必ず `member_id` で判断する
- `summary` と `specialties` の意味的な一致を優先する
- すでに `assignee_id` が入っているタスクは、明確な不一致がない限り維持してよい
- 現行 MVP では担当者ごとの負荷平準化は行わない

## 確認事項

- `assignee_id` には `members.csv` に存在する `member_id` だけを書き込む
- 未確定なら空欄のままにして理由をメモする
- 更新後は必要に応じて `npm run render -- --project-file data/project.csv --schedule-file output/schedule.csv --output-file output/gantt.mmd` を実行する
