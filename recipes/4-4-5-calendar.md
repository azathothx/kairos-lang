# 4-4-5 会計暦を定義する——第 53 週の繰上げは自動で出る

小売・製造で使われる 4-4-5 会計暦（四半期を 4 週・4 週・5 週の期に割る）は、**「月」が
存在しない暦**なので月ベースの繰り返し語彙が全滅する。Kairos では暦そのものを派生 premise
として定義でき、悪名高い**第 53 週の繰上げ規則すら書かずに済む**。

## 既存側で何が起きるか

- cron・RRULE の月・週フィールドはグレゴリオ暦の月に固定されており、4-4-5 の「期」を
  参照できない。
- 実務では[会計 SaaS が専用機能として個別実装](https://help.anaplan.com/set-the-weeks-4-4-5-4-5-4-or-5-4-4-calendar-150f3b73-8be1-4d95-92fd-24daa46ae869)
  するのが通例——スケジュール言語の外で解決されてきた。
- ISO 週が 53 週ある年（2026 年など）は、53 週目をどの期に足すかの**繰上げ規則**が別途要り、
  これが実装ごとの差異の温床になってきた。

## Kairos で書く

期の頭＝「ISO 週番号 1, 5, 9, 14, …, 48 の月曜」をマーカー列にし、`segmentBy` で期を張る。
標準 premise の `ISOWeek` から派生させるだけ:

```kairos
# eval: 2025-12-01..2027-03-01
premise R445 = ISOWeek with {
  periodStart = isoWeekStart |> filter(d =>
    ((isoWeekNo(d) - 1) mod 13 == 0 or (isoWeekNo(d) - 1) mod 13 == 4 or (isoWeekNo(d) - 1) mod 13 == 8)
    and isoWeekNo(d) <= 48)
  period = day |> segmentBy(periodStart, edges: clip, empties: error)
}
premise JPR { calendar-system: R445; tz: "Asia/Tokyo"; wkst: Mon }
@JPR
everyDay |> within(period) |> first
#=> 2025-12-29 2026-01-26 2026-02-23 2026-03-30 2026-04-27 2026-05-25
#=> 2026-06-29 2026-07-27 2026-08-24 2026-09-28 2026-10-26 2026-11-23
#=> 2027-01-04 2027-02-01
```

ISO 2026 年は 53 週年——最終期 P12 が 11/23 から 2027-01-03 までの **6 週に自動で伸び**
（W49〜W53 を吸収）、翌年は W01（2027-01-04）から正常に再開している。**繰上げ規則
（NRF 流の「最終期に足す」）を一行も書いていない**のに、「期の頭は W48 まで」という定義の
形から帰結として出る——規則を列挙するのではなく、暦の構造を定義した結果として正しい端が出る。

期ができれば「期末の 3 営業日前」も「期の第 1 営業日」も、グレゴリオ暦の月とまったく同じ
語彙（`within(period)`・`roll`・`shift`）で書ける。

## ブラウザで試す

[Playground で実行](https://kairos-lang.org/playground/#s=cHJlbWlzZSBSNDQ1ID0gSVNPV2VlayB3aXRoIHsKICBwZXJpb2RTdGFydCA9IGlzb1dlZWtTdGFydCB8PiBmaWx0ZXIoZCA9PgogICAgKChpc29XZWVrTm8oZCkgLSAxKSBtb2QgMTMgPT0gMCBvciAoaXNvV2Vla05vKGQpIC0gMSkgbW9kIDEzID09IDQgb3IgKGlzb1dlZWtObyhkKSAtIDEpIG1vZCAxMyA9PSA4KQogICAgYW5kIGlzb1dlZWtObyhkKSA8PSA0OCkKICBwZXJpb2QgPSBkYXkgfD4gc2VnbWVudEJ5KHBlcmlvZFN0YXJ0LCBlZGdlczogY2xpcCwgZW1wdGllczogZXJyb3IpCn0KcHJlbWlzZSBKUFIgeyBjYWxlbmRhci1zeXN0ZW06IFI0NDU7IHR6OiAiQXNpYS9Ub2t5byI7IHdrc3Q6IE1vbiB9CgpASlBSCmV2ZXJ5RGF5IHw-IHdpdGhpbihwZXJpb2QpIHw-IGZpcnN0&f=2025-12-01&t=2027-03-01)
——`mod 13 == 0/4/8` を変えれば 4-5-4・5-4-4 の変種になる。

## 関連

- 会計年度（4 月始まりなど）は標準 premise `Fiscal`: [stdlib](../stdlib/)
- 窓を切る語彙: [`segmentBy`](../reference/segmentBy.md)・[`split`](../reference/split.md)
  （規則的な等分割は split が正準——本レシピの形との関係は各ページの注記）
- 本社と支社で暦がずれる話（同じ式が違う日を出す仕組み）:
  [調査研究 11](../design/40-examples/11-impossible-schedules.md) と premise の派生
