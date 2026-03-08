# Plan Generate Skill

検証済み CSV からスケジュールを生成し、`output/gantt.mmd` を出力する。

## 目的

- 営業日、依存関係、同時進行上限に基づいて日程を決める
- Mermaid `gantt` 構文の `gantt.mmd` を生成する
- 必要なら `schedule.csv` も併せて出力する

## 前提

- 先に `skills/validate` 相当の確認を通しておく
- 入力は通常 `data/`、出力は通常 `output/`
- 入力 CSV は上書きしない

## 実行

`gantt.mmd` のみを出力する場合:

```bash
python3 scripts/project_manager.py plan --input-dir data --output-dir output
```

`schedule.csv` も出力する場合:

```bash
python3 scripts/project_manager.py plan --input-dir data --output-dir output --write-schedule
```

## 確認事項

- `output/gantt.mmd` が再生成可能であること
- 期限超過は `WARNING:` として表示される
- `schedule.csv` を出す場合、`gantt.mmd` と開始日・終了日・順序が一致すること
