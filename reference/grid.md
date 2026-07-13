# `grid` — 連続軸の一様分割（暦の原子）

**分類**: 窓生成語（premise 層） ／ **シグネチャ**: `grid(w) : Chronos -> Stream(partitioned)` ／ 名は確定（spec §5.4）

## 意味

連続基底 Chronos を幅 `w` で等幅にタイルし、**暦の原子**を作る。言語中で唯一 `chronos`（基底の字句名。
ADR-29）だけが受け取る語。主な書き手は暦法定義者（`Gregorian` の `day` がこれで立つ）だが、
カレンダー実体が営業時間の壁時計 tick を張る形（`nine = chronos grid 1d anchor: …T09:00`・ADR-41）も
正当な第二の用途。

幅 `w` は**市民時の幅規約**（ADR-11/12）——`1d` は「1 市民日」であって固定の `86400s` ではない。
DST 切替日の市民日は 23〜25 時間になる（うるう秒はスコープ外＝ADR-33）。

**位相**は既定で整列する（ADR-31）: 市民時幅（`d`）は在圏 `tz:` の**各市民日の開始瞬間**（通常日は
真夜中。ADR-31 改訂）に、経過時間幅
（`h`/`m`/`s`）は**紀元**に。`day = chronos grid 1d` が無指定で「真夜中区切りの暦日」になるのは
この既定による。別位相が要るときだけ `anchor:` で上書きする。**時刻付き anchor の市民幅グリッド**の
窓境界は「各市民日で anchor の**壁時計時刻（ラベル読み）**を最初に読む瞬間」（DST 隙間→隙間明けの
最初の瞬間・重複→最初の出現・存在しない市民日→目盛りなし・市民日の開始点を anchor にした場合は
日整列。ADR-31 改訂 2）——`anchor: 2026-01-01T09:00` は DST 切替日も壁時計 09:00 を保つ。

## 例

10 日ごとの「旬」窓を 2026-01-01 起点で張る:

```kairos
# eval: 2026-01-01..2026-02-05
premise Dekad = Gregorian with { decade = chronos grid 10d anchor: 2026-01-01 }
premise JPD { calendar-system: Dekad; tz: "Asia/Tokyo"; wkst: Mon }
@JPD
everyDay |> within(decade) |> first
#=> 2026-01-01 2026-01-11 2026-01-21 2026-01-31
```

標準の `day` の定義（stdlib/gregorian.md）:

```text
day = chronos grid 1d      # 原子。位相は既定（各市民日の開始瞬間＝通常日は真夜中）なので anchor: 不要
```

## label:（ADR-34）

`grid` にも `label: (p => 式)` を後置できる（`p`＝窓の先頭点。詳細は [`span`](span.md) の同節と ADR-34）。

## 落とし穴

- `grid` に渡せるのは `chronos` のみ——既存の窓を等幅に割るのは [`split`](split.md)（可変幅リストで）
  か、細かい原子からの [`span`](span.md)。
- 暦の「月」を `grid(30d)` で作ってはいけない——月は非一様なので `span daysInMonth`（値式による可変
  集約）で束ねる。

## 関連

[`span`](span.md)・[`split`](split.md)・[`cycle`](cycle.md)・`chronos`（ADR-29）・位相と紀元（ADR-31）・ADR-11/12。
