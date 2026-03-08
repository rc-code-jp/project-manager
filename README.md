# プロジェクト管理

AI を利用して、CSV から軽量なプロジェクト計画を生成する。

実タスクや実名は Git 管理せず、テンプレートをコピーして利用する。

## できること

- `tasks.csv`、`project.csv`、`holidays.csv` の妥当性確認
- 営業日、依存関係、同時進行上限に基づくスケジュール生成
- Mermaid `gantt` 形式の `gantt.mmd` 出力
- 必要に応じた `schedule.csv` 出力

## ディレクトリ

- `template/`: 入力テンプレート
- `data/`: 実データ配置先。Git 管理対象外
- `output/`: 生成物配置先。Git 管理対象外
- `skills/`: Codex CLI から呼び出すスキル定義
- `scripts/`: 補助 CLI

## 利用方法

1. `template/` 配下の CSV を `data/` にコピーして更新する。
2. 妥当性確認を実行する。
3. 問題がなければ計画生成を実行する。
4. `output/gantt.mmd` を確認する。

### 妥当性確認

```bash
python3 scripts/project_manager.py validate --input-dir data
```

### 計画生成

```bash
python3 scripts/project_manager.py plan --input-dir data --output-dir output
```

`schedule.csv` も出力する場合:

```bash
python3 scripts/project_manager.py plan --input-dir data --output-dir output --write-schedule
```

## 開発時の確認

- 変更確認: `git status`
- ドキュメント差分確認: `git diff -- docs/spec.md template/ README.md`
- テスト実行: `python3 -m unittest discover -s tests`
