# AI Adjust Skill

初稿スケジュールを読み、Codex に調整案を作らせて最終版ガントを再生成する。

## 目的

- 初稿のボトルネックや不自然な並びを見直す
- 調整理由を残しつつ `schedule.csv` を更新する
- 調整後ガント `gantt.mmd` を生成する

## 前提

- `output/schedule.csv` と `output/gantt.mmd` が生成済みである
- 調整内容は AI が提案・編集し、人間が最終確認する
- 元の `data/` 入力は変更しない

## 実行フロー

1. `output/schedule.csv` と `output/gantt.mmd` を確認する
2. 調整後の `output/schedule.csv` を更新する
3. 調整理由を `output/adjustment_notes.md` にまとめる
4. 次のコマンドで調整後ガントを再生成する

```bash
npm run render -- --project-file data/project.csv --schedule-file output/schedule.csv --output-file output/gantt.mmd
```

## 確認事項

- `schedule.csv` は初稿生成時と同じヘッダーを維持する
- 依存関係や開始日・終了日の説明が必要なら `adjustment_notes.md` に残す
- `gantt.mmd` は最終候補として扱う
