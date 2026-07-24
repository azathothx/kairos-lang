---
source_sha: b761cd000ae9
---

# `everyInstant` — streams every point of the continuous base

> Translated from the canonical Japanese page [reference/everyInstant.md](../../reference/everyInstant.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: generator (body-layer core) · **Signature**: `everyInstant : () -> Stream` ·
name settled (spec §5.4)

## Meaning

Streams **every point** (the continuum) of the base Chronos. Where `everyDay` takes the calendar
system's atom (the day) as its unit, `everyInstant` goes through no calendar — it is the entry
point for stepping cycles that do not ride the calendar's rhythm (one Martian sol, an orbital pass
every 90 minutes, and so on) with [`strideBy`](strideBy.md).

The continuum cannot be enumerated, so `everyInstant` cannot be evaluated on its own; it requires
`strideBy(w, from:)` immediately after. The origin `from:` is mandatory — there is no upstream
window to supply it (the origin rule of §4.7; ADR-31).

## Examples

Every Martian sol (24 hours 39 minutes 35.244 seconds):

```kairos
# eval: 2026-01-01..2026-01-03
@JP
everyInstant |> strideBy(24h39m35.244s, from: 2026-01-01)
#=> 2026-01-01 2026-01-02T00:39:35
```

The sol is given as a composite width of **elapsed time**, not civil time (`d`). Civil time and
elapsed time cannot be mixed (`1d12h` is a static error; ADR-28 · §5.5).

## Pitfalls

- Compositions that require enumeration, such as `everyInstant |> filter(…)` or
  `everyInstant |> within(…)`, cannot be written. Discretize with `strideBy` first.
- Precision and rounding of firing instants are the implementation's responsibility (the language
  goes only as far as defining the set of points; spec §1.4).

## Related

[`strideBy`](strideBy.md) · [`everyDay`](everyDay.md) · the width-literal conventions (ADR-11/12 ·
spec §5.5).
