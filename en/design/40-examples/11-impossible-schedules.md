---
source_sha: 418ee2a077e7
---

# 11 — Schedules long said to be unwritable: collecting the world's limitation cases, then measuring them

> Translated from the canonical Japanese study
> [design/40-examples/11-impossible-schedules.md](../../../design/40-examples/11-impossible-schedules.md).
> The code fences are byte-identical to the Japanese original and are executed as doctests there
> (`impl/test/doctest.test.ts`); a consistency check keeps this page in sync.

**Origin** (2026-08-16, designer's instruction): collect the schedule requirements that have been
called "unwritable" in cron, RRULE, and business schedulers, classify them, and verify what Kairos
can do — **by measurement**. The comparison table in spec §1.2 (13 capability rows) was drawn from
the design side; this page walks the same map from the opposite direction, starting from
**requirements where real users reported real failures** (it doubles as 1.0 positioning material
and a seedbed for blog posts).

A disclaimer up front: what follows lists the "can't" of cron, RRULE, and various products, but it
is not a dismissal of those tools. cron's five fields have carried the overwhelming majority of
periodic jobs for fifty years as a **deliberately small tool**, and RRULE is an **interchange
format** with a different design goal. What we collect here are the requirements that stayed
outside those design goals — the territory each community has kept filling with workarounds,
dialect extensions, and purpose-built machinery.

## 11.1 How the cases were collected

Three lines of web research (captured 2026-08-17; every URL verified to exist) plus internal
records:

- **cron family**: frequent Stack Overflow / Server Fault / Unix SE questions, man pages and the
  POSIX text, the Debian bug tracker, HN. 16 items, ranked by view counts.
- **RRULE / iCalendar family**: RFC 5545/7529 discussions, CalConnect recommendations, issues of
  the major implementations (dateutil, rrule.js, ical4j, lib-recur). 14 items, **distinguishing
  the limits of the spec from the limits of implementations**.
- **Calendar APIs / business systems**: Google Calendar and Microsoft Graph specifications,
  Kubernetes / Airflow / Quartz / ADF issues, the dedicated features of payroll and accounting
  SaaS. 17 items.
- **Internal records**: the expressibility reflux reports (25 standard B2B forms — 21/25 writable
  and the remaining 4 settled as F100–F103; 15 calendar-and-almanac formulas — only two could not
  be written), studies 01–10, and the out-of-scope F numbers (F8, F24).

## 11.2 The catalog — collected requirements and verdicts

Verdicts: **vocabulary** = writable with the current vocabulary (→ measured below); **data** =
writable once authoritative data is brought in via external/table literals (the intake and its
governance are settled in ADR-26/37); **out of scope** = deliberately outside the design, with the
receptacle named.

| # | Requirement | Where it failed (representative source) | Kairos verdict |
|---|---|---|---|
| 1 | Last day of month / N days before month end | cron's most frequent failure ([SO, 325k views](https://stackoverflow.com/questions/6139189/cron-job-to-run-on-the-last-day-of-the-month)); K8s CronJob is a [reopened-issue loop](https://github.com/kubernetes/kubernetes/issues/121088); `L` is a dialect that does not port | vocabulary (<code>month &#124;> last</code>, settled in spec §1.2) |
| 2 | Last business day of month | Google Calendar only via [ICS import with an "uneditable" warning](https://www.garethjmsaunders.co.uk/2022/03/26/how-to-set-up-recurring-events-on-the-last-working-day-of-the-month-in-google-calendar/); Quartz `LW` ignores holidays | vocabulary + data (→ (a)) |
| 3 | Day-of-month AND day-of-week (Friday the 13th) | POSIX specifies **OR** for DOM/DOW; [Debian Bug #460070, 15 years wontfix](https://groups.google.com/g/linux.debian.bugs.dist/c/LM4Rqrf9oQM); Vixie cron's own source: "bizarre… it's the standard" | vocabulary (`filter` with and; blog #3) |
| 4 | Nth weekday (Patch Tuesday; reboot on 3rd Tuesday) | `15-21 * * 2` hit the OR trap and [rebooted every system on the 3rd Wednesday](https://superuser.com/questions/348348/crontab-day-of-week-vs-day-of-month) | vocabulary (→ (h)) |
| 5 | Last ○day of month (release on last Friday) | month-length variation × OR trap; [croniter ended up implementing calendar back-search itself](https://github.com/taichino/croniter/issues/159) | vocabulary (<code>filter(Fri) &#124;> within(month) &#124;> last</code>; alternative in reference/roll.md) |
| 6 | Nth business day / 10th business day | [ADF: "not achievable with regular triggers"](https://stackoverflow.com/questions/76503521/how-to-schedule-an-azure-datafactory-pipeline-to-run-on-every-nth-business-day); Quartz answer: "CRON… will probably never support holidays" | vocabulary + data (→ (i); F102 settled) |
| 7 | Payday roll (25th; previous business day if holiday) | RRULE: ["I don't think it possible"](https://stackoverflow.com/questions/38170676/recurring-calendar-event-on-first-of-the-month); EXDATE deletes but **cannot generate the substitute day**; the impossibility [motivated a new DSL](https://dev.to/chatii/schedules-are-rules-not-lists-of-timestamps-introducing-yarunoka-98i) | vocabulary + data (`roll`; doctest at spec §7.4) |
| 8 | Weekdays minus holidays (skip 3-day-weekend Mondays) | cron has no external calendar; [100 machines run on manual crontab comment-outs](https://superuser.com/questions/239591/cron-tips-for-not-running-cron-jobs-on-holidays-the-monday-of-a-three-day-weeke); Airflow gave up on cron and [built the Timetable mechanism](https://airflow.apache.org/docs/apache-airflow/stable/howto/timetable.html) | vocabulary + data (`bizDay` cascade; study 01) |
| 9 | Biweekly (14-day payroll, 26 runs/year) | cron resets at month boundaries; [Quartz's official cookbook concedes "CronTrigger won't work"](https://www.quartz-scheduler.org/documentation/quartz-2.2.2/cookbook/BiWeeklyTrigger.html); the ISO-week-parity hack double-fires on week 53 | vocabulary (`stride(2, from:)`; F103 settled; → (c)) |
| 10 | Every N days across month boundaries | `*/10` resets each month; [Debian's own man page ships the epoch-seconds-modulo hack](https://manpages.debian.org/bookworm/cron/crontab.5.en.html) | vocabulary (→ (c)) |
| 11 | Every 90 minutes (intervals not dividing 60/24) | [SO, 68k views](https://stackoverflow.com/questions/247626/how-can-i-set-cron-to-run-certain-commands-every-one-and-a-half-hours): "not possible with a single expression" | vocabulary (`strideBy(1h30m)`; → (l)) |
| 12 | Sub-minute (every 30 seconds) | cron's granularity floor ([SF, 81k views](https://serverfault.com/questions/49082/can-i-run-a-cron-job-more-frequently-than-every-minute); `sleep 30` twice is the folklore) | vocabulary (`strideBy(30s)`; granularity is a projection of the continuous base — no floor) |
| 13 | Time-boxed recurrence (daily 7:00 from 6/29 to 12/30) | cron has neither years nor periods; [the accepted answer: "comment it out by hand before next year"](https://stackoverflow.com/questions/704927/does-cron-expression-in-unix-linux-allow-specifying-exact-start-and-end-dates) | vocabulary (definition/evaluation-range separation is first-class; in-language too → (n)) |
| 14 | Exclusion / negation (skip one specific date; pause 1–3 am on 2nd/4th Sundays) | cron has no NOT ([20k views](https://unix.stackexchange.com/questions/236120/excluding-specific-date-and-time-in-cronjob)); RFC 5545 **abolished** EXRULE | vocabulary (`\` and `filter(not …)`; → (o)) |
| 15 | Twice-monthly in one series (1st & 15th; 2nd Tue & 4th Thu) | Graph API's [closed set of 6 patterns](https://learn.microsoft.com/en-us/graph/api/resources/recurrencepattern?view=graph-rest-1.0); `BYDAY=2TU,4TH` is legal yet Outlook rejects it and [W3C gave up publishing it](https://github.com/w3c/calendar/issues/25) | vocabulary (combinator <code>&#124;</code>; → (h)) |
| 16 | Union / intersection of rules (8:00 and 9:30 daily; every 3 days ∩ Mondays) | BY clauses are products only; RFC 5545 made multiple RRULEs **undefined**; RRuleSet is [non-standard and does not travel in .ics](https://www.vitavonni.de/blog/200702/2007021501-icalendar-is-broken.html) | vocabulary (closure everywhere; combinators are the core. ADR-04/22) |
| 17 | Different times per weekday (Tue/Wed 15:00, Fri 17:00) | [Google Calendar API: one time per series](https://stackoverflow.com/questions/62979226/how-do-i-repeat-the-event-at-different-times-weekly) — "override each instance" is the answer | vocabulary (→ (k)) |
| 18 | Every 3rd business day (weekends not counted) | ["There's no way to do that natively with Google Calendar"](https://webapps.stackexchange.com/questions/88418/google-calendar-recurring-event-every-x-weekdays) — decompose by hand into 3 series over 3 weeks | vocabulary + data (→ (i)) |
| 19 | Weekday nearest the 15th (Quartz `15W`) | absent from RRULE; even the Quartz dialect ignores holidays | vocabulary (finite case-split composition; → (e)) |
| 20 | Easter and its movable companions | inexpressible in RFC 5545/7529; [dateutil's `byeaster` self-describes as "an extension to the RFC"](https://dateutil.readthedocs.io/en/stable/rrule.html); there is even a [repo of approximate RRULEs valid only 1900–2099](https://github.com/sappjw/calendars) | vocabulary (**pure arithmetic, zero data**; → (g)) |
| 21 | Offsets from a computed anchor (Sunday after Thanksgiving; US election day) | RRULE has no "day found by another rule + n days"; [the negative-BYYEARDAY hack breaks across month boundaries](https://stackoverflow.com/questions/72777808/rrule-and-ical-complex-recurrence) | vocabulary (closure of selectors + point transforms; → (f)) |
| 22 | Monthly on the 31st — the two meanings for short months (skip vs snap) | RFC 5545 silently skips; the remedy SKIP (RFC 7529) has been [unimplemented by major libraries for 11 years](https://github.com/jkbrzt/rrule/issues/133) | vocabulary (**the two meanings are two different expressions**; → (b)) |
| 23 | Non-Gregorian recurrence (lunisolar, Hijri, Hebrew) | [CalConnect: "not possible within the basic iCalendar notation"](https://www.calconnect.org/news/2014-06-19-rrules-and-rscale-examples-for-non-gregorian-recurring-events-in-icalendar/); RSCALE nearly unimplemented; Android rejects it | vocabulary (rule-based calendars are premise definitions = proven in study 10) / data (observation-based) |
| 24 | Hindu lunisolar calendar (Diwali) | **absent from RSCALE's value domain** (the CLDR registry) — even a complete RFC 7529 implementation cannot write it | data (external data + covering/asof; the rule part of the calendar windows in a premise) |
| 25 | Dates fixed by astronomy or gazette (Japan's equinox holidays; sighting-based Islamic feasts) | **in principle** no rule determines the future date — every calendar product updates by hand yearly | data (this is what `external`/`covering`/`asof` exist for; 01/03, blog #14) |
| 26 | Shift rotations (4-on-4-off; DuPont 28-day) | aligned to neither week nor month, structurally beyond RRULE; shift SaaS ships [pattern strings + **expanded .ics** export](https://www.rotaplanner.app/shift-patterns/) | vocabulary (an 8-day `cycle`; → (j)) |
| 27 | 4-4-5 accounting calendar (53rd-week catch-up included) | a calendar without "months", so month-based vocabulary is useless; [accounting SaaS implement it as a dedicated feature](https://help.anaplan.com/set-the-weeks-4-4-5-4-5-4-or-5-4-4-calendar-150f3b73-8be1-4d95-92fd-24daa46ae869) | vocabulary (a derived premise; **the 53rd week falls out of the structure**; → (m)) |
| 28 | Garbage-day holiday cascade (everything after a holiday slides one day that week) | holiday data × conditionals × chained shifts — triple out of RRULE; [per-municipality code generating expanded ICS](https://github.com/fromtheboonies/TrashCal) is the norm | vocabulary + data (one step is `roll`/case-split; **unbounded recursion is out of scope = F8**, fixed-depth expansion is the receptacle) |
| 29 | "n sessions total even after cancellations" (refill to keep COUNT) | COUNT counts **before** exclusion; [not possible in rrule.js either](https://github.com/jkbrzt/rrule/issues/456) | **out of scope** (no "first N" selector — demand-gated; this survey found the first real demand → §11.5) |
| 30 | Feedback on execution state (5 hours after the last run finished) | outside cron/RRULE too (it is execution, not definition) | **out of scope → decompose** (next-fire from an injected instant = spec §7.7; doctests in study 07) |
| 31 | One fixed time "correct for every participant" under mixed DST | ["The answer is: there is no answer"](https://zachholman.com/talk/utc-is-enough-for-everyone-right) — products **silently** let the organizer's TZ win | the requirement itself is ambiguous; Kairos's receptacle = **explicit premise** (the language makes you say whose wall clock; blog #15, spec §3.6) |
| 32 | Definitions that cross system boundaries **as rules** | Outlook's internal rules degrade to expanded points at the RRULE/Graph boundary; [Exchange speaks a different format entirely](https://www.nylas.com/blog/calendar-events-rrules/) | yes (definitions are text; the CLI/doctests are the interchange form; structural contrast in 10 §10.1) |

Cross-checking the reflux record: the 25 standard B2B forms (3rd reflux) are mostly variations of
rows 2, 6, 7, 8, 9 — all reached writable. Of the 15 calendar-and-almanac formulas (5th reflux),
the two that could not be written (nine-star daily boards, planetary hours) fall on the data side
of row 25 (astronomy-dependent).

## 11.3 Measurements — writing the representative cases in the current vocabulary

The ```kairos blocks below are executed by the doctest harness (`impl/test/doctest.test.ts`).
Unless noted, the premise is `@JP` (Gregorian, Asia/Tokyo, wkst: Mon — the standard doctest
premise, which carries a calendar entity with Japan's confirmed 2026 holidays; `bizDay` and
`holidays2026` come from it. ADR-35).
The four highest-demand cases ((a) last business day, (e) 15W, (g) Easter, (m) 4-4-5) are also
re-arranged as searcher-facing practical pages in the [recipes](../../../en/recipes/README.md)
(with self-contained Playground links).

### (a) Last business day of the month — cron's most frequent failure (catalog 1, 2)

```kairos
# eval: 2026-01-01..2026-07-01
@JP
bizDay |> within(month) |> last
#=> 2026-01-30 2026-02-27 2026-03-31 2026-04-30 2026-05-29 2026-06-30
```

January's end (1/31 Sat) and May's end (5/30 Sat, 5/31 Sun) correctly retreat to Friday.

### (b) Monthly on the 31st — writing the two meanings for missing months (catalog 22)

RRULE's `BYMONTHDAY=31` silently skips short months; RFC 7529's `SKIP=BACKWARD` snaps to month
end — **only the author knows which was intended**, yet both fall silently to a default. In
Kairos the two meanings are two different expressions. The skip form:

```kairos
# eval: 2026-01-01..2026-07-01
@JP
everyDay |> within(month) |> nth(31)
#=> 2026-01-31 2026-03-31 2026-05-31
```

Months without a 31st are a **legitimate empty** (the expression reads as "only months where a
31st exists"). The snap form uses the month-length projection (`daysInMonthOf`, the F101 sugar):

```kairos
# eval: 2026-01-01..2026-07-01
@JP
day30 = everyDay |> within(month) |> nth(30)
short = (everyDay |> within(month) |> last) |> filter(d => daysInMonthOf(d) < 30)
day30 | short
#=> 2026-01-30 2026-02-28 2026-03-30 2026-04-30 2026-05-30 2026-06-30
```

### (c) Every N days / biweekly — stable across month boundaries (catalog 9, 10)

cron's `*/10` resets inside each month and never means "every 10 days" (acknowledged by the man
page). Kairos strides count the input (ADR-38), immune to boundaries:

```kairos
# eval: 2026-01-01..2026-03-01
@JP
everyDay |> stride(10, from: 2026-01-05)
#=> 2026-01-05 2026-01-15 2026-01-25 2026-02-04 2026-02-14 2026-02-24
```

Biweekly Friday (the 26-payrolls-a-year form; F103 settled):

```kairos
# eval: 2026-01-01..2026-03-15
@JP
everyDay |> filter(d => weekday(d) == Fri) |> stride(2, from: 2026-01-09)
#=> 2026-01-09 2026-01-23 2026-02-06 2026-02-20 2026-03-06
```

### (d) Three business days before quarter end — business-day arithmetic with freshness alongside (catalog 6 family)

Business-day **arithmetic** (counting, not skipping) is impossible in cron and RRULE, and even
business-calendar products stop at before/after flags (spec §1.2). Kairos has the general
arithmetic — and where the data runs out, **an annotation rides along**:

```kairos
# eval: 2026-01-01..2027-01-01
@JP
bizDay |> within(quarter) |> last |> shift(-3, unit: bizDay)
#=> 2026-03-26 2026-06-25 2026-09-25 2026-12-28
#~> 範囲外 2026-12-29..2027-01-01（holidays2026 covering 2026-01-01..2026-12-31, asof 2026-01-05）
```

### (e) Weekday nearest the 15th — Quartz `15W` by composition (catalog 19)

There is no `Nearest` roll convention, but a **finite case-split composition** writes it directly:

```kairos
# eval: 2026-01-01..2026-12-31
@JP
weekdays = everyDay |> filter(d => weekday(d) != Sat and weekday(d) != Sun)
d15 = everyDay |> within(month) |> nth(15)
(d15 |> filter(d => weekday(d) != Sat and weekday(d) != Sun))
  | (d15 |> filter(d => weekday(d) == Sat) |> roll(Preceding, on: weekdays))
  | (d15 |> filter(d => weekday(d) == Sun) |> roll(Following, on: weekdays))
#=> 2026-01-15 2026-02-16 2026-03-16 2026-04-15 2026-05-15 2026-06-15
#=> 2026-07-15 2026-08-14 2026-09-15 2026-10-15 2026-11-16 2026-12-15
```

February, March, November (15th on Sunday) go to Monday; August (15th on Saturday) retreats to
Friday 8/14.

### (f) Offsets from computed anchors — US election day and the Sunday after Thanksgiving (catalog 21)

"The Tuesday after the first Monday of November" (US election day) can only be encoded in RRULE
as `BYDAY=TU;BYMONTHDAY=2,3,4,5,6,7,8` — **the intent is gone**. Kairos writes it in the order
the statute says it:

```kairos
# eval: 2024-01-01..2029-01-01 tz: America/New_York
premise US {
  calendar-system: Gregorian
  tz: "America/New_York"
  wkst: Sun
}
@US
firstMonNov = everyDay |> filter(d => weekday(d) == Mon and month(d) == 11) |> within(year) |> first
firstMonNov |> shift(+1, unit: day)
#=> 2024-11-05 2025-11-04 2026-11-03 2027-11-02 2028-11-07
```

"The Sunday after Thanksgiving (4th Thursday of November)" is the type where **some years cross
into the next month**, which breaks the negative-BYYEARDAY hack — under closure (a derived stream
feeds the next operator) the crossing is a non-event:

```kairos
# eval: 2024-01-01..2028-01-01 tz: America/New_York
premise US {
  calendar-system: Gregorian
  tz: "America/New_York"
  wkst: Sun
}
@US
thanksgiving = everyDay |> filter(d => weekday(d) == Thu and month(d) == 11) |> within(month) |> nth(4)
thanksgiving |> roll(Following, on: (everyDay |> filter(d => weekday(d) == Sun)))
#=> 2024-12-01 2025-11-30 2026-11-29 2027-11-28
```

2024 gives 12/1 — **the month crossing comes out right**.

### (g) Easter — the flagship movable feast RRULE cannot write (catalog 20; the sequel to 03 §3.5)

At exploration time, 03 §3.5 judged this "the value computes; lifting to instants needs
completion" (F28). With the projection family settled (ADR-27/30) it now **closes in the current
vocabulary alone** — the Computus (Anonymous Gregorian algorithm) as pure arithmetic with zero
data:

```kairos
# eval: 2024-01-01..2029-01-01 tz: UTC
premise W {
  calendar-system: Gregorian
  tz: "UTC"
  wkst: Mon
}
@W
a = y => y mod 19
b = y => y div 100
h = y => (19*a(y) + b(y) - b(y) div 4 - (b(y) - (b(y)+8) div 25 + 1) div 3 + 15) mod 30
l = y => (32 + 2*(b(y) mod 4) + 2*((y mod 100) div 4) - h(y) - (y mod 100) mod 4) mod 7
m = y => (a(y) + 11*h(y) + 22*l(y)) div 451
eMonth = y => (h(y) + l(y) - 7*m(y) + 114) div 31
eDay   = y => ((h(y) + l(y) - 7*m(y) + 114) mod 31) + 1
everyDay |> filter(d => month(d) == eMonth(year(d)) and ordinalIn(day, month, d) == eDay(year(d)))
#=> 2024-03-31 2025-04-20 2026-04-05 2027-03-28 2028-04-16
```

All five years match the publicly known Easter Sundays. **The verdict of 03 §3.5 is hereby
upgraded to "writable"** (the measured proof that F28 is resolved; Good Friday and Easter Monday
are one `shift(±n, unit: day)` away).

### (h) Twice a month in one series — the form W3C gave up on (catalog 4, 15)

The 2nd Tuesday (Patch Tuesday) and the 4th Thursday as **one definition**:

```kairos
# eval: 2026-01-01..2026-06-01
@JP
tue2 = everyDay |> filter(d => weekday(d) == Tue) |> within(month) |> nth(2)
thu4 = everyDay |> filter(d => weekday(d) == Thu) |> within(month) |> nth(4)
tue2 | thu4
#=> 2026-01-13 2026-01-22 2026-02-10 2026-02-26 2026-03-10 2026-03-26
#=> 2026-04-14 2026-04-23 2026-05-12 2026-05-28
```

"Create two series" (Graph API's answer, W3C's ruling) is the absence of a combinator leaking
onto humans — with `|` in the language, the definition closes on its own side.

### (i) 10th business day; every 3rd business day (catalog 6, 18)

The 10th business day that ADF called "not achievable", and the every-3rd-business-day that
Google Calendar has "no native way" to do. Once the business-day stream exists, both are old
vocabulary:

```kairos
# eval: 2026-01-01..2026-06-01
@JP
bizDay |> within(month) |> nth(10)
#=> 2026-01-16 2026-02-16 2026-03-13 2026-04-14 2026-05-19
```

```kairos
# eval: 2026-01-01..2026-03-01
@JP
bizDay |> stride(3, from: 2026-01-05)
#=> 2026-01-05 2026-01-08 2026-01-14 2026-01-19 2026-01-22 2026-01-27
#=> 2026-01-30 2026-02-04 2026-02-09 2026-02-13 2026-02-18 2026-02-24 2026-02-27
```

Coming-of-Age Day (1/12) and National Foundation Day (2/11) are correctly left out of the count
(three business days after 1/8 is 1/14; after 2/9 it is 2/13).

### (j) 4-on-4-off — an 8-day cycle aligned to neither week nor month (catalog 26)

The form shift SaaS works around with pattern strings (`DDDD----`) and expanded .ics. It is
exactly an 8-day `cycle` (parallel labels):

```kairos
# eval: 2026-01-05..2026-01-25
premise Rota = Gregorian with {
  duty = day cycle [On, On, On, On, Off, Off, Off, Off] anchor: 2026-01-05
}
premise JPR { calendar-system: Rota; tz: "Asia/Tokyo"; wkst: Mon }
@JPR
everyDay |> filter(d => duty(d) == On)
#=> 2026-01-05 2026-01-06 2026-01-07 2026-01-08
#=> 2026-01-13 2026-01-14 2026-01-15 2026-01-16
#=> 2026-01-21 2026-01-22 2026-01-23 2026-01-24
```

DuPont (28-day cycle, different start times for day and night shifts) is the same shape — a
28-label cycle composed with the time attachment of (k) via `|`.

### (k) Different times per weekday, one series (catalog 17)

The same class at 15:00 on Tue/Wed and 17:00 on Fri. The one-time-per-series restriction (Google
Calendar API) dissolves once time is not an attribute of the series but a **merge of streams**:

```kairos
# eval: 2026-01-05..2026-01-12
@JP
at15 = everyInstant |> strideBy(1d, from: 2026-01-05T15:00) |> filter(d => weekday(d) == Tue or weekday(d) == Wed)
at17 = everyInstant |> strideBy(1d, from: 2026-01-05T17:00) |> filter(d => weekday(d) == Fri)
at15 | at17
#=> 2026-01-06T15:00 2026-01-07T15:00 2026-01-09T17:00
```

### (l) Every 90 minutes inside business hours, resetting at 9:00 each morning (catalog 11)

There is no `hour` window in the Gregorian standard, but **a calendar atom is one line away**
(grid; the second use sanctioned by ADR-41):

```kairos
# eval: 2026-01-05..2026-01-07
premise Hourly = Gregorian with { hourW = chronos grid 1h }
premise JPH { calendar-system: Hourly; tz: "Asia/Tokyo"; wkst: Mon }
@JPH
everyInstant |> strideBy(1h30m, from: 2026-01-05T09:00)
  |> filter(d => ordinalIn(hourW, day, d) >= 10 and ordinalIn(hourW, day, d) <= 17)
#=> 2026-01-05T09:00 2026-01-05T10:30 2026-01-05T12:00 2026-01-05T13:30 2026-01-05T15:00 2026-01-05T16:30
#=> 2026-01-06T09:00 2026-01-06T10:30 2026-01-06T12:00 2026-01-06T13:30 2026-01-06T15:00 2026-01-06T16:30
```

(90 minutes divides 24h, so the morning phase is preserved. If an interval that does not divide
the day must "reset every morning" strictly, fall back to the in-window stride — the modulo form
of `ordinalIn`; see reference/ordinalIn.md.)

### (m) The 4-4-5 accounting calendar — the 53rd week falls out of the structure (catalog 27)

The 4-4-5 that accounting SaaS ship as a dedicated feature. Period starts are "the Mondays of ISO
weeks 1, 5, 9, 14, …, 48", used as markers for `segmentBy`:

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

ISO year 2026 has 53 weeks — the final period P12 **stretches automatically to six weeks**
(11/23 through 2027-01-03, absorbing W49–W53), and the next year restarts cleanly at W01
(2027-01-04). **Not one line of catch-up rule was written** — the NRF-style "add it to the last
period" follows as a consequence of "period starts stop at W48". (The seemingly canonical
`isoYear split (…) by: isoWeek` was rejected on the parent's window kind — see F109 in §11.5.)

### (n) Time-boxed recurrence (catalog 13)

The first receptacle is the **separation of definition and evaluation range** itself (definitions
are tenseless; evaluation always runs over a bounded [from, to) — cron's "comment it out by hand
next year" is the consequence of not being able to put a period into a definition). When the
period must live in the definition, ordinal comparison over the resident calendar does it:

```kairos
# eval: 2026-06-25..2026-07-03
@JP
everyInstant |> strideBy(1d, from: 2026-01-01T07:00)
  |> filter(d => epochOrdinal(day, d) >= epochOrdinal(day, 2026-06-29) and epochOrdinal(day, d) <= epochOrdinal(day, 2026-12-30))
#=> 2026-06-29T07:00 2026-06-30T07:00 2026-07-01T07:00 2026-07-02T07:00
```

(Direct comparison of a point against a date literal, `d >= 2026-06-29`, is absent from the value
layer — `epochOrdinal` is the current canonical route. → §11.5)

### (o) Exclusion and negation (catalog 14)

Removing exactly one date (2026-05-10) from a weekend-18:00 series:

```kairos
# eval: 2026-05-01..2026-05-18
@JP
weekend18 = everyInstant |> strideBy(1d, from: 2026-01-01T18:00)
  |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
weekend18 |> filter(d => not (ordinalIn(day, month, d) == 10 and month(d) == 5))
#=> 2026-05-02T18:00 2026-05-03T18:00 2026-05-09T18:00 2026-05-16T18:00 2026-05-17T18:00
```

Only 5/10 (Sunday) disappears; the neighboring weekends stay. The "pause 1–3 am on the 2nd and
4th Sundays" class (maintenance windows) is the same `filter(not …)` + `ordinalIn` composition.

## 11.4 The three-way classification — what "unwritable" really was

The collected "can't"s split three ways.

**(A) Writable with vocabulary** — 22 of the 32 catalog items. The failures were rooted in the
**structure** of the existing formats (field products, monthly resets, one-series-one-time,
closed pattern sets), and they vanish under the vocabulary design (closure, combinators,
windows/selectors, the premise layer). All 17 measurements above live here — **zero language
changes, zero new vocabulary**. The four operations the RRULE survey found missing (external data
reference, conditional rolling, offsets from computed anchors, unions/intersections of rules)
correspond one-to-one to four spines of Kairos (entity declaration + external; roll; closure +
point transforms; combinators) — the skeleton derived at design time from the comparison table
(spec §1.2) landed exactly on the distribution of real users' failures.

**(B) Writable with data** — holidays, gazettes, astronomy, observation. Not a defeat of
vocabulary but a matter of **where knowledge comes from**; no tool can write these from rules in
principle (Japan's equinox holidays are not official until the gazette announcement the previous
February). The difference from the existing formats is not "writable or not" but **whether the
language says it is data** — covering/asof/runway ride along with the answer (ADR-26/37; blog #5
"Holiday tables rot silently"; #14).

**(C) Deliberately out of scope** — declined, with the receptacle in writing. Only three of the
collected items land here:

| Out of scope | Receptacle | What this survey added |
|---|---|---|
| Execution feedback ("5 hours after the last completion") | decompose into next-fire from an injected instant (spec §7.7; study 07) | cron/RRULE can't either — corroborates the "this is not definition" boundary |
| **Unbounded recursion** of substitution/shifts (the slid day is itself a holiday, ad infinitum) | fixed-depth expansion (F8; 01 §1.4) | the garbage-cascade cases (a real two-step slide report exists) — practice needs 1–2 steps |
| "First N" selection (COUNT-style; refill after exclusion) | bounding via evaluation range / covering (spec §1.2) | **first real demand evidence** (rrule.js #456; the lessons business) → §11.5 |

What the three have in common: the receptacle **names the decomposition instead of approximating
silently**. Since so many of the collected failures stem from **silent defaults** — "silently
becomes OR", "silently skips", "the organizer's TZ silently wins" (catalog 3, 22, 31) — the
out-of-scope side refusing to be silent is the closing contrast of this page.

## 11.5 Yield — tears, demand, verdict updates

Four records from the measurements:

- **F109** (new; filed in 90-findings): **`split` does not accept an interval-sequence
  (segmentBy-built) parent window.** The natural statement of 4-4-5,
  `isoYear split (y => …) by: isoWeek`, is rejected with "not a partition window" — although
  isoYear is an effective partition that `within` accepts under the I5 check. Not an
  expressiveness hole (the segmentBy canonical form works; measured in §(m)), but for
  variable-length years (52/53 weeks) the split lambda (parent ordinal → width list) is closest
  to the intent. Widening acceptance needs a consistency ruling against ADR-08 (the two window
  kinds) — **awaiting ruling; does not block 1.0**.
- **No ordering comparison between a point and a date literal** (`d >= 2026-06-29` fails with
  "not a number"). Current receptacles: the evaluation-range separation (first) and
  `epochOrdinal` ordinal comparison ((n)). Readable as the same governance that kept point ±
  width arithmetic out (ADR-34: points are not bare numbers), though ordering is arguably a
  separate question from arithmetic — a sugar candidate if demand persists (recorded only; no F
  number).
- **No `hour` window in the Gregorian standard.** Proven definable as a one-line derived premise
  (`chronos grid 1h`) in (l) — added "sub-day windows" to the standard-sugar work item (the F1
  family, already listed in 90-open-questions).
- **First confirmed real demand for a "first N" selector** (catalog 29). spec §1.2 had kept it
  "demand-gated"; rrule.js #456 (refill to keep n sessions after cancellations; a staple of the
  lessons business) is the real case. A design memo is also recorded: were it introduced,
  "count **after** exclusion" falls out of composition order (`(lessons \ cancelled) |> take(5,
  …)`) — a shape that structurally avoids RRULE's COUNT trap. **Awaiting ruling (whether to
  introduce it at all is the designer's call).**

One verdict update: **03 §3.5 Easter, "value computes / lifting needs completion" → "writable"**
(the measurement in (g); the proof that F28 is resolved).

**(Postscript, same day, 2026-08-17)**: three of the four records above **went the whole way —
ruling → candidate design → four-perspective verification → ADR → implementation — within the
day**: F109 → **ADR-48** (split's widened acceptance, restricted to rule markers; the split form
of 4-4-5, with the g(i) 53-week branch, measured extensionally identical to the canonical form of
§(m)) · first-N → **ADR-49 `take(n, from:)`** (catalog 29 moves from "out of scope" to
**"vocabulary"** — the first case of a named receptacle turning into an adopted word within one
day of demand evidence; class C shrinks to two items) · the hour window → **ADR-50**
(standardization plus the new ordinalIn alignment check — including the episode of verification
refuting the first calibration by measurement). Only point-vs-date-literal comparison stays under
watch. 555 tests.

## 11.6 Summary — as 1.0 positioning material

- **17 measurements of "things said to be unwritable" — all in the current vocabulary, zero
  language changes.** The 32 collected items classify as A 22, B 7, C 3 — everything out of
  scope has its receptacle in writing.
- Measurements usable as headline material: last business day of month (a 325k-view failure in
  one line); Easter (the RFC's flagship impossibility in 8 lines of zero-data arithmetic); 4-4-5
  (a SaaS dedicated feature in a 5-line premise with the 53rd week falling out of the
  structure); twice-monthly in one series (what W3C gave up on, via a single `|`); monthly on
  the 31st (silent defaults vs writing the two meanings apart).
- Blog seed candidates: a survey post ("what cron cannot write" — the catalog table is the
  outline); an Easter post (the Computus story); a 4-4-5 post (accounting calendars and week
  53); a "silent defaults" essay (the OR trap, SKIP, organizer-TZ — three silences, and a design
  that refuses to be silent).
