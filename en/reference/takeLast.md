---
source_sha: cce988c1ad75
---

# `takeLast` — cut off after the last n points (recent N)

> Translated from the canonical Japanese page [reference/takeLast.md](../../reference/takeLast.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: stride (body-layer core; a separate family from selectors) / **Signature**:
`takeLast(n, until:) : Stream -> Stream` / name settled (ADR-52)

## Meaning

Passes **only the last n input points** at or before `until:` (**inclusive**). The mirror of
[`take`](take.md) ("cut off at the head") — the word that says "the most recent N firings" in an
expression (ADR-52 — revising the ADR-49 deferral once real demand 〈recipe firing-example
displays〉 materialized).

The terminus `until:` is mandatory (the dual of [`take`](take.md)'s `from:`; the family's anchor
rule). The output is a pure function of (input, n, until:), and the evaluation range is a cutting
window over that extension. **There is no "now" in the language** — a dynamic "most recent" is
produced by the consumer injecting the current time into `until:` (determinism is unchanged).

## Examples

The last 3 firings of a several-times-a-year calendar entry (tensha-nichi class) — the guesswork
of "how many days of window fit n firings?" disappears:

```kairos
# eval: 2026-01-01..2026-12-31
@JP
tensha = [2026-01-06, 2026-03-05, 2026-05-25, 2026-07-24, 2026-10-06, 2026-12-21] covering: 2026-01-01..2026-12-31
tensha |> takeLast(3, until: 2026-08-21)
#=> 2026-03-05 2026-05-25 2026-07-24
```

While until: ≤ the covering tail, the count runs over the **settled past only**, so the answer
comes out deterministic with no annotation (the mirror-image advantage over forward take, whose
"covering tail always sits near now"). To attach a time, **count in the day layer and attach the
time afterwards** (the standard composition with [`at`](at.md)):

```kairos
# eval: 2026-01-01..2026-12-31
@JP
tensha = [2026-01-06, 2026-03-05, 2026-05-25, 2026-07-24, 2026-10-06, 2026-12-21] covering: 2026-01-01..2026-12-31
tensha |> takeLast(2, until: 2026-08-21) |> at(T07:00)
#=> 2026-05-25T07:00 2026-07-24T07:00
```

## Pitfalls

- **`until:` inclusion is point inclusion.** A date literal anchors at 00:00, so applying it
  directly to a timed firing stream **drops the same-day firing from the count** (with a `T07:00`
  stream and `until: 2026-08-21`, the 8/21 firing is not included). The right form is the
  composition order above (count in the day layer), or inject `until:` with a time (also correct
  in the sense of "do not count firings still to come today as recent examples").
- **Evaluate from the head of the covering.** The evaluation range is a cutting window, so a
  narrow range silently truncates the answer — do not trade the "is 366 days enough?" hole for an
  evaluation-range hole.
- If `until:` passes the covering tail, **all output becomes tentative** (out-of-coverage
  annotations — an unknown "more recent" firing could exist. Correct behavior). The covering head
  with fewer than n points (a feed just started — "not n yet") is likewise observable through
  annotations.
- **Windowed input is a static error.** "The last 1 per window" is [`within`](within.md) followed
  by [`last`](last.md); "the last N" is a union of `shift(-k, unit: axis)` from the window
  boundary point (takeLast counts through; a backward in-window ordinal is a recorded adjacent
  demand, not in the current vocabulary).
- `takeLast(0)` and negative values are static errors (the same rule as ADR-38 decision 12).
  Passing `from:` gets a dedicated diagnostic (the anchor is until: — count from the head with
  take).
- With generator input (everyDay class), an `until:` near the computation range or the
  materialization floor produces horizon-clip **warnings** (down to "only k of n" — an
  implementation horizon, not a language one. ADR-37 decision 8 · F107).

## Related

[`take`](take.md) (cut off at the head = the dual) · [`stride`](stride.md) (thin) ·
[`strideBy`](strideBy.md) (step by width) · [`at`](at.md) (the standard composition for attaching
times) · ADR-31/38/49/52.
