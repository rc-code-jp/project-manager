# Draft Plan Skill

検証済み CSV から、ルールベースの初稿スケジュールを生成する。

## 目的

- 営業日、依存関係、同時進行上限に基づく初稿日程を決める
- AI 調整のたたき台として `schedule.csv` を生成する
- 初稿ガント `gantt.mmd` を生成する

## 前提

- 先に `validate` 相当の確認を通しておく
- 入力は通常 `data/`、出力は通常 `output/`
- 入力 CSV は上書きしない

## 実行

```bash
npm run draft -- --input-dir data --output-dir output
```

## 確認事項

- `output/schedule.csv` が AI 調整の入力になる
- `output/gantt.mmd` は初稿の可視化用である
- 期限超過は `WARNING:` として表示される
