# 境界チェックリスト（2026-09-29〜30・三巡）——敵対的レビューの代替として当方が機械的に回した実測録

**目的**: レッドチーム監査（80 系の非公開記録・追補 20）の教訓「witness の網に資源・入出力の境界が無かった」を受け、境界値を列挙して
参照実装 1.0.5（非公開の正本・追補 22 準備済み）に流し、**統治外エラー（RangeError／TypeError／NaN）・タイムアウト・黙って通る形**を探した。
判定は当方の実測のみ（外部 AI の判定は使わない）。

**方法**: ケースごとに子プロセス（タイムアウト 20 秒）で評価。分類＝OK（値が出た）／ERR（KairosError・SupplyError・LexError・ParseError＝
統治されたエラー）／UNGOV（それ以外の例外）／TIMEOUT／CLI は終了コード。再現＝当方の作業ディレクトリのスクリプト（cases.mjs・run.mjs・
one.ts・probe2.ts・probe3.ts）。ケース数 135（本体 114・CLI 21）。

**集計**: ERR 42・OK 75・UNGOV 1・TIMEOUT 1・EXIT1 15・EXIT2 1

## 結果の読み

### 修正した綻び（1.0.5 に同乗）

- **F116 `shift` の非整数**——`shift(1.5, unit: month)` は TypeError（統治外）、`shift(1.5, unit: bizDay)` は NaN の日付が
  window-clip 警告に漏れて 0 点。stride／take／takeLast には整数検査があり shift だけ無かった。→「shift: n は整数（1.5 は不可。方向は符号で表す。§5.2）」
  を静的エラー化・witness 3 本。

### 黙って通る形（設計者裁定「全部」＝10 件とも 1.0.5 で処置・F117〜F126・witness は impl/test/boundary-checklist.test.ts）

1. **評価範囲の逆順**（to < from）——run() も CLI も黙って 0 点（CLI は「# 0 点」exit 0）。→ 使い方エラー「評価範囲が逆順」（from = to の空範囲は正当のまま）。
2. **`tz: ""`**——空文字列が「未宣言」と同じ扱いになり黙って機械 tz に落ちる（`memberStr(...) || rt.tzName`）。→ 危険メンバーの空値は静的エラー。
3. **BOM 付きファイル**——字句エラー「不明な文字」。Windows のメモ帳が付ける＝Windows 導線の実害。→ 先頭の BOM を読み飛ばす（CRLF は問題なし）。
4. **`nth(0)`・`nth(-1)`・`nth(1.5)`**——黙って 0 点。仕様は「1 起点」。→ stride／take と同規約「nth: n は 1 以上の整数」（`nth(32)` の空は正当のまま）。
5. **年 5 桁 `10000-01-01`**——字句が 4 桁で切って別のエラー（「labels:/covering: は…」）に誤誘導。→ 字句で「年は 4 桁」。あわせて `0000` は
   受理される（ISO 8601 の year 0）＝Limits 節の「0001–9999」は「0000–9999」に訂正が要る。
6. **同一ブロック内の前文メンバー二重宣言**（`wkst: Mon; wkst: Sun`）——後勝ちで黙る。→ 静的エラー。
7. **premise の同名再定義**——後勝ちで黙る（仕様に規定なし）。→ 静的エラー＋spec 明文（裁定）。
8. **異型の等値比較**（`"a" == 1`・`dayNo(d) == "1"`）——黙って偽（仕様に規定なし）。→ 型エラーにするか「異型は偽」を明文するか（裁定）。
9. **0 除算・`mod 0`**——黙って偽（NaN）。→ 評価時エラー。
10. **空ファイル**——本体式が無いのに exit 0・0 行。→ 使い方エラー「本体式が無い」（コメントだけのファイルは `#` 以外が字句エラー＝統治済み）。

**処置の対応**＝1. F117 ／ 2. F118 ／ 3. F119 ／ 4. F120 ／ 5. F121（Limits 節も 0000 に訂正） ／ 6. F122 ／ 7. F123（spec §3.2 明文） ／
8. F124（spec §4.9 明文・型エラー側を採用） ／ 9. F125 ／ 10. F126（CLI 側で止める。run() は空集合を返す言語の評価のまま）。

### 軽微（文言・便宜。機会があれば）

11. `wkst: Xyz`・`granularity: nope` は使用時に「未解決の名前: Xyz」（宣言時でなく使用時・原因を指さない）。値域は暦法依存なので宣言時検査は採らず、文言に「wkst: の値」を添える程度。
12. calendar-system 無し／premise 無し／`calendar-system: Nonsense` は「未解決の名前: day」（原因を指さない）。→「calendar-system: の宣言が無い」を添える。
13. CLI の使い方エラーの一部が Node の parseArgs の英語文言（`-n -1`「argument is ambiguous」・未知フラグ「Unknown option」）。→ 日本語文言で包む。
14. サブコマンド省略でフラグが先頭（`kairos --from … file`）は使い方全文で exit 1（旧形式はファイル先頭のみ）。
15. `takeLast` の空入力に「実体化下限で切れ——n=3 個中 0 個」の horizon-clip 警告（誤診断）。→ 空入力なら警告しない。
16. `strideBy(-1s)` は「数値ではない: width」（誘導なし）。→「幅は正の量」に統一。
17. supply の `asof` の形式が検査されない（`"yesterday"` が通る）。→ 契約違反に追加。

### 記録のみ（綻びではない）

- 性能: filter 述語の射影 1 項あたり約 0.28 ms（`or` 200 項で 3 日窓 22 秒・線形。parse は 0 ms）。極端に長い述語は遅いが指数ではない。
- `shift(10^9, unit: month)` で horizon-clip 警告 689 本（実体化域の全点）＝既知（90-open 採録済み）。
- DST の隙間（`at(T02:30)` が 03:00 へ）・重複（最初の出現）は ADR-31 改訂 2 のとおり。supply の契約違反（重複・逆順・実在しない日・形式・covering 外・asof 欠落・解決失敗）は run()／CLI とも全件統治。
  stride／take／takeLast の整数検査・テーブルの重複逆順・字句の日付検査・1970 前・tz 不正名・9999 年・2000 字の識別子・Unicode 識別子・束縛と糖衣の循環・空ストリームへの全段は問題なし。

## ケース一覧（自動生成）


### 数

- `n01` ERR: KairosError stride: n は 1 以上の整数（0 は不可。ADR-38 判断 12）
- `n02` ERR: KairosError stride: n は 1 以上の整数（-1 は不可。ADR-38 判断 12）
- `n03` OK: 86 点
- `n04` OK: 1 点
- `n05` ERR: KairosError stride: n は 1 以上の整数（1.5 は不可。ADR-38 判断 12）
- `n06` ERR: KairosError stride: from: が必須（起点の明示。ADR-31・§4.7）
- `n07` ERR: KairosError strideBy: 幅は正の量（0 幅は前進しない＝無限ループ。1s・1d のような正の幅を書く。ADR-38 判断 12）
- `n08` ERR: KairosError 数値ではない: width
- `n09` OK: 86400 点
- `n10` OK: 1 点
- `n11` OK: 0 点
- `n12` OK: 0 点
- `n13` OK: 0 点
- `n14` OK: 0 点
- `n15` OK: 0 点
- `n16` OK: 0 点
- `n17` ERR: KairosError take: n は 1 以上の整数（0 は不可。ADR-38 判断 12 と同規約）
- `n18` ERR: KairosError take: n は 1 以上の整数（-1 は不可。ADR-38 判断 12 と同規約）
- `n19` OK: 90 点
- `n20` ERR: KairosError takeLast: n は 1 以上の整数（0 は不可。ADR-38 判断 12 と同規約）
- `n21` ERR: KairosError takeLast: n は 1 以上の整数（-1 は不可。ADR-38 判断 12 と同規約）
- `n22` ERR: KairosError shift: 点が軸上にない（先に roll で有効点へ寄せる）
- `n23` ERR: KairosError shift: 点が軸上にない（先に roll で有効点へ寄せる）
- `n24` OK: 0 点・警告 689
- `n25` UNGOV: TypeError Cannot read properties of undefined (reading 'start')
- `n26` OK: 0 点
- `n27` OK: 0 点
- `n28` ERR: ParseError 構文エラー(3:38): ) を期待（'e309' の位置）
- `n29` OK: 0 点
- `n30` OK: 0 点
- `n31` OK: 0 点
- `n32` OK: 0 点

### 集合

- `s01` OK: 0 点
- `s02` OK: 0 点
- `s03` OK: 0 点
- `s04` OK: 0 点
- `s05` OK: 0 点
- `s06` OK: 0 点
- `s07` OK: 0 点・警告 1
- `s08` OK: 0 点
- `s09` OK: 0 点
- `s10` OK: 0 点
- `s11` OK: 90 点
- `s12` OK: 90 点
- `s13` OK: 1 点
- `s14` ERR: KairosError テーブルリテラルは昇順・重複なし（§3.8 静的エラー）
- `s15` ERR: KairosError テーブルリテラルは昇順・重複なし（§3.8 静的エラー）
- `s16` OK: 0 点
- `s17` OK: 1 点（註釈 1）
- `s18` OK: 0 点
- `s19` OK: 0 点
- `s20` OK: 90 点
- `s21` OK: 64 点

### 時間

- `t01` OK: 1 点
- `t02` ERR: KairosError プロトタイプの評価範囲は 1970-01-01 以降
- `t03` OK: 12 点
- `t04` OK: 0 点
- `t05` OK: 0 点
- `t06` OK: 12 点
- `t07` ERR: LexError 字句エラー(3:6): 実在しない日付: 2026-02-30（月は 01..12・日は月と閏年規則の実在日のみ——proleptic Gregorian 固定。F66/ADR-43）
- `t08` ERR: LexError 字句エラー(3:6): 実在しない日付: 2026-13-01（月は 01..12・日は月と閏年規則の実在日のみ——proleptic Gregorian 固定。F66/ADR-43）
- `t09` OK: 0 点（註釈 1）
- `t10` ERR: KairosError labels:/covering: は時点列（テーブルリテラル）にのみ付く
- `t11` OK: 3 点
- `t12` OK: 3 点
- `t13` ERR: KairosError 存在しない時刻: 2026-03-08T02:30（tz "America/New_York" の DST の隙間に落ちる——実在の壁時計で書く。ADR-33）
- `t14` ERR: LexError 字句エラー(3:16): 時刻が範囲外: T24:00（hh は 00..23・mm/ss は 00..59。うるう秒は表現しない＝ADR-33）
- `t15` ERR: LexError 字句エラー(3:16): 時刻が範囲外: T23:59:60（hh は 00..23・mm/ss は 00..59。うるう秒は表現しない＝ADR-33）
- `t16` OK: 2 点
- `t17` OK: 3 点
- `t18` OK: 3 点
- `t19` ERR: KairosError 不正な tz 名: "Mars/Olympus"（IANA 名か固定オフセット正準形 "±HH:MM"。ADR-33/36/43）
- `t20` OK: 90 点
- `t21` OK: 2 点
- `t22` OK: 2 点
- `t23` OK: 1 点
- `t24` OK: 0 点
- `t25` ERR: KairosError 不正な tz 名: "Mars/Olympus"（IANA 名か固定オフセット正準形 "±HH:MM"。ADR-33/36/43）
- `t26` OK: 0 点

### 前文

- `p01` OK: 90 点
- `p02` ERR: KairosError 未定義の premise: A
- `p03` ERR: KairosError 未定義の premise: B
- `p04` OK: 77 点
- `p05` OK: 3 点
- `p06` ERR: KairosError 未解決の名前: day（premise 相対解決 §3.4）
- `p07` OK: 90 点
- `p08` ERR: KairosError 未解決の名前: day（premise 相対解決 §3.4）
- `p09` ERR: KairosError 未定義の premise: @Nope
- `p10` OK: 90 点 / 90 点
- `p11` ERR: KairosError 未解決の名前: day（premise 相対解決 §3.4）
- `p12` OK: 90 点
- `p13` OK: 90 点
- `p14` OK: 90 点
- `p15` ERR: KairosError 未解決の名前: day（premise 相対解決 §3.4）
- `p16` ERR: KairosError external は premise 束縛の右辺（先頭）でのみ書ける（source: 統治が premise に要る——本体層・top-level 束縛は不可。ADR-46）
- `p17` ERR: KairosError covering: 区間の端が逆順
- `p18` ERR: ParseError 構文エラー(3:43): 式を期待（':' の位置）
- `p19` OK: 90 点
- `p20` OK: 90 点
- `p21` OK: 3 点
- `p22` ERR: KairosError 未解決の名前: granularity（premise 相対解決 §3.4）
- `p23` ERR: KairosError 束縛の循環参照は静的エラー: x → x（§4.8 の依存解析）
- `p24` ERR: KairosError 糖衣定義の循環参照は静的エラー: (無名ラムダ) → (無名ラムダ)——糖衣の展開は有限（再帰は書けない。§4.8 の依存解析）
- `p25` OK: 90 点
- `p26` OK: 90 点
- `p27` OK: 0 点
- `p28` OK: 0 点
- `p29` ERR: KairosError 未解決の名前: nope（premise 相対解決 §3.4）
- `p30` ERR: KairosError 未解決の名前: Funday（premise 相対解決 §3.4）
- `p31` ERR: ParseError 構文エラー(3:1): 式を期待（'/' の位置）
- `p32` ERR: ParseError 構文エラー(4:1): name を期待（'eof' の位置）
- `p33` OK: 3 点
- `p34` TIMEOUT: 
- `p35` ERR: KairosError 未解決の名前: true（premise 相対解決 §3.4）

### CLI

- `c01` OK（空ファイル）: ・stdout 0 行
- `c02` EXIT1（コメントのみ）: 構文エラー(1:1): 式を期待（'/' の位置）
- `c03` EXIT1（BOM+CRLF）: 字句エラー(1:1): 不明な文字: "U+FEFF"
- `c04` EXIT1（存在しないファイル）: ENOENT: no such file or directory, open '/tmp/kairos-boundary-hENE13/missing.kairos'
- `c05` EXIT1（from 形式不正）: 日付は YYYY-MM-DD: 2026/01/01
- `c06` OK（to < from）: ・stdout 1 行
- `c07` OK（from = to）: ・stdout 1 行
- `c08` EXIT1（next -n 0）: -n は正の整数: 0
- `c09` EXIT1（next -n -1）: Option '-n' argument is ambiguous.
- `c10` EXIT2（next 大量）: ⚠ 地平線 1 年以内の発火は 365 件（要求 100000 件）
- `c11` EXIT1（horizon 0）: --horizon は正の整数: 0
- `c12` EXIT1（supply 不正 JSON）: --supply の JSON が壊れている（/tmp/kairos-boundary-hENE13/c12.json）: Expected property name or '}' in JSON at position 1 (line 1 column 2)
- `c13` EXIT1（supply 1 万件（重複・逆順込み））: external は premise 束縛の右辺（先頭）でのみ書ける（source: 統治が premise に要る——本体層・top-level 束縛は不可。ADR-46）
- `c14` EXIT1（supply 重複・逆順）: external は premise 束縛の右辺（先頭）でのみ書ける（source: 統治が premise に要る——本体層・top-level 束縛は不可。ADR-46）
- `c15` EXIT1（supply 実在しない日）: external は premise 束縛の右辺（先頭）でのみ書ける（source: 統治が premise に要る——本体層・top-level 束縛は不可。ADR-46）
- `c16` EXIT1（tz 不正）: 不正な tz 名: "Mars/Olympus"（IANA 名か固定オフセット正準形 "±HH:MM"。ADR-33/36/43）
- `c17` EXIT1（lang 不正）: --lang は ja または en: xx
- `c18` EXIT1（未知フラグ）: Unknown option '--bogus'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "--
- `c19` OK（from/to なし）: ・stdout 365 行
- `c20` EXIT1（サブコマンド省略）: 使い方（kairos ＝ node src/cli.ts）:
- `c21` OK（同じフラグ 2 回）: ・stdout 1 行

### 再測（probe2・probe3）

- DST 隙間 NY 3/8 `at(T02:30)` → 2026-03-08T03:00（隙間明け）・重複 11/1 `at(T01:30)` → 1 回（最初の出現）。
- `wkst: Xyz` は `within(week)` で「未解決の名前: Xyz」・`weekday(d)` だけなら黙って通る。`granularity: nope` も同型。二重宣言は後勝ち。
- CRLF のみ＝正常。BOM＝字句エラー。
- `shift(1.5, unit: bizDay)`（修正前）＝0 点＋window-clip 警告に NaN-NaN-NaN。
- `or` 連鎖: 25 項 2.9 秒・50 項 5.6 秒・100 項 10.8 秒・200 項 22.6 秒（3 日窓・parse 0 ms）。
- supply: 重複逆順・実在しない日・形式不正・時刻付き・1 万件（重複込み）・covering 外・covering 逆順・dates 無し・解決失敗＝全件契約違反または供給エラー。空＝正常。asof 不正＝通る（未検査）。


## 二巡目（2026-09-30）——一巡目で覆っていなかった層

設計者「見落としがないか不安」を受け、premise 層の生成語（grid／span／split／cycle／phase／label）・派生（rephase／rebase）・segmentBy・射影と述語・
`at`・external の kind と labels・stdlib（Fiscal／ISOWeek）・`next` 経路・CLI の `--tz`／窓・字句と構造（入れ子・長い連鎖・全角空白・
タブ・継続行・文字列）を 115 件。集計（修正前）: TIMEOUT 3・ERR 53・OK 49・UNGOV 6・EXIT1 3・EXIT2 1。

### 修正した綻び（1.0.5 に同乗・witness は boundary-checklist.test.ts の二巡目 describe）

- **F127** `span` の個数が非整数（1.5）→ TypeError。「span: 個数は 1 以上の整数」。
- **F128** `split` の幅に 0・負（総和は I5 を通る）→ TypeError。各幅を「1 以上の整数」で検査。
- **F129** `phase: 1.5`・`rephase(+1.5, …)` → TypeError。「phase は 0 以上の整数」「rephase: δ は整数」。
- **F130** `chronos grid 0d` → 停止しない（タイムアウト）。F112（strideBy の 0 幅）の grid 版。「grid: 幅は正の量」。
- **F131** 括弧 1000 段 → 構文解析の RangeError。入れ子 200 段で構文エラー「式の入れ子が深すぎる」。
- **F132** `filter((a, b) => a == b)`・`f()`（仮引数 1）→ undefined が黙って束縛。「引数の個数が違う」。
- **F133** `dayNo(d, d)` の余分な引数が黙って無視・`dayNo()` は「時点ではない: undefined」。F132 と同じ検査で止まる。
- **F134** 束縛の再定義（トップ・premise 内）が後勝ちで黙る。「束縛の再定義は静的エラー」（派生 with の上書きは正当）。
- **F135** `cycle []` が黙って通る（射影が undefined）。「cycle: ラベル列が空」（重複ラベルは正当）。

### 記録のみ（資源・軽微）

- `chronos grid 1s` を窓に使うと実体化域（to+400 日）で約 3,500 万窓＝タイムアウト。既知の「細かい原子 grid は実用不能」（F80・ADR-36 判断 8）。
- `next -n 1` は最初の探索窓が 1 年なので、`strideBy(1s, …)` では 1 点のために約 3,100 万点を実体化＝タイムアウト。改善候補＝探索窓を短く始めて倍々（設計判断・90-open）。
- `phase: 12`（＝周期）と `phase: 13` は法で黙って正規化される（負は F65 でエラー）＝非対称。軽微。
- 全角スペース（U+3000）は字句エラー「不明な文字」＝文言に「全角スペース」を添えると親切。`with` は束縛名に使える（`premise` は不可）。100 KB の tz 文字列はエラー文言に全文が出る（切り詰め候補）。`--tz JST` は ICU が受理する。
- 問題なし＝split の総和不一致（I5）・cycle の anchor 窓外／anchor 欠落／窓でない入力・rephase の射程外・rebase の不正 tz・segmentBy（空マーカー・labels と empties: drop の組合せ・edges 必須・入れ子・時刻付きマーカー）・述語の非論理値・`on:` の非ストリーム・`at` の窓付き入力と非時刻引数・external の kind／labels 契約（宣言と解決値の不一致 4 形・instants の型）・Fiscal／ISOWeek（第 53 週・fiscalMonthNo）・`next` の 2 式／不足／遠い将来／9999 年越え・CLI の `--tz` 3 形・100 年窓（1,200 行）。

### ケース一覧（自動生成・修正前の分類）

#### 生成語

- `g01` TIMEOUT: 
- `g02` ERR: ParseError 構文エラー(2:20): 窓生成語の引数を期待（'-' の位置）
- `g03` TIMEOUT: 
- `g04` ERR: LexError 字句エラー(2:31): 時刻が範囲外: 2026-01-01T25:00（hh は 00..23・mm/ss は 00..59。うるう秒は表現しない＝ADR-33）
- `g05` OK: 3 点
- `g06` ERR: KairosError span: 個数は 1 以上
- `g07` ERR: KairosError span: 個数は 1 以上
- `g08` UNGOV: TypeError Cannot read properties of undefined (reading 'end')
- `g09` OK: 90 点
- `g10` ERR: KairosError 数値ではない: string
- `g11` ERR: KairosError I5: split の幅総和 0 ≠ 親窓内の単位数 12（親窓 1971-01-01..1972-01-01。可変長の親は g が親序数で分岐するか segmentBy 正準形へ。ADR-48）
- `g12` UNGOV: TypeError Cannot read properties of undefined (reading 'end')
- `g13` ERR: KairosError I5: split の幅総和 10 ≠ 親窓内の単位数 12（親窓 1971-01-01..1972-01-01。可変長の親は g が親序数で分岐するか segmentBy 正準形へ。ADR-48）
- `g14` UNGOV: TypeError Cannot read properties of undefined (reading 'end')
- `g15` ERR: KairosError 未解決の名前: nope（premise 相対解決 §3.4）
- `g16` ERR: KairosError 未解決の名前: A（premise 相対解決 §3.4）
- `g17` OK: 3 点
- `g18` OK: 3 点
- `g19` ERR: KairosError cycle: anchor が対象窓の外
- `g20` ERR: KairosError cycle は anchor: が必要（§3.6）
- `g21` ERR: KairosError 窓（パーティション）ではない: stream
- `g22` ERR: KairosError span: phase は 0 以上（負位相は周期を法として正規化して書く。F65）
- `g23` OK: 2 点
- `g24` UNGOV: TypeError Cannot read properties of undefined (reading 'end')
- `g25` ERR: KairosError label: はラムダ（付与式）を取る: number（§4.9）
- `g26` ERR: KairosError 0 で割れない（/ の右辺は 0 以外。§4.9）
- `g27` OK: 4 点

#### 派生

- `r01` OK: 3 点
- `r02` OK: 3 点
- `r03` OK: 3 点
- `r04` OK: 3 点
- `r05` UNGOV: TypeError Cannot read properties of undefined (reading 'end')
- `r06` ERR: KairosError rephase の射程は k 定数の span のみ（§3.7）
- `r07` ERR: KairosError rephase: base に窓 nope がない
- `r08` ERR: KairosError rephase の射程外: base の year は「nope span (定数)」の形でない（§3.7）
- `r09` OK: 3 点
- `r10` ERR: KairosError 不正な tz 名: "Mars/Olympus"（IANA 名か固定オフセット正準形 "±HH:MM"。ADR-33/36/43）
- `r11` ERR: KairosError 不正な tz 名: ""（IANA 名か固定オフセット正準形 "±HH:MM"。ADR-33/36/43）
- `r12` OK: 3 点
- `r13` OK: 3 点

#### 区間

- `s30` ERR: KairosError segmentBy: マーカーが空
- `s31` OK: 2 点（註釈 1）
- `s32` ERR: KairosError segmentBy(labels:): empties: drop とは組めない——空窓の除去が序数を詰め、どのラベルが落ちたかリストから判別できない（empties: keep/error へ。ADR-39 判断 4）
- `s33` ERR: KairosError segmentBy(labels:): empties: drop とは組めない——空窓の除去が序数を詰め、どのラベルが落ちたかリストから判別できない（empties: keep/error へ。ADR-39 判断 4）
- `s34` ERR: KairosError segmentBy(labels: cycle): empties: drop とは組めない——空窓の除去が序数を詰め、どのラベルが落ちたかリストから判別できない（empties: keep/error へ。ADR-39 判断 4）
- `s35` OK: 4 点
- `s36` ERR: KairosError 未解決の名前: nope（premise 相対解決 §3.4）
- `s37` ERR: KairosError segmentBy は edges: が必須（I5・§4.2）
- `s38` OK: 1 点（註釈 1）
- `s39` OK: 2 点（註釈 1）

#### 射影

- `j01` OK: 0 点
- `j02` ERR: KairosError 未解決の名前: nope（premise 相対解決 §3.4）
- `j03` ERR: KairosError 未解決の名前: nope（premise 相対解決 §3.4）
- `j04` OK: 90 点
- `j05` ERR: KairosError 未解決の名前: nope（premise 相対解決 §3.4）
- `j06` OK: 48 点
- `j07` OK: 24 点
- `j08` ERR: KairosError 論理値ではない: point
- `j09` ERR: KairosError 論理値ではない: number
- `j10` ERR: KairosError 論理値ではない: string
- `j11` ERR: KairosError 等値比較の両辺の型が異なる: 時点 と undefined（比較は同じ型どうし。§4.9）
- `j12` ERR: KairosError 時間ストリームではない: number
- `j13` OK: 90 点
- `j14` ERR: KairosError 時点ではない: windows
- `j15` OK: 3 点
- `j16` ERR: KairosError 時点ではない: undefined

#### at

- `a01` OK: 2 点
- `a02` ERR: KairosError at: 窓付き入力は取らない——展開形は入力の窓を引き継がない（通し数えや選択子の型エラーに化ける）。窓は at の後で切る: … ｜> at(Thh:mm) ｜> within(…)（外延同値。ADR-51 追記）
- `a03` OK: 0 点
- `a04` ERR: KairosError at: 引数は単独時刻リテラル（Thh:mm）のみ——日付つきの錨は前方専用で anchor より前の点が黙って空になる（anchor 引数形は不採＝ADR-51 判断 8）。日の調整は日の層で: shift(±k, unit: day) ｜> at(Thh:mm)
- `a05` OK: 2 点
- `a06` OK: 2 点

#### external

- `x01` ERR: SupplyError 供給エラー: 解決子がない——external H.hol（source: "x"）は解決できない（ADR-46 判断 7 (a)）
- `x02` ERR: SupplyError 供給エラー: 解決子がない——external H.hol（source: "x"）は解決できない（ADR-46 判断 7 (a)）
- `x03` ERR: KairosError external の kind: は dates ｜ instants（整列の主張＝字面クラスの宣言。ADR-46）
- `x04` ERR: KairosError external は named-arg のみを取る（kind: が必須。ADR-46）
- `x05` ERR: SupplyError 供給エラー: 解決子がない——external H.hol（source: "x"）は解決できない（ADR-46 判断 7 (a)）

#### stdlib

- `t30` OK: 3 点
- `t31` OK: 7 点
- `t32` OK: 0 点
- `t33` OK: 0 点
- `t34` OK: 90 点
- `t35` OK: 3 点

#### 字句

- `l01` UNGOV: RangeError Maximum call stack size exceeded
- `l02` OK: 90 点
- `l03` ERR: LexError 字句エラー(3:9): 不明な文字: "　"
- `l04` OK: 3 点
- `l05` OK: 3 点
- `l06` OK: 3 点
- `l07` ERR: LexError 字句エラー(3:36): 文字列リテラルが閉じていない（改行は含められない。ADR-32）
- `l08` ERR: LexError 字句エラー(3:25): 文字列リテラルが閉じていない（改行は含められない。ADR-32）
- `l09` ERR: KairosError 不正な tz 名: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
- `l10` ERR: KairosError 時間ストリームではない: number
- `l11` ERR: ParseError 構文エラー(3:9): { を期待（'=' の位置）
- `l12` OK: 90 点
- `l13` ERR: ParseError 構文エラー(3:36): 式を期待（')' の位置）
- `l14` OK: 3 点
- `l15` ERR: KairosError nth: 未知の名前付き引数 n:（黙って捨てない——ADR-39）
- `l16` ERR: ParseError 構文エラー(3:45): 名前付き引数 on: の二重指定（':' の位置）
- `l17` ERR: KairosError roll: 未知の名前付き引数 axis:（黙って捨てない——ADR-39）
- `l18` OK: 90 点

#### CLI

- `n30` TIMEOUT（next 1s 刻み・地平線 1 年（資源））: 
- `n31` EXIT1（next 本体式 2 つ）: next は本体式 1 つのファイル向け（2 式ある——list を使うか式を 1 つに）
- `n32` OK（next 遠い将来）: ・stdout 1 行
- `n33` EXIT2（next 地平線内に不足）: ⚠ 地平線 2 年以内の発火は 2 件（要求 3 件）
- `n34` EXIT1（next external 供給なし）: external は premise 束縛の右辺（先頭）でのみ書ける（source: 統治が premise に要る——本体層・top-level 束縛は不可。ADR-46）
- `n35` OK（next from 実在しない日）: ・stdout 1 行
- `n36` OK（next 地平線 1000 年）: ・stdout 1 行
- `n37` OK（next 9999 年越え）: ・stdout 1 行
- `c30` OK（json（警告なし・正常））: ・stdout 21 行
- `c31` OK（--tz と premise tz の差）: ・stdout 1 行
- `c32` OK（--tz 固定オフセット）: ・stdout 1 行
- `c33` OK（--tz 略称）: ・stdout 1 行
- `c34` EXIT1（--from 時刻付き）: 日付は YYYY-MM-DD: 2026-01-01T00:00
- `c35` OK（100 年窓）: ・stdout 1200 行


## 三巡目（2026-09-30）——Kyureki（供給つき）・Playground 経路・`--json` の形・供給の巨大入力・細粒度・軽微（文言）

二巡目の引き継ぎに挙げた 5 層を回した。対象は修正前の 1.0.5 準備版（二巡目の処置後・714 テスト）。

**方法と件数**

| 層 | 道具 | 件数 | 見るもの |
|---|---|---|---|
| Kyureki（テーブル版 27・供給版 19）・供給契約 39・細粒度 17・CLI 経由の供給 35 | `cases3.mjs`＋`run.mjs` | 137 | 分類（OK／ERR／UNGOV／TIMEOUT／終了コード）と値 |
| Playground 経路（評価器） | `ENGINE=playground/js/index.js`＋`run.mjs` | 一巡目・二巡目の本体 215＋三巡目の本体 102 | impl との差（分類・点数・先頭と末尾・文言・警告） |
| Playground 経路（UI 層） | `pg-ui.mjs`（DOM の代役で `core.js` を駆動） | 64 項目 | プリセット日英 10 本・入力の境界・URL 固定と復元 |
| `--json` の形 | `json-invariants.mjs`（CLI を子プロセスで・パイプ越し） | 30 本 | CliReport の不変条件（下記） |
| 再測 | `probe5.ts`・`probe6.ts` | — | 狭い窓・日付マーカー・covering の巨大年と区間数・tz の違い・最終窓 |

**集計（三巡目の 137 件・修正前）**: OK 58・ERR 49・UNGOV 5・TIMEOUT 1・EXIT1 23・EXIT2 1。
**修正後**: OK 56・ERR 58・EXIT1 22・EXIT2 1（UNGOV・TIMEOUT 0）。Playground 評価器との差は 0 件（一巡目・二巡目の本体 215 件＝修正前／
三巡目の本体 102 件＝修正後）。
`--json` の不変条件は 30 本で違反 0 件（修正前の違反は F137／F139 の 1 本だけ）。

### 修正した綻び（1.0.5 に同乗・witness は boundary-checklist.test.ts の三巡目 describe・変異試験 26 本とも赤）

**統治外エラー**

- **F136** `covering:` の区間リストが 13 万個を越えると RangeError（被覆サマリの登録が `Math.max(...)` のスプレッド）。
  テーブル字面・供給値の両方。→ 畳み込みで最大を取る。
- **F137** 配列に入らない点数の実体化が RangeError（Invalid array length）——`strideBy(0.001s, …)` は計算範囲の端までで
  約 346 億点。→「strideBy: 点が多すぎて実体化できない（…約 N 個——参照実装の配列の上限。…言語の上限ではない）」。
  上限は置かない裁定（2026-09-29）のまま＝配列に入らないと分かる個数（2^32−1 超）は実体化の前に、その手前で処理系が
  落ちた場合は落ちた時点で診断にする。`grid` の経過時間幅も同じ。
- **F146** Playground の「URL に固定」が 130 KB 前後の定義で RangeError（`String.fromCharCode(...全バイト)` のスプレッド）。
  例外が外へ出てボタンが黙って何もしない。→ 小分けにして変換（1,000 KB まで復元一致を確認）。

**偽エラー（正しい定義が、評価範囲の取り方で落ちる）**

- **F144** `朔テーブル |> snapTo(day)` をマーカーにした `segmentBy(labels:)` が、狭い評価窓で「ラベル列の長さ 38 ≠ 窓数 37」。
  朔が計算範囲（to+400 日）で切られるため。**同梱の例で再現する**——`kairos list --from 2026-10-01 --to 2026-11-01
  examples/rokuyo.kairos`（来月の大安）がこのエラーで止まった。90-open の実装宿題（2026-08-26 採録）と同じ面。覆域より
  400 日以上前の窓は「segmentBy: マーカーが空」になった（覆域より後の窓は 0 点＋註釈で通る＝非対称）。
  → 市民日への `snapTo` は、計算範囲の先の点も日の先頭へ解析的に寄せる（日の先頭は実体化なしで決まる）。マーカーが
  欠けなくなるので同長性検査は評価範囲によらず正確（spec §4.2 の「覆域基準＝評価範囲非依存」に実装が追いついた）。
  狭い窓のたびに出ていた `horizon-clip: snapTo` 警告も出なくなる。月など日以外の窓への `snapTo` は従来どおり
  クリップ＋警告（ADR-37 判断 8）——既存 witness 2 本はその形へ差し替えた。
- **F145** `empties: error` が、計算範囲の先・1970 年より前に掛かる窓を「空窓がある」と誤判定。日付テーブルをそのまま
  マーカーにする形（期の開始日の表・元号の表）で、狭い窓や 1970 年以前から始まる表が偽エラーになった。
  → 生成子由来の入力（実体化が [紀元, to+400 日) に限られる）では、その範囲に収まる窓だけを判定する。範囲の内側の
  空窓は従来どおり止まる。

**黙って通る形**

- **F138** 市民日の幅の非整数——`strideBy(1.5d, …)` は黙って 3 日ごと、`0.5d` は 1 日ごと（添字が非整数で点が欠落）。
  `chronos grid 1.5d` も同じ。→ 字句エラー「市民日の幅は整数」（半日は `12h`）。spec §5.5 明文（日英）。
- **F139** ms 未満の幅と字面——`strideBy(24h39m35.2444s, …)` の点が非整数の epoch ms になる・`T00:00:00.0004` は黙って
  丸め。→ 字句エラー「幅は 1 ms の整数倍」「秒の小数は 3 桁まで」（末尾の 0 は可）。幅の計算は十進の字面から整数 ms を
  厳密に出す（`1.1h` は 3,960,000 ms ちょうど）。spec §5.5 明文（日英）・Limits 節に分解能 1 ms。
- **F140** 時刻として表せない `instants`（±8.64e15 ms の外）が黙って通る。covering が狭いと診断の日付が NaN-NaN-NaN。
  → 契約違反「instants が時刻の表現範囲の外」。
- **F141** `covering:` の年だけの略記が 5 桁以上でも通る（`2026..10000`）。275760 を越えると端が NaN になり「要素が
  covering の外」へ誤誘導。文法は `digit4`。→「covering: 年は 4 桁の整数（0000..9999）」。供給値の covering の
  エラー（逆順・重複・年）には「契約違反: …——external 名」を添える。
- **F142** CLI の入力ファイル——BOM 付き UTF-8 の供給 JSON が「JSON が壊れている」（F119 の供給版）。UTF-16（PowerShell 5 の
  `>` と Out-File の既定）の定義・供給は「不明な文字」「JSON が壊れている」。→ BOM は読み飛ばす・UTF-16 は保存し直しを
  案内・読めないファイルは「--supply のファイルが読めない: パス（ENOENT…）」とどの引数かを添える。
- **F143** 解決子が Promise を返す（async 関数を渡す）と「契約違反: covering がない」へ誤誘導。文字列・配列を返しても
  同じ。Error でない値の throw は文言が「undefined」。→ 供給エラーで名指し（「解決子が Promise を返した」
  「解決値がオブジェクトでない」）。

### 文言（軽微 7 のうち 6 件と、今回の 3 件）

- 軽微 11 `wkst: Xyz` →「未解決の名前: Xyz…——前文メンバー wkst: の値が解決できない」。
- 軽微 12 calendar-system が無い／premise でない →「未解決の名前: day…——在圏の前文に calendar-system: の宣言が無い」
  「calendar-system: Nonsense という premise は無い」。
- 軽微 13 引数の誤りは日本語（「未知のオプション: --bogus」「オプション -n の値が無いか、- で始まっている」）。`--lang en` は原文。
- 軽微 14 サブコマンド省略はフラグが先頭でも list。`--help`／`-h` は使い方を stdout に出して終了 0。
- 軽微 15 `takeLast` は入力そのものが空なら horizon-clip 警告を出さない（実体化下限で切れた不足は従来どおり警告）。
- 軽微 16 `strideBy(-1s, …)` →「幅は正の量（負の幅は書けない…）」。
- 見えない文字・紛らわしい文字の「不明な文字」に符号位置と直し方（U+00A0 ノーブレークスペース・U+3000 全角スペース・
  ゼロ幅・引用符 U+201C 級・制御文字）。Web や文書からの貼り付けで混ざる形。
- 診断の長さは 2,000 字で切る（1 MB の供給値・tz 名・文字列がそのまま 1 MB の診断になっていた）。
- 軽微 17（供給の `asof` の形式）は未処置＝下の裁定待ち。

### 裁定待ち（表面・意味論の判断が要るもの。処置していない）

1. **最終窓の `last`**——覆域の端で確定する最終窓（ADR-37）に `last` を掛けると、覆域の最終日が「月末」として出る
   （旧暦の例: `lunarMonth |> last` が 2027-12-31。実際の旧十二月は 2028-01-26 まで続く）。註釈は 2028-01-01 から
   なので、その点自体には付かない。窓の所属（12/28〜31 は旧十二月）は正しいが、窓の終端は未確定——`last`・窓幅・
   `shift(unit: 窓)` が終端を読む。
2. **秒未満の点の表示形**——表示形は `YYYY-MM-DD[Thh:mm[:ss]]` で ms を印字しない。0.5 秒刻みや秒未満を持つ供給の
   instants は同じ表示形が続く（`points` は一意）。人間表示では区別できない。
3. **DST の重複時の表示形**——オフセットを印字しないので、秋の切替日は同じ壁時計が 2 回出て表示形が逆行する
   （NY 2026-11-01 の 01:30 → 01:00）。`--json` は `points` で区別できる。
4. **`results[].source` が常に空文字列**——CliReport では必須の文字列（JSON Schema を公開するなら必須項目になる）。式の字面を
   入れるか、項目の意味を定めるか（Schema を公開する前に決める）。
5. **`--json` のエラー時は JSON を返さない**——stdout は空・stderr に文言・終了 1。機械の消費側（MCP）は stderr を読む
   ことになる（機械向けの入口を設計するときの材料）。
6. **供給の `asof` の形式**（軽微 17）——`"yesterday"` も通る。日付に限るかは供給側の実態次第。
7. **covering の表示形の長さ**——区間の数に比例する（5 万区間で註釈 1 行が約 1.2 MB）。実用の覆域は数区間。

### 記録のみ（綻びではない）

- Kyureki: テーブル版と供給版は観測等価（26 点・被覆サマリ一致）。ラベルの過不足・同日 2 朔・逆順・covering 外・型の
  混在・秒で渡す誤り（1970-01-21 と出る）・朔の追加でラベルを足し忘れる形は全て統治。宣言 asof と供給 asof の不一致は
  被覆サマリに「（宣言 asof … と不一致）」。`snapTo` 抜けは kyureki.md §7 (1) の既知の落とし穴（朔当日が前月へ）。
  参照側 premise の `tz:` を変えてもデータ側の `tz:` が勝つ（内側固定）。実行 tz が違えば時刻付きで印字。
- 供給の資源: dates 100 万件（JSON 13 MB）は CLI で 0.6 秒・instants 100 万件 0.3 秒・未使用キー 10 万個 0.4 秒・
  入れ子 10 万段の JSON は「JSON オブジェクト」エラー・`__proto__` キーは無害・JSON 内の重複キーは後勝ち（JSON の規定）。
  external の無い定義に `--supply` を付けても通る（要求駆動）。同じフラグの 2 回指定は後勝ち。
- `next` と供給: 覆域の先へ探索が進むと範囲外註釈と被覆サマリ（残走路が負）が並走する。`everyDay \ h` の形は覆域外の
  点も出力し註釈が付く（判定は外部＝ADR-37）。
- `--json`: 鍵の集合と順・`dates` と `points` の同長・`points` の狭義昇順と [from, to) への包含・表示形と `points` の
  対応（Intl で独立に再計算。+05:45 の固定オフセット・45 分オフセットの IANA・UTC・9999 年を含む）・註釈のクリップと
  表示形・`runwayDays` の整数性（開端だけ null）・stderr の警告行と `warnings` の一致・`next` の `found`／`to`／
  終了コード 2・人間表示の日付行との一致・86,400 点のパイプ越しの完全性——いずれも成立。
- Playground: プリセット日英 10 本は評価される。空の定義は「（出力なし）」（CLI は「本体式がない」）。from／to が空なら
  「日付は YYYY-MM-DD: 」。`<input type=date>` の検証はブラウザ側。壊れた URL（不正な base64・s なし）はプリセットへ
  落ちる。孤立サロゲートは復元で U+FFFD になる。1 秒刻み 7 日（60 万点）でメインスレッドを 1.2 秒塞ぎ、出力は 12 MB
  （Limits 節の「上限なし」の Playground 版）。

### ケース一覧（自動生成。変わったものは「修正前 → 修正後」）

#### Kyureki

- `k01` OK: 26 点
- `k02` ERR: KairosError segmentBy: マーカーが空 **→ 修正後** OK: 0 点（註釈 1）
- `k03` OK: 0 点（註釈 1）
- `k04` OK: 4 点（註釈 1）
- `k05` ERR: KairosError segmentBy(labels:): ラベル列の長さ 38 ≠ 窓数 15（窓数は覆域基準＝マーカー数。マーカーとラベルは対で更新する——ADR-39/F62） **→ 修正後** OK: 2 点（註釈 1）
- `k06` ERR: KairosError segmentBy(labels:): ラベル列の長さ 38 ≠ 窓数 16（窓数は覆域基準＝マーカー数。マーカーとラベルは対で更新する——ADR-39/F62） **→ 修正後** OK: 1 点
- `k07` OK: 1 点
- `k08` ERR: KairosError segmentBy(labels:): ラベル列の長さ 37 ≠ 窓数 38（窓数は覆域基準＝マーカー数。マーカーとラベルは対で更新する——ADR-39/F62）
- `k09` ERR: KairosError segmentBy(labels:): ラベル列の長さ 39 ≠ 窓数 38（窓数は覆域基準＝マーカー数。マーカーとラベルは対で更新する——ADR-39/F62）
- `k10` ERR: KairosError segmentBy(empties: error): 空窓がある **→ 修正後** OK: 4 点
- `k11` ERR: KairosError segmentBy(labels:): ラベル列の長さ 39 ≠ 窓数 38（窓数は覆域基準＝マーカー数。マーカーとラベルは対で更新する——ADR-39/F62）
- `k12` ERR: KairosError segmentBy(empties: error): 空窓がある
- `k13` ERR: KairosError segmentBy(labels:): ラベル列の長さ 38 ≠ 窓数 29（窓数は覆域基準＝マーカー数。マーカーとラベルは対で更新する——ADR-39/F62） **→ 修正後** OK: 3 点
- `k14` ERR: KairosError segmentBy(labels:): ラベル列の長さ 38 ≠ 窓数 30（窓数は覆域基準＝マーカー数。マーカーとラベルは対で更新する——ADR-39/F62） **→ 修正後** OK: 3 点
- `k15` OK: 0 点（註釈 2）
- `k16` ERR: KairosError テーブルの要素が covering の外: 2024-12-31T07:27（列の全要素は covering に包含——ADR-37）
- `k17` ERR: KairosError テーブルリテラルは昇順・重複なし（§3.8 静的エラー）
- `k18` ERR: KairosError segmentBy(labels:): ラベル列は等質（同一の値型。ADR-34 判断 3）
- `k19` OK: 6 点
- `k20` OK: 0 点
- `k21` OK: 181 点
- `k22` OK: 0 点
- `k23` OK: 0 点
- `k24` ERR: KairosError takeLast: 窓付き入力は取らない——「窓ごとの最後の 1」は within の後の last で・「最後の N」は窓境界点からの shift(-k, unit: 軸) の和で（takeLast は通し数え。ADR-52）
- `k25` OK: 3 点（註釈 1）
- `k26` OK: 10 点・警告 2
- `k27` OK: 1 点（註釈 1）・警告 3

#### Kyureki供給

- `x01` OK: 26 点
- `x02` ERR: KairosError 契約違反: 解決値の点が covering の外——external Kyureki.newMoons: 1970-01-21T11:06:37（列の全要素は covering に包含——ADR-37 判断 1）
- `x03` ERR: KairosError 契約違反: instants は有限整数の epoch ms——external Kyureki.newMoons: 1735597620000.5
- `x04` ERR: KairosError segmentBy(labels:): ラベル列の長さ 38 ≠ 窓数 39（窓数は覆域基準＝マーカー数。マーカーとラベルは対で更新する——ADR-39/F62）
- `x05` OK: 26 点
- `x06` OK: 26 点
- `x07` ERR: KairosError 契約違反: 解決値の点が covering の外——external Kyureki.newMoons: 2024-12-31T07:27（列の全要素は covering に包含——ADR-37 判断 1）
- `x08` ERR: KairosError segmentBy(labels:): ラベル列の長さ 38 ≠ 窓数 10（窓数は覆域基準＝マーカー数。マーカーとラベルは対で更新する——ADR-39/F62）
- `x09` ERR: KairosError segmentBy(labels:): ラベル列の長さ 38 ≠ 窓数 10（窓数は覆域基準＝マーカー数。マーカーとラベルは対で更新する——ADR-39/F62）
- `x10` ERR: KairosError segmentBy: マーカーが空
- `x11` ERR: KairosError 契約違反: kind: instants の解決値は instants（epoch ms の列）を運ぶ——external Kyureki.newMoons
- `x12` OK: 4 点（註釈 1）
- `x13` ERR: KairosError 契約違反: covering がない——external Kyureki.newMoons（解決値は覆域の主張を必ず運ぶ。ADR-46） **→ 修正後** ERR: SupplyError 供給エラー: 解決子が Promise を返した——external Kyureki.newMoons（source: "eco.mtk.nao.ac.jp/koyomi/yoko"）。解決子は同期で値を返す（取得は run() の前に await で済ませ、結果を返す関数を渡す。ADR-46）
- `x14` ERR: SupplyError 供給エラー: 解決に失敗——external Kyureki.newMoons（source: "eco.mtk.nao.ac.jp/koyomi/yoko"）: undefined **→ 修正後** ERR: SupplyError 供給エラー: 解決に失敗——external Kyureki.newMoons（source: "eco.mtk.nao.ac.jp/koyomi/yoko"）: boom
- `x15` ERR: SupplyError 供給エラー: 解決に失敗——external Kyureki.newMoons（source: "eco.mtk.nao.ac.jp/koyomi/yoko"）: ECONNREFUSED 127.0.0.1:5432
- `x16` ERR: SupplyError 供給エラー: 解決値が無い——external Kyureki.newMoons（source: "eco.mtk.nao.ac.jp/koyomi/yoko"）
- `x17` ERR: KairosError 契約違反: covering がない——external Kyureki.newMoons（解決値は覆域の主張を必ず運ぶ。ADR-46） **→ 修正後** ERR: SupplyError 供給エラー: 解決値がオブジェクトでない——external Kyureki.newMoons（source: "eco.mtk.nao.ac.jp/koyomi/yoko"）。{dates｜instants, covering, asof [, labels]} を返す（ADR-46）
- `x18` ERR: KairosError 契約違反: covering がない——external Kyureki.newMoons（解決値は覆域の主張を必ず運ぶ。ADR-46） **→ 修正後** ERR: SupplyError 供給エラー: 解決値がオブジェクトでない——external Kyureki.newMoons（source: "eco.mtk.nao.ac.jp/koyomi/yoko"）。{dates｜instants, covering, asof [, labels]} を返す（ADR-46）
- `x19` OK: 26 点

#### 供給契約

- `s50` OK: 0 点 **→ 修正後** ERR: KairosError 契約違反: instants が時刻の表現範囲の外——external H.h: 8640000000000001（epoch ms は ±8.64e15 以内。秒やマイクロ秒で渡していないか）
- `s51` OK: 0 点 **→ 修正後** ERR: KairosError 契約違反: instants が時刻の表現範囲の外——external H.h: 100000000000000000（epoch ms は ±8.64e15 以内。秒やマイクロ秒で渡していないか）
- `s52` OK: 0 点
- `s53` OK: 0 点 **→ 修正後** ERR: KairosError 契約違反: instants が時刻の表現範囲の外——external H.h: 9007199254740991（epoch ms は ±8.64e15 以内。秒やマイクロ秒で渡していないか）
- `s54` ERR: KairosError 契約違反: instants は有限整数の epoch ms——external H.h: Infinity
- `s55` ERR: KairosError 契約違反: instants は有限整数の epoch ms——external H.h: NaN
- `s56` OK: 0 点
- `s57` ERR: KairosError 契約違反: instants は有限整数の epoch ms——external H.h: 1767193200000
- `s58` OK: 0 点
- `s59` OK: 0 点
- `s60` OK: 0 点
- `s61` ERR: KairosError 契約違反: 日付の形式が不正——external H.h:  2026-01-05（"YYYY-MM-DD"）
- `s62` ERR: KairosError 契約違反: 日付の形式が不正——external H.h: 2026-01-05
- `s63` ERR: KairosError 契約違反: 日付の形式が不正——external H.h: ２０２６-01-05（"YYYY-MM-DD"）
- `s64` ERR: KairosError 契約違反: 日付の形式が不正——external H.h: 20260105（"YYYY-MM-DD"）
- `s65` ERR: KairosError 契約違反: 日付の形式が不正——external H.h: null（"YYYY-MM-DD"）
- `s66` ERR: KairosError 契約違反: kind: dates の解決値は dates（"YYYY-MM-DD" の列）を運ぶ——external H.h
- `s67` ERR: KairosError 契約違反: covering がない——external H.h（解決値は覆域の主張を必ず運ぶ。ADR-46）
- `s68` ERR: KairosError 契約違反: covering が読めない——external H.h: 構文エラー(1:5): .. を期待（'eof' の位置）
- `s69` ERR: KairosError covering: 区間の端が逆順 **→ 修正後** ERR: KairosError 契約違反: covering: 区間の端が逆順——external H.h
- `s70` ERR: KairosError 契約違反: covering が読めない——external H.h: 構文エラー(1:4): .. を期待（'eof' の位置）
- `s71` ERR: KairosError covering: 区間リストは昇順・重複なし（ADR-37 判断 9） **→ 修正後** ERR: KairosError 契約違反: covering: 区間リストは昇順・重複なし（ADR-37 判断 9）——external H.h
- `s72` ERR: KairosError 契約違反: 解決値の点が covering の外——external H.h: 2026-01-05（列の全要素は covering に包含——ADR-37 判断 1） **→ 修正後** ERR: KairosError 契約違反: covering: 年は 4 桁の整数（0000..9999）: 10000——external H.h
- `s73` ERR: KairosError 契約違反: covering がない——external H.h（解決値は覆域の主張を必ず運ぶ。ADR-46）
- `s74` OK: 1 点
- `s75` OK: 1 点
- `s76` OK: 1 点
- `s77` ERR: KairosError 契約違反: asof がない——external H.h（データの観測日はデータと一緒に来る。ADR-46）
- `s78` OK: 1 点
- `s79` ERR: KairosError 契約違反: 宣言値域の外のラベル——external H.h: 1（域外の封止＝ADR-42 判断 7 の契約版）
- `s80` ERR: KairosError 契約違反: labels 宣言つきの external にラベルが来ない——H.h
- `s81` OK: 1 点
- `s90` OK: 1 点
- `s91` OK: 1 点
- `s92` OK: 1 点
- `s93` UNGOV: RangeError Maximum call stack size exceeded **→ 修正後** OK: 1 点（註釈 15）
- `s94` OK: 1 点（註釈 15）
- `s95` ERR: KairosError 契約違反: 日付の形式が不正——external H.h: x…x
- `s96` OK: 365 点

#### 細粒度

- `f01` OK: 172800 点
- `f02` UNGOV: RangeError Invalid array length **→ 修正後** ERR: LexError 字句エラー(3:26): 幅は 1 ms の整数倍: 0.0004s（参照実装の分解能は 1 ms——ms 未満の桁は黙って丸めない）
- `f03` UNGOV: RangeError Invalid array length **→ 修正後** ERR: KairosError strideBy: 点が多すぎて実体化できない（紀元または from: から計算範囲の端 to+400 日まで約 34,646,400,000 個——参照実装の配列の上限。幅を粗くするか、from: と評価範囲を近づける。言語の上限ではない）
- `f04` UNGOV: RangeError Invalid array length **→ 修正後** ERR: LexError 字句エラー(3:26): 幅は 1 ms の整数倍: 0.0015s（参照実装の分解能は 1 ms——ms 未満の桁は黙って丸めない）
- `f05` OK: 3 点（01-01・01-04・01-07＝3 日ごと） **→ 修正後** ERR: LexError 字句エラー(3:26): 市民日の幅は整数: 1.5d（市民日は 23〜25 時間の規約幅で分数は定義しない——半日は 12h のように経過時間で書く。ADR-28）
- `f06` OK: 3 点（1 日ごと） **→ 修正後** ERR: LexError 字句エラー(3:26): 市民日の幅は整数: 0.5d（市民日は 23〜25 時間の規約幅で分数は定義しない——半日は 12h のように経過時間で書く。ADR-28）
- `f07` OK: 3 点（1 日ごと） **→ 修正後** ERR: LexError 字句エラー(2:20): 市民日の幅は整数: 0.5d（市民日は 23〜25 時間の規約幅で分数は定義しない——半日は 12h のように経過時間で書く。ADR-28）
- `f08` OK: 3 点（3 日ごと） **→ 修正後** ERR: LexError 字句エラー(2:20): 市民日の幅は整数: 1.5d（市民日は 23〜25 時間の規約幅で分数は定義しない——半日は 12h のように経過時間で書く。ADR-28）
- `f09` TIMEOUT **→ 修正後** ERR: LexError 字句エラー(2:20): 幅は 1 ms の整数倍: 0.0004s（参照実装の分解能は 1 ms——ms 未満の桁は黙って丸めない）
- `f10` OK: 2 点（註釈 2）
- `f11` OK: 2 点（註釈 1） **→ 修正後** ERR: LexError 字句エラー(3:2): 秒の小数は 3 桁まで: 2026-01-01T00:00:00.0004（参照実装の分解能は 1 ms——ms 未満の桁は黙って丸めない）
- `f12` OK: 2 点
- `f13` UNGOV: RangeError Invalid array length **→ 修正後** ERR: LexError 字句エラー(3:26): 幅は 1 ms の整数倍: 0.0000001s（参照実装の分解能は 1 ms——ms 未満の桁は黙って丸めない）
- `f14` OK: 4 点
- `f15` OK: 4 点（非整数の epoch ms） **→ 修正後** ERR: LexError 字句エラー(3:26): 幅は 1 ms の整数倍: 24h39m35.2444s（参照実装の分解能は 1 ms——ms 未満の桁は黙って丸めない）
- `f16` OK: 24 点 **→ 修正後** ERR: LexError 字句エラー(3:36): 秒の小数は 3 桁まで: 2026-01-01T00:00:00.0004（参照実装の分解能は 1 ms——ms 未満の桁は黙って丸めない）
- `f17` ERR: KairosError shift: n は整数（1.5 は不可。方向は符号で表す。§5.2）

#### CLI

- `u01`（供給つき正常） OK・stdout 4 行
- `u02`（premise 修飾キー） OK・stdout 3 行
- `u03`（重複・逆順） EXIT1: 契約違反: 解決値は昇順・重複なし——external H.h（§3.8 と同じ整列則）
- `u04`（実在しない日） EXIT1: 契約違反: 実在しない日付——external H.h: 2026-02-30（黙ったロールオーバーの封止＝ADR-43 の字句検査の解決値向け再執行。ADR-46）
- `u05`（BOM 付き UTF-8 の JSON） EXIT1: --supply の JSON が壊れている（（一時ファイル））: Unexpected token 'U+FEFF', "U+FEFF{"h":{"da"... is not valid JSON **→ 修正後** OK・stdout 4 行
- `u06`（UTF-16 LE（PowerShell 5 の > の既定）の JSON） EXIT1: --supply の JSON が壊れている（（一時ファイル））: Unexpected token 'U+FFFD', "U+FFFDU+FFFD{"h""... is not valid JSON **→ 修正後** EXIT1: --supply のファイルが UTF-16 で保存されている: （一時ファイル）——UTF-8 で保存し直す（PowerShell 5 の > と Out-File は UTF-16 になる。Set-Content -Encoding utf8 か PowerShell 7 を使う）
- `u07`（0 バイトの JSON） EXIT1: --supply の JSON が壊れている（（一時ファイル））: Unexpected end of JSON input
- `u08`（JSON が null） EXIT1: --supply は {束縛名: {dates｜instants, covering, asof}} の JSON オブジェクト: （一時ファイル）
- `u09`（JSON が配列） EXIT1: --supply は {束縛名: {dates｜instants, covering, asof}} の JSON オブジェクト: （一時ファイル）
- `u10`（空オブジェクト（キーなし）） EXIT1: 供給エラー: --supply （一時ファイル） に h がない（キーは束縛名または "premise.束縛名"——ここでは "H.h"）
- `u11`（値が null） EXIT1: --supply （一時ファイル） の "h" は {dates｜instants, covering, asof} のオブジェクト
- `u12`（dates と instants の両方） EXIT1: --supply （一時ファイル） の "h": dates / instants はどちらか一方（wire は宣言の kind と評価器が照合する）
- `u13`（dates も instants も無い） EXIT1: --supply （一時ファイル） の "h": dates / instants はどちらか一方（wire は宣言の kind と評価器が照合する）
- `u14`（covering 無し） EXIT1: --supply （一時ファイル） の "h": covering（文字列）が必須
- `u15`（asof 無し） EXIT1: --supply （一時ファイル） の "h": asof（文字列）が必須
- `u16`（キーの綴り違い） EXIT1: 供給エラー: --supply （一時ファイル） に h がない（キーは束縛名または "premise.束縛名"——ここでは "H.h"）
- `u17`（dates 10 万件） OK・stdout 33 行
- `u18`（dates 100 万件（JSON 13 MB）） OK・stdout 33 行
- `u19`（未使用キー 10 万個） OK・stdout 3 行
- `u20`（入れ子 10 万段の JSON） EXIT1: --supply は {束縛名: {dates｜instants, covering, asof}} の JSON オブジェクト: （一時ファイル）
- `u21`（__proto__ キー） OK・stdout 3 行
- `u22`（JSON 内の重複キー（後勝ち）） OK・stdout 3 行
- `u23`（--supply が存在しない） EXIT1: ENOENT: no such file or directory, open '/nonexistent/supply.json' **→ 修正後** EXIT1: --supply のファイルが読めない: /nonexistent/supply.json（ENOENT: no such file or directory, open '/nonexistent/supply.json'）
- `u24`（--supply がディレクトリ） EXIT1: EISDIR: illegal operation on a directory, read **→ 修正後** EXIT1: --supply のファイルが読めない: /tmp（EISDIR: illegal operation on a directory, read）
- `u25`（external の無い定義に --supply（未使用）） OK・stdout 1 行
- `u26`（instants に 1e400（JSON では Infinity）） EXIT1: 契約違反: instants は有限整数の epoch ms——external H.h: Infinity
- `u27`（instants が非整数） EXIT1: 契約違反: instants は有限整数の epoch ms——external H.h: 1767193200000.5
- `u28`（next が覆域端を越えて探す（2 件で尽きる）） EXIT2: ⚠ 地平線 10 年以内の発火は 2 件（要求 3 件）
- `u29`（next の答えが覆域の外に出る（everyDay \ h）） OK・stdout 6 行
- `u30`（同（--json）） OK・stdout 47 行
- `u31`（--supply 2 回） OK・stdout 3 行
- `u32`（1 MB の要素（文言の長さ）） EXIT1: 契約違反: 日付の形式が不正——external H.h: x…x
- `u33`（--supply なし（供給エラー）） EXIT1: 供給エラー: 解決子がない——external H.h（source: "x"）は解決できない（ADR-46 判断 7 (a)）
- `u34`（--supply なし（--json）） EXIT1: 供給エラー: 解決子がない——external H.h（source: "x"）は解決できない（ADR-46 判断 7 (a)）
- `u35`（定義ファイルが UTF-16 LE） EXIT1: 字句エラー(1:1): 不明な文字: "U+FFFD" **→ 修正後** EXIT1: 定義ファイルが UTF-16 で保存されている: （一時ファイル）——UTF-8 で保存し直す（PowerShell 5 の > と Out-File は UTF-16 になる。Set-Content -Encoding utf8 か PowerShell 7 を使う）
