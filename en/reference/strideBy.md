---
source_sha: c8d01a32fbd6
---

# `strideBy` — step by width, "every w"

> Translated from the canonical Japanese page [reference/strideBy.md](../../reference/strideBy.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: stride (body-layer core) · **Signature**: `strideBy(w, from:) : Stream -> Stream` ·
name settled (spec §5.4)

## Meaning

Marks points at an **equal spacing of width `w`** from the origin `from:`. Where
[`stride`](stride.md) takes "every `n` points of the input" (**counting in points**), `strideBy`
takes "every physical quantity `w`" (**stepping by width**) — the operator for cycles that do not
ride the calendar's rhythm (one Martian sol, every 90 minutes, every 36 hours); the two are split
into separate operators because the argument kinds differ (spec §4.7 · ADR-38).

The origin `from:` is mandatory (ADR-31; the rule shared with `stride` across the family).

## Examples

Every 36 hours (a composite width of elapsed time):

```kairos
# eval: 2026-01-01..2026-01-05
@JP
everyInstant |> strideBy(36h, from: 2026-01-01)
#=> 2026-01-01 2026-01-02T12:00 2026-01-04
```

For every Martian sol, see the example in [`everyInstant`](everyInstant.md)
(`strideBy(24h39m35.244s, from: …)`).

## Pitfalls

- Mind the width conventions: `d` is the **civil day** (it stretches and shrinks under DST; leap
  seconds are out of scope = ADR-33), while `h`/`m`/`s` are **elapsed time**. Mixing (`1d12h`) is
  a static error (ADR-12/28). If you want "the same time every day", use civil-time (calendar)
  operations; if you want "every 86400 seconds", use elapsed time — the two diverge on DST days.
- Thinning **by count**, like "every 3 business days", is [`stride`](stride.md). `strideBy` does
  not count; it measures.

## See also

[`stride`](stride.md) · [`everyInstant`](everyInstant.md) · width literals (spec §5.5 ·
ADR-11/12/28).
