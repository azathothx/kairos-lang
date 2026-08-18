---
source_sha: afac0419542f
---

# Recipes — practical forms of the schedules long said to be unwritable

Schedule requirements that cron, Quartz, and iCalendar RRULE have long been said to be unable to
express, presented as **one page per requirement**. Each page runs "what happens today (with
sources) → the Kairos expression (execution-verified) → try it in your browser" — the answer
first, the background after.

| Page | Requirement |
|---|---|
| [Last day of the month](cron-last-day-of-month.md) | cron's most common stumbling block, up to the last *business* day |
| [Easter](easter-schedule.md) | The canonical movable feast RRULE cannot express — pure arithmetic, zero data |
| [4-4-5 fiscal calendar](4-4-5-calendar.md) | A calendar with no "months"; the 53rd-week rule falls out of the definition |
| [Nearest weekday to the 15th](quartz-15w-nearest-weekday.md) | The general form of Quartz `15W`, extendable to holidays |

- Every code example is execution-verified by the reference implementation's doctests
  (`impl/test/doctest.test.ts`). `# eval:` gives the evaluation range and `#=>` the expected
  output (conventions: [reference](../reference/README.md)). Blocks using `@JP` get the standard
  doctest premise (Gregorian, Asia/Tokyo, wkst: Mon, with a calendar entity carrying Japan's
  confirmed 2026 holidays).
- Each page's Playground link is a **self-contained form** (premise included) — run and edit it
  directly in the browser (the [Playground](../playground/) executes the reference implementation
  as is; nothing is sent to any server).
- The full catalogue of collected "unwritable" cases (32 items with sources) and their three-way
  classification: [study 11](../design/40-examples/11-impossible-schedules.md). These recipes are
  the practical re-arrangement of that study's measured section.
- The language itself: [specification](../spec/) · vocabulary: [descriptor reference](../reference/).
