# プロジェクト管理AI MVP計画

## 概要
- MVP はアプリケーションではなく、`Codex CLI` 上で利用するエージェントスキル群として実装する。
- 対象はプロジェクト計画作成支援であり、人が手動更新したテンプレート準拠の CSV を入力としてガントチャートを生成する。
- 実行環境は `Codex CLI` のみを正式対応とし、外部 UI や専用バイナリは作らない。
- 利用者は `Codex CLI` を起動し、必要なスキルを呼び出して計画確認とガントチャート生成を行う。

## MVPの実装方針
- 1つの巨大な自動化アプリは作らず、責務ごとに分割したスキルセットとして提供する。
- スキルは `SKILL.md` を中心に、入力形式、実行手順、出力物、判断基準を明文化する。
- 機械的に判定できる検証はスキル内のチェックリストまたは補助スクリプトで扱い、曖昧な判断は Codex に委ねる。
- MVP では最小フローを優先し、`CSV確認 -> スケジュール生成 -> ガントチャート出力` に直接必要なスキルだけを対象にする。
- 入力 CSV は必ず `template/` 配下のテンプレート仕様に従うものとする。

## 最小ユーザーストーリー
1. 利用者が `template/tasks.csv` と `template/project.csv` を元に、実データ用 CSV を手動で更新する。
2. 利用者が `Codex CLI` を起動する。
3. 利用者が計画生成用スキルを呼び出す。
4. Codex がテンプレート準拠を確認し、依存関係と同時進行上限を踏まえたスケジュール案を作る。
5. Codex が `gantt.mmd` を生成し、必要ならあわせて `schedule.csv` を出力する。

## 想定スキル構成
- `project-intake`: `tasks.csv` と `project.csv` の形式確認、前提整理、欠損情報の洗い出しを行う。
- `task-planning`: タスク一覧、依存関係、優先度、同時進行上限から実行順とスケジュール案を作る。
- `plan-review`: 循環依存、期限超過、同時進行上限違反などのリスクを検査する。
- `gantt-output`: スケジュール案から `gantt.mmd` と必要最小限の補助出力を整形する。

## MVP対象スキル
- `project-intake`: テンプレート準拠の CSV かどうかを確認する。
- `task-planning`: タスクの順序と開始終了日を決める。
- `gantt-output`: `gantt.mmd` を生成する。

## 将来拡張
- `assignment-planning`: 担当候補、負荷、スキル適合をもとに割当案を作る。
- `status-update`: 実績や差分入力を受けて計画を更新する。
- `reporting`: 共有用の追加成果物やサマリーを生成する。

## 入出力設計
- 基本入力は `tasks.csv` と `project.csv` とする。
- CSV の列定義、許容値、記法は [template/README.md](/Users/rc/work/project-manager/template/README.md) に従う。
- `tasks.csv`: `task_id,title,estimate_days,due_date,priority,depends_on,status`
- `project.csv`: `project_name,start_date,parallel_task_limit`
- `depends_on` は `|` 区切りで複数依存を表現する。
- MVP の必須出力は `gantt.mmd` とする。
- 必要に応じて中間成果物として `schedule.csv` を出力する。
- スキルは入力ファイルそのものを書き換えるのではなく、生成物として結果を返す。

## 入力仕様
### tasks.csv
- `task_id`: タスクの一意識別子。`TASK-001` 形式で固定し、依存関係の参照にも使う。
- `title`: タスク名。自由入力。重複可。
- `estimate_days`: 見積工数。整数の日数で表現する。
- `due_date`: タスク期限。必須。形式は `YYYY-MM-DD`。
- `priority`: 優先度。`低`、`中`、`高` の 3 段階のみを許可する。
- `depends_on`: 先行タスクの `task_id` 一覧。空欄は依存なし。複数値は `|` 区切り。
- `status`: タスク状態。`未着手`、`進行中`、`完了` の 3 値のみを許可する。

### project.csv
- `project_name`: プロジェクト名。自由入力。
- `start_date`: 計画開始日。必須。形式は `YYYY-MM-DD`。
- `parallel_task_limit`: 同時に進められるタスク数の上限。必須。`1` 以上の整数。

## 解釈ルール
- `tasks.csv` の行順は補助的な優先順位として扱い、同条件なら上にあるタスクを優先する。
- `完了` タスクもガントチャートに含める。
- `進行中` タスクも、MVP では残り日数を `estimate_days` のまま扱う。
- `parallel_task_limit` は人数ではなく、同時進行できる作業枠数として扱う。

## 標準ワークフロー
1. `project-intake` でテンプレート準拠、入力の欠損、不整合、運用前提を整理する。
2. `task-planning` で依存関係と `parallel_task_limit` を満たすスケジュール案を作る。
3. 必要に応じて `plan-review` で明らかなリスクを確認する。
4. `gantt-output` で `gantt.mmd` を生成する。

## スケジューリング方針
- 納期遵守と依存関係の整合性を最優先とする。
- `project.csv` の `parallel_task_limit` を超えない範囲で同時進行させる。
- `tasks.csv` の行順は、同条件時の補助的な優先順位として扱う。
- タスク分解は自動確定せず、必要な場合は追加タスク案として提案に留める。
- Codex の判断結果は必ず理由付きで出力し、人がレビュー可能な形にする。

## ディレクトリ方針
- リポジトリ直下または所定の skills 配下に、各スキルの `SKILL.md` を配置する。
- 反復利用する検証や整形処理がある場合のみ、小さな補助スクリプトを追加する。
- `template/` 配下に入力テンプレートと仕様書を同梱し、Codex CLI 単体で試せる状態にする。

## 品質基準
- 各スキルの責務、入力、出力、前提条件、失敗条件が `SKILL.md` に明記されていること。
- `template/README.md` と `MVP_PLAN.md` の入力定義に矛盾がないこと。
- 循環依存、未定義依存、期限超過、`parallel_task_limit` 超過を検知できること。
- `schedule.csv` と `gantt.mmd` の内容整合が取れていること。
- 代表的な正常系と異常系を、サンプル入力と期待出力で検証できること。
- 利用者が `Codex CLI` 上でスキルを呼び出し、CSV 更新後にガントチャートを再生成できること。
