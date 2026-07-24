---
source_sha: ddb0d7a64101
---

# `nth` — select the Nth in each window

> Translated from the canonical Japanese page [reference/nth.md](../../reference/nth.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: selector (body-layer core) · **Signature**: `nth(n) : Stream(windowed) -> Stream` ·
name settled (spec §5.4)

## Meaning

Selects the **`n`-th element** (1-based) within each window. Window-relative (I4): the count
restarts in every window. The default target is the innermost window; when nesting makes it
ambiguous, name the target window with `of: w` (`nth(2, of: quarter)`; §4.3 and the example in
[`first`](first.md)). "The Nth" also depends on the window's **origin** — the Nth of
`within(week)` changes with WKST (where the week starts), the two-step dependency selector →
window → WKST (ADR-24). This dependency is localized to the resolution of the window name.

A window with fewer than `n` elements yields nothing (empty is legitimate; ADR-15).

## Examples

The 25th of every month (the first half of a payday rule; the 25th **day**):

```kairos
# eval: 2026-01-01..2026-02-01
@JP
everyDay |> within(month) |> nth(25)
#=> 2026-01-25
```

The **2nd business day** of each month — thin the input to business days first, then count in
month windows:

```kairos
# eval: 2026-01-01..2026-02-01
@JP
everyDay |> filter(on: bizDay) |> within(month) |> nth(2)
#=> 2026-01-05
```

(The business days of 2026-01 are 1/2, 1/5, … — 1/1 is a holiday, so the 2nd business day is 1/5.)

The canonical form of "the Nth business day of the month" is **within + nth** (the answer to F102
of the third feedback batch — no dedicated selector is needed). A month with fewer than N business
days is a **legitimate empty** (I15) — the filter form's edge-case guarantee now standing on a
selector. "The 2nd Monday" (Happy-Monday class) has the same shape
(`mondays |> within(month) |> nth(2)`):

```kairos
# eval: 2026-01-01..2026-03-01
@JP
bizDay |> within(month) |> nth(2)
#=> 2026-01-05 2026-02-03
```

## Pitfalls

- `n` is 1-based. 0 and negatives are invalid.
- "The 2nd Monday of the month" is not `within(week)` — **count the weekdays inside the month
  window** (`filter(d => weekday(d) == Mon) |> within(month) |> nth(2)`), which is
  WKST-independent. "The Friday of the 2nd week" (WKST-dependent) is a different thing
  (stdlib/gregorian.md §4.4).
- Multiple ordinals (`nth([1, 3])`) are not introduced — enumerate with a union (open item F11).

## Related

[`first`](first.md) · [`last`](last.md) · [`within`](within.md) · [`ordinalIn`](ordinalIn.md) ·
I4 · ADR-24.
