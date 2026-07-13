# 標準 premise: Gregorian

`Gregorian` は Kairos に同梱される**透明な標準 premise**（原始的定義の根。派生元を持たない）。「透明」とは、
言語組み込みの魔法ではなく、ユーザーが書けるのと同じ原始的定義の構文（`../spec/20-premise-layer.md` §3.6）で
書かれており、中身を読めて差し替えもできる、という意味である。本書はその完全定義と各語を解説する。言語仕様
（`../spec/`）はこの `Gregorian` を「原始的定義の例」として引用するにとどめ、網羅的な説明は本書が担う。

## 1. 完全定義

```text
premise Gregorian {
  day     = chronos grid 1d                                 # 原子（連続基底 Chronos を市民日で分割）
  weekday = day cycle [Mon, Tue, Wed, Thu, Fri, Sat, Sun] anchor: 2000-01-03

  epochYear    = 1970                                       # 補助値関数（紀元年。ADR-31 の言語既定）
  monthOf      = m => m mod 12
  yearOf       = m => epochYear + m div 12
  monthLengths = leap => [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

  isLeap      = y => y mod 4 == 0 and not(y mod 100 == 0 and y mod 400 != 0)
  daysInMonth = m => monthLengths(isLeap(yearOf(m)))[monthOf(m)]
  month   = day   span daysInMonth label: (p => monthNo(p))        # 基本の括り：day を束ねる（year 非依存）
  year    = month span (_ => 12) phase: 0 label: (p => yearNo(p))  # month を 12 ずつ束ねる
  quarter = year  split (_ => [3, 3, 3, 3]) by: month       # year の従属窓

  weekStart = day |> filter(d => weekday(d) == wkst)        # wkst は利用側前文の宣言を遅延解決（§4.5）
  week      = day |> segmentBy(weekStart, edges: clip, empties: error)

  monthStart = month |> first                               # 公開境界語（選択子の再利用）
  monthEnd   = month |> last
  yearStart  = year  |> first
  # yearEnd は未定義（需要が立っていないため非対称のまま。必要なら year |> last の一行・会計年度末は
  # Fiscal の within(year) |> last で到達——fiscal.md）

  yearNo  = d => yearOf(epochOrdinal(month, d))             # 暦座標糖衣（spec §4.9）: 暦年（2026 など）
  monthNo = d => monthOf(epochOrdinal(month, d)) + 1        # 暦月（1..12）
  dayNo   = d => ordinalIn(day, month, d)                   # 暦日（1..31）
}
```

補助値関数（完全定義ブロック内の top-level 束縛＝**公開束縛**。派生からも裸名で参照できる——`Fiscal` の
`fiscalYearNo` が `yearOf` を使うのはこの継承。いずれも month の通し番号 `m` だけから計算し、`year` 窓を
参照しない）:

- `monthOf(m)` = `m mod 12` — 月位置（0＝1 月 … 11＝12 月）。
- `yearOf(m)` = `epochYear + m div 12` — その月が属する暦年（`epochYear` = 1970）。
- `monthLengths(leap)` — 12 か月の日数リスト（閏は 2 月だけ 29）。

窓序数 `m`・`n` の起点となる**紀元**は言語既定の 1970-01-01T00:00（在圏 tz）で、序数は 0 起点（`m = 0` が
1970 年 1 月。ADR-31）。`epochYear = 1970` はこの既定を引いた値。別紀元の暦法は原始的定義のメンバー
`epoch:` で基準を張り替えられる（その場合は補助値関数も紀元に合わせて書く）。

### 補足: `day` の幅は市民日（86400 秒ではない）

`day = chronos grid 1d` の `1d` は「**1 市民日**（暦の 1 日）」という幅の規約であって、`86400s`（固定秒数）ではない。
市民日は DST 切替日に 23 時間・25 時間になるなど、経過時間としての長さが一定でない（ADR-11。うるう秒は
**スコープ外**——chronos はうるう秒を持たない一様な理想化軸（UTC の各日＝86,400 秒）で、`23:59:60` は
字句エラー。ADR-33）。もし
`day` を `86400s` の固定量で刻むと、それは「**経過時間**」の幅になり、DST のたびに市民日とずれていく（ADR-12 が
UK の DST 日で「1 日後」が経過時間 24h と市民時で別の日時に化けることを検証）。`Gregorian` の `day` は
暦の日＝市民日なので、幅は物理秒でなく市民時の規約 `1d` で与える。経過時間の幅（`24h`・`86400s` 等）は
`shift` の `unit:` など別の用途で使う概念で、暦の分割には使わない。

grid の**位相**は既定で整列する——市民時幅（`d`）は在圏 `tz:` の各市民日の開始瞬間（通常日は真夜中。ADR-31 改訂）に、経過時間幅（`h`/`m`/`s`）は紀元に。
`day = chronos grid 1d` が無指定で「真夜中区切りの暦日」になるのはこの既定による。別位相が要るときだけ
`anchor:` で上書きする（ADR-31）。

## 2. 各語

| 語 | 種別 | 説明 |
|---|---|---|
| `day` | 窓（原子） | 連続基底 Chronos を幅 1 日で一様分割（`grid`）した暦の原子。 |
| `weekday` | 並列ラベル | 各 `day` に曜日ラベルを巡回で付す（`cycle`）。窓ではなくラベル。詳細は §4。 |
| `isLeap` | 値式 | 閏年判定（グレゴリオ暦の規則）。引数は暦年（値）。 |
| `daysInMonth` | 値式 | month 序数から日数を返す。閏を**値**として見る（§3）。 |
| `month` | 窓 | 基本の括り。`day` を可変個（28〜31）束ねる（`span`）。`year` に依存しない。標準ラベル＝暦月番号（ADR-42）——`month(5)`＝毎年 5 月の日々（窓インスタンス参照）。 |
| `year` | 窓 | `month` を 12 個ずつ束ねる（`span`）。`phase: 0`＝1 月始まり。標準ラベル＝暦年（ADR-42）——`year(2026)`＝2026 年の日々。 |
| `quarter` | 窓 | `year` を 3 か月ずつに割る従属窓（`split by: month`）。`year` の変化に自動追従。 |
| `week` | 窓 | WKST 位相の 7 日並列窓（月・年に非入れ子）。`weekStart`（wkst ラベル日）で day 列を区切る。`wkst` は利用側前文の宣言を遅延解決（§4.5）。 |
| `monthStart`/`monthEnd`/`yearStart` | 公開境界語 | 各窓の先頭・末尾点。選択子（`first`/`last`）の再利用で導く。生成子 `monthEnd`（暦日の月末）の正体はこれ。 |
| `yearNo`/`monthNo`/`dayNo` | 値関数（暦座標） | 点の暦座標を読む射影糖衣（spec §4.9 が予告する `epochOrdinal`＋`ordinalIn`＋補助値関数の合成）。`dayNo(d) == 11` で固定日など。 |

標準ラベルの下では `year(d)` と `yearNo(d)` が同値の二綴りになる（`month(d)`/`monthNo(d)` も同様）。
**暦座標糖衣（`yearNo` 系）が正準**——`label:` は主に窓インスタンス参照（値引数側）の資格付与
（spec §4.9・ADR-42）。特定期間の絞り込みの正準形:

```kairos
# eval: 2026-04-28..2026-05-03
@JP
month(5) & year(2026)
#=> 2026-05-01 2026-05-02
```

## 3. 依存方向と「閏は窓でなく値」

依存は**ボトムアップ集約**を主とする: `day → month → year`。`month` が基本の括りで、`year` はその 12 集約。
`quarter` だけが `year` を割る従属窓（トップダウン）。

この向きの要が「**閏は窓でなく値**」である。「2 月は 28 日か 29 日か」は `year` という**窓**への依存に見えるが、
実際は month 序数 `m` から算出できる**値**依存である（`m` → 暦年 → `isLeap`）。だから `month` を `year` 窓に依存
させる必要がなく、`month` を親（基本の括り）に置ける。もし `month` を `year` の子にすると、派生（会計暦。§6）で
`year` を `month` から束ね直すとき `month ↔ year` が循環する。閏を値と見て `month` を親に置けば、循環は最初から
生じない——これが会計暦を一行で・回避策なしに書ける根拠になる。

## 4. weekday（cycle）と WKST は別物

ここが最も誤解を招きやすい。**曜日ラベルの律動（`weekday`）と、週の開始（WKST）は独立した別概念**であり、
`Gregorian` は前者だけを持ち、後者は持たない。

| 概念 | 何を決めるか | 所属 | 普遍か文化依存か |
|---|---|---|---|
| `weekday`（cycle） | どの日が Mon/Tue/… か（曜日ラベル） | `Gregorian`（暦法純粋） | **普遍**（月曜は世界中で月曜） |
| WKST | 週が**どこで始まる**か（週窓の切れ目・「第 N 週」の起点） | premise メンバー（前文で宣言） | **文化・用途依存** |

### 4.1 リスト順は「週開始」ではない

定義の `cycle [Mon, Tue, Wed, Thu, Fri, Sat, Sun]` は月曜先頭で書かれているが、これは**巡回列**である（Mon の
次は Tue … Sun の次は Mon）。循環だから先頭に「週開始」の意味はない。決めているのは 2 つだけ：

- **巡回順** — 曜日の並び（Mon の次は Tue）。普遍。
- **位相** — `anchor: 2000-01-03`。2000 年 1 月 3 日が Mon、という普遍的事実。どの実日がどのラベルかを固定する。

`[Sun, Mon, …, Sat]` と書いても、`anchor` が同じなら**同一の暦**になる（同じ日が同じ曜日ラベルを持つ）。週開始を
表しているわけではない。

### 4.2 週の開始は WKST が決める

「週がどこで切れるか」は WKST（前文の premise メンバー。危険メンバー＝宣言必須寄り、言語既定なし）が担う。
週窓 `within(week)` の切れ目と、その窓に対する「第 N」の起点が WKST に依存する（二段依存。ADR-24）。

```text
# 同じ Gregorian（weekday ラベルは不変）でも、WKST で週窓の切れ目が変わる
@JP wkst: Mon    …|> within(week)…   # 週は Mon〜Sun
@US wkst: Sun    …|> within(week)…   # 週は Sun〜Sat
```

`weekday` ラベル（どの日が月曜か）は WKST に関係なく不変。動くのは週窓の**第 1 日**だけである。

### 4.3 「週開始」の現実（なぜ Gregorian に埋めないか）

週開始は文化・用途で割れており、唯一の正解がない：

- 一般カレンダー表示は日本もアメリカも**日曜始まり**が主流。
- ISO 8601（国際標準・ビジネス・週番号）は**月曜始まり**。
- Unicode CLDR は**ロケールごと**（US・JP は日曜、多くの欧州は月曜、中東は土曜）。
- プログラム言語の曜日**番号**は「日曜 0」の系譜（C・Unix cron・JavaScript）が多いが、ISO 準拠の新しめの API
  （`java.time`・Python の一部）は月曜始まり。「番号の起点」と「週の開始表示」は別問題。

これらの違いは「**Gregorian 暦の上の週の数え方の規約**」であって、暦法そのものではない。ゆえに `Gregorian` には
週開始を焼き込まず、WKST として用途ごとに宣言する。これは「WKST の非二択性」（`../design/90-open-questions.md`。
土曜始まりの組織も実在）と一貫する。

### 4.4 WKST が効く／効かない例

- **効く**: 「第 2 週の金曜」＝ `within(week)` の第 2 窓 → 週の切れ目が WKST で動くので結果が変わりうる。
- **効かない**: 「月の第 2 月曜」（成人の日など）＝ 月窓内で `weekday == Mon` を数える → 曜日ラベルだけで決まり
  WKST 非依存。

「第 N 週」は WKST に依存し、「第 N 月曜」（月内のその曜日の N 番目）は依存しない。混同しやすいので設計上分離して
いる。同じ理由で、糖衣 `nextWeekday(d)`（次の d 曜へ進む）も WKST 非依存である——展開先は週窓でなく前方 roll
（`roll(Following, on: d ラベル日の列)`。spec §4.8）。

### 4.5 week 窓——wkst の遅延解決で立つ

`week` は `Gregorian` の公開語だが、`Gregorian` 自身は週開始を知らない（§4.3）。定義の右辺が前文メンバー
`wkst:` を参照し、**利用側の在圏 premise で遅延解決**される（糖衣定義と同じ規則）:

```text
weekStart = day |> filter(d => weekday(d) == wkst)
week      = day |> segmentBy(weekStart, edges: clip, empties: error)
```

`wkst:` 未宣言の premise 下で `within(week)` を使うと静的エラー——「宣言必須寄り」の統治（ADR-16）がそのまま
効く。生成は `segmentBy`（区間列型）だが、weekday の巡回により網羅・無重複が I5 検査で証明できるため
`within(week)` に使える（パーティション性は生成語でなく検査で立つ）。

## 5. スコープ（Gregorian が負わないもの）

`Gregorian` は理想化された連続時間軸（Chronos）上の**数学的モデル**であり、歴史的事実は負わない:

- 1582 年グレゴリオ改暦の日付消失・重複、地域ごとの改暦時期の違い。
- うるう秒（正負とも。chronos はうるう秒を持たない一様な理想化軸＝ADR-33）、地球の自転・公転の歴史的変動。
- 暦の有効範囲（いつからいつまで妥当か）。

これらは暦法純粋（I8）な生成規則が背負う層ではない。必要なら別 premise（歴史考証版）や `asof`/`source` 注釈で
扱う。標準の `Gregorian` は綺麗な生成規則に保つ。

## 6. 派生の例: Fiscal（会計暦）

`Gregorian` を土台に `year` の括りだけ組み替えると会計暦になる（`premise → premise` の派生。詳細は
`../spec/20-premise-layer.md` §3.7）。

```text
premise Fiscal = Gregorian with {
  year = month span (_ => 12) phase: 3 label: (p => yearNo(p))   # 4 月始まり・開始暦年ラベル
}
```

`month` に触れないので暦日・月末は不動。`quarter` は継承定義（`year split by month`）が新 `year` に自動追従し、
会計四半期（Apr-Jun/…）になる。§3 で `month` を親に置いた（閏は値）おかげで、`month = Gregorian.month` のような
据え置きピンも循環回避も要らず、`year` 一行で済む。`label:` は**上書きに継承されない**（定義の一部・
ADR-42/F96）ので、年度の窓インスタンス参照（`year(2026)`＝2026 年度の日々）が要るなら明示に付け直す
——`shiftBoundary` 展開形は base の `label:` を保存する（F65）ため、付け直しがないと二形の等価が破れる。

Fiscal は標準 premise として独立の解説に昇格した——年度番号・会計月番号・変種（US 型・半期）・射程外まで
含む網羅は [fiscal.md](fiscal.md)。同じく `Gregorian` からの派生では [iso-week.md](iso-week.md)（ISO 週暦）、
データで月を切る暦法では [kyureki.md](kyureki.md)（旧暦）がある。
