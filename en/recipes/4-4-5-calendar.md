---
source_sha: d0f93143ba14
---

# What is a 4-4-5 calendar? The 4-5-4 and 5-4-4 variants, the 53rd week, and the 2026 period table

> Translated from the canonical Japanese page
> [recipes/4-4-5-calendar.md](../../recipes/4-4-5-calendar.md).

A **4-4-5 calendar** is a fiscal calendar that divides the year into four 13-week quarters and
each quarter into **three periods of 4, 4 and 5 weeks** (52 weeks, 364 days in total). Every
period ends on the same weekday, so periods carry the same number of weeks and weekends and
year-over-year comparisons line up — which is why retailers, restaurants and manufacturers report
on it. The **4-5-4** variant (the NRF retail calendar in the US) and **5-4-4** only move the
five-week period. Because 52 weeks are 364 days, a **53rd week** has to be added every five or
six years, and *which period absorbs it* is where implementations have always diverged.

This page gives (1) the 2026 period table, then (2) the definition that produced it. The table is
the literal output of the definition (a Kairos expression), executed and checked by the reference
implementation.

## The 2026 period table (ISO-week based; a 53-week year)

| Period | Start (Mon) | End (Sun) | Weeks | ISO weeks |
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

- The year starts on the Monday of ISO week W01 (2025-12-29). 2026 has 53 ISO weeks; the 53rd
  week is absorbed by the last period, so P12 alone is six weeks long.
- Select the table in your browser and copy it — it pastes into Excel cell by cell.
- The NRF retail calendar starts the fiscal year on the Sunday nearest February 1 — a different
  year-start convention. It can be written with the same vocabulary but is outside this page
  (a separate recipe if there is demand).

## What happens elsewhere

- cron's and RRULE's month/week fields are fixed to Gregorian months and cannot refer to 4-4-5
  "periods".
- In practice, [accounting SaaS products implement it as a dedicated feature](https://help.anaplan.com/set-the-weeks-4-4-5-4-5-4-or-5-4-4-calendar-150f3b73-8be1-4d95-92fd-24daa46ae869)
  — solved outside the scheduling language.
- In ISO years with 53 weeks (such as 2026), you additionally need a **carry rule** for which
  period absorbs week 53 — a classic source of divergence between implementations.

## Writing it in Kairos — the carry rule falls out of the definition

Take the period heads — "Mondays of ISO weeks 1, 5, 9, 14, …, 48" — as a marker stream and cut
periods with `segmentBy`, deriving from the standard `ISOWeek` premise. The example premise
`US445` is US Eastern time (the calendar is date-only, so the time zone does not change the
result — it is aligned with the Playground's display zone). Weeks are ISO weeks (Monday start),
hence `wkst: Mon`:

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

ISO year 2026 has 53 weeks — the final period P12 **automatically stretches to six weeks**
(11/23 through 2027-01-03, absorbing W49–W53), and the next year restarts normally from W01
(2027-01-04). **The carry rule (NRF's "add it to the last period") is nowhere in the code** —
it falls out of the shape of the definition, "period heads only up to W48". Instead of
enumerating rules, you define the structure of the calendar and the correct edges emerge.

Period ends (the "End" column of the table above) come from the same definition:

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

Once the periods exist, "3 business days before period-end" and "first business day of the
period" use exactly the same vocabulary as Gregorian months (`within(period)`, `roll`, `shift`).

## Try it in your browser

[Run it in the Playground (period starts)](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBSNDQ1ID0gSVNPV2VlayB3aXRoIHsKICBwZXJpb2RTdGFydCA9IGlzb1dlZWtTdGFydCB8PiBmaWx0ZXIoZCA9PgogICAgKChpc29XZWVrTm8oZCkgLSAxKSBtb2QgMTMgPT0gMCBvciAoaXNvV2Vla05vKGQpIC0gMSkgbW9kIDEzID09IDQgb3IgKGlzb1dlZWtObyhkKSAtIDEpIG1vZCAxMyA9PSA4KQogICAgYW5kIGlzb1dlZWtObyhkKSA8PSA0OCkKICBwZXJpb2QgPSBkYXkgfD4gc2VnbWVudEJ5KHBlcmlvZFN0YXJ0LCBlZGdlczogY2xpcCwgZW1wdGllczogZXJyb3IpCn0KcHJlbWlzZSBVUzQ0NSB7IGNhbGVuZGFyLXN5c3RlbTogUjQ0NTsgdHo6ICJBbWVyaWNhL05ld19Zb3JrIjsgd2tzdDogTW9uIH0KCkBVUzQ0NQpldmVyeURheSB8PiB3aXRoaW4ocGVyaW9kKSB8PiBmaXJzdA&f=2025-12-01&t=2027-03-01&z=America%2FNew_York) ·
[period ends](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBSNDQ1ID0gSVNPV2VlayB3aXRoIHsKICBwZXJpb2RTdGFydCA9IGlzb1dlZWtTdGFydCB8PiBmaWx0ZXIoZCA9PgogICAgKChpc29XZWVrTm8oZCkgLSAxKSBtb2QgMTMgPT0gMCBvciAoaXNvV2Vla05vKGQpIC0gMSkgbW9kIDEzID09IDQgb3IgKGlzb1dlZWtObyhkKSAtIDEpIG1vZCAxMyA9PSA4KQogICAgYW5kIGlzb1dlZWtObyhkKSA8PSA0OCkKICBwZXJpb2QgPSBkYXkgfD4gc2VnbWVudEJ5KHBlcmlvZFN0YXJ0LCBlZGdlczogY2xpcCwgZW1wdGllczogZXJyb3IpCn0KcHJlbWlzZSBVUzQ0NSB7IGNhbGVuZGFyLXN5c3RlbTogUjQ0NTsgdHo6ICJBbWVyaWNhL05ld19Zb3JrIjsgd2tzdDogTW9uIH0KCkBVUzQ0NQpldmVyeURheSB8PiB3aXRoaW4ocGVyaW9kKSB8PiBsYXN0&f=2025-12-29&t=2027-01-04&z=America%2FNew_York)
— change `mod 13 == 0/4/8` and you get the 4-5-4 and 5-4-4 variants.

## Related

- Fiscal years (April start etc.) are the standard premise `Fiscal`: [stdlib](../stdlib/)
- Window-cutting vocabulary: [`segmentBy`](../reference/segmentBy.md) ·
  [`split`](../reference/split.md) (regular equal partitions are canonically `split`; each page
  notes how this recipe's form relates)
- Head office and branches on different calendars (the same expression yielding different dates):
  [study 11](../design/40-examples/11-impossible-schedules.md) and premise derivation
