---
# INDEX.md が readme-index プラグインの index 判定（大文字小文字無視）に誤マッチして
# /design/ が生成されないため、明示の permalink で確定させる（この front matter は消さない）
permalink: /design/
---

# design — 設計記録

索引と現在地は **[INDEX.md](INDEX.md)** を最初に読む（読む順序・ADR 一覧・現在地・次にやること）。

この `design/` は経緯の追跡可能性を優先する**設計記録**であり、仕様の正本は [`spec/`](../spec/)。
役割語の規約（対話痕跡の正規化・2026-07-12）: 裁定・判断の主体は**設計者**（プロジェクト著者）を指し、
「N 観点レビュー」「敵対的検証」は設計案に対する機械的な多視点検証を指す。「ユーザー」は常に
**言語の利用者**の意（ユーザー定義の暦法、等）。

| 場所 | 内容 |
|---|---|
| [INDEX.md](INDEX.md) | 読む順序と現在地（再開時はまずここ） |
| [00-overview.md](00-overview.md) | 目的・スコープ・設計の背骨 |
| [10-domain-model.md](10-domain-model.md) | ドメインモデル・不変条件 I1〜I8 |
| `20-adr/` | 設計判断の履歴（ADR-01〜44・1 判断 1 ファイル・不変・追記型。一覧は [INDEX.md](INDEX.md)） |
| [30-syntax/00-syntax-draft.md](30-syntax/00-syntax-draft.md) | 構文の作業中ドラフト（区切りで spec/ に反映） |
| [40-examples/](40-examples/) | 表現力検証（サンプル集・判定マトリクス・綻びログ） |
| [60-reviews/](60-reviews/) | 外部レビューの受領と処置の記録 |
| [90-open-questions.md](90-open-questions.md) | 宿題・保留事項（分類つき） |
