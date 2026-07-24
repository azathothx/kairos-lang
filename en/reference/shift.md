---
source_sha: 65cce16e358c
---

# `shift` — move by n units

> Translated from the canonical Japanese page [reference/shift.md](../../reference/shift.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: point transform (body-layer core) / **Signature**: `shift(n, unit: U) : Stream ->
Stream` / name settled (spec §5.4)

## Meaning

Moves each point by `n` steps in unit `U`. **Direction is carried by the sign; no direction words
(`back:` and the like) are taken** — once `n` becomes a variable, direction would be doubled
across a word and a sign (ADR-21).

`U` is a premise-relative axis name with two faces:

- **Window units** (`day`, `month`, …) — move the index of the containing window. The offset
  within the window is preserved **in elapsed time** (ADR-31 revision 2 = F83. Landing = the start
  of the landing window + the elapsed offset. Crossing a DST transition day changes the wall
  clock — in NY, `[3/7T09:00] |> shift(+1, unit: day)` → 3/8 **10:00**. Sticking to the wall
  clock is the declaring side's business 〈the entity's sessionOpens, the tick of a timed
  anchor〉. If the offset exceeds the landing window's width it spills into the next window —
  nudging back is roll's job).
- **Point-sequence axes** (`bizDay` and other discrete valid-point sequences) — move the position
  along the axis. A point not on the axis is a static error (nudge it onto a valid point with
  [`roll`](roll.md) first; the spirit of I3).

## Examples

3 business days before month-end ([representative example §7.1](../spec/90-examples.md). January:
month-end 1/31 Sat → roll to 1/30 Fri → back 3 business days to 1/27 Tue):

```kairos
# eval: 2026-01-01..2026-02-01
@JP
monthEnd |> roll(Preceding, on: bizDay) |> shift(-3, unit: bizDay)
#=> 2026-01-27
#~> 範囲外 2026-01-01..2026-01-02（holidays2026 covering 2026-01-01..2026-12-31, asof 2026-01-05）
```

Window units preserve the offset — Hachijūhachiya (87 days after the instant of Risshun, 2/4
05:02) moves with its time of day:

```kairos
# eval: 2026-01-01..2026-06-01
@JP
sekki = [2026-01-05T17:23, 2026-01-20T10:45, 2026-02-04T05:02]
  covering: 2026..2026
  labels: [小寒, 大寒, 立春]
sekki |> filter(s => sekki(s) == 立春) |> shift(+87, unit: day)
#=> 2026-05-02T05:02
#~> 範囲外 2026-01-01..2026-03-29（sekki covering 2026-01-01..2026-12-31）
```

To land on a date, add [`snapTo(day)`](snapTo.md) downstream.

## Pitfalls

- `roll` "nudges only when invalid" (valid points stay put); `shift` "always moves". Holiday
  adjustment is roll; "N business days before" is shift — needing both is the standard idiom for
  month-end offsets.
- A point that is not a business day under `unit: bizDay` is a static error. Keep the
  `roll |> shift` order.
- Variable-width range shift (a band of ±k days) is not introduced (it needs a fold; open item
  F26) — for fixed widths, enumerate with a union.
- **Point-sequence axes** (`unit: bizDay`) require the input and the axis to agree in alignment
  (ADR-36). **Window words** (`unit: day` and the like) are interval membership
  (offset-preserving within the window) and hence outside the check — moving timed points with
  `shift(+87, unit: day)` is legal (the Hachijūhachiya idiom).

## Related

[`roll`](roll.md) · [`snapTo`](snapTo.md) · [`stride`](stride.md) (thins rather than moves) ·
ADR-21.
