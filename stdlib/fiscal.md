# 標準 premise: Fiscal

`Fiscal` は Kairos に同梱される**透明な標準 premise**（会計暦・4 月始まり）。[Gregorian](gregorian.md) を
土台にした**派生的定義**（`premise → premise`。`../spec/20-premise-layer.md` §3.7）であり、原始的定義の根では
ない。「透明」とは、言語組み込みの魔法ではなく、ユーザーが書けるのと同じ派生の構文
（[`with`](../reference/with.md)）で書かれており、中身を読めて差し替えもできる、という意味である。言語仕様
（`../spec/`）は会計暦を「派生的定義の例」として引用するにとどめ（spec §3.7・`../spec/90-examples.md` §7.3）、
網羅的な説明は本書が担う。標準が 4 月始まりを選ぶのは日本の年度（国の会計年度は 4 月 1 日〜翌年 3 月 31 日。
財政法第 11 条）の規約であり、他の開始月は同じ形の派生を各自一行で書く（§6）。公開語の名（`fiscalYearNo`
など）は premise 公開語なので統治は軽く、仮のまま 1.0 で一括確定する流儀に従う（言語の**記述語**の命名確定
状況は spec §5.4——premise 公開語はその表の外）。

## 1. 完全定義

```text
premise Fiscal = Gregorian with {
  year = month span (_ => 12) phase: 3 label: (p => yearNo(p))   # 暦月を 4 月始まりで 12 ずつ束ね直す
                                                            # （ラベル＝開始暦年＝年度番号。上書きはラベルを
                                                            #   継承しない——同時付与が統治。ADR-42/F96）

  fiscalYearNo  = d => yearOf(epochOrdinal(month, d) - 3)   # 年度番号（開始暦年の規約。「2026 年度」= 2026）
  fiscalMonthNo = d => ordinalIn(month, year, d)            # 会計月番号（4 月 = 1 … 3 月 = 12）
}
```

上書きは `year` の**一行**である。`span` の窓序数は**紀元**——言語既定の 1970-01-01T00:00（在圏 tz）・0 起点
（ADR-31）——から数えるので、`phase: 3` は「束ね始めを月序数 3（= 1970 年 4 月）に置く」の意。以降の切れ目は
毎年 4 月 1 日になる。残る二語は読み取り用の**値関数**（追加語）。右辺の `yearOf` は Gregorian の公開束縛
（gregorian.md §1 の完全定義に含まれる補助値関数）を裸名で参照し、[`epochOrdinal`](../reference/epochOrdinal.md)・
[`ordinalIn`](../reference/ordinalIn.md) は言語の射影一族の記述語である（ADR-27）。

この定義は同梱ソース [`../impl/stdlib/fiscal.kairos`](../impl/stdlib/fiscal.kairos) そのものであり、前文で
`calendar-system: Fiscal` と書けば宣言なしで使える。`year` の上書きだけなら、糖衣
[`shiftBoundary`](../reference/shiftBoundary.md)（**仮称**。言語で唯一の仮称語）でも書ける:

```text
premise Fiscal = Gregorian |> shiftBoundary(+3, on: year, unit: month)   # year 一行と同じ展開（仮称）

# 展開規則: shiftBoundary(δ, on: W, unit: U)  ≡  W = U span (_ => k) phase: ((φ₀ + δ) mod k)
#   （負の δ も法で正規化＝F65。base の label: は保存＝F96——§1 の label: 同時付与と等価が立つ根拠）
#   ここでは k = 12（year ⊃ month の個数）・φ₀ = 0（Gregorian の year の位相）・δ = +3
```

## 2. 各語（何が変わり・何が変わらないか）

| 語 | 種別 | 説明 |
|---|---|---|
| `year` | 窓（**上書き**） | 暦月を 4 月始まりで 12 ずつ束ね直す（`phase: 3`）。切れ目は毎年 4/1。標準ラベル＝開始暦年（`year(2026)`＝2026 年度の日々・ADR-42）。 |
| `fiscalYearNo` | 値関数（追加） | 点の**年度番号**。開始暦年の規約（「2026 年度」= 2026。§5）。 |
| `fiscalMonthNo` | 値関数（追加） | **会計月番号** 1..12（4 月 = 1 … 3 月 = 12）。`ordinalIn` の再利用。 |
| `quarter` | 窓（継承・**自動追従**） | 継承定義 `year split (_ => [3, 3, 3, 3]) by: month` が新 `year` に追従し、会計四半期（Apr–Jun/Jul–Sep/Oct–Dec/Jan–Mar）になる（§3）。 |
| `yearStart` | 公開境界語（継承・**自動追従**） | 継承定義 `year \|> first` が新 `year` に追従 → 4 月 1 日群。 |
| `day` / `month` / `week` / `weekday` | 窓・ラベル（継承・不動） | 暦日・暦月・週・曜日は Gregorian のまま（§4）。 |
| `monthStart` / `monthEnd` | 公開境界語（継承・不動） | 暦月の月初・月末。年度の切れ目に影響されない（§4）。 |
| `yearNo` / `monthNo` / `dayNo` | 値関数（継承・不動） | **暦**座標の糖衣（gregorian.md §2）。定義が `year` 窓でなく `month` 序数を参照するため追従しない——`yearNo` は暦年であって年度ではない（年度は `fiscalYearNo`）。 |

各会計年度の初日は 4 月 1 日群になる:

```kairos
# eval: 2025-01-01..2028-01-01
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
everyDay |> within(year) |> first
#=> 2025-04-01 2026-04-01 2027-04-01
```

末日は 3 月 31 日群（4/1 の前日）:

```kairos
# eval: 2025-01-01..2028-01-01
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
everyDay |> within(year) |> last
#=> 2025-03-31 2026-03-31 2027-03-31
```

`fiscalMonthNo` は「第 12 会計月」＝翌暦年の 3 月を選び出せる（FY2026 の第 12 会計月の月初は 2027-03-01）:

```kairos
# eval: 2026-04-01..2027-04-01
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
everyDay |> filter(d => fiscalMonthNo(d) == 12) |> within(month) |> first
#=> 2027-03-01
```

落とし穴（実装）: `ordinalIn(month, year, d)` は点が枠窓（`year`）に属することを要求する。**言語意味論では**
窓は全域パーティション（I5）で、紀元の前後にも完全な窓が張られる——1970-02-01 が属するのは完全な FY1969 窓
（1969-04-01〜1970-03-31）である。**リファレンス実装は** 1970 以前を評価できない（有界実体化）ため、`span` の
頭・`split` の末尾に**切れ端窓**を張り、実体化範囲内で I5 を**近似**する（張る以前は `fiscalMonthNo` が
「点が枠窓の外」エラーで書けなかった）。この近似のため紀元直後（1970-01〜03）の `fiscalMonthNo` は意味論と
乖離する——切れ端窓内の序数（1970-02 なら 2）を返すが、意味論どおりなら FY1969 の第 11 会計月である（既知の
実装制約。F59）。なお同区間の `fiscalYearNo` は正しく 1969 を返すが、これは `yearOf` の `div` が負の被除数を
floor に丸める実装だから（trunc なら 1970 に化ける——だから `div` は floor と規定された。ADR-31 改訂・F63）。

## 3. なぜ一行で書けるか（機構 A と「閏は窓でなく値」）

派生の名前解決は**機構 A**（ADR-17・spec §3.7）:

- **裸名は派生スコープで再解決**——上書きした `year` が shadow し、`year` に依存する継承語（`quarter`・
  `yearStart`）は再列挙なしで新しい定義に**自動追従**する。
- **`Base.word` は base の値にピン**——あえて元に固定したいときの明示手段。会計暦では**不要**である。

ピンが不要なのは、Gregorian が `month` を `year` に依存させない設計だから——「2 月は 28 日か 29 日か」は
`year` **窓**への依存ではなく month 序数からの**値**計算（「閏は窓でなく値」。gregorian.md §3）。もし `month`
が `year` の子だったら、`year` を `month` から束ね直す会計暦で `month ↔ year` が循環する。閏を値と見て
`month` を親に置いたので、`month = Gregorian.month` のような据え置きピンも循環回避も要らず、`year` 一行で
済む。閏の帰属も正しい——FY2027（2027-04-01〜2028-03-31）は 2028-02-29 を含むが、これは `year` の位相と
無関係に `month` が値計算で 29 日になるだけである。

`quarter` の自動追従を 2026 暦年で見る。ただし `phase: 3` は 3 の倍数なので、**切れ目の集合は Gregorian の
四半期と同一**（1/1・4/1・7/1・10/1）——切れ目のレベルでは追従を観測**できない**。変わるのは**所属**で、
1/1 に始まる窓は暦の Q1 ではなく **FY2025 の Q4**（Jan–Mar）になる:

```kairos
# eval: 2026-01-01..2027-01-01
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
everyDay |> within(quarter) |> first
#=> 2026-01-01 2026-04-01 2026-07-01 2026-10-01
```

所属の変化は序数で観測できる——「第 4 会計四半期（1〜3 月）」に属する日々の四半期頭は 1/1 である:

```kairos
# eval: 2026-01-01..2027-01-01
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
everyDay |> filter(d => ordinalIn(quarter, year, d) == 4) |> within(quarter) |> first
#=> 2026-01-01
```

## 4. 日付は動かない（I1）

派生が動かすのは窓の**切れ目**だけで、暦日は不動（基底固定 I1・ADR-19）。2026-03-01 は会計暦でも「3 月 1 日」
のまま、所属する**年窓**だけが 2025 年度（Apr2025–Mar2026）に変わる。`month` に触れていないので、月末
（`monthEnd`）も Gregorian と完全に一致する——年度の切れ目（3/31→4/1）をまたいでも、2 月末（2026 年は非閏年
で 2/28）でも:

```kairos
# eval: 2026-01-01..2026-07-01
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
monthEnd
#=> 2026-01-31 2026-02-28 2026-03-31 2026-04-30 2026-05-31 2026-06-30
```

軸そのものを 3 か月平行移動する解釈（4 月が「1 月」に化ける類）は却下済みである（ADR-19 の解釈 Q。採用は
解釈 P＝日付不動）——
4 月は 4 月のまま、「第 1 会計月」という**序数**（`fiscalMonthNo` = 1）になるだけ。

## 5. 年度ラベル（開始年か終了年か）

年度の**番号付け**は、窓の切断とは独立の規約である（spec §3.7 の「直交する別ノブ」）:

- **開始暦年**（日本の年度）: 「2026 年度」= 2026-04-01〜2027-03-31。
- **終了暦年**（US 連邦の FY）: 「FY2026」= 2025-10-01〜2026-09-30（§6）。

窓に名を付ける正式な担い手は、窓生成時の **`label:` 付与式**。束縛規則は ADR-34 で確定した——ラムダは
**窓の先頭点**を受け、意味論は定義的等式「`名前(d)` ≡ 付与式(d の属する窓の先頭点)」（評価は射影時・遅延）:

```text
# 開始暦年ラベル: 先頭点（4/1）の属する暦年を貼る。読み側は year(d) が年度番号を返す
year = month span (_ => 12) phase: 3 label: (p => yearNo(p))
```

読む側は今日でも**値関数**で書ける——`Fiscal` が同梱する `fiscalYearNo` がそれである。`epochOrdinal(month, d)`
は点 `d` が属する暦月の通し序数（0 起点・ADR-31）。そこから位相ぶんの 3 を引いて「4 月始まりに位相をそろえた
月序数」にし、`yearOf`（= 1970 + m div 12。gregorian.md §1）で 12 か月ごとに区切れば開始暦年が出る。
FY2026 の初日:

```kairos
# eval: 2025-01-01..2028-01-01
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
everyDay |> filter(d => fiscalYearNo(d) == 2026) |> within(year) |> first
#=> 2026-04-01
```

末日は翌暦年の 3 月 31 日——2027-03-31 も `fiscalYearNo` = 2026 であり（1〜3 月は前年度に属する。
2026-01-15 なら 2025）、暦年を返す継承語 `yearNo`（= 2027）とここで食い違う:

```kairos
# eval: 2025-01-01..2028-01-01
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
everyDay |> filter(d => fiscalYearNo(d) == 2026) |> within(year) |> last
#=> 2027-03-31
```

**窓インスタンス参照は premise 相対**（ADR-42・落とし穴）——`Fiscal` の下の `year(2026)` は
2026 **年度**の日々（2026-04-01〜2027-03-31）であって暦年ではない。`newYearHoliday \ year(2026)` を
年度暦の下で書くと 2027 年 1 月の正月を消す（意図が 2026 年 1 月なら別の年度）。暦年が要るなら
**修飾ピン** `Gregorian.year(2026)`（機構 A——射影・インスタンス参照の両面に同一に効く）:

```kairos
# eval: 2026-03-30..2026-04-03
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
year(2025) & Gregorian.year(2026)
#=> 2026-03-30 2026-03-31
```

（2025 年度∩暦年 2026＝2026 年 1〜3 月。評価窓では年度末の 2 日だけが出る——年度と暦年の
食い違いがそのまま観測できる。）

## 6. 変種

**US 連邦型（10 月始まり・終了年ラベル）**は `phase: 9` と補正 `+3` の派生を自分で書く（31 U.S.C. §1102。
US FY2026 = 2025-10-01〜2026-09-30）。ラベルの補正は一般に、開始年規約が `- phase`・終了年規約が
`+ ((12 - phase) mod 12)`（日本型は `- 3`・US 型は `+ 3`。`phase: 0` では両規約が一致するので補正 0）:

```kairos
# eval: 2025-01-01..2028-01-01
premise USFiscal = Gregorian with {
  year = month span (_ => 12) phase: 9
  usFiscalYearNo = d => yearOf(epochOrdinal(month, d) + 3)
}
premise USFY { calendar-system: USFiscal; tz: "Asia/Tokyo"; wkst: Mon }
@USFY
everyDay |> within(year) |> first
#=> 2025-10-01 2026-10-01 2027-10-01
```

終了年ラベルの検証——US FY2026 の末日は 2026-09-30:

```kairos
# eval: 2025-01-01..2028-01-01
premise USFiscal = Gregorian with {
  year = month span (_ => 12) phase: 9
  usFiscalYearNo = d => yearOf(epochOrdinal(month, d) + 3)
}
premise USFY { calendar-system: USFiscal; tz: "Asia/Tokyo"; wkst: Mon }
@USFY
everyDay |> filter(d => usFiscalYearNo(d) == 2026) |> within(year) |> last
#=> 2026-09-30
```

**半期**は `Fiscal` をさらに派生（派生の派生）して従属窓を一語足すだけ——上期 4〜9 月・下期 10〜3 月:

```kairos
# eval: 2025-04-01..2026-04-01
premise FiscalHalf = Fiscal with { half = year split (_ => [6, 6]) by: month }
premise FYH { calendar-system: FiscalHalf; tz: "Asia/Tokyo"; wkst: Mon }
@FYH
everyDay |> within(half) |> first
#=> 2025-04-01 2025-10-01
```

**射程外の「会計年度」もある**。英国の個人課税年度（4 月 6 日開始）は日単位のずらしで、`month ⊃ day` の
`k`（窓が含む単位の個数）が可変な組——`shiftBoundary` の射程（`k` 定数の組）の外であり、`span` の位相ずらし
一発では書けない（spec §3.7。必要になれば別演算子＝宿題）。4-4-5 週会計（52/53 週制）も `week` 基準の別系統
で、`Fiscal` の変種ではなく別の premise として設計する問題である。

## 7. スコープ（Fiscal が負わないもの）

- **4 月以外の決算期**（12 月決算・2 月決算・US 連邦型など）——標準は日本の年度の規約だけを負う。他は各組織
  が `phase` を変えた派生を一行で書く（§6）。
- **年度ラベルの表記**（「令和 8 年度」「FY26」等の文字列化・和暦変換）——`fiscalYearNo` は数値（開始暦年）を
  返すだけで、表記は表示側・データ側の仕事。
- **日単位ずらしの課税年度・4-4-5 週会計**——`k` 可変で射程外（§6）。
- **営業日・締め日の実務**（月末営業日・祝日回避など）——暦の切断だけを担い、カレンダー（`calendar:`）や
  本体層の変換（`roll` 等）と組み合わせて使う。
