# Template Format

`template/tasks.csv` と `template/project.csv` は、Codex CLI から計画スキルを呼び出すための最小入力テンプレートです。

## tasks.csv

ヘッダー:

```csv
task_id,title,estimate_days,due_date,priority,depends_on,status
```

ルール:

- `task_id`: `TASK-001` 形式で固定する。
- `title`: 自由入力。重複可。識別は `task_id` のみで行う。
- `estimate_days`: 整数のみ。
- `due_date`: 必須。形式は `YYYY-MM-DD`。
- `priority`: `低`、`中`、`高` の完全一致のみ許可する。
- `depends_on`: 空欄なら依存なし。複数依存は `TASK-001|TASK-003` のように `|` 区切りで記載する。
- `status`: `未着手`、`進行中`、`完了` の完全一致のみ許可する。
- 行順は補助的な優先順位として扱う。同条件なら上の行を優先する。
- `完了` タスクもガントチャートに含める。
- `進行中` タスクも、MVP では残り日数を `estimate_days` のまま扱う。

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
