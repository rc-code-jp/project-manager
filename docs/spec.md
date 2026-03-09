# 仕様書

## 目的

本仕様書は、`Codex CLI` 上で動作するプロジェクト計画支援スキル群の MVP を実装するための基準文書である。手動更新した CSV を入力として、妥当性確認、初稿スケジュール生成、AI による調整、Mermaid 出力までを一貫して定義する。

## 対象範囲

- 対象実行環境は `Codex CLI` のみとする。
- 利用者は手動で `codex` を起動し、スキルを呼び出す。
- MVP の主目的は、入力 CSV の妥当性確認、ルールベース初稿生成、AI 調整、Mermaid 形式ガントチャート生成である。
- 専用アプリケーションや Web API は作成しない。
- ただし、生成済み `gantt.mmd` をローカル確認するための表示専用 viewer は追加してよい。

## 実装原則

- 1つの大きなアプリケーションではなく、責務ごとに分割したスキル群として実装する。
- スキルは `SKILL.md` を中心に提供し、必要に応じて小さな補助スクリプトを追加してよい。
- 補助スクリプトを追加する場合、実装言語は `Node.js` / `TypeScript` を標準とする。
- 機械的に判定できる処理は明示的なルールで扱い、曖昧な判断だけを Codex に委ねる。
- 入力ファイルは読み取り専用として扱い、スキルが直接書き換えてはならない。
- 生成結果は `output/` などの出力先に返すものとし、少なくとも `gantt.mmd` を生成できなければならない。
- 表示専用 viewer を追加する場合でも、Mermaid 記法の生成責務は CLI 側に残す。

## 最小ユーザーストーリー

1. 利用者が `template/` 配下のテンプレートを元に、実データ用 CSV を手動で更新する。
2. 利用者が `Codex CLI` を手動で起動する。
3. 利用者が計画生成用スキルを呼び出す。
4. スキルがテンプレート準拠を確認し、営業日、依存関係、メンバー数、メンバー稼働期間をもとに初稿計画を作る。
5. 初稿として `schedule.csv` と `gantt.mmd` を生成する。
6. Codex が `tasks.csv` の概要と `members.csv` の得意分野をもとに `schedule.csv` の担当者 ID を割り振る。
7. 利用者または Codex が `schedule.csv` を見て調整する。
8. スキルが `gantt.mmd` を再生成する。
9. 利用者は必要に応じてローカル viewer で `gantt.mmd` をブラウザ確認できる。

## 入力ファイル

### 必須入力

- `tasks.csv`
- `project.csv`
- `members.csv`

### 任意入力

- `holidays.csv`

`tasks.csv`、`project.csv`、`members.csv` は必須とする。`holidays.csv` は存在すれば使用し、存在しない場合は土日のみを非営業日として扱う。

## テンプレート配置

- 入力テンプレートは `template/` 配下に配置する。
- 実データは Git 管理対象外の `data/<project-name>/` 配下に配置することを想定する。
- 出力先は `output/<project-name>/` とする。
- テンプレート定義は [template/README.md](/Users/rc/work/project-manager/template/README.md) と一致していなければならない。

## ディレクトリ方針

- スキル本体はリポジトリ直下または `.agents/skills/` 配下に配置してよい。
- 反復利用する検証や整形処理がある場合のみ、補助スクリプトを追加してよい。
- 入力テンプレート、仕様書、サンプル出力がリポジトリ内に揃っており、`Codex CLI` 単体で試せる状態であること。
- 複数プロジェクトは `data/<project-name>/` と `output/<project-name>/` でディレクトリを分けて管理する。`--project <name>` フラグで両方を一括指定できる。

## CSV 仕様

### tasks.csv

ヘッダー:

```csv
task_id,title,summary,assignee_id,estimate_days,due_date,priority,depends_on,status
```

各列の仕様:

- `task_id`
  - タスクの一意識別子。
  - 書式は `TASK-001` 形式で固定する。
  - `depends_on` から参照されるキーでもある。
- `title`
  - タスク名。
  - 自由入力。
  - 重複を許可する。
- `summary`
  - タスク概要。
  - 自由入力。
  - AI が担当者を推定する際の主な判断材料に使う。
- `assignee_id`
  - 担当者 ID。
  - `members.csv` の `member_id` を参照する。
  - 空欄は未割り当てを表す。
- `estimate_days`
  - タスク完了に必要な見積日数。
  - 整数のみ許可する。
  - 単位は営業日。
- `due_date`
  - タスク期限。
  - 必須。
  - 形式は `YYYY-MM-DD`。
- `priority`
  - 優先度。
  - 許可値は `低`、`中`、`高` の完全一致のみ。
- `depends_on`
  - 先行タスクの `task_id` 一覧。
  - 空欄は依存なしを表す。
  - 複数値は `|` 区切りで記載する。
- `status`
  - タスク状態。
  - 許可値は `未着手`、`進行中`、`完了` の完全一致のみ。

解釈ルール:

- `tasks.csv` の行順は補助的な優先順位として扱う。
- 条件が同じ場合は上にある行を優先する。
- `進行中` タスクも、MVP では残り日数を `estimate_days` のまま扱う。
- `完了` タスクも出力対象に含める。
- `assignee_id` は担当者制約の識別子として保持する。
- 同じ `assignee_id` のタスクは同一営業日に 1 件までしか進められない。
- 同時実行可能なタスク数は、その営業日に稼働可能なメンバー数と同じとみなす。
- 負荷平準化や稼働率最適化までは行わない。

### project.csv

ヘッダー:

```csv
project_name,start_date
```

各列の仕様:

- `project_name`
  - プロジェクト名。
  - 自由入力。
- `start_date`
  - 計画開始日。
  - 必須。
  - 形式は `YYYY-MM-DD`。
追加ルール:

- `project.csv` はヘッダーに続く 1 行のみを有効データとして扱う。
- 同時実行可能なタスク数は `members.csv` のうち、その営業日に稼働可能なメンバー数から自動判定する。

### members.csv

ヘッダー:

```csv
member_id,name,specialties,available_from,available_until
```

各列の仕様:

- `member_id`
  - 担当者の一意識別子。
  - `tasks.csv` の `assignee_id` から参照されるキーである。
- `name`
  - 担当者名。
  - 同名を許可する。
- `specialties`
  - 得意分野。
  - `|` 区切りのキーワード列でも自然文でもよい。
  - AI が自動割当する際の判断材料に使う。
- `available_from`
  - 稼働開始日。
  - 必須。
  - 形式は `YYYY-MM-DD`。
- `available_until`
  - 稼働終了日。
  - 必須。
  - 形式は `YYYY-MM-DD`。

追加ルール:

- 各メンバーは `available_from` から `available_until` の期間中しか稼働できない。

### holidays.csv

ヘッダー:

```csv
date,name
```

各列の仕様:

- `date`
  - 非営業日として追加する日付。
  - 必須。
  - 形式は `YYYY-MM-DD`。
- `name`
  - 祝日名または休業日の説明。
  - 任意の文字列。

追加ルール:

- `holidays.csv` は存在すれば使用する。
- 存在しない場合は土日のみを非営業日として扱う。
- `holidays.csv` に記載された日付は曜日に関わらず非営業日とする。

## 営業日計算

- 土曜と日曜は非営業日とする。
- `holidays.csv` が存在する場合、その `date` に一致する日も非営業日とする。
- 営業日計算は開始日を 1 日目として数える。
- 例:
  - 開始日が営業日で `estimate_days=3` の場合、終了日は開始日を含めて 3 営業日目とする。
- 開始候補日が非営業日の場合、次の営業日に繰り延べる。

## スケジューリング仕様

### 基本方針

- 納期遵守を最優先とする。
- 依存関係の整合性を必須条件とする。
- その営業日に稼働可能なメンバー数を超える同時進行は認めない。
- 同じ `assignee_id` を持つタスクの同時進行は認めない。
- タスクの自動分解は行わない。
- 担当者情報は `assignee_id` ベースでスケジューリング制約に使う。

### 実行可能条件

タスクは以下をすべて満たしたときに開始可能とする。

- すべての依存先タスクが完了済みである。
- 開始日が営業日である。
- その営業日時点の同時進行数が、その日に稼働可能なメンバー数以下である。
- `assignee_id` が空欄でない場合、その担当者が同一営業日に別タスクを実行していない。
- `assignee_id` が空欄でない場合、その担当者の稼働期間内である。

### 優先順位

開始可能なタスクが複数ある場合の優先順位は以下の通りとする。

1. `priority` が高いものを優先する。
2. 同じ `priority` の場合は `tasks.csv` の上にある行を優先する。

優先度の強さは `高 > 中 > 低` とする。

### 開始日と終了日

- 各タスクの開始日は、依存関係と空き枠を満たす最も早い営業日とする。
- 終了日は開始日を 1 日目として `estimate_days` 分の営業日を数えた日とする。
- 依存先タスクを持つタスクは、すべての依存先タスクの終了日の翌営業日以降で開始可能とする。
- `assignee_id` が設定されているタスクは、同じ担当者の既存タスク期間と重ならない最も早い営業日に開始する。
- `assignee_id` が設定されているタスクは、その担当者の `available_from` から `available_until` の範囲内で完了できる日程に限って開始する。

### status の扱い

- `未着手` と `進行中` は、MVP では同じ日数計算ルールで扱う。
- `完了` はガント出力対象に含める。
- `status` はガント出力上の表示状態にも反映する。
- 担当者情報は `assignee_id` として保持し、同時実行制約と稼働期間制約に使う。

## 検証仕様

### エラーとする条件

- 必須入力ファイルが存在しない。
- 必須列が欠けている。
- `task_id` の形式が不正。
- `task_id` が重複している。
- `member_id` が空欄または重複している。
- `available_from` または `available_until` が日付形式でない。
- `available_from` が `available_until` より後である。
- `estimate_days` が整数でない、または `1` 未満である。
- `due_date`、`start_date`、`holidays.csv` の `date` が日付形式でない。
- `priority` が `低`、`中`、`高` 以外である。
- `status` が `未着手`、`進行中`、`完了` 以外である。
- `depends_on` に未定義の `task_id` が含まれる。
- `assignee_id` に未定義の `member_id` が含まれる。
- 依存関係が循環している。

### 警告とする条件

- 計画結果として `due_date` を超過するタスクがある。
- `holidays.csv` に重複日付がある。
- `title` が重複している。
- `members.csv` に同名の `name` がある。

## 出力仕様

### 出力

- `schedule.csv`
- `gantt.mmd`
- 必要に応じて `adjustment_notes.md`

出力共通ルール:

- 入力 CSV を上書きしない。
- 生成物は再生成可能であること。
- `schedule.csv` と `gantt.mmd` の開始日、終了日、タスク順は一致していなければならない。
- AI 調整は `data/` 配下の元入力ではなく、`output/` 配下の生成物に対して行う。

### gantt.mmd

- Mermaid の標準 `gantt` 構文で出力する。
- 各タスクは `title :task_id, status, start, end` 形式で出力する。
- `assignee_id` がある場合、`title` は `タスク名 [assignee_id]` 形式で表示する。
- `status` はスケジュール CSV の `status` を Mermaid 表現にマッピングして出力する。

Mermaid 状態マッピング:

- `完了` -> `done`
- `進行中` -> `active`
- `未着手` -> 状態指定なし

日付表現:

- `start` と `end` は `YYYY-MM-DD` 形式で出力する。

### schedule.csv

初稿生成後も AI 調整後も、以下の列で出力する。

```csv
task_id,title,summary,assignee_id,status,priority,start_date,end_date,due_date,depends_on
```

### AI 調整方針

- スクリプトは制約を満たす初稿生成までを責務とする。
- AI は初稿に対する調整提案、順序見直し、説明生成を担当する。
- AI は `summary` と `members.csv` の `specialties`、`available_from`、`available_until` を参照して `assignee_id` の候補提示または自動入力も担当する。
- AI が調整した結果をガント化するために、`schedule.csv` から `gantt.mmd` を再生成できなければならない。

各列の意味:

- `task_id`: 元タスク ID
- `title`: 元タスク名
- `summary`: 元タスク概要
- `assignee_id`: 担当者 ID
- `status`: 元タスク状態
- `priority`: 元優先度
- `start_date`: 算出された開始日
- `end_date`: 算出された終了日
- `due_date`: 元期限
- `depends_on`: 元依存関係

## スキル責務

本 MVP で定義するスキルは以下の通りとする。

### validate

- 入力ファイルの存在確認を行う。
- CSV ヘッダーと値がテンプレート仕様に従うか確認する。
- 不足情報、不正値、循環依存を検出する。
- 失敗時は、どのファイルのどの列に問題があるかを明示する。

### draft-plan

- 妥当な入力をもとに開始日と終了日を算出する。
- 依存関係、営業日、稼働可能メンバー数、メンバー稼働期間、優先順位を考慮する。
- `schedule.csv` と `gantt.mmd` を生成する。
- タスク分解は行わず、入力タスク単位のまま計画する。

### ai-assign

- `members.csv` の得意分野とタスク概要をもとに担当者 ID を割り振る。
- `schedule.csv` の `assignee_id` を更新し、必要なら判断理由を残す。
- 担当者名ではなく `member_id` を唯一の識別子として扱う。

### ai-adjust

- `draft-plan` の結果に対して、並び順や期限リスクを見直す。
- `schedule.csv` を直接更新し、必要なら `adjustment_notes.md` を作る。
- `render` コマンドを用いて `gantt.mmd` を再生成する。

## スキル定義要件

- 各スキルの `SKILL.md` には少なくとも、責務、入力、出力、前提条件、失敗条件、実行手順を記載すること。
- スキル単独で実行可能であること。
- 標準ワークフローに従って組み合わせた場合にも矛盾しないこと。

## 標準ワークフロー

1. `validate` でテンプレート準拠、欠損、不整合を確認する。
2. `draft-plan` で営業日、稼働可能メンバー数、メンバー稼働期間を満たす初稿スケジュール案を作る。
3. `ai-assign` で担当者 ID を割り振り、`schedule.csv` を更新する。
4. `ai-adjust` で初稿を見直し、必要なら `schedule.csv` を更新する。
5. `render` で `gantt.mmd` を生成する。
6. 必要に応じて viewer で `gantt.mmd` を確認する。

## 非対象

- 実績工数の反映
- 祝日以外の複雑なカレンダー例外
- CSV 編集やスケジュール計算を行う GUI 提供
- 自動での Codex 起動

## 品質基準

- [template/README.md](/Users/rc/work/project-manager/template/README.md) と矛盾しないこと。
- 正常系と異常系のサンプル入力で同じ結果を再現できること。
- 循環依存、未定義依存、期限超過、メンバー稼働期間違反を検知できること。
- `schedule.csv` と `gantt.mmd` の開始日、終了日、タスク順が一致すること。
- 各スキルの `SKILL.md` が本仕様と矛盾しないこと。
