---
source_sha: 5f335759598b
---

# `take` — cut off after the first n points (the COUNT counterpart)

> Translated from the canonical Japanese page [reference/take.md](../../reference/take.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: stride (body-layer core; a separate family from selectors) / **Signature**:
`take(n, from:) : Stream -> Stream` / name settled (ADR-49)

## Meaning

Of the input points at or after `from:` (inclusive), passes **only the first n**. Where
[`stride`](stride.md) "counts points and thins", take "counts points and **cuts off**" — the
COUNT counterpart of RRULE, held in a form that **composes** with exclusions and rolls (ADR-49).

The anchor `from:` is mandatory (ADR-31; the rule shared by the stride family). The output is a
pure function of (input, n, from:) alone; the evaluation range is a cut-out window over that
extension — narrowing the range never re-counts.

## Examples

A five-session course. Cancellations still leave **five sessions total** (the composition order —
exclude, then count — produces the refill):

```kairos
# eval: 2026-04-01..2026-08-01
@JP
lessons   = everyDay |> filter(d => weekday(d) == Tue)
cancelled = [2026-04-14, 2026-05-05] covering: 2026-04-01..2026-07-01
(lessons \ cancelled) |> take(5, from: 2026-04-01)
#=> 2026-04-07 2026-04-21 2026-04-28 2026-05-12 2026-05-19
```

RRULE's `COUNT=5` plus two EXDATEs counts the generated set **before** exclusion and **shrinks to
three sessions** (exactly the rrule.js #456 report). take has no notion of "before exclusion" in
the expression — 5/12 and 5/19 refill naturally.

## Pitfalls

- **Windowed input is a static error.** Do not write "the first 3 business days of each month" as
  `within(month) |> take(3, …)` (take counts through — it would stop at January's 3 points). The
  per-window first N is [`within`](within.md) followed by [`nth`](nth.md), or an
  [`ordinalIn`](ordinalIn.md) predicate.
- **Time-boxing is not take's job.** "Daily from 6/29 to 12/30" belongs to the separation of
  definition and evaluation range — `take(180)` bakes mental day-arithmetic into the expression.
- `take(0)` and negative values are static errors (the same rule that eradicated `stride(0)`'s
  "silently empty"; ADR-38 decision 12).
- After the nth point the output is a **legitimate empty** (no annotation — ADR-37 decision 2).
  Conversely, if the covering runs out **before** the nth point, everything after carries an
  out-of-coverage annotation (making the tentative ranking observable. A cancellation feed's
  covering tail sits near "now" in practice — the annotation not going away is normal; extending
  the coverage is the correct response).
- There is no "last N" (counting from the end would depend on the covering; not introduced.
  ADR-49).

## Related

[`stride`](stride.md) (thin) · [`strideBy`](strideBy.md) (step by width) · [`nth`](nth.md)
(window-relative "the Nth" — the dual) · [`filter`](filter.md) · ADR-31/38/49.
