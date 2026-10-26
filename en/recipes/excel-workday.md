---
source_sha: f2dffbbe29da
---

# Schedules that are hard to write with Excel's WORKDAY and EOMONTH — do not let an expired holiday table stay silent

> Translated from the canonical Japanese page
> [recipes/excel-workday.md](../../recipes/excel-workday.md).

A page for people who compute business days in Excel: accounting, general affairs and IT departments that
build tables of closing dates and payment dates with `WORKDAY`, `EOMONTH` and `NETWORKDAYS`.
You do not need to read the language specification.

Kairos does not replace Excel. It splits the roles: **producing the list of dates** goes to Kairos; totals and
layout stay in Excel. Kairos can write its results as tab-separated values (TSV), so they enter Excel as a
table ([Handing it to Excel](#handing-it-to-excel-tsv)).

## At a glance

| Requirement | Excel | Kairos |
|---|---|---|
| Last business day of the month | `WORKDAY` and `EOMONTH` | `within(month)` and `last` |
| Payment on the 25th, the business day before if it is a day off | `WORKDAY` and `DATE` | `nth(25)` and `roll` |
| The 10th business day | `WORKDAY` and `EOMONTH` | `nth(10)` |
| Three business days before quarter-end | `WORKDAY` and `EOMONTH` | `within(quarter)` and `shift` |
| Every 3 business days | needs a helper column | `stride(3)` |
| First and third Wednesday | two `WEEKDAY` formulas | the union of `nth(1)` and `nth(3)` |

The Kairos expressions are written under the standard `@JP` premise (a business-day stream `bizDay` derived
from weekends and Japan's 2026 holidays). The form that brings in your own holiday table is in
[When the holiday table runs out](#when-the-holiday-table-runs-out).
The `# eval:` and `#=>` lines are verification comments for this site; you may delete them.

## Last business day of the month

In Excel, read it as "one business day before the 1st of the next month". A2 is any day in the month and
`祝日` is the name of the holiday-table range:

```text
=WORKDAY(EOMONTH(A2,0)+1,-1,祝日)
```

In Kairos: "cut the business-day stream by month, take the last point". It is written in the order it is read:

(`@JP` in the block below is the doctest's standard premise, with `holidays2026` and `bizDay` included. To run it yourself, use the self-contained form behind the "▶ Open in Playground" link — see [recipes/README](README.md).)

```kairos
# eval: 2026-01-01..2027-01-01
@JP
bizDay |> within(month) |> last
#=> 2026-01-30 2026-02-27 2026-03-31 2026-04-30 2026-05-29 2026-06-30
#=> 2026-07-31 2026-08-31 2026-09-30 2026-10-30 2026-11-30 2026-12-31
```

The end of January (1/31 Sat) and the end of May (5/30 Sat, 5/31 Sun) retreat to Friday. The Excel formula
gives one month per cell; a table for the year means copying it into 12 rows. Give Kairos the range and the
12 points come out at once.

## Payment on the 25th — the business day before if it is a day off

In Excel: "one business day before the 26th". If the 25th is a business day it stays the 25th; on a weekend
or holiday it becomes the business day before:

```text
=WORKDAY(DATE(YEAR(A2),MONTH(A2),26),-1,祝日)
```

In Kairos: "make the 25th of every month, and if it is not a business day, move it back":

```kairos
# eval: 2026-01-01..2027-01-01
@JP
everyDay |> within(month) |> nth(25) |> roll(Preceding, on: bizDay)
#=> 2026-01-23 2026-02-25 2026-03-25 2026-04-24 2026-05-25 2026-06-25
#=> 2026-07-24 2026-08-25 2026-09-25 2026-10-23 2026-11-25 2026-12-25
#~> 範囲外 2026-01-01..2026-01-02（holidays2026 covering 2026-01-01..2026-12-31, asof 2026-01-05）
```

January 25 (Sun) moves to the 23rd (Fri), April 25 (Sat) to the 24th, October 25 (Sun) to the 23rd.

The last line is a one-line note from the language: "if a point landed on January 1, the business day
before it would be outside the holiday table (in 2025)" (the interval `2026-01-01..2026-01-02` excludes its right end, so it is January 1 only).

No point of this expression lands there, but the
expression does not stay silent about an interval that could depend on what lies outside the table.
To move forward to the next business day instead, use `roll(Following, on: bizDay)`.

## The 10th business day

In Excel: "10 business days after the end of the previous month":

```text
=WORKDAY(EOMONTH(A2,-1),10,祝日)
```

In Kairos: "cut the business-day stream by month, take the 10th":

```kairos
# eval: 2026-01-01..2027-01-01
@JP
bizDay |> within(month) |> nth(10)
#=> 2026-01-16 2026-02-16 2026-03-13 2026-04-14 2026-05-19 2026-06-12
#=> 2026-07-14 2026-08-17 2026-09-14 2026-10-15 2026-11-16 2026-12-14
```

January leaves Coming of Age Day (1/12) out of the count and May leaves out the Golden Week holidays,
giving 1/16 and 5/19.

## Three business days before quarter-end

In Excel: "four business days before the 1st of the next quarter". A2 is the first day of the quarter.
`-1` is the last business day, `-4` is three business days before it:

```text
=WORKDAY(EOMONTH(A2,2)+1,-4,祝日)
```

Get the count wrong by one and the date is off by a day, and Excel says nothing. In Kairos: "from the last
business day of the quarter, step back 3 on the business-day scale":

```kairos
# eval: 2026-01-01..2027-01-01
@JP
bizDay |> within(quarter) |> last |> shift(-3, unit: bizDay)
#=> 2026-03-26 2026-06-25 2026-09-25 2026-12-28
#~> 範囲外 2026-12-29..2027-01-01（holidays2026 covering 2026-01-01..2026-12-31, asof 2026-01-05）
```

December: three business days back from 12/31 is 12/28. The last line is the note "the 2027 table is missing", carried along by the
arithmetic: stepping back three business days moves that unknown region onto December 29–31. Any point due in that interval would
come from outside the table, so it cannot be known. The point 12/28 itself is correct.

The difference between `roll` (move onto) and `shift` (count) is in [spec §4.4](../spec/30-body-layer.md).

## Every 3 business days, and the first and third Wednesday

In Excel, "every 3 business days" becomes a helper column: each row is 3 business days after the row above,
copied downwards (`=WORKDAY(B2,3,祝日)`). Change the starting point and the whole table is rebuilt.
Kairos takes the starting point as an argument:

```kairos
# eval: 2026-01-01..2026-03-01
@JP
bizDay |> stride(3, from: 2026-01-05)
#=> 2026-01-05 2026-01-08 2026-01-14 2026-01-19 2026-01-22 2026-01-27
#=> 2026-01-30 2026-02-04 2026-02-09 2026-02-13 2026-02-18 2026-02-24 2026-02-27
```

"First and third Wednesday" takes two `WEEKDAY` formulas in Excel (the first Wednesday, and 14 days after
it). In Kairos, take "the 1st in each month" and "the 3rd" from the stream of Wednesdays and join them with
`|`. Measured results are in [Writing "twice a month" as one expression](https://selog.tech/?p=434) (Japanese).

## When the holiday table runs out

This is the main point. The third argument of `WORKDAY` is the holiday-table range, and **even when the
table stops at 2026, computing a 2027 date silently returns an answer with zero holidays**.
January 1, 2027 becomes a business day. You notice after a payment has slipped by a day.

In Kairos, the table carries `covering:` (the range in which the table is valid). Computing outside that
range still yields points, but an annotation saying "computed outside the table" (`範囲外`, out of coverage)
always comes along. Here, with your own holiday table, computing October 2026 to March 2027:

```kairos
# eval: 2026-10-01..2027-04-01
premise JP {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  wkst: Mon
}

@JP
holidays2026 = [2026-01-01, 2026-01-12, 2026-02-11, 2026-02-23, 2026-03-20,
                2026-04-29, 2026-05-03, 2026-05-04, 2026-05-05, 2026-05-06,
                2026-07-20, 2026-08-11, 2026-09-21, 2026-09-22, 2026-09-23,
                2026-10-12, 2026-11-03, 2026-11-23] covering: 2026..2026
satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
bizDay = everyDay \ (satSun | holidays2026)

bizDay |> within(month) |> last
#=> 2026-10-30 2026-11-30 2026-12-31 2027-01-29 2027-02-26 2027-03-31
#~> 範囲外 2027-01-01..2027-04-01（holidays2026 covering 2026-01-01..2026-12-31）
```

The three 2027 points are computed with "zero holidays", just as in Excel, but **the same output states the
interval that is "outside the table"**. `next` (the next N points) prints the same annotation.
The "remaining runway" in the coverage summary is the number of days the table has left, and it is shown on
every evaluation. That is the signal that it is time to extend the table.

Extend the holiday table once a year (the Cabinet Office announces Japan's national holidays every
February). Add the rows and extend `covering:` by one year; that is all. The three ways of writing
`covering:` are in [table literal](../reference/table-literal.md); the background of "holiday tables rot
silently" is in [the blog post](https://selog.tech/?p=297) (Japanese).

## Handing it to Excel (TSV)

`--tsv` (from 1.0.10) writes the results as tab-separated values, one point per line. Annotations and the
coverage summary go to standard error, so they do not get mixed into the file:

```text
kairos list --tsv --from 2026-01-01 --to 2027-01-01 month-end.kairos > month-end.tsv
```

```text
expr	source	uid	date	time	epoch_ms	note	label
1	bizDay |> within(month) |> last	kairos-3d28b4e324d5-series@kairos-lang.org	2026-01-30		1769698800000		
1	bizDay |> within(month) |> last	kairos-3d28b4e324d5-series@kairos-lang.org	2026-02-27		1772118000000		
1	bizDay |> within(month) |> last	kairos-3d28b4e324d5-series@kairos-lang.org	2026-03-31		1774882800000		
```

**Excel**: do not double-click the file. Use "Data → From Text/CSV", pick the file, choose UTF-8 as the file
origin and Tab as the delimiter. `date` comes in as a date and `epoch_ms` as a number.
`time` is filled only for definitions that carry a time of day. `note` is the annotation text when the point
falls in an interval "outside the table"; empty means the computation stayed inside the table. `label` (from 1.0.12)
holds the point's label (a solar-term name, say) when the expression's text refers to exactly one labelled binding (a table with `labels:`, or a cycle such as `weekday`);
it is empty in this example.

- **PowerShell**: ``Import-Csv month-end.tsv -Delimiter "`t" -Encoding utf8 | Format-Table date, note``.
- **VBA**: call `kairos` through `Shell`, have it write the TSV, and read it line by line.
- The meaning of the columns and when to use `--json` instead: [reference implementation README](../../impl/README.md#--tsvexcelpowershell-向けの表) (Japanese).

Installing on Windows and running it every day from Task Scheduler: [Kairos for Windows administrators](windows-admin.md).

## Try it in your browser

[Run the self-contained form (premise included, holiday table inside the expression) in the Playground](https://kairos-lang.org/en/playground/#s=IyBTY2hlZHVsZXMgdGhhdCBhcmUgYXdrd2FyZCBpbiBFeGNlbCdzIFdPUktEQVkvRU9NT05USCDigJQgbGFzdCBidXNpbmVzcyBkYXkgb2YgdGhlIG1vbnRoICh0aHJlZSBtb3JlIGluIHRoZSBjb21tZW50cykKcHJlbWlzZSBKUCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFzaWEvVG9reW8iCiAgd2tzdDogTW9uCn0KCkBKUApob2xpZGF5czIwMjYgPSBbMjAyNi0wMS0wMSwgMjAyNi0wMS0xMiwgMjAyNi0wMi0xMSwgMjAyNi0wMi0yMywgMjAyNi0wMy0yMCwKICAgICAgICAgICAgICAgIDIwMjYtMDQtMjksIDIwMjYtMDUtMDMsIDIwMjYtMDUtMDQsIDIwMjYtMDUtMDUsIDIwMjYtMDUtMDYsCiAgICAgICAgICAgICAgICAyMDI2LTA3LTIwLCAyMDI2LTA4LTExLCAyMDI2LTA5LTIxLCAyMDI2LTA5LTIyLCAyMDI2LTA5LTIzLAogICAgICAgICAgICAgICAgMjAyNi0xMC0xMiwgMjAyNi0xMS0wMywgMjAyNi0xMS0yM10gY292ZXJpbmc6IDIwMjYuLjIwMjYKc2F0U3VuID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBTYXQgb3Igd2Vla2RheShkKSA9PSBTdW4pCmJpekRheSA9IGV2ZXJ5RGF5IFwgKHNhdFN1biB8IGhvbGlkYXlzMjAyNikKIyBTd2FwIHRoZSBsYXN0IGxpbmUgdG8gdHJ5IHRoZSBvdGhlcnM6CiMgICBldmVyeURheSB8PiB3aXRoaW4obW9udGgpIHw-IG50aCgyNSkgfD4gcm9sbChQcmVjZWRpbmcsIG9uOiBiaXpEYXkpICAg4oCmIHBheW1lbnQgb24gdGhlIDI1dGgsIHByZXZpb3VzIGJ1c2luZXNzIGRheSBpZiBvZmYKIyAgIGJpekRheSB8PiB3aXRoaW4obW9udGgpIHw-IG50aCgxMCkgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICDigKYgMTB0aCBidXNpbmVzcyBkYXkKIyAgIGJpekRheSB8PiB3aXRoaW4ocXVhcnRlcikgfD4gbGFzdCB8PiBzaGlmdCgtMywgdW5pdDogYml6RGF5KSAgICAgICAgICDigKYgdGhyZWUgYnVzaW5lc3MgZGF5cyBiZWZvcmUgcXVhcnRlci1lbmQKYml6RGF5IHw-IHdpdGhpbihtb250aCkgfD4gbGFzdAo&f=2026-01-01&t=2027-01-01&z=Asia%2FTokyo)
— the 12 last business days of 2026 come out. Swap in any of the other three expressions in the comments
(payment on the 25th, the 10th business day, three business days before quarter-end) and try them.
Everything runs in the browser; nothing is sent anywhere.

## Related

- Month-end in depth: [Last day of the month](cron-last-day-of-month.md) (comparison with cron, loading the same expression onto US holidays, patterns for running it automatically)
- Measured results for the same family: the two meanings of "the 31st of every month", the Nth business day, every N business days — [study 11, measured section](../design/40-examples/11-impossible-schedules.md)

Vocabulary and where the specification is:

- Vocabulary: [`within`](../reference/within.md) · [`nth`](../reference/nth.md) · [`last`](../reference/last.md) ·
  [`roll`](../reference/roll.md) · [`shift`](../reference/shift.md) · [`stride`](../reference/stride.md)
- Bringing in holiday data and its freshness (`covering:`, `asof:`): [spec §4.10](../spec/30-body-layer.md) · [`nonWorking` and `bizDay`](../reference/nonWorking.md)
