---
source_sha: 4062b3af3ebe
---

# `everyDay` — streams every day of the in-scope calendar system

> Translated from the canonical Japanese page [reference/everyDay.md](../../reference/everyDay.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: generator (body-layer core) / **Signature**: `everyDay : () -> Stream` / name settled
(spec §5.4)

## Meaning

Streams every element of the `day` window defined by the in-scope premise's calendar system
(`calendar-system:`), as a time stream. It is the starting point of most body expressions.

Generators are **calendar-system-pure** (I8, ADR-20) — `everyDay` depends only on the calendar
system, never on calendars (business days, holidays). Narrowing to "business days only" is the job
of a downstream [`filter`](filter.md); this separation lets the same expression be reused under a
different calendar.

Under a derived calendar system (a fiscal calendar, etc.) `day` is untouched, so `everyDay`'s
output does not change — a derivation moves only the window cuts (calendar dates stay fixed; I1).

## Examples

```kairos
# eval: 2026-01-01..2026-01-05
@JP
everyDay
#=> 2026-01-01 2026-01-02 2026-01-03 2026-01-04
```

Combined with a window — "the first day of each month":

```kairos
# eval: 2026-01-01..2026-04-01
@JP
everyDay |> within(month) |> first
#=> 2026-01-01 2026-02-01 2026-03-01
```

## Pitfalls

- `everyDay |> first` is a type error (no window; I4). Put up a window with [`within`](within.md) /
  [`segmentBy`](segmentBy.md) before a selector.
- A "**generator** that streams business days" was rejected in ADR-20. Business days are written
  `everyDay |> filter(on: bizDay)` (the sugar `businessDays` is likewise a transform, not a
  generator; F45). Note that naming an entity directly in **axis position**, `filter(on: TSE)`, is
  legal (read as the standard derivation; ADR-35) — what was rejected is the generator, not the
  direct naming.

## See also

[`everyInstant`](everyInstant.md) (every point of the continuous base) · [`filter`](filter.md) ·
public boundary words (`monthEnd = month |> last`, etc.; spec §3.6) · I8 / ADR-20.
