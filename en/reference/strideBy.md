---
source_sha: 01f3b9f86284
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
ride the calendar's rhythm (one Martian sol, every 90 minutes, every 36 hours); together with
[`take`](take.md) and [`takeLast`](takeLast.md) they form the stride family's four operators,
split apart because the argument kinds differ (spec §4.7 · ADR-38/49/52).

The origin `from:` is mandatory (ADR-31; the rule shared with `stride` across the family).
**`from:` is forward-only** — nothing is generated before the origin (an evaluation range before
the anchor is silently empty). To lay a wall-clock tick over any period, pass a **standalone time
literal** `Thh:mm` as `from:` — anchoring at the epoch anchor day 1970-01-01 structurally removes
the gap (civil 1d width only; ADR-51). If you write a dated anchor, pick a date before the
evaluation range.

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

<p align="center"><img src="../../assets/figures/civil-day-dst.svg" width="880"
  alt="New York's civil days from 2026-03-06 to 03-09 laid on one physical time axis (evaluation range 2026-03-06..2026-03-10, tz America/New_York). On Sunday, March 8, the clocks jump from 02:00 to 03:00, so that civil day is 23 hours; the other three days are 24 hours. Stepping by 1d, everyInstant |&gt; strideBy(1d, from: 2026-01-01T09:00) sticks to 09:00 on 3/6, 3/7, 3/8 and 3/9 (3/7 09:00 to 3/8 09:00 is 23 hours). Stepping by 24h, strideBy(24h, from: 2026-01-01T09:00) gives 3/6 09:00 and 3/7 09:00, then 3/8 10:00 and 3/9 10:00, staying one hour late from the transition day on."></p>

## Related

[`stride`](stride.md) · [`take`](take.md) · [`everyInstant`](everyInstant.md) · width literals
(spec §5.5 · ADR-11/12/28).
