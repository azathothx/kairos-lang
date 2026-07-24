# INDEX — 読む順序と設計記録の索引

このドキュメント群は、スケジュール定義言語 **Kairos**（汎用スケジューラ向け）の設計記録である。
全体を把握するときは、この索引を最初に読むこと。リリース状況（RC）は [`../spec/README.md`](../spec/README.md)、
宿題・保留事項の正本は [`90-open-questions.md`](90-open-questions.md)、**1.0 宣言の条件（DoD）と
宣言時作業の正本は [`70-release-1.0.md`](70-release-1.0.md)**（2026-07-24 裁定）。

## 読む順序

0. `../spec/` — **レビュー可能な言語仕様**（Kairos の通読用。全体を掴む・レビューするならまずここ）。
   `../stdlib/` — 標準 premise（Gregorian 等）の解説。spec が例として引用する中身の網羅資料。
   `../reference/` — **記述語リファレンス**（1 語 1 ファイルの解説。実行例は impl の doctest で検証）。
1. [00-overview.md](00-overview.md) — 目的・スコープ・既存方式との関係・設計の背骨。まずこれで全体像。
2. [10-domain-model.md](10-domain-model.md) — premise 定義・ドメインモデル・不変条件 I1〜I8。現在の姿（上書き型）。
3. [20-adr/](20-adr/README.md) — 設計判断の履歴（ADR-01〜47）。なぜそうなったかを遡るとき。相互に参照し合う。
4. [30-syntax/00-syntax-draft.md](30-syntax/00-syntax-draft.md) — 構文の作業中ドラフト。設計を進める層（区切りで spec/ に反映）。
5. [40-examples/](40-examples/README.md) — 表現力検証（既知スケジュールのサンプル集＝綻び出しの作業層）。判定マトリクスと綻びログ。
6. [60-reviews/](60-reviews/README.md) — 外部レビューの受領と処置の記録。
7. [90-open-questions.md](90-open-questions.md) — 宿題・保留事項。
8. `../impl/` — リファレンス実装の試作（TypeScript。spec §7＋実データの実行検証。制約は impl/README）。

## ADR 一覧（20-adr/）

- [ADR-01](20-adr/adr-01-cascade.md) 営業日はカスケード（濾過の残余ではない）
- [ADR-02](20-adr/adr-02-time-axis-base.md) 基底は時間軸（暦法ではない）
- [ADR-03](20-adr/adr-03-weekday-parallel.md) 曜日は並列サイクル、週末休は方針
- [ADR-04](20-adr/adr-04-closure.md) 全式は時間ストリーム→時間ストリーム（閉包）
- [ADR-05](20-adr/adr-05-single-type.md) 型は一本（本体層内に限定。ADR-18 で改訂）
- [ADR-06](20-adr/adr-06-window-first-class.md) 窓を第一級に
- [ADR-07](20-adr/adr-07-window-generalized-calendar.md) 窓を任意境界まで一般化＝暦法のユーザ定義
- [ADR-08](20-adr/adr-08-window-two-kinds.md) 窓はパーティション型と区間列型の二種
- [ADR-09](20-adr/adr-09-base-fixed.md) 暦法は自由、基底は固定
- [ADR-10](20-adr/adr-10-base-to-time-granularity.md) 基底を時間軸＋粒度へ降格
- [ADR-11](20-adr/adr-11-granularity-and-width.md) 粒度は表示射影、幅は演算子の規約引数
- [ADR-12](20-adr/adr-12-width-convention-set.md) 幅は規約集合
- [ADR-13](20-adr/adr-13-roll-axis-agnostic.md) ロール規約は軸非依存（Following/Preceding）
- [ADR-14](20-adr/adr-14-modified-boundary.md) Modified は上位窓内に留める（上位窓は明示引数）
- [ADR-15](20-adr/adr-15-empty-stream-provenance.md) 空は正当な値、出自は評価註釈、判定は外部
- [ADR-16](20-adr/adr-16-premise-scope-governance.md) 意味は premise 相対、省略の統治（premise の定義元）
- [ADR-17](20-adr/adr-17-name-resolution.md) 名前解決は premise 相対（曖昧なら修飾）
- [ADR-18](20-adr/adr-18-two-layer.md) premise 層と本体層の二層、語彙共有・型分離
- [ADR-19](20-adr/adr-19-primitive-derived-premise.md) 原始/派生 premise、型は正体で分ける、基底座標の管
- [ADR-20](20-adr/adr-20-generator-calendar-pure.md) 生成子は暦法純粋（I8）
- [ADR-21](20-adr/adr-21-point-transform-family.md) roll/shift は同じ点変換族、各段が premise 自足
- [ADR-22](20-adr/adr-22-operator-symbols.md) 記号は三役に一対一（`|>`・`.`・`|`）
- [ADR-23](20-adr/adr-23-core-and-sugar.md) core 族＋糖衣、糖衣は core へ片方向依存
- [ADR-24](20-adr/adr-24-window-notation-and-selector-origin.md) 窓記法と、選択子の第 N は窓起点（WKST）依存
- [ADR-25](20-adr/adr-25-primitive-full-syntax-and-value-layer.md) 原始的定義はフル構文、値式・変数レイヤーを導入（値型は第三の型）
- [ADR-26](20-adr/adr-26-table-literal-data-intake.md) テーブルリテラル＝データの持ち込み口（出所統治・層またぎ・暦法純粋との整理）
- [ADR-27](20-adr/adr-27-window-value-projection.md) 窓→値の射影一族（ordinalIn/labelOf/snapTo）と cycle の一般化
- [ADR-28](20-adr/adr-28-date-width-literal-lexical.md) 日付・幅リテラルの字句（TZ は premise が打つ・市民時と経過時間は混合不可）
- [ADR-29](20-adr/adr-29-chronos-lexical-name.md) 基底の字句名を chronos に（axis の二義解消・操作軸 axis: は確定）
- [ADR-30](20-adr/adr-30-projection-family-internals.md) 射影一族の内部設計（二窓 ordinalIn・labelOf 廃止・点はラベルを格納しない・labels:）
- [ADR-31](20-adr/adr-31-phase-and-epoch.md) 位相と紀元の規定（grid の既定整列＋anchor:・紀元 1970/epoch:・stride 一族は from: 必須）
- [ADR-32](20-adr/adr-32-string-literal.md) 文字列リテラルの導入（tz/source の字句衝突の解消。ADR-28 の追補）
- [ADR-33](20-adr/adr-33-tz-definition.md) TZ の定義（射影パラメータモデル・市民日の「最初の瞬間」規則・うるう秒スコープ外・DST 隙間/重複は明示エラー）
- [ADR-34](20-adr/adr-34-label-binding.md) label: 付与式の束縛規則（ラムダは窓の先頭点・定義的等式・射影時遅延・点±幅算術は導入しない）
- [ADR-35](20-adr/adr-35-calendar-entity.md) カレンダー実体の宣言（予約公開語 nonWorking を持つ premise・bizDay 標準導出・軸位置の規約＝F53）
- [ADR-36](20-adr/adr-36-granularity-alignment.md) 結合子・軸所属の粒度整合（整列の静的検査・snapTo が明示の再整列・tz 名はリテラル等値）
- [ADR-37](20-adr/adr-37-out-of-coverage-provenance.md) 範囲外出自と covering: の活性化（区間註釈・輸送表・実効被覆域・被覆サマリ＝I6 の具体化）
- [ADR-38](20-adr/adr-38-window-membership-and-stride.md) 窓所属の述語（coincides・仮称＝F68）と stride の入力相対（F70）
- [ADR-39](20-adr/adr-39-window-parallel-labels.md) 窓列への並行ラベル列（segmentBy の labels: 一般化・同長性検査＝F62 の器）
- [ADR-40](20-adr/adr-40-date-label-rebase.md) 日付ラベル保存の再錨（rebase・仮称＝F69）と免除系の tz 検査
- [ADR-41](20-adr/adr-41-business-hours.md) 営業時間の供給規約と標準導出（sessionOpens/sessionCloses・isOpen＝F67/F79）
- [ADR-42](20-adr/adr-42-window-instance-reference.md) 位置依存の名前解釈と窓インスタンス参照（適用の型規則＝F64/F9・逆像 `year(2020)`）
- [ADR-43](20-adr/adr-43-literal-tightening.md) リテラルと値束縛の締め（日付値域・固定オフセット正準形・点の値束縛＝F66/F97）
- [ADR-44](20-adr/adr-44-line-continuation.md) 文の区切りと複数行継続（括弧内自由改行・行頭/行末の段・結合子継続＝F91）
- [ADR-45](20-adr/adr-45-empty-table-literal.md) 空テーブルリテラル——「点ゼロだが覆域は主張したい」の一次形（F98＝発報層還流第一次・整列に空虚適合の第三状態）
- [ADR-46](20-adr/adr-46-external-supply.md) 外部供給宣言 `external`——実行時に解決されるテーブルリテラル（socket の確定・kind＝整列の主張・供給契約・供給エラーの部分類）
- [ADR-47](20-adr/adr-47-cycle-labels.md) 窓列への周期ラベル——segmentBy の labels: cycle 形（anchor の属する窓が先頭ラベル・同長性検査なし＝守るのは位相の宣言のみ）

## 運用メモ

- **図解は仕様確定後に**（設計者指示 2026-07-08）: ADR が長く複雑になり、読み手として図解が
  ほしい箇所が増えている（整列 G・註釈の輸送と二重の地平線・証人規則・実体の解決経路など）。
  ただし設計が動いている間の図は保守コストが高いので、機構の仕様が定まった後の整備タスクとして
  spec に図を足す（ADR には義務付けない）。
- Markdown は markdownlint（VS Code）で警告が出にくい記法に保つ。
- ADR は確定後は不変、追記型。改訂が要る場合は当該 ADR に「改訂」節を足す（ADR-05 が例）。
- ドメインモデルと構文は現在形で上書きしてよい。
- このファイル群はローカルの Git 管理下で育てる想定。
