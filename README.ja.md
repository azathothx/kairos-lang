# <img src="assets/logo/kairos-mark.svg" width="30" height="30" alt=""> Kairos

[English](./) | **日本語**（ドキュメントは日本語が正・英語版は順次拡充）

**Kairos** は、汎用スケジューラのためのスケジュール定義言語である。連続時間軸という基底（**Chronos**）から、
発報すべき意味ある時点（*kairos*）の集合を紡ぐ。

```text
premise JP { calendar-system: Gregorian; calendar: TSE; tz: "Asia/Tokyo"; wkst: Mon }

@JP
monthEnd |> roll(Preceding, on: bizDay) |> shift(-3, unit: bizDay)   # 毎月末の 3 営業日前
```

cron や iCalendar RRULE は「月末 N 日前（暦日）」までは書けるが、「第 N 営業日」を式の中で簡潔に書けるものは
無い。既存言語の本質的な限界は機能不足ではなく、**式が一枚岩で合成できない**こと——Kairos は「導いた日を基準に
さらに別の定義を作る」**閉包性**を中核に据える（全式は時間ストリーム → 時間ストリーム）。祝日カスケードの導出・
会計暦・旧暦・二十四節気・干支まで、同じ演算子族の合成で書ける。

**何ができて何ができないか**——cron・Quartz・RRULE・営業日カレンダー付き製品との**比較表**は
[spec §1.2](spec/00-intro.md)。実装系（発報層）との分業の全体像（消費ループ・決定性・missed-fire）は
[spec §7.8](spec/90-examples.md)、「前回完了から N 営業日後」のような実行起点相対の正しい書き方
（分解の仕方）は [spec §7.7](spec/90-examples.md)。

**ステータス: リリース候補（RC5＝2026-07-08 宣言・追補 2026-07-09 まで反映）**。意味論・演算子族・文法（EBNF）・字句は確定、命名も
一括確定済み（仮称は `shiftBoundary` 一語＝1.0 で確定）。表現力は既知スケジュール 20 要素のサンプル
検証と、リファレンス実装での実行検証（国立天文台 暦要項の実データ照合を含む・370 テスト）で実証済み。

## 構成

| ディレクトリ | 内容 |
|---|---|
| [`spec/`](spec/) | **言語仕様**（レビュー可能なスナップショット。まずここ） |
| [`reference/`](reference/) | **記述語リファレンス**（演算子・窓生成語ごとの解説。例は実装で実行検証） |
| [`stdlib/`](stdlib/) | 標準 premise の解説（`Gregorian`・`Fiscal`・`ISOWeek`・`Kyureki`——透明な標準ライブラリ。例は実行検証） |
| [`impl/`](impl/) | リファレンス実装（TypeScript・実行時依存ゼロ。プロトタイプ） |
| [`design/`](design/) | 設計記録（ADR-01〜44・ドメインモデル・構文ドラフト・表現力検証・綻びログ） |

設計の履歴を遡るときは [`design/INDEX.md`](design/INDEX.md) から。

## クイックスタート（リファレンス実装）

Node.js 24+ で TypeScript をそのまま実行できる。

```bash
cd impl
npm install          # devDependencies（typescript / vitest）のみ
npm test             # 仕様の代表例・実データ照合・doctest（reference/ と stdlib/ の実行例）

node src/cli.ts examples/payday.kairos      --from 2026-01-01 --to 2027-01-01
node src/cli.ts examples/jp-holidays.kairos --from 2026-01-01 --to 2027-01-01
node src/cli.ts examples/rokuyo.kairos      --from 2026-01-01 --to 2027-01-01
```

`jp-holidays.kairos` は法定祝日の表だけから、振替休日（2026-05-06）と国民の休日（2026-09-22）を言語の式で
導出する例。`rokuyo.kairos` は旧暦（NAOJ 暦要項の朔データで月を切る）から大安などの六曜を導出する例。

## 設計の背骨

- **基底 Chronos は固定** — TZ 非依存の単一絶対軸（TZ は市民座標への写像・premise 相対）。全ての暦法・粒度はここへの射影。
- **暦法は自由** — 暦法はユーザー定義でき、グレゴリオ暦もその一インスタンス（`stdlib/`）。
- **閉包** — 全演算子は `(ストリーム…, premise) → ストリーム`。
- **二層** — premise 層（暦法・カレンダーを組み立てる）と本体層（スケジュールを紡ぐ）。
- **core 族と糖衣** — 糖衣は core への機械的展開で消せる。
- **省略の統治** — 取り違えがサイレントな誤結果を生む前提（カレンダー・ロール規約・週の開始…）は宣言必須。

## ライセンス

[Apache-2.0](LICENSE)（帰属表示は [NOTICE](NOTICE)）。

- 本リポジトリへの貢献は、Apache-2.0 の第 5 条に基づき同ライセンスで提供されたものとみなします。
  あわせて [Developer Certificate of Origin](https://developercertificate.org/)（DCO）への同意を
  お願いします（コミットの `Signed-off-by:` 行）。
- 「Kairos」の名称・ロゴはライセンスの対象外です（Apache-2.0 §6）。
