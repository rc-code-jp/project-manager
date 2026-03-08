# Validate Skill

`tasks.csv`、`project.csv`、`holidays.csv` の妥当性確認を行う。

## 目的

- テンプレート準拠かを確認する
- スケジュール生成前にエラーと警告を分離する
- 依存関係や値形式の不整合を早期に止める

## 前提

- 実データは通常 `data/` 配下に置く
- 入力ファイルは読み取り専用として扱う
- `holidays.csv` は任意

## 実行

```bash
python3 scripts/project_manager.py validate --input-dir data
```

## 確認事項

- `ERROR:` が 1 件でも出たら計画生成に進まない
- `WARNING:` は修正推奨だが、生成自体を止めない
- ヘッダー不一致、循環依存、未定義依存は必ず修正する
