# プロジェクト管理

AI を利用して、CSV から軽量なプロジェクト計画を生成し、初稿から調整版まで管理する。

実タスクや実名は Git 管理せず、テンプレートをコピーして利用する。

## できること

- `tasks.csv`、`project.csv`、`holidays.csv` の妥当性確認
- 営業日、依存関係、同時進行上限に基づく初稿スケジュール生成
- AI によるスケジュール調整
- Mermaid `gantt` 形式の初稿・調整後ガント出力

## ディレクトリ

- `template/`: 入力テンプレート
- `data/`: 実データ配置先。Git 管理対象外
- `output/`: 生成物配置先。Git 管理対象外
- `.agents/skills/`: Codex CLI から呼び出すスキル定義
- `scripts/`: TypeScript 補助 CLI

## 利用方法

1. `template/` 配下の CSV を `data/` にコピーして更新する。
2. 妥当性確認を実行する。
3. 問題がなければ初稿生成を実行する。
4. `output/schedule.csv` を AI に調整させる。
5. 調整後ガントを再生成して確認する。

### 妥当性確認

```bash
npm run validate -- --input-dir data
```

### 初稿生成

```bash
npm run draft -- --input-dir data --output-dir output
```

生成されるファイル:

- `output/schedule.csv`
- `output/gantt.mmd`

### 調整後ガント再生成

AI が `output/schedule.csv` を調整したあと、次を実行する。

```bash
npm run render -- --project-file data/project.csv --schedule-file output/schedule.csv --output-file output/gantt.mmd
```

## 開発時の確認

- 変更確認: `git status`
- ドキュメント差分確認: `git diff -- docs/spec.md template/ README.md`
- 依存関係導入: `npm install`
- テスト実行: `npm test`
- 型検査: `npm run typecheck`
