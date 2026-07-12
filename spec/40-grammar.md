# Kairos 言語仕様 — 5. 文法と記号

## 5.1 記号一覧

| 記号 | 層／役 | 意味 |
|---|---|---|
| `\|>` | 両層 | 段の連結（本体層: stream → stream ／ premise 層: premise → premise） |
| `.` | 両層 | premise 修飾（`Gregorian.month`） |
| `\|` | 両層 | 結合子・和 |
| `&` | 両層 | 結合子・積 |
| `\` | 両層 | 結合子・差（U+005C。円記号 ¥ ではない） |
| `=` | 両層 | 束縛（定義） |
| `==` `!=` `<` `<=` `>` `>=` | 値式 | 比較 |
| `+ - * /` `mod` `div` | 値式 | 算術（`mod`＝剰余・`div`＝整数除算は語） |
| `and` `or` `not` | 値式 | 論理（語。記号は結合子に温存） |
| `? :` | 値式 | 三項条件 |
| `in` | 値式 | リスト所属述語 |
| `[…]` / `l[i]` | 値式 | リストリテラル／添字（0 起点）。時点要素のリストは時間ストリーム定数（§3.8） |
| `"…"` | 値式 | 文字列リテラル（改行不可・エスケープなし。TZ・出所の値。ADR-32） |
| `..` | 値式 | 日付範囲（連続日への展開糖衣） |
| `=>` | 両層 | ラムダ束縛（型記法 `->` と区別） |
| `@名前` | 前文 | premise 束の軽量参照 |
| `#` | 両層 | 行コメント |

## 5.2 本体層 core 族のシグネチャ

- `everyDay : () -> Stream` ／ `everyInstant : () -> Stream` — 暦法純粋の生成子（後者は連続基底の全点）。
- `within(w) : Stream -> Stream(partitioned)` — パーティション型窓。`w` は窓名。網羅・無重複は I5 で検査可能。
- `segmentBy(m, edges:, empties:) : Stream -> Stream(interval)` — 区間列型窓。隙間ポリシー（`edges:`/`empties:`）は
  必須（I5）。要素の所属は代表点（窓要素なら先頭点）で決まる（§3.8・ADR-26）。
- `first / nth(n) / last : Stream(windowed) -> Stream` — 窓内選択。既定は最内窓、`of: w` で対象窓を明示。窓相対（I4）。
- `filter(on: P) : Stream -> Stream` ／ `filter(x => 条件) : Stream -> Stream` — premise 述語または値式述語で間引く。
- `roll(conv, on: P) : Stream -> Stream` — 無効点を conv（Following/Preceding/Modified…）で有効点へ寄せる。`on:` は
  軸名または導出ストリーム。
- `shift(n, unit: U) : Stream -> Stream` — U 単位で n（符号つき）だけ動かす。方向は符号で表す。
- `snapTo(w) : Stream -> Stream` — 各点を属する `w` 窓の先頭点へ写す（floor。§4.4）。
- 射影（値式内）: `ordinalIn(u, w, d) : 点 -> 数値`（二窓・粒度非依存）／`epochOrdinal(u, d) : 点 -> 数値`。
  ラベルは束縛名で読む（`weekday(d)` など。`labelOf` 汎用語は廃止・点はラベルを格納しない。§4.9・ADR-27/30）。
- 結合子: `A \| B` 和／`A & B` 積／`A \ B` 差。優先度付き上書きは和・差の左結合順序適用で表す（専用記号なし）。
- ストライド（選択子と別族）: `stride(n, from:)` 入力カウント（**入力の点**を n ごと・軸引数なし・
  n は 1 以上の整数＝ADR-38）／`strideBy(w, from:)` 幅刻み（複数軸の物理量）。起点 `from:` は必須
  （ADR-31。数え起点は from: 以上の最初の入力点）、リセットは既定しない。
- 窓所属の述語（射影一族・§4.9）: `coincides(S, w, d)`＝点 d の属する w 窓に S の点が在るか
  （論理値。証人規則・tz 名検査＝ADR-38）。

## 5.3 premise 層のシグネチャ

**原始的定義の窓生成語**（名は確定。§5.4）:

- `grid(w) : Chronos -> Stream(partitioned)` — 連続軸を幅 `w` で一様分割（暦の原子）。位相は既定整列
  （市民時幅＝各市民日の開始瞬間〈通常日は tz 真夜中〉・経過時間幅＝紀元）、`anchor:` で上書き（ADR-31）。
- `span(n => 個数) : Stream -> Stream(partitioned)` — 細かい単位を束ねる（ボトムアップ）。`n` は生成中の窓の序数
  （紀元起点・0 起点。紀元は言語既定 1970-01-01・メンバー `epoch:` で上書き可＝ADR-31）。位相は `phase:`。
- `split(y => [幅…]) by: u : Stream(windowed) -> Stream(partitioned)` — 親窓を単位 `u` の可変幅で割る（トップ
  ダウン）。幅総和＝親（I5）。
- `cycle(labels) anchor: r : Stream -> Stream(labeled)` — 並列反復ラベル。窓でなくラベルを生む。周期長・適用先は
  任意、`anchor:` は属する対象窓が先頭ラベル。束縛名は点→ラベルの値関数として読める（ADR-27）。
- 公開語は premise ブロック top-level の束縛（`Gregorian.month`）。境界は選択子の再利用（`monthStart = month |> first`）。
- **テーブルリテラル**（§3.8・ADR-26）: 時点リストは時間ストリーム定数。`covering:` で有効範囲、`labels:` で
  並行ラベル列（点→ラベル射影の定義。ADR-30）。
- premise 束縛の右辺には本体層のストリーム式も書ける（層またぎ。`week` の定義が例。§3.6）。

**派生的定義**:

- `Base with { w = … } : premise -> premise` — base の公開語を上書き/追加。裸名は派生スコープで再解決、`Base.w` は
  base 値にピン（機構 A）。継承語は依存する上書き語に自動追従。
- `\|> shiftBoundary(δ, on: W, unit: U) : premise -> premise`（仮称） — 窓 `W` の切れ目を単位 `U` で δ ずらす糖衣。
  展開は `W = U span (_ => k) phase: (φ₀+δ) mod k`（`k`＝`W ⊃ U` の個数、`φ₀`＝base の位相。負の δ も法で正規化＝F65）。base の `label:` は保存。`k` 可変組は射程外。日付は不動。

**糖衣定義**（専用構文なし＝既存の `=` 束縛）:

- `name(引数) = s => s |> core列`（基底 B）／前段が素直なら `s =>` を省くポイントフリー略記（A・eta 簡約）。
- 宣言印なし（糖衣性は依存解析で自動判定、core 語再定義は静的エラー）。premise は焼き込まず遅延解決。展開＝右辺の
  機械的差し込み（core への片方向）。

## 5.4 命名の確定状況

**確定**（2026-07-07・RC2 時点＋ADR-31/32）: 窓生成語 `grid`／`span`／`split`／`cycle`、引数
`anchor:`／`phase:`／`by:`／`from:`（stride 一族で必須）、メンバー `epoch:`（紀元）、文字列リテラル `"…"`、
派生の `with`（以上 RC1・40-examples の表現力検証で綻びなし）。基底の字句名 **`chronos`**（`day = chronos grid
1d`。型名も `Chronos`）と操作軸の **`axis:`**——両者の二義は ADR-29 で解消し、双方を正式名に確定。射影一族の
**`ordinalIn`／`epochOrdinal`／`snapTo`** と付与・データ側の **`label:`／`labels:`／`covering:`**——内部設計の
確定（ADR-30）と綻び出し（`40-examples/04-projections.md`・F34〜F42）で名への綻びが出なかったため RC2 で確定。
本体層の記号・演算子名（`|>`・`within`・`segmentBy`・`roll`・`shift`・`stride`・`strideBy`・`filter`・選択子・
結合子）も確定。日付・幅リテラルの字句は ADR-28 で確定（§5.5）。

**確定（2026-07-09・F51 の一括確定＝設計者裁定）**: `nonWorking`（実体の予約公開語・§3.9）・
`coincides`（窓所属述語・§4.9。比較候補 `hits`/`anyIn`/`sharesWindow` は不採用）・`rebase`（再錨・
§4.4。比較候補 `relabel`/`sameDate` は不採用）・`bizOpen`/`bizClose`/`isOpen`（標準導出・§3.9.1）は
**そのまま正式名に確定**。営業時間の供給の対は **`sessionOpens`/`sessionCloses` に改名して確定**
（旧仮称 `opens`/`closes`——一般英単語で偶然の同名束縛との衝突面が広いため。ADR-41 改訂）。
いずれも実戦使用（16〜35 ファイル）で名への綻びなし。

**仮称のまま**（綻び・多義の懸念が残る語）:

- `shiftBoundary` — `k` 可変組の射程外問題（§3.7）と連動。別演算子を導入する場合に名の対称性を再考する余地を
  残すため 1.0 送り（2026-07-09 の一括確定でも据え置き継続——唯一の残存仮称）。

## 5.5 字句（ADR-28）

- **日付リテラル**: `YYYY-MM-DD`（日）・`YYYY-MM-DDThh:mm(:ss(.f+)?)?`（時刻付き）。**TZ 指定子は持たない**——
  錨は在圏 premise の `tz:` が打つ（I6）。同じリテラルが premise により基底上の別の点を指すのは仕様。
  **日付部の値域は字句エラー**（ADR-43＝F66 (a)）: 月は 01..12・日は月と閏年規則（proleptic
  Gregorian・premise 非依存）の実在日のみ——`2026-02-30` は字句層で拒否（黙ったロールオーバーはしない）。
  時刻部の桁域は `hh` = 00..23・`mm`/`ss` = 00..59（**`23:59:60` は字句エラー**＝うるう秒はスコープ外。
  ADR-33）。時刻付きリテラルが在圏 tz の DST の隙間・重複に落ちる場合はエラー（「存在して一意」の要求。
  ADR-33——tz データに相対なので静的とは限らない）。
- **文字列リテラル**: `"` から次の `"` まで（改行を含めない・エスケープ列なし＝引用符を含む文字列は将来拡張。
  ADR-32）。`tz:`・`source:` のメンバー値に使う。`tz:` の値域は IANA tzdb の地域識別子・固定オフセット表記・
  `"UTC"`（ADR-33）。**固定オフセット表記は厳格一意形のみ**（ADR-43＝F66 (b)）: `"±HH:MM"`
  （ゼロ埋め必須・HH＝00..14・MM＝00..59）。`"+9:00"`・`"+0900"`・`"Z"`・`"UTC+9"` 級は字句エラー
  （tz 名の等値がリテラル字面の等値〈ADR-36〉であるための一意性）。
- **幅リテラル**: `数値＋単位` の並び。`d`＝市民日（規約幅）、`h`/`m`/`s`＝経過時間。複合（`24h39m35.244s`）は
  経過時間内のみ。市民時と経過時間の混合（`1d12h`）は静的エラー（規約集合 ADR-12 をまたぐ幅は不定義）。
- **数値**: 整数・小数。**識別子・列挙ラベル**: Unicode 文字を許す（`甲`・`子` 等の漢字ラベル可）。予約記号
  （`|> . | & \ = => < > [ ] ( ) { } : , ? @ #`）と空白は識別子に使えない。
- **コメント**: `#` から行末まで。
- **文の区切りと継続**（ADR-44）: 文（束縛・premise メンバー・本体式）の区切りは改行。ただし
  (1) 丸括弧・角括弧が閉じていない間の改行、(2) 行末または行頭が段接続 `|>` か結合子
  `|`・`&`・`\` のときは前行の継続（文は結合子で始まれないため一義）。継続記号は持たない。

## 5.6 文法（EBNF）

構造は確定・一部の語は仮称（§5.4）。EBNF 上も仮称の語はその名で書く。糖衣（`a..b` 範囲、ポイントフリー略記）は
展開で core に消える。

```ebnf
(* ---- プログラム ---- *)
program        = { statement } ;
statement      = premise-def | preamble | binding | stream-expr ;

(* ---- premise 層 ---- *)
premise-def    = "premise" , name , ( premise-block | "=" , premise-expr ) ;
premise-expr   = name , [ "with" , premise-block ] , { "|>" , stage } ;
premise-block  = "{" , { member | binding } , "}" ;
member         = member-key , ":" , value-expr ;
member-key     = "calendar-system" | "calendar" | "axis" | "roll" | "granularity"
               | "tz" | "wkst" | "asof" | "source" | "epoch" ;
                 (* epoch は原始的定義ブロック専用（利用側前文には置けない。ADR-31） *)

(* 前文（独立の文。以降の文を次の前文まで統べる。§3.2） *)
preamble       = ( "@" , name , { member } )            (* 軽量形＋後置畳み込み *)
               | ( "premise" , premise-block )          (* 完全形インライン *)
               | ( "@" , name , "{" , { statement } , "}" ) ;   (* ブロック形（範囲の明示） *)

(* ---- 束縛（公開語・糖衣・値関数が同じ機構） ---- *)
binding        = name , [ "(" , params , ")" ] , "=" , rhs ,
                 [ "covering" , ":" , covering-list ] ;  (* 束縛後置＝合成の明示被覆主張（ADR-37 判断 5）。
                                                            rhs がテーブルリテラル単体のときはテーブルの
                                                            属性と同義 *)
params         = param , { "," , param } ;
param          = name | named-param ;
named-param    = param-key , ":" , name ;
rhs            = lambda | stream-expr | gen-expr | value-expr ;

(* ---- 本体層 ---- *)
stream-expr    = pipe-expr , { combine-op , pipe-expr } ;     (* 同一優先度・左結合 *)
combine-op     = "|" | "&" | "\" ;
pipe-expr      = stream-atom , { "|>" , stage } ;
stream-atom    = table-literal | ( name | qualified ) , [ "(" , args , ")" ] | "(" , stream-expr , ")" ;
                 (* qualified 適用＝修飾ピンの頭位置適用（Gregorian.year(2020)。ADR-42） *)
stage          = ( name | qualified ) , [ "(" , args , ")" ] ;
qualified      = name , "." , name ;
args           = arg , { "," , arg } ;
arg            = named-arg | lambda | stream-expr | value-expr ;
named-arg      = param-key , ":" , ( lambda | stream-expr | value-expr ) ;
param-key      = "on" | "unit" | "of" | "from" | "edges" | "empties"
               | "by" | "anchor" | "phase" | "covering" | "label" | "labels" ;

(* ---- premise 層の窓生成（中置） ---- *)
gen-expr       = operand , gen-word , gen-arg , { named-arg } ;
operand        = name ;                                  (* chronos・day・month・year 等 *)
gen-word       = "grid" | "span" | "split" | "cycle" ;
gen-arg        = width-literal | lambda | list-literal | name | "(" , lambda , ")" ;

(* ---- 値式 ---- *)
value-expr     = ternary ;
ternary        = or-expr , [ "?" , value-expr , ":" , value-expr ] ;
or-expr        = and-expr , { "or" , and-expr } ;
and-expr       = unary-not , { "and" , unary-not } ;
unary-not      = [ "not" ] , comparison ;                (* not(x) の関数形も可 *)
comparison     = additive , [ comp-op , additive ] ;
comp-op        = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" ;
additive       = multiplicative , { ( "+" | "-" ) , multiplicative } ;
multiplicative = unary , { ( "*" | "/" | "mod" | "div" ) , unary } ;
unary          = [ "-" ] , postfix ;
postfix        = atom , { "[" , value-expr , "]" | "(" , args , ")" } ;
atom           = number | date-literal | width-literal | string-literal | name | qualified
               | list-literal | "(" , value-expr , ")" ;
lambda         = ( name | "_" | "(" , params , ")" ) , "=>" , ( value-expr | stream-expr ) ;

(* ---- リスト・テーブル ---- *)
list-literal   = "[" , [ list-elem , { "," , list-elem } ] , "]" ;
list-elem      = value-expr | date-range ;
date-range     = date-literal , ".." , date-literal ;    (* 連続日へ展開される糖衣 *)
table-literal  = list-literal , [ "covering" , ":" , covering-list ] ,
                 [ "labels" , ":" , list-literal ] ;     (* 要素が時点ならストリーム定数（§3.8）。
                                                            labels: は並行ラベル列（ADR-30） *)
covering-list  = covering-range , { "," , covering-range } ;   (* 区間リスト＝中抜けの申告（ADR-37） *)
covering-range = [ covering-edge ] , ".." , [ covering-edge ] ; (* 端の省略＝開端（完結主張）。
                                                                   ".." 単独＝全域完結。ADR-37 判断 9 *)
covering-edge  = date-literal | digit4 ;                 (* 年だけの略記可 *)

(* ---- 字句（§5.5） ---- *)
date-literal   = digit4 , "-" , digit2 , "-" , digit2 ,
                 [ "T" , digit2 , ":" , digit2 , [ ":" , digit2 , [ "." , digits ] ] ] ;
width-literal  = civil-width | elapsed-width ;
civil-width    = digits , "d" ;
elapsed-width  = [ digits , "h" ] , [ digits , "m" ] , [ digits , [ "." , digits ] , "s" ] ;
number         = digits , [ "." , digits ] ;
string-literal = '"' , { ? " と改行以外の任意文字 ? } , '"' ;   (* エスケープなし。ADR-32 *)
name           = letter , { letter | digit } ;           (* letter は Unicode 文字（漢字可） *)
comment        = "#" , { ? 行末までの任意文字 ? } ;
```

注記: 列挙ラベル（`Mon`・`甲`・`Following`）は字句上 `name` と同じで、意味論（在圏 premise の解決）で区別する。
`table-literal` と `list-literal` は同一構文で、型が要素で決まる（ADR-26）。`labels:` のラベル列は時点列と同長
（意味論検査。ADR-30）。演算子の優先順位は上の生成規則の入れ子がそのまま定義（結合子は同一優先度・左結合、
`&` 混在は括弧必須の規約を検査で課す。§4.5）。前文（preamble）は文法上独立の文で、束縛・本体式はその下に並べて
よい（§7.5 の祝日カスケードが例）。効力は次の前文まで（§3.2）——これは文法でなくスコープ規則。危険メンバーが
未解決のまま評価に至る本体式は静的エラー（§3.3——同じく文法でなく統治の検査）。

## 5.7 未確定事項

未確定事項・宿題の**正本は `../design/90-open-questions.md`**（構文レベルの詳細は `../design/30-syntax/00-syntax-draft.md` §4）。
本仕様の範囲では、`shiftBoundary`（名と、`k` 可変組の射程外を扱う別演算子）・`of:` の匿名窓ラベル付け・
外部供給宣言（socket）が未確定として残る。いずれも意味論を変えない
（純命名または追加拡張。DoD の分類は `../design/90-open-questions.md` 冒頭）。
