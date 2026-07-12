# Kairos リファレンス実装（プロトタイプ）

スケジュール定義言語 **Kairos**（[`../spec/`](../spec/)）のリファレンス実装の試作。
目的は仕様の実行可能性の検証——**EBNF §5.6 がそのままパーサに、代表例 §7 と 40-examples の実データが
そのままテストに**なるかを確かめ、仕様の穴を実行で炙り出すこと（結果＝綻び F43〜F50。
[`../design/40-examples/90-findings.md`](../design/40-examples/90-findings.md)）。

## 使い方

```bash
npm install          # devDependencies（typescript / vitest）のみ
npm test             # spec §7 全代表例・NAOJ 暦要項実データ・静的エラー・reference/ と stdlib/ の doctest
npm run typecheck

# CLI（Node 24+。TS をネイティブ実行）
node src/cli.ts examples/payday.kairos      --from 2026-01-01 --to 2027-01-01
node src/cli.ts examples/jp-holidays.kairos --from 2026-01-01 --to 2027-01-01
node src/cli.ts examples/rokuyo.kairos      --from 2026-01-01 --to 2027-01-01   # 旧暦・六曜（大安など）
```

ライブラリとして:

```ts
import { run } from './src/index.ts';
const r = run(source, { from: '2026-01-01', to: '2027-01-01' });
r.results[0].dates;   // ['2026-01-23', …]
```

## 設計（仕様との対応）

| 層 | ファイル | 対応する仕様 |
|---|---|---|
| 字句 | `src/lexer.ts` | §5.5・ADR-28（日付・幅リテラル、市民時/経過時間の混合エラー、Unicode 識別子） |
| 構文 | `src/parser.ts` | §5.6 EBNF（前文・束縛・gen-expr・値式の優先順位・テーブルリテラル） |
| 評価 | `src/eval.ts` | §3（窓生成語・機構 A・遅延解決）・§4（core 段・射影）・I1〜I8 の一部を実行時検査 |
| 標準 premise | `stdlib/*.kairos`（gregorian・fiscal・isoweek を依存順にロード） | 各 stdlib ページ §1 の完全定義を **Kairos ソースのまま**評価器に食わせる（Kyureki はデータ入り premise のため同梱しない＝[`../stdlib/kyureki.md`](../stdlib/kyureki.md)） |

方針: **評価器は core 演算子だけを実装**し、`Gregorian`・糖衣・祝日カスケードはすべて Kairos ソースとして
評価する（言語組み込みの魔法にしない＝「透明な標準ライブラリ」ADR-25 の検証）。

検証済みの言語機構: 二層構造・前文（三形＋後置畳み込み `axis:`）・機構 A（`Fiscal` の `quarter` 自動追従）・
`with` 上書きと `shiftBoundary` 展開の一致・糖衣の遅延解決（`nextWeekday` の前方 roll・WKST 非依存）・
week 窓の `wkst:` 遅延解決・cycle（曜日・年干支）・テーブルリテラル（`covering:`/`labels:`・昇順検査）・
束縛名射影（`sekki(s) == 立春`）・射影 `ordinalIn`/`epochOrdinal`・`snapTo`・結合子カスケード・
選択子の窓相対（I4 エラー含む）・`segmentBy`（隙間ポリシー必須）・ストライド（`from:` 必須＝ADR-31）・
文字列リテラル（`tz: "Asia/Tokyo"`＝ADR-32）・grid の `anchor:`（ADR-31）・
**カレンダー実体と bizDay 標準導出**（`calendar: TSE`・軸位置の `on: TSE`・正体判定＝ADR-35。doctest の
標準前提も実体経由）・**member 解決規則**（定義側優先の上書き重ね＝ADR-35 判断 8）・**整列の検査**
（`&`/`\`/`filter(on:)`/`roll(on:)`/`shift(unit: 点列軸)` の同一 G 要求・`snapTo` の再整列＝ADR-36）・
**範囲外出自と covering: の活性化**（ADR-37。値随伴の区間註釈＝輸送表 §4.10・包含の静的検査・
開端/区間リスト covering・束縛後置の被覆主張＋必要条件検査・実効被覆域の分類器・
`RunResult.annotations`/`coverage`（残走路）・segmentBy の覆域端発火・地平線 4 サイトの三分岐降格・
defCache キーへの asof/source 追加）・**窓所属の述語 `coincides` と stride の入力相対**
（ADR-38。証人規則の三分岐・tz 静的検査・窓語 S / cycle w の静的エラー・filter 輸送の逆像拡幅
＝F75・stride の n 域検査と from: 規約・**窓リーダーの覆域検査＝F82**〔覆域外に張られた窓の読みは
coincides/ordinalIn/epochOrdinal/ラベル射影とも範囲外——合成マーカー帯の黙った 24 時間帯化の封止〕）・**窓列への並行ラベル列**（ADR-39。segmentBy の `labels:`・
束縛名射影・覆域基準の同長性検査＝F62 の器・clip/drop/label: 同居/規則マーカー/合成マーカーの
静的エラー群・未知 named-arg を黙って捨てない検査）・**多 TZ**（IANA tz を Intl ベース・依存ゼロで
サポート——premise 相対 TZ〔ADR-33 の射影パラメータモデル〕・DST の 23/25h 市民日〔ADR-11/12 の
幅規約の実行検証〕・隙間/重複リテラルの明示エラー・tz 相対の紀元・covering 端の premise tz 解決・
整列タグの tz 名と実幾何の一致・`tz:` 宣言必須の執行＝ADR-35/37）・**日付ラベル保存の再錨
`rebase` と免除系の tz 名検査**（ADR-40。day 整列検査・存在しない日付の明示エラー・
最初の瞬間への着地・恒等最適化・註釈の floor/ceil 輸送・within/選択子/ordinalIn/cycle・値射影の
市民グリッド tz 名検査〔snapTo は除外〕——F69 の解＝TSE×NYSE 共通営業日が書ける）・
**営業時間の供給規約と標準導出**（ADR-41。`sessionOpens`/`sessionCloses` の対宣言〔with 継承込み〕・整合性検査
〔結合実効被覆域∩実体化範囲の局所交互・端の切り欠き・同時刻対は両点保持＝文脈順序〕・実体相対の
`bizOpen`/`bizClose`/`isOpen`〔開場日固定＝F85・証人規則の三分岐・実体キーのメモ化〕——
クロス tz の isOpen が tz 検査に掛からず読める＝F89）・**時刻付き anchor/from: の壁時計ラベル読み**
（ADR-31 改訂 2＝F87 の修正。切替日 anchor の grid が anchor 自身を通り、同じ壁時計の 2 本が
同一 G になる・shift の経過保存は回帰テストで固定＝F83 (a)）・**窓インスタンス参照**
（ADR-42。適用の引数型 dispatch〔点→束縛名射影・値→逆像〕を WindowsV/StreamV＋wins の二表現に
対で実装・要素点列＝定義が窓に束ねた入力点列の窓所属〔F93〕・「窓列→要素点列」の輸送行
〔F94。filter と共通経路 `filterByPredicate` を共有＝第 5 の窓リーダーサイト〕・逆像は窓単位の
ラベル評価〔ADR-34 の構造保証から外延等価・naive filter の 1/5〜1/25〕・静的検査群 (a)〜(g)
〔自己参照ガードの値引数拡張＝ADR-34 改訂・labels: リテラルの域外検査を含む〕・修飾適用形
`Gregorian.year(2020)`・stdlib の標準ラベル〔Gregorian year/month・Fiscal.year の同時付与＝F96〕
——`marineDay \ year(2020)` 級の F9 正準例が立つ）・**リテラルと値束縛の締め**（ADR-43。
非実在日付の字句エラー〔2026-02-30 級のロールオーバー封止〕・固定オフセット tz の厳格一意形
〔"±HH:MM" のみ・Intl 前段の字句検査〕・時点の裸の値束縛＝F97 の挙動固定）・**文の区切りと
複数行継続**（ADR-44。括弧内自由改行・行頭/行末の段・結合子継続・空行跨ぎ可）。

## プロトタイプの制約（仕様との既知の乖離）

- **有界実体化**: 時間ストリームは [1970-01-01, to+400日) で実体化する。I7（遅延・無限・オンライン）は
  近似。1970 以前は評価できない。
- **TZ は IANA tz を実装**（`src/tz.ts`——Intl.DateTimeFormat の探査＋二分法でオフセット遷移点列を
  一度だけ構築・依存ゼロ）。市民日は「その日付になる最初の瞬間」からの半開区間（ADR-33 判断 4）で、
  DST 切替日は 23/25 時間（1d＝市民日 ≠ 86400s＝ADR-11/12 の幅規約を実行検証）。前文 `tz:` メンバーは
  評価され、day グリッド・リテラルの錨打ち・紀元（1970-01-01T00:00 の逆像）・covering の端が
  **premise 相対**になる（ADR-33 の射影パラメータモデル）。DST の隙間・重複に落ちる時刻リテラルは
  明示エラー（解決規約は将来の opt-in）。整列タグ（ADR-36）の tz 名は実幾何と一致する
  （`tz:` 未宣言の premise は実行既定 tz へフォールバック——タグと幾何は常に同じ tz）。
  残る近似: うるう秒はスコープ外（ADR-33＝乖離ではない）・遷移タイムラインの構築範囲は
  [1969, 2101)・tzdb 版はプロセスの ICU 版に固定（ADR-33 判断 10 の版差リスクは仕様どおり）・
  時刻付き anchor の civil grid 境界は「各市民日で anchor の壁時計時刻（ラベル読み）を最初に読む
  瞬間」（隙間は隙間明けの最初の瞬間・重複は最初の出現＝ADR-31 改訂 2。市民日の開始点を anchor に
  すると日整列＝off 0——真夜中遷移 tz の 01:00 開始も日整列と読む）。
- **未実装**: `Modified` ロール（上位窓引数。roll の依存像も Following/Preceding の 2 規約のみ）・
  `everyInstant` の一般合成（`strideBy(w, from:)` のみ）。
- **整列（ADR-36）は評価時のタグ伝播**＝「束縛解決後静的検査」の近似。細かい原子 grid（秒級
  `grid 1s`）は有界実体化のため実用不能——ADR-36 判断 8 の修理形の検証は 1h 級まで。
  定量（F80）: `hour |> first` は hour 窓の全実体化（約 49 万窓）で例 1 本 12〜22 秒、
  `everyInstant |> strideBy(1h, from:)` は from: 以降のみで 1 秒級（from: がグリッド上なら同じ
  点列）——doctest の hour 級の例は後者で書く。また**本体層の束縛は defCache されない**
  （premise 束縛のみメモ化）——値述語から参照されるストリーム束縛（segmentBy の帯等）を本体層に
  置くと点ごとに再評価される（実測 1 秒 → 50 秒）。メモ化の拡張は改善候補（仕様の乖離ではない）。
  窓インスタンス参照 `W(v)`（ADR-42）は W の解決 1 回＋窓単位のラベル評価なので値述語形より
  桁で軽い（実測で naive filter の 1/5〜1/25）が、W が本体層束縛だと W の解決自体が参照ごとに
  再評価される——**繰り返し使う窓束縛は premise 束縛に置く**（F80 と同じ誘導）。
- **`label:` 付与式は実装済み**（ADR-34）: ラムダは窓の先頭点・射影時の遅延評価・自己参照は明示エラー・
  cycle への label: は明示エラー。字句の時刻検査（`23:59:60` 拒否＝ADR-33）も実装。
  既知の穴: 自己参照ガード（labelStack）はラムダの同一性に依存するため、**本体層に置いた窓束縛**では
  解決ごとに新クロージャが生まれてガードをすり抜け、label: の自己参照（射影・逆像とも）が無限再帰
  し得る——premise 束縛なら検出される（defCache）。F80 の「premise 束縛に置く」誘導と同根で、
  本体層束縛のメモ化拡張（上記の改善候補）と束ねて解消するのが筋。
- **有界実体化の端の扱い**: `span phase:>0` の頭・`split` の末尾には**切れ端窓**を張り、I5（全域
  パーティション）を実体化範囲内で保つ（これが無いと `ordinalIn(month, year, d)` が「枠窓の外」を誤報）。
  切れ端窓の `label:` は**切れ端の先頭点**で評価されるため、本来の窓と別のラベルが付き得る——
  窓インスタンス参照 `W(v)` ではこのずれが**「別の年への漏れ」に増幅**される（例: `Fiscal` の頭の
  切れ端 [1970-01-01, 1970-04-01) は FY1969 の尾だが先頭点の暦年 1970 が付き、`year(1970)` に混入）。
  実体化端（紀元 1970 直後・to+400 日際）を跨ぐインスタンス参照は評価範囲を内側に取って避けること
  （ADR-42 帰結の注記）。
  計算範囲（to＋約 400 日）越えの `snapTo`/`roll` 終端/`shift` は**クリップ＋機械可読警告
  `horizon-clip:`** に降格済み（ADR-37 判断 8 の三分岐——「評価範囲はデータ被覆域に重ねて取る」の
  運用制約は解消）。roll/shift の地平線判定は「軸の終端が評価 to 以遠まで実体化されているか」の近似。
- **範囲外出自（ADR-37）の近似**: 註釈は評価時の値随伴伝播（整列タグと同型）。`stride` の位相汚染は
  「from: 以降で交差する註釈区間の尾部を +∞ へ拡張」の保守近似（stride は入力相対＝ADR-38 で確定）。
  `snapTo` の註釈の像は端点を属する窓の先頭へ床処理（覆域の端を窓粒度で解決する操作形）。
  被覆主張の必要条件検査は「成分 covering の和 ∪ 複合註釈の補集合」で判定（規則ベース成分は補集合側で
  通る）。**`covering:`/日付テーブルを持つ premise の `tz:` 宣言必須**（ADR-35 判断 1/ADR-37 判断 1）は
  **宣言時に執行**する（base 連鎖の宣言でも可＝member 解決規則で内側固定。覆域の端は premise tz の
  市民日で解決）。並行リスト添字（F62）の分類は依存が覆域を持たないため常に硬エラー側。
- 実装で出た綻び F43〜F50 は仕様側で解消済み（例の修正＝F45〜F48・ADR-31/32＝F43/F44/F49/F50）。
  ただし `epoch:` の**既定以外の値**（別紀元の暦法）は未対応（宣言すると静的エラーで知らせる）。

## テスト

- `test/examples.test.ts` — spec §7 の全代表例。糖衣形と core 展開形の一致、JS Date による独立オラクル照合
  （月末 3 営業日前・第 2 営業日の次の金曜・給料日）、祝日カスケード（2026 年の振替 5/6・国民の休日 9/22 の
  導出）、会計暦、年干支、week/WKST、入れ子窓。
- `test/projections.test.ts` — 射影一族と天文暦。期待値は NAOJ 令和8年暦要項
  （`../design/40-examples/95-reference-data.md`）: 立春 2/4・八十八夜 5/2・二百十日 9/1・旧正月 2/17。
- `test/static-errors.test.ts` — 統治の静的エラー（幅の混合・core 語再定義・I4・I5・昇順・labels: 同長）。
- `test/stdlib-premises.test.ts` — 同梱 stdlib premise（Fiscal・ISOWeek）の回帰。ISO 週暦は JS 実装の
  isocalendar を独立オラクルに全数照合（label: 不要の等価変形の検証）。切れ端窓（I5）・div の floor
  （F63）の回帰を含む。
- `test/label.test.ts` — `label:` 付与式（ADR-34）。年度ラベル（span）・旧暦月名（segmentBy・文字列
  リスト添字）・split/grid のラベル・自己参照/cycle/非ラムダの明示エラー・字句の時刻検査。
- `test/calendar-entity.test.ts` — カレンダー実体（ADR-35）と整列（ADR-36）。標準導出のオラクル照合・
  `on: TSE` の等価・`axis: TSE` 畳み込み・正体判定/予約/逆向き判定の静的エラー・`&`/`\`/`filter(on:)`/
  `roll(on:)` の整列エラーと `snapTo` 整合・混合和・窓語 shift の免除・strideBy のグリッド一致。
- `test/annotations.test.ts` — 範囲外出自と covering: の活性化（ADR-37）。包含の静的検査・開端/区間
  リスト covering・クリップ枠・結合子の相殺なし和と bizDay 退化の観測・shift の平行移動像・roll の
  依存像と三分岐（範囲外/地平線/完結の尽き）・選択子の窓拡幅・stride の位相汚染・segmentBy の覆域端
  （最終窓の確定）・filter/epochOrdinal の「落として註釈」と覆域内硬エラーの非対称・被覆主張と必要条件
  検査・被覆サマリ（残走路・完結主張）・defCache×asof。
- `test/coincides.test.ts` — 窓所属の述語と stride の入力相対（ADR-38）。真偽の確定・証人規則の
  三分岐（覆域端跨ぎ窓の証人・退化 S の非証人・覆域完全の偽）・filter 輸送の逆像拡幅（F75）・
  tz 不一致/窓語 S/cycle w の静的エラー・閏月検出（閏六月 2025-07-25）・毎営業日 9 時の正準形と
  前段差の一致・stride の n 域と from: 規約・窓リーダーの覆域検査（F82＝合成マーカー帯の
  覆域外読みは落として註釈——06-business-hours の敵対的検証で発見した回帰）。
- `test/window-labels.test.ts` — 窓列への並行ラベル列（ADR-39）。束縛名射影と旧イディオムの一致・
  空窓のラベル読み（欠ティティ）・紀元跨ぎの窓列序数・覆域外射影の分類・同長エラー（短/長）・
  clip/drop/label: 同居/規則マーカー/合成マーカーの静的エラー・被覆主張による合成マーカーの通し・
  未知 named-arg（core 段・gen 語・糖衣）。
- `test/timezone.test.ts` — 多 TZ（ADR-33/35/36/37 の幾何側）。DST 切替日の 23/25h 市民日・
  strideBy の市民時幅/経過時間幅の分岐・切替日を跨ぐ roll/shift・隙間/重複リテラルの明示エラー・
  真夜中スキップ tz（チリ）の市民日開始・premise 相対 day グリッドと紀元・covering 端の premise tz
  解決・整列 tz 不一致（実幾何）・クロス tz snapTo＝chronos の重なり（F69 の前提の固定）・
  Kyureki 型の内側固定・2027 春節の JST/CST 割れ・tz: 必須の執行・時刻付き anchor/from: の壁時計
  ラベル読み（ADR-31 改訂 2＝F87: 切替日 anchor・隙間/重複の目盛り・同一 G）・shift の経過保存の
  固定回帰（F83 (a): 単射着地・往復恒等・Santiago の日開始着地）。
- `test/business-hours.test.ts` — 営業時間の供給規約と標準導出（ADR-41）。ADR の TSE 二部制の例
  そのままで isOpen の真偽（半開境界・昼休み・半日休・祝日）・bizOpen/bizClose（開場日固定・
  半日休の引け）・実体相対のクロス tz 読み（F89）・同時刻対＝連続営業と和の右端・深夜セッション
  （F85）・交互性違反のデータ相対エラー・対宣言/予約名/未宣言の静的エラー・with 継承込みの対判定・
  covering 外の「落ちて註釈」・営業時間内の毎正時（06 §6.3 と同じ期待値——正準は isOpen 一語）。
- `test/rebase.test.ts` — 日付ラベル保存の再錨（ADR-40）。共通営業日の正準例（東京×NY・手計算固定）・
  snapTo との対比（系統的 1 日ずれ）・恒等/往復恒等・DST 切替日と真夜中スキップ日（チリ）への
  再錨・存在しない日付（Pacific/Apia 2011-12-30）・入力整列違反 3 態・to: の統治・註釈輸送・
  免除系の tz 名検査（within/ordinalIn/値射影/選択子＋rebase 後は通る側・snapTo の除外）。
- `test/instance-reference.test.ts` — 窓インスタンス参照（ADR-42）。F9 の正準例 3 種
  （`marineDay \ year(2020)`・`month(5) & year(2026)`・segmentBy 由来の `kyuMonth("五月")`）・
  定義的等式との外延一致・点引数射影の不変・修飾適用形 `Gregorian.year(2020)`（Fiscal 下で暦年・
  結合子被演算子・射影面）・全マッチの和（`lunarMonth25(6)` が閏六月を含む）・空窓/ゼロマッチ＝空・
  輸送行の回帰（マーカー覆域の先で「落ちて註釈」＝F94）・静的検査群 (a)〜(g) 全種・値式位置の
  型エラー・F96 回帰（shiftBoundary のラベル保存＝Fiscal.year 同時付与と等価）。
- `test/lexical-limits.test.ts` — リテラルの締め（ADR-43）。非実在日付の字句エラー（閏年規則込み）・
  固定オフセット tz の厳格一意形・時点の裸の値束縛（F97）の挙動固定。
- `test/continuation.test.ts` — 文の区切りと複数行継続（ADR-44）。行頭/行末の結合子継続・premise
  ブロック内の複数行右辺・「文頭の結合子は引き続き構文エラー」の退行なし。
- `test/doc-consistency.test.ts` — 文書の整合性（機械検査）。ADR 範囲表記 vs 実ファイル数・改名済み
  旧名の残存・仮称印・stdlib の .kairos↔解説 md の label: 同期。
- `test/doctest.test.ts` — [`../reference/`](../reference/) と [`../stdlib/`](../stdlib/) の実行例
  （` ```kairos ` フェンスの `# eval:`／`#=>` 規約）を全件実行して照合。ドキュメントの例が仕様・実装と
  ずれたらここで割れる。
