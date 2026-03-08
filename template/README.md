# Template Format

`template/tasks.csv`、`template/project.csv`、`template/members.csv`、`template/holidays.csv` は、Codex CLI から計画スキルを呼び出すための最小入力テンプレートです。

## tasks.csv

ヘッダー:

```csv
task_id,title,summary,assignee_id,estimate_days,due_date,priority,depends_on,status
```

ルール:

- `task_id`: `TASK-001` 形式で固定する。
- `title`: 自由入力。重複可。識別は `task_id` のみで行う。
- `summary`: タスク概要。AI が担当者を割り振る際の判断材料に使う。
- `assignee_id`: 担当者 ID。`members.csv` の `member_id` を参照する。空欄は未割り当てとして扱う。
- `estimate_days`: 整数のみ。
- `due_date`: 必須。形式は `YYYY-MM-DD`。
- `priority`: `低`、`中`、`高` の完全一致のみ許可する。
- `depends_on`: 空欄なら依存なし。複数依存は `TASK-001|TASK-003` のように `|` 区切りで記載する。
- `status`: `未着手`、`進行中`、`完了` の完全一致のみ許可する。
- 行順は補助的な優先順位として扱う。同条件なら上の行を優先する。
- `完了` タスクもガントチャートに含める。
- `進行中` タスクも、MVP では残り日数を `estimate_days` のまま扱う。
- `assignee_id` はスケジューリングにも使う。同じ担当者は同一営業日に 1 タスクまでしか担当できない。

## members.csv

ヘッダー:

```csv
member_id,name,specialties
```

ルール:

- `member_id`: 担当者の一意識別子。`tasks.csv` の `assignee_id` から参照する。
- `name`: 表示名。同名を許可する。
- `specialties`: 得意分野。`|` 区切りでも自然文でもよい。AI 割当時の判断材料に使う。

## project.csv

ヘッダー:

```csv
project_name,start_date,parallel_task_limit
```

ルール:

- 1 行だけの設定ファイルとして扱う。
- `project_name`: 自由入力。
- `start_date`: 必須。形式は `YYYY-MM-DD`。
- `parallel_task_limit`: 必須。`1` 以上の整数で、同時に進められるタスク数を表す。

## holidays.csv

ヘッダー:

```csv
date,name
```

ルール:

- 存在すれば使用する。存在しない場合は土日のみを非営業日として扱う。
- `date`: 必須。形式は `YYYY-MM-DD`。
- `name`: 任意。祝日名や休業日の説明を書く。
- 記載された日付は曜日に関わらず非営業日として扱う。
