---
source_sha: da899f1dbe12
---

# `snapTo` — map to the first point of the containing window (floor)

> Translated from the canonical Japanese page [reference/snapTo.md](../../reference/snapTo.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: point transform (body-layer core) / **Signature**: `snapTo(w) : Stream -> Stream` /
name settled (RC2 · spec §5.4)

## Meaning

Maps each point to the **first point** of the `w` window it **belongs to** (floor). The operator
that aligns granularity seams — dropping timed astronomical events (the instant of a solar term,
the instant of a new moon) onto "their day", folding a timed sequence to the start of "its month",
and so on.

It stands in a complementary relation, with a different entrance, to the public boundary words
(`monthStart = month |> first` = window → point) — `snapTo` is **point → point (of the containing
window)** and passes through no selector (settled as a basic word in ADR-30 (6)).

**Second role (ADR-36)**: because the output constructively aligns to `w`'s element grid, it
doubles as the **explicit means of conformance** for the combinators `&`/`\` and the
axis-membership alignment checks (spec §4.5). On points already aligned it is identity — only the
alignment claim is reattached.

## Examples

Drop the instant of Risshun (2/4 05:02) onto its calendar day:

```kairos
# eval: 2026-01-01..2026-03-01
@JP
sekki = [2026-01-05T17:23, 2026-01-20T10:45, 2026-02-04T05:02]
  covering: 2026..2026
  labels: [小寒, 大寒, 立春]
sekki |> filter(s => sekki(s) == 立春) |> snapTo(day)
#=> 2026-02-04
```

The instant of a new moon to the new-moon day (the date used as the boundary of a lunisolar
month):

```kairos
# eval: 2026-01-01..2026-02-01
@JP
newMoons = [2026-01-19T04:52]
newMoons |> snapTo(day)
#=> 2026-01-19
#~> 範囲外 2026-01-01..2026-02-01（newMoons covering 2026-01-19T04:52..2026-01-19T04:52）
```

## Pitfalls

- A new moon at 21:01 also floors to **that day** (no rounding up). If a "carry to the next day"
  convention is wanted, write it explicitly: `snapTo(day) |> shift(+1, unit: day)`.
- Distinct points belonging to the same window fold into one point (streams are sets).
- Under **non-total windows** (window sequences with holes, such as a `segmentBy` window with
  `edges: drop`), a point may belong to no window. The behavior is the three-way out-of-coverage
  fork (ADR-37): if the point is outside the window data's **effective coverage**, drop it and
  annotate the interval; outside the materialization horizon, a warning; **a gap inside the
  coverage is a static error** ("snapTo: point outside windows" — a detector for corrupted data or
  a mixed-up expression; it never passes silently).
- Label projections (`sekki(s)`) read **the original point** — after snapping, the point is no
  longer an element of the table and cannot be read. Write read-then-map, in that order (the
  example above).
- **snapTo is chronos membership** (floor into the window containing the same instant) — across
  tzs, the first point of a Tokyo day lands on the **previous day** in NY (a systematic one-day
  shift; that is the chronos fact). The means of conformance are three: for the same **instant**,
  snapTo; for the same **date**, [`rebase`](rebase.md); for timed **membership**,
  [`coincides`](coincides.md) (for cross-tz, first unify the tz with rebase).

## Related

[`shift`](shift.md) · [`rebase`](rebase.md) (re-anchoring by date-label correspondence) ·
[`segmentBy`](segmentBy.md) (cut at snapped markers) ·
[combinators](combinators.md) (the means of conformance for alignment checks) ·
public boundary words (spec §3.6) · ADR-27/30/36.
