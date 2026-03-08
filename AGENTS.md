# Repository Guidelines

## プロジェクト構成とモジュール配置

このリポジトリは、Codex CLI 向けの軽量なプロジェクト計画ワークフローを定義します。ルート直下には主要ドキュメントを置きます。[`README.md`](/Users/rc/work/project-manager/README.md) は入口、[`docs/spec.md`](/Users/rc/work/project-manager/docs/spec.md) は実装仕様、[`template/`](/Users/rc/work/project-manager/template) には入力用 CSV テンプレート（`tasks.csv`、`project.csv`、`members.csv`、`holidays.csv`）と補足説明を配置します。実データは `data/`、生成物は `output/` に置き、どちらも Git 管理対象外です。

## ビルド・テスト・開発コマンド

現時点では専用のビルドシステムはありません。編集時は次のような基本コマンドで確認します。

- `git status` : 変更対象と未追跡ファイルを確認する。
- `git diff -- docs/spec.md template/ README.md` : 仕様書、テンプレート、README の差分を確認する。
- `cat template/tasks.csv`、`cat template/members.csv` または `sed -n '1,80p' template/README.md` : テンプレートのヘッダーや記述例を確認する。

将来スクリプトを追加する場合は、リポジトリ直下から実行できる小さな単位に保ち、この節へ実行例を追記してください。

## コーディングスタイルと命名規則

Markdown と CSV は簡潔に保ち、長い説明よりも更新しやすい記述を優先します。見出しは ATX 形式（`##`）を使い、説明文は短く直接的に書いてください。CSV ヘッダーは [`template/README.md`](/Users/rc/work/project-manager/template/README.md) の定義を厳密に維持します。識別子は仕様に合わせ、タスク ID は `TASK-001`、日付は `YYYY-MM-DD`、出力ファイル名は `gantt.mmd` や `schedule.csv` のように用途が明確な名前を使います。

## テスト方針

自動テストはまだありません。そのため、変更時はドキュメント、テンプレート、仕様書の整合を手動で確認してください。

- テンプレートのヘッダーが仕様書と一致していること
- `assignee_id` が `members.csv` の `member_id` を参照していること
- メンバーの稼働期間が `available_from` から `available_until` の形式で記載されていること
- 記載例の値が定義された形式を満たしていること
- `.gitignore` により実データや生成物がコミットされないこと

スクリプトを追加した場合は、再実行可能な検証コマンドを用意し、実装の近くまたは `tests/` ディレクトリにテストを配置してください。

## コミットとプルリクエストの指針

最近の履歴では、短い命令形の件名と、必要に応じた `feat:` などの接頭辞が使われています。コミットは 1 つの変更目的に絞り、たとえば `docs: align template rules with spec` のように内容がすぐ分かる件名にしてください。プルリクエストでは、利用者に見える変更点、影響するファイル、残作業の有無を簡潔にまとめます。CSV 形式やスケジュール規則を変更する場合は、差分例や生成結果の抜粋も添えてください。
