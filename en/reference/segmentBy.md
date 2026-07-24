---
source_sha: 19019f76ed1c
---

# `segmentBy` — interval-sequence windows (cut at markers)

> Translated from the canonical Japanese page [reference/segmentBy.md](../../reference/segmentBy.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: window (body-layer core) / **Signature**:
`segmentBy(m, edges:, empties:) : Stream -> Stream(interval)` / name settled (spec §5.4)

## Meaning

Takes an arbitrary stream `m` as **markers** and makes each half-open interval `[mᵢ, mᵢ₊₁)` between
adjacent markers a window. Every window whose boundaries are given by a sequence of points — fiscal
closes, lunar phases (a lunisolar calendar cut at new moons), weeks (cut at the `wkst`-labeled day)
— stands on this.

Unlike the partition type, **exhaustiveness is not guaranteed**, so the two arguments that state the
meaning of the gaps explicitly are **mandatory declarations** (I5; omission is a static error). This
closes off, by syntax, the accident in which firings silently vanish on missing data (ADR-15's
"accidental empty").

## Arguments

| Argument | Value | Meaning |
|---|---|---|
| `m` | stream expression | the markers (the intervals' boundary points) |
| `edges:` | `drop` / `clip` / `error` | treatment of points before the first marker / after the last marker (discard / make a partial window / error) |
| `empties:` | `keep` / `drop` / `error` | treatment of zero-element windows between markers (keep as a legitimate empty / discard / error) |
| `labels:` | list (literal / list binding name) | a **parallel label list** for the window sequence (ADR-39); reading is binding-name projection `name(d)` |
| `label:` | lambda `(p => expr)` | a **computed label** per window (ADR-34; for index expressions and conditional computations that do not fit `labels:`) |

## Examples

Lunisolar months cut at new moons — take the first day (the new-moon day) of each month. Lunar New
Year 2026-02-17 appears:

```kairos
# eval: 2026-01-01..2026-05-01
@JP
newMoons = [2026-01-19T04:52, 2026-02-17T21:01, 2026-03-19T10:23, 2026-04-17T20:52]
lunarStart = newMoons |> snapTo(day)
everyDay |> segmentBy(lunarStart, edges: drop, empties: drop) |> first
#=> 2026-01-19 2026-02-17 2026-03-19
#~> 範囲外 2026-01-01..2026-01-19（newMoons covering 2026-01-19T04:52..2026-04-17T20:52）
#~> 範囲外 2026-04-17..2026-05-01（newMoons covering 2026-01-19T04:52..2026-04-17T20:52）
```

With `edges: drop`, nothing past the last marker 4/17 becomes a window (no silent continuation at
the data's edge).

## labels: — a parallel label list for the window sequence (ADR-39)

Binds a data label sequence to the window sequence. Reading is **binding-name projection** —
`name(d)` returns the label of the window that point `d` belongs to (defining equation
`name(d) ≡ labels[window-sequence ordinal]`; in the window-sequence ordinal, the window starting at
the first marker within the effective coverage is 0). A **same-length check** runs at evaluation:
list length == window count (the window count is **coverage-based** = the marker count, independent
of the evaluation range and the materialization range) — forgetting to update markers and labels as
a pair breaks loudly as a static error (the vessel for F62):

```kairos
# eval: 2026-01-01..2026-07-01
@JP
newMoons = [2026-01-19T04:52, 2026-02-17T21:01, 2026-03-19T10:23, 2026-04-17T20:52]
  covering: 2026-01-19..2026-04-30
lunarMonth = everyDay |> segmentBy((newMoons |> snapTo(day)), edges: drop, empties: error,
                                   labels: [12, 1, 2, 3])
lunarMonth |> first |> filter(d => lunarMonth(d) == 1)
#=> 2026-02-17
#~> 範囲外 2026-01-01..2026-01-19（newMoons covering 2026-01-19..2026-04-30）
#~> 範囲外 2026-05-01..2026-07-01（newMoons covering 2026-01-19..2026-04-30）
```

**Preconditions and tightening rules** (all static errors; ADR-39 decision 4): it cannot combine with
`edges: clip` (pseudo-windows shift the ordinals); it cannot combine with `empties: drop` (removing
empty windows compacts the ordinals); it cannot coexist with a `label:` lambda (doubling the label
source); it does not attach to rule markers (infinite sequences of the `week` class — periodic
labels go to [`cycle`](cycle.md), computed numbers to [`ordinalIn`](ordinalIn.md) or `label:`);
composite markers (`t1 | t2`) split the effective coverage so the window count is not determined —
fix it first with a binding-postfix coverage claim (`covering:`). **The reading port for an empty
window's label (`empties: keep`)** is interval membership — any point within the window interval,
in practice the marker point itself (the form in which an absent period's number still stands). For
several parallel sequences (numbers and names) the canonical form is **separate window bindings**
over the same markers (the check bites twice;
[`../../stdlib/kyureki.md`](../../stdlib/kyureki.md) (Japanese) §1).

## label: (ADR-34)

The parenthesized named-arg `segmentBy(m, edges:, empties:, label: (p => expr))` attaches a
**computed label** to each window (`p` = the window's first point; lazy evaluation at projection
time). When merely pasting a data column, `labels:` is canonical (ADR-39, ADR-30 revised); `label:`
is for computations involving index expressions and conditions
([`../../stdlib/kyureki.md`](../../stdlib/kyureki.md) (Japanese) §7 (5)).

## Pitfalls

- Omitting `edges:`/`empties:` is a static error. There is room to fold "frequently used pairs"
  into sugar (ADR-23), but core always states them explicitly.
- When a coarse unit sequence is cut by finer markers, membership is decided by the
  **representative point** (for a window element, its first point) (spec §5.2).
- Even a `segmentBy`-made window whose cuts are periodic and whose exhaustiveness and non-overlap
  can be shown is certified partition-type by the I5 check and can be used with `within` — the
  standard `week` is the example (`day |> segmentBy(weekStart, edges: clip, empties: error)`;
  stdlib/gregorian.md §4.5).
- A window binding with `labels:` supports **window-instance reference** (value-argument
  application, ADR-42) — `sekkiW("立春")` is **all days of the interval** of the 立春 (Risshun)
  term (the 2/4–2/18 class), a different thing from the table projection
  `sekki |> filter(s => sekki(s) == 立春)` (the **point** of Risshun). If you want the point,
  filter the table; if you want the days of the interval, use the window-instance reference. Note
  too that number labels are not unique keys (`lunarMonth(6)` includes the leap sixth month — a
  repeat of the preceding month's number — as the union of all matches; with the name label
  `kyuMonth("六月")` the leap sixth month stays distinct).

## Related

[`within`](within.md) · [`snapTo`](snapTo.md) (granularity-matching the markers) ·
[`cycle`](cycle.md) (periodic labels) ·
[table literals](table-literal.md) (bringing marker data in) · ADR-07/08/15 · I5.
