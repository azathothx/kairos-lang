---
source_sha: 6e2f8da48520
---

# `before` — cutting a point set to "strictly before p"

> Translated from the canonical Japanese page [reference/before.md](../../reference/before.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: sugar (stdlib; a Gregorian public word = transform) / **Signature**: `before(p) : Stream -> Stream`
(`p` is a dated date-time literal) / Name final (ADR-55, 2026-10-19, spec §5.4) / **The 1.1 additive extension**

## Meaning

Keeps the input points **strictly before `p` (`p` excluded)**. The expansion is one `filter` stage (sugar = spec §4.8):

```
before(p) = s => s |> filter(t => t < p)
```

Paired with [`since`](since.md) (at or after `p`, inclusive) it cuts the **half-open [since, before)** — the same boundary
convention as the evaluation range `[from, to)`, windows and `isOpen`.

`before` is the **dual on the end side**: in the 1.0 core it could only be written as an `epochOrdinal` ordinal
comparison (with a unit) or as a difference `\` (which stops on a union with alignment "none" and drops windows).

## Examples

**Day granularity** — business days strictly before 10/13 (10/12 is Sports Day):

```kairos
# eval: 2026-10-01..2026-10-20
@JP
bizDay |> before(2026-10-13)
#=> 2026-10-01 2026-10-02 2026-10-05 2026-10-06 2026-10-07 2026-10-08 2026-10-09
```

**Timed** — the deadline day from 9:00 up to but not including 17:00 (17:00 is not in):

```kairos
# eval: 2026-11-04..2026-11-05
@JP
hourly = everyInstant |> strideBy(1h, from: 2026-01-01)
hourly |> since(2026-11-04T09:00) |> before(2026-11-04T17:00)
#=> 2026-11-04T09:00 2026-11-04T10:00 2026-11-04T11:00 2026-11-04T12:00 2026-11-04T13:00 2026-11-04T14:00 2026-11-04T15:00 2026-11-04T16:00
```

## Pitfalls

- **A timed literal on a day-granular stream** — a day's point is 00:00, so `everyDay |> before(2026-11-04T17:00)`
  **includes** 11/4 (00:00 < 17:00). To leave the day out, write the date (`before(2026-11-04)`); to include it, the
  next day (`before(2026-11-05)`) — the same convention as the evaluation range's `to`. No warning is raised
  (documented only).

- **`until:` of [`takeLast`](takeLast.md) is point-inclusive** — `before` is exclusive. "The most recent N" is `until:`;
  "everything strictly before `p`" is `before`.

- **Never embed "now"**, **no standalone time**, **a same-named top-level binding is a static error**, **no new points
  are created** — the same pitfalls as [`since`](since.md).

- It applies as it is to a union with alignment "none" (`(bizDay | hourly) |> before(p)`) — building it with a
  difference `\` is the static error of ADR-36.

## Related

[`since`](since.md) (the pair; at or after `p`) · [`filter`](filter.md) (the expansion) · [`takeLast`](takeLast.md)
(`until:` is point-inclusive) · [`epochOrdinal`](epochOrdinal.md) (the 1.0 form) · spec §4.8 / §4.9 · ADR-55.
