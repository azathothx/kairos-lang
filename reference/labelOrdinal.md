# `labelOrdinal` — 宣言値域の中でラベルが第何番目か

**分類**: 射影（値式・本体層 core） ／ **シグネチャ**: `labelOrdinal(B, x) : ラベル値 -> 数値`（点形 `labelOrdinal(B, d) : 点 -> 数値`） ／ 名は確定（ADR-54・2026-10-19・spec §5.4） ／ **1.1 の追加拡張**

## 意味

束縛 `B` が**宣言した値域**（ラベルの列挙）の中で、ラベル値 `x` が**第何番目か**を返す（**1 起点**・宣言順）。
`labelOrdinal(weekday, Sun)` は 7、`labelOrdinal(saku, m3)` は 3。ラベルは文字列値で、識別子形と文字列形は
同じ値（`m3` と `"m3"`。spec §5.5）。

値域になるのは**宣言リスト 3 形**だけ:

| 値域の源 | 書き方 | 読む例 |
|---|---|---|
| `external` の `labels:` | `saku = external(kind: dates, labels: [m1, …, m12])` | `labelOrdinal(saku, m3)` → 3 |
| 窓束縛 `cycle` | `weekday = day cycle [Mon, …, Sun] anchor: …` | `labelOrdinal(weekday, Sun)` → 7 |
| `segmentBy` の `labels: cycle` | `sekkiMonth = … labels: cycle [寅, 卯, …] anchor: …` | `labelOrdinal(sekkiMonth, 卯)` → 2 |

意味論は定義的等式 1 行——`labelOrdinal(B, v) ≡ v == E₁ ? 1 : … : v == Eₙ ? n : ⊥`。右辺は 1.0 の値式だけで
書ける三項のネスト（旧正準形）の畳み込みで、違いは**既定枝が ⊥＝明示エラー「値域の外」**になること。

値域が数値や論理値のリスト（`labels: cycle [10, 20, 30]`）でも同じく位置を返す——値域はリストで、型で特別扱いしない
（ADR-54 判断 5）。

**点形** `labelOrdinal(B, d)` は `labelOrdinal(B, B(d))` の略——点 `d` を先に `B(d)` の束縛名射影で
ラベルにし、そのラベルの序数を返す。範囲外の註釈（spec §4.10）も tz 名検査（ADR-40）も `B(d)` のものが
そのまま効き、本語自身は註釈を生まない。

## 例

**曜日番号**——`weekday` の cycle のリスト順（Mon=1 … Sun=7）。`wkst` に依らない（`wkst: Sun` の下でも
日曜が 7。週の中の第何日は [`ordinalIn`](ordinalIn.md)`(day, week, d)` で、こちらは `wkst: Sun` なら土曜が 7）:

```kairos
# eval: 2026-01-01..2026-01-20
premise US { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Sun }
@US
everyDay |> filter(d => labelOrdinal(weekday, d) == 7)
#=> 2026-01-04 2026-01-11 2026-01-18
```

**`labels: cycle` の値域**——節切り月（立春の窓が寅）。卯月＝宣言順の 2 番目:

```kairos
# eval: 2026-02-03..2026-03-07
@JP
setsu = [2026-01-05, 2026-02-04, 2026-03-05, 2026-04-05] covering: 2026-01-05..2026-04-05
sekkiMonth = everyDay |> segmentBy(setsu, edges: drop, empties: error,
                                   labels: cycle [寅, 卯, 辰, 巳, 午, 未, 申, 酉, 戌, 亥, 子, 丑]
                                   anchor: 2026-02-04)
everyDay |> filter(d => labelOrdinal(sekkiMonth, d) == 2)
#=> 2026-03-05 2026-03-06
```

**`external` の値域——六曜（大安）**。朔のデータは旧暦月名のラベル（`m1`〜`m12`）と一緒に届く
（[`external`](external.md)・`# resolve:` 行は doctest の解決子固定材）。月番号は `labelOrdinal(saku, …)` で
値域から読み、六曜は `(月番号 + 旧暦日) mod 6`（0 が大安。stdlib/kyureki.md §5）:

```kairos
# eval: 2026-02-17..2026-03-19
# resolve: saku = dates 2026-01-19 2026-02-17 2026-03-19 2026-04-17 2026-05-17 covering: 2026-01-01..2026-05-31 asof: 2026-09-03 labels: m12 m1 m2 m3 m4
premise L { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "moon/saku"
  saku  = external(kind: dates, labels: [m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12])
  lunar = day |> segmentBy(saku, edges: drop, empties: keep, label: (p => saku(p)))
  rokuyoNo = d => (labelOrdinal(saku, lunar(d)) + ordinalIn(day, lunar, d)) mod 6
}
@L
everyDay |> filter(d => rokuyoNo(d) == 0)
#=> 2026-02-21 2026-02-27 2026-03-05 2026-03-11 2026-03-17
```

`lunar(d)` は `label:` ラムダの計算ラベル（値域を持たない）なので、序数は値域を持つ側 `saku` から読む——
`labelOrdinal(saku, lunar(d))`。1.0 の書き方（三項 12 段の `monthLabelNo`）との違いは
[`segmentBy`](segmentBy.md) の「ラベルを数値として使う」。

## 落とし穴

- **三つの序数の使い分け**: [`ordinalIn`](ordinalIn.md) は枠窓内の第 N（**1 起点**）・[`epochOrdinal`](epochOrdinal.md) は
  紀元からの座標（**0 起点**）・`labelOrdinal` は値域内の第 N（**1 起点**）。リストの添字 `l[i]` は 0 起点のまま——
  往復は `l[labelOrdinal(B, v) - 1] == v`。

- **並行ラベル列は値域ではない**——`segmentBy` の静的 `labels: [12, 1, 2, 3]` やテーブルリテラルの `labels:` は
  窓順・点順の**割り当て列**で、宣言順＝序数ではない（`m1` が位置 2 に来る）。渡すと誘導つき静的エラー。
  番号が要るなら `labels:` に数値を直接書く（stdlib/kyureki の形）か `epochOrdinal` の差で。

- **`label:` ラムダは列挙できない**——`labelOrdinal(lunar, d)` は静的エラー。値域を持つ側を渡す
  （`labelOrdinal(saku, lunar(d))`）。

- **値域に重複があると呼び出し時の静的エラー**——4 勤 4 休の `cycle [On, On, On, On, Off, Off, Off, Off]` は
  ラベル射影としては合法のまま（宣言側に検査は足さない）が、序数は一意でないので読めない。検査は呼び出しが評価されたときに走る
  （`filter` の述語の中の呼び出しは点が流れたとき＝列が空なら走らない。値域外の検査も同じ）。「サイクルの
  何日目」は位相の量で、`epochOrdinal` の差で書く。

- **値域の外は明示エラー**——宣言に無い値（文字列形の `"m13"`・別の値域のラベル）は「値域の外」で止まる。診断の
  値域の表示は先頭 12 個まで（13 個以上は「, …」で打ち切る）。

- **先に止まる 2 つの形**——宣言に無い識別子形 `m13` は 1.0 どおり名前解決で止まり、供給が域外のラベルを渡せば
  `external` の契約検査が先に止める。

- **宣言に `m13` を足した場合**は値域の外ではない——三項形は既定枝の 12 に黙って化ける（警告 0）が、`labelOrdinal` は
  13 を正しく読む（点列が変わる・エラーではない）。

- **`labelOrdinal` は予約語**（1.1 以降に追加した語は core・stdlib を問わず同名の利用側 top-level 束縛が
  誘導つき静的エラー。spec §4.8）。ラベル名にも使えない。1.0 の語の挙動は不変。

## 関連

[`ordinalIn`](ordinalIn.md)・[`epochOrdinal`](epochOrdinal.md)（序数の一族）・[`cycle`](cycle.md)・
[`segmentBy`](segmentBy.md)（`labels: cycle`・1.0 互換の三項形）・[`external`](external.md)（`labels:` 値域）・
spec §4.9・ADR-54。
