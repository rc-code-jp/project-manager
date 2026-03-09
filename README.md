# プロジェクト管理

AI を利用して、CSV から軽量なプロジェクト計画を生成し、初稿から調整版まで管理する。

実データと生成物も含めて Git 管理し、テンプレートをコピーして利用する。
担当者は `members.csv` の `member_id` で管理し、タスク概要から AI が `assignee_id` を割り振れるようにする。

## できること

- `tasks.csv`、`project.csv`、`members.csv`、`holidays.csv` の妥当性確認
- 営業日、依存関係、メンバー数に基づく初稿スケジュール生成
- 担当者ごとの同時実行を 1 タスクに制限し、メンバーの稼働期間を考慮した初稿スケジュール生成
- タスク概要と担当者の得意分野に基づく AI 担当割当
- AI によるスケジュール調整
- 担当者 ID 付きの Mermaid `gantt` 形式で初稿・調整後ガント出力
- 生成済み `gantt.mmd` をブラウザでホットリロード表示

## ディレクトリ

- `template/`: 入力テンプレート
- `data/<project-name>/`: 実データ配置先。Git 管理対象
- `output/<project-name>/`: 生成物配置先。Git 管理対象
- `.agents/skills/`: Codex CLI から呼び出すスキル定義
- `scripts/`: TypeScript 補助 CLI

複数プロジェクトをディレクトリ名で区別して管理できる。

```
data/
  project-a/
    tasks.csv
    project.csv
    members.csv
    holidays.csv   # optional
  project-b/
    ...
output/
  project-a/
    schedule.csv
    gantt.mmd
  project-b/
    ...
```

## 利用方法

1. `template/` 配下の CSV を `data/<project-name>/` にコピーして更新する。
2. 妥当性確認を実行する。
3. 問題がなければ初稿生成を実行する。
4. `data/<project-name>/members.csv` と `output/<project-name>/schedule.csv` をもとに AI が `assignee_id` を割り振る。
5. 必要なら `output/<project-name>/schedule.csv` を AI に調整させる。
6. 調整後ガントを再生成して確認する。

### 妥当性確認

```bash
npm run validate -- --project <project-name>
```

### 初稿生成

```bash
npm run draft -- --project <project-name>
```

生成されるファイル:

- `output/<project-name>/schedule.csv`
- `output/<project-name>/gantt.mmd`

### AI 担当割当

`data/<project-name>/members.csv` の得意分野と稼働期間、`tasks.csv` の `summary` をもとに、Codex に `output/<project-name>/schedule.csv` の `assignee_id` を割り振らせる。
ワークフローは [ai-assign](/Users/rc/work/project-manager/.agents/skills/ai-assign/SKILL.md) に定義する。

実行前に確認するファイル:

- `data/<project-name>/members.csv`: `member_id`、`name`、`specialties`、`available_from`、`available_until`
- `data/<project-name>/tasks.csv`: `task_id`、`title`、`summary`
- `output/<project-name>/schedule.csv`: `assignee_id` を更新する対象

Codex への依頼例:

```text
ai-assign を使って担当者を割り振ってください。
data/<project-name>/members.csv の specialties と output/<project-name>/schedule.csv の summary を見て、
各タスクの assignee_id を埋めてください。迷うものは assignment_notes.md に理由を書いてください。
```

実行後に確認する点:

- `output/<project-name>/schedule.csv` の `assignee_id` が `data/<project-name>/members.csv` の `member_id` と一致していること
- 未割当タスクがあれば理由が `output/<project-name>/assignment_notes.md` に残っていること
- 担当割当後にガントを更新する場合は次の `render` を実行すること

### 調整後ガント再生成

AI が `output/<project-name>/schedule.csv` を調整したあと、次を実行する。

```bash
npm run render -- --project <project-name>
```

## 開発時の確認

- 変更確認: `git status`
- ドキュメント差分確認: `git diff -- docs/spec.md template/ README.md`
- 依存関係導入: `npm install`
- テスト実行: `npm test`
- 型検査: `npm run typecheck`
- viewer 起動: `npm run viewer -- --project <project-name>`
- viewer ビルド: `npm run viewer:build`

### CLI フラグ一覧

`--project <name>` は `--input-dir data/<name> --output-dir output/<name>` の省略形。個別にディレクトリを指定したい場合は `--input-dir`、`--output-dir`、`--project-file`、`--schedule-file`、`--output-file` を直接指定する。

## ガント viewer

`output/<project-name>/gantt.mmd` をブラウザで表示するローカル viewer を用意している。viewer 自体のコード変更は Vite の HMR で反映され、対象の `gantt.mmd` を更新するとブラウザも自動で再読み込みする。

Codex から使う場合は `view-gantt` スキル名で依頼してよい。複数プロジェクトがある場合、スキルはどの `project-name` を開くか必ず確認する。

起動手順:

```bash
npm run viewer -- --project <project-name>
```

別ターミナルで `gantt.mmd` を更新する例:

```bash
npm run render -- --project <project-name>
```

補足:

- viewer は表示専用で、CSV 編集やスケジュール計算は行わない。
- `output/<project-name>/gantt.mmd` が存在しない場合は、viewer 上に不足ファイルのパスを表示する。
