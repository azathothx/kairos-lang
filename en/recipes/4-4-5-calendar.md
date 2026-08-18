---
source_sha: 3a442b1104a8
---

# Defining a 4-4-5 fiscal calendar — the 53rd week falls out automatically

> Translated from the canonical Japanese page
> [recipes/4-4-5-calendar.md](../../recipes/4-4-5-calendar.md).

The 4-4-5 fiscal calendar used in retail and manufacturing (each quarter split into periods of
4, 4, and 5 weeks) is a **calendar with no "months"**, so every month-based recurrence vocabulary
fails at once. In Kairos the calendar itself is a derived premise — and the notorious
**53rd-week carry rule never even has to be written**.

## What happens elsewhere

- cron's and RRULE's month/week fields are fixed to Gregorian months and cannot refer to 4-4-5
  "periods".
- In practice, [accounting SaaS products implement it as a dedicated feature](https://help.anaplan.com/set-the-weeks-4-4-5-4-5-4-or-5-4-4-calendar-150f3b73-8be1-4d95-92fd-24daa46ae869)
  — solved outside the scheduling language.
- In ISO years with 53 weeks (such as 2026), you additionally need a **carry rule** for which
  period absorbs week 53 — a classic source of divergence between implementations.

## Writing it in Kairos

Take the period heads — "Mondays of ISO weeks 1, 5, 9, 14, …, 48" — as a marker stream and cut
periods with `segmentBy`, deriving from the standard `ISOWeek` premise:

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

ISO year 2026 has 53 weeks — the final period P12 **automatically stretches to six weeks**
(11/23 through 2027-01-03, absorbing W49–W53), and the next year restarts normally from W01
(2027-01-04). **The carry rule (NRF's "add it to the last period") is nowhere in the code** —
it falls out of the shape of the definition, "period heads only up to W48". Instead of
enumerating rules, you define the structure of the calendar and the correct edges emerge.

Once the periods exist, "3 business days before period-end" and "first business day of the
period" use exactly the same vocabulary as Gregorian months (`within(period)`, `roll`, `shift`).

## Try it in your browser

[Run it in the Playground](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBSNDQ1ID0gSVNPV2VlayB3aXRoIHsKICBwZXJpb2RTdGFydCA9IGlzb1dlZWtTdGFydCB8PiBmaWx0ZXIoZCA9PgogICAgKChpc29XZWVrTm8oZCkgLSAxKSBtb2QgMTMgPT0gMCBvciAoaXNvV2Vla05vKGQpIC0gMSkgbW9kIDEzID09IDQgb3IgKGlzb1dlZWtObyhkKSAtIDEpIG1vZCAxMyA9PSA4KQogICAgYW5kIGlzb1dlZWtObyhkKSA8PSA0OCkKICBwZXJpb2QgPSBkYXkgfD4gc2VnbWVudEJ5KHBlcmlvZFN0YXJ0LCBlZGdlczogY2xpcCwgZW1wdGllczogZXJyb3IpCn0KcHJlbWlzZSBKUFIgeyBjYWxlbmRhci1zeXN0ZW06IFI0NDU7IHR6OiAiQXNpYS9Ub2t5byI7IHdrc3Q6IE1vbiB9CgpASlBSCmV2ZXJ5RGF5IHw-IHdpdGhpbihwZXJpb2QpIHw-IGZpcnN0&f=2025-12-01&t=2027-03-01)
— change `mod 13 == 0/4/8` and you get the 4-5-4 and 5-4-4 variants.

## Related

- Fiscal years (April start etc.) are the standard premise `Fiscal`: [stdlib](../stdlib/)
- Window-cutting vocabulary: [`segmentBy`](../reference/segmentBy.md) ·
  [`split`](../reference/split.md) (regular equal partitions are canonically `split`; each page
  notes how this recipe's form relates)
- Head office and branches on different calendars (the same expression yielding different dates):
  [study 11](../design/40-examples/11-impossible-schedules.md) and premise derivation
