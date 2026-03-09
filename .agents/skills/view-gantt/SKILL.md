---
name: view-gantt
description: Start the local gantt viewer for a project, and ask the user which project to open when multiple project directories exist.
---

# View Gantt Skill

生成済み `gantt.mmd` をローカル viewer で開く。

## 目的

- `output/<project-name>/gantt.mmd` をブラウザで確認する
- viewer コード変更と `gantt.mmd` 更新のホットリロードを使う
- 複数プロジェクトがある場合は対象を勝手に決めない

## 前提

- viewer は `npm run viewer -- --project <project-name>` で起動する
- `gantt.mmd` は通常 `npm run draft` または `npm run render` で生成済みである
- viewer は表示専用で、CSV 編集や再計算は行わない

## 実行フロー

1. `data/` と `output/` の直下にあるプロジェクトディレクトリを確認する
2. 候補が 0 件なら、表示対象がないことを伝えて必要なら `draft` または `render` を案内する
3. 候補が 1 件なら、その `project-name` を使って viewer を起動する
4. 候補が 2 件以上なら、必ずユーザーにどの `project-name` を開くか確認してから起動する
5. `output/<project-name>/gantt.mmd` が未生成なら、その旨を伝えて必要なら `render` を案内する

## 実行

```bash
npm run viewer -- --project <project-name>
```

## 確認事項

- 複数プロジェクト時はユーザー確認なしで起動しない
- 起動後は `output/<project-name>/gantt.mmd` の更新をブラウザへ自動反映する
- 長時間プロセスになるため、起動したことと対象プロジェクト名を明示する
