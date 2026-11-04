---
source_sha: 5ba09abca13a
---

# `since` — cutting a point set to "at or after p"

> Translated from the canonical Japanese page [reference/since.md](../../reference/since.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: sugar (stdlib; a Gregorian public word = transform) / **Signature**: `since(p) : Stream -> Stream`
(`p` is a dated date-time literal) / Name final (ADR-55, 2026-10-19, spec §5.4) / **The 1.1 additive extension**

## Meaning

Keeps the input points **at or after `p` (`p` inclusive)**. The expansion is one `filter` stage (sugar = spec §4.8):

```
since(p) = s => s |> filter(t => t >= p)
```

Paired with [`before`](before.md) (strictly before `p`) it cuts the **half-open [since, before)** — the same boundary
convention as the evaluation range `[from, to)`, windows and `isOpen`. `p` resolves to an instant in the in-scope
premise's `tz:` (ADR-33) — `since(2026-10-26)` is the first instant of 10/26 in that tz.

The ordering between points `t >= p` was defined in 1.1 (spec §4.9 "Types in equality and ordering"). It is the total
order of instants on chronos and **has no unit** — unlike the `epochOrdinal(hour, …)` comparison, which cut at the
"floor of the hour" (pass 14:30 and 14:00 gets in), `since(…T14:30)` starts at 15:00.

## Examples

**Day granularity** — business days from 10/13 on (10/12 is Sports Day):

```kairos
# eval: 2026-10-01..2026-10-20
@JP
bizDay |> since(2026-10-13)
#=> 2026-10-13 2026-10-14 2026-10-15 2026-10-16 2026-10-19
```

**Timed** — the hourly stream from 14:30 up to but not including 18:00. An off-grid anchor does not fall to the floor
(it starts at 15:00):

```kairos
# eval: 2026-10-26..2026-10-27
@JP
hourly = everyInstant |> strideBy(1h, from: 2026-01-01)
hourly |> since(2026-10-26T14:30) |> before(2026-10-26T18:00)
#=> 2026-10-26T15:00 2026-10-26T16:00 2026-10-26T17:00
```

"Business hours left until the deadline" is `hourly |> filter(t => isOpen(t)) |> since(now) |> before(deadline)`
(design/40-examples/11 §(n); stdlib §2).

## Pitfalls

- **Never embed "now" in the expression** — for cutting at the day level, the separation of the evaluation range
  (`--from` / `--to`) comes first. Only the cut at an instant (a dated date-time) goes into the expression, and the date-time is
  injected through an argument or by the caller (the same placement as `until:` of [`takeLast`](takeLast.md);
  ADR-52 decision 2).

- **A date literal marks a boundary of the definition** — write one only for a boundary that belongs to the
  definition itself (a start or an end date).

- **A timed literal on a day-granular stream** — a day's point is 00:00, so `everyDay |> since(2026-10-26T14:00)`
  does **not** include 10/26 (it starts at 10/27). To include the day, write the date (`since(2026-10-26)`). No
  warning is raised (documented only).

- **A standalone time `T14:00` cannot be passed** — a guided static error, checked at the call (so it stops even when the
  stream is empty; ADR-51; ordering takes a dated date-time literal). A `p` that is not an instant (a number, a label) stops at the call as well. "From 14:00 every day" is a band of times, not a cut — use an `ordinalIn(hour, day, t)` predicate or
  [`isOpen`](isOpen.md).

- **A same-named top-level binding is a static error** — `since` is a reserved word added in 1.1 (spec §4.8). Rename a
  consumer-side `since(…) = …`. It cannot be a label name either (the label list of `cycle`, `labels:`): a definition that used `since` as a label in 1.0 is renamed.

- **No new points are created** — even when `p` is not a point of the input, the output starts at "the first input
  point at or after `p`" (this is not point ± width arithmetic; ADR-34 decision 4 is unchanged).

- Alignment, windows and the transport row of annotations are those of the `filter` it expands to —
  `within(month) |> since(p) |> first` holds, and an out-of-coverage interval stays an annotation as it is (a
  home-made `stride(1, from: p)` sugar would swell the annotation to the end of the evaluation range).

## Related

[`before`](before.md) (the pair; strictly before `p`) · [`filter`](filter.md) (the expansion) · [`at`](at.md) (attaching a
time) · [`epochOrdinal`](epochOrdinal.md) (the 1.0 form = floor comparison of ordinals) · [`takeLast`](takeLast.md)
(`until:` is point-inclusive) · spec §4.8 / §4.9 · ADR-55.
