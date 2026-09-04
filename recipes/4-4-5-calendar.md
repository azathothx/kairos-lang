# 4-4-5 会計暦とは——4-5-4・5-4-4 の変種、第 53 週の扱い、2026 年の期間表

**4-4-5 会計暦**は、1 年を 13 週の四半期 4 つに分け、各四半期を **4 週・4 週・5 週の 3 期**に割る
会計暦（合計 52 週＝364 日）。どの期も同じ曜日で終わるので期どうしの週数と週末の数が揃い、前年
同期比が素直に取れる——小売・外食・製造の報告暦として使われる。変種の **4-5-4**（米国小売の NRF
暦）と **5-4-4** は、5 週の期の位置が違うだけ。52 週は 364 日なので 5〜6 年に一度**第 53 週**を
足す必要があり、「どの期が第 53 週を吸収するか」が実装ごとに割れてきた所。

本ページは (1) 2026 年の期間表 → (2) その表を出した定義、の順。表は定義（Kairos の式）の出力
そのもので、リファレンス実装が実行検証している。

## 2026 年の期間表（ISO 週基準・第 53 週を含む年）

| 期 | 始点（月曜） | 終点（日曜） | 週数 | ISO 週 |
|---|---|---|---|---|
| P1 | 2025-12-29 | 2026-01-25 | 4 | W01–W04 |
| P2 | 2026-01-26 | 2026-02-22 | 4 | W05–W08 |
| P3 | 2026-02-23 | 2026-03-29 | 5 | W09–W13 |
| P4 | 2026-03-30 | 2026-04-26 | 4 | W14–W17 |
| P5 | 2026-04-27 | 2026-05-24 | 4 | W18–W21 |
| P6 | 2026-05-25 | 2026-06-28 | 5 | W22–W26 |
| P7 | 2026-06-29 | 2026-07-26 | 4 | W27–W30 |
| P8 | 2026-07-27 | 2026-08-23 | 4 | W31–W34 |
| P9 | 2026-08-24 | 2026-09-27 | 5 | W35–W39 |
| P10 | 2026-09-28 | 2026-10-25 | 4 | W40–W43 |
| P11 | 2026-10-26 | 2026-11-22 | 4 | W44–W47 |
| P12 | 2026-11-23 | 2027-01-03 | **6** | W48–W53 |

- 年始は ISO 週 W01 の月曜（2025-12-29）。2026 年は ISO 週が 53 週ある年で、第 53 週は最終期 P12 が
  吸収し、P12 だけ 6 週になる。
- ブラウザで表を選択してコピーすれば、Excel にセル単位で貼り付く。
- 米国小売の NRF 暦は「2 月 1 日に最も近い日曜」から年が始まる別の年始規約。同じ語彙で書けるが
  本ページの範囲外（需要があれば別レシピ）。

## 既存側で何が起きるか

- cron・RRULE の月・週フィールドはグレゴリオ暦の月に固定されており、4-4-5 の「期」を
  参照できない。
- 実務では[会計 SaaS が専用機能として個別実装](https://help.anaplan.com/set-the-weeks-4-4-5-4-5-4-or-5-4-4-calendar-150f3b73-8be1-4d95-92fd-24daa46ae869)
  するのが通例——スケジュール言語の外で解決されてきた。
- ISO 週が 53 週ある年（2026 年など）は、53 週目をどの期に足すかの**繰上げ規則**が別途要り、
  これが実装ごとの差異の温床になってきた。

## Kairos で書く——繰上げ規則は定義の形から出る

期の頭＝「ISO 週番号 1, 5, 9, 14, …, 48 の月曜」をマーカー列にし、`segmentBy` で期を張る。
標準 premise の `ISOWeek` から派生させるだけ。例の premise `US445` は米国東部時間（暦は日付
だけなので tz は結果を変えない——Playground の表示 tz と揃えてある）。週は ISO 週（月曜始まり）
なので `wkst: Mon`:

```kairos
# eval: 2025-12-01..2027-03-01 tz: America/New_York
premise R445 = ISOWeek with {
  periodStart = isoWeekStart |> filter(d =>
    ((isoWeekNo(d) - 1) mod 13 == 0 or (isoWeekNo(d) - 1) mod 13 == 4 or (isoWeekNo(d) - 1) mod 13 == 8)
    and isoWeekNo(d) <= 48)
  period = day |> segmentBy(periodStart, edges: clip, empties: error)
}
premise US445 { calendar-system: R445; tz: "America/New_York"; wkst: Mon }

@US445
everyDay |> within(period) |> first
#=> 2025-12-29 2026-01-26 2026-02-23 2026-03-30 2026-04-27 2026-05-25
#=> 2026-06-29 2026-07-27 2026-08-24 2026-09-28 2026-10-26 2026-11-23
#=> 2027-01-04 2027-02-01
```

ISO 2026 年は 53 週年——最終期 P12 が 11/23 から 2027-01-03 までの **6 週に自動で伸び**
（W49〜W53 を吸収）、翌年は W01（2027-01-04）から正常に再開している。**繰上げ規則
（NRF 流の「最終期に足す」）を一行も書いていない**のに、「期の頭は W48 まで」という定義の
形から帰結として出る——規則を列挙するのではなく、暦の構造を定義した結果として正しい端が出る。

期末（上の表の「終点」列）も同じ定義から出る:

```kairos
# eval: 2025-12-29..2027-01-04 tz: America/New_York
premise R445 = ISOWeek with {
  periodStart = isoWeekStart |> filter(d =>
    ((isoWeekNo(d) - 1) mod 13 == 0 or (isoWeekNo(d) - 1) mod 13 == 4 or (isoWeekNo(d) - 1) mod 13 == 8)
    and isoWeekNo(d) <= 48)
  period = day |> segmentBy(periodStart, edges: clip, empties: error)
}
premise US445 { calendar-system: R445; tz: "America/New_York"; wkst: Mon }

@US445
everyDay |> within(period) |> last
#=> 2026-01-25 2026-02-22 2026-03-29 2026-04-26 2026-05-24 2026-06-28
#=> 2026-07-26 2026-08-23 2026-09-27 2026-10-25 2026-11-22 2027-01-03
```

期ができれば「期末の 3 営業日前」も「期の第 1 営業日」も、グレゴリオ暦の月とまったく同じ
語彙（`within(period)`・`roll`・`shift`）で書ける。

## ブラウザで試す

[Playground で実行（期の始点）](https://kairos-lang.org/playground/#s=cHJlbWlzZSBSNDQ1ID0gSVNPV2VlayB3aXRoIHsKICBwZXJpb2RTdGFydCA9IGlzb1dlZWtTdGFydCB8PiBmaWx0ZXIoZCA9PgogICAgKChpc29XZWVrTm8oZCkgLSAxKSBtb2QgMTMgPT0gMCBvciAoaXNvV2Vla05vKGQpIC0gMSkgbW9kIDEzID09IDQgb3IgKGlzb1dlZWtObyhkKSAtIDEpIG1vZCAxMyA9PSA4KQogICAgYW5kIGlzb1dlZWtObyhkKSA8PSA0OCkKICBwZXJpb2QgPSBkYXkgfD4gc2VnbWVudEJ5KHBlcmlvZFN0YXJ0LCBlZGdlczogY2xpcCwgZW1wdGllczogZXJyb3IpCn0KcHJlbWlzZSBVUzQ0NSB7IGNhbGVuZGFyLXN5c3RlbTogUjQ0NTsgdHo6ICJBbWVyaWNhL05ld19Zb3JrIjsgd2tzdDogTW9uIH0KCkBVUzQ0NQpldmVyeURheSB8PiB3aXRoaW4ocGVyaW9kKSB8PiBmaXJzdA&f=2025-12-01&t=2027-03-01&z=America%2FNew_York)・
[期の終点](https://kairos-lang.org/playground/#s=cHJlbWlzZSBSNDQ1ID0gSVNPV2VlayB3aXRoIHsKICBwZXJpb2RTdGFydCA9IGlzb1dlZWtTdGFydCB8PiBmaWx0ZXIoZCA9PgogICAgKChpc29XZWVrTm8oZCkgLSAxKSBtb2QgMTMgPT0gMCBvciAoaXNvV2Vla05vKGQpIC0gMSkgbW9kIDEzID09IDQgb3IgKGlzb1dlZWtObyhkKSAtIDEpIG1vZCAxMyA9PSA4KQogICAgYW5kIGlzb1dlZWtObyhkKSA8PSA0OCkKICBwZXJpb2QgPSBkYXkgfD4gc2VnbWVudEJ5KHBlcmlvZFN0YXJ0LCBlZGdlczogY2xpcCwgZW1wdGllczogZXJyb3IpCn0KcHJlbWlzZSBVUzQ0NSB7IGNhbGVuZGFyLXN5c3RlbTogUjQ0NTsgdHo6ICJBbWVyaWNhL05ld19Zb3JrIjsgd2tzdDogTW9uIH0KCkBVUzQ0NQpldmVyeURheSB8PiB3aXRoaW4ocGVyaW9kKSB8PiBsYXN0&f=2025-12-29&t=2027-01-04&z=America%2FNew_York)
——`mod 13 == 0/4/8` を変えれば 4-5-4・5-4-4 の変種になる。

## 関連

- 会計年度（4 月始まりなど）は標準 premise `Fiscal`: [stdlib](../stdlib/)
- 窓を切る語彙: [`segmentBy`](../reference/segmentBy.md)・[`split`](../reference/split.md)
  （規則的な等分割は split が正準——本レシピの形との関係は各ページの注記）
- 本社と支社で暦がずれる話（同じ式が違う日を出す仕組み）:
  [調査研究 11](../design/40-examples/11-impossible-schedules.md) と premise の派生
