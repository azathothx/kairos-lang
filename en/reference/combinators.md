---
source_sha: fc41386ebe96
---

# `|` `&` `\` — combinators (union, intersection, difference) and the cascade

> Translated from the canonical Japanese page [reference/combinators.md](../../reference/combinators.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: combinator (body-layer core) · **Signature**: `Stream × Stream -> Stream` · symbols
settled (ADR-22 · spec §5.4)

## Meaning

| Symbol | Meaning |
|---|---|
| `\|` | **Union** (merger) |
| `&` | **Intersection** (the points contained in both) |
| `\` | **Difference** (removes the right side's points from the left). **Backslash U+005C** — even when a Japanese font shows the yen glyph ¥, the code point is U+005C (¥ = U+00A5 is a different character) |

All share **a single precedence level, left-associative**. Mixtures involving `&` change meaning
with order, so parenthesize explicitly (spec §4.5).

**Prioritized overriding (the cascade) has no dedicated symbol** — it is expressed by
left-associative, in-order application of union and difference. Declaration order (the later
term) wins = last-wins, as in CSS layers. Holiday "addition" decomposes into union, "exceptions
and inversion" into difference (ADR-01).

## Examples

Citizens' holidays — the **intersection** of "the day after a holiday" and "the day before a
holiday", minus the holidays (September 2026: 9/22, sandwiched between Respect for the Aged Day
9/21 and Autumnal Equinox Day 9/23):

```kairos
# eval: 2026-09-01..2026-10-01
@JP
statutory  = [2026-09-21, 2026-09-23] covering: 2026..2026
sandwiched = ((statutory |> shift(+1, unit: day)) & (statutory |> shift(-1, unit: day))) \ statutory
statutory | sandwiched
#=> 2026-09-21 2026-09-22 2026-09-23
```

Difference: "excluding weekends":

```kairos
# eval: 2026-01-01..2026-01-06
@JP
everyDay \ satSun
#=> 2026-01-01 2026-01-02 2026-01-05
```

## Pitfalls

- `|` (union) is distinct from the stage connector `|>` — the symbols map one-to-one onto three
  roles (ADR-22).
- Logic in value expressions is written with words (`and`/`or`/`not`). The symbols `&`/`|` are
  reserved for the combinators (spec §3.5).
- The cascade reads **left to right** — `weekends | statutory | substitutes \ specialBiz` is
  "stack, stack, then subtract the exception last".
- **`&` and `\` require both sides to agree in alignment (granularity and tz)** (ADR-36 · spec
  §4.5). A mismatch like `everyDay \ instant-sequence` never coincides at a point and silently
  no-matches, hence a **static error** — align a timed sequence to days explicitly with
  `|> snapTo(day)` before composing. Union `|` asks nothing (a mixed schedule is legitimate), but
  feeding the mixed output into a downstream `&`/`\` triggers the check there. The empty table
  (`[] covering:`; [table-literal](table-literal.md)) is **vacuous conformance** — it passes the
  check, and the output inherits the partner's alignment (ADR-45).
- Excluding from a timed schedule "the points falling on holiday **days**" cannot be written as an
  equality difference — write it with the window-membership predicate
  [`coincides`](coincides.md) (`|> filter(t => not coincides(holidays, day, t))`; settled by
  F68 = ADR-38). The division of labor: "for the same **point**, a combinator 〈conform a
  misalignment with snapTo〉; for the same **membership** (day), coincides" — for exception days
  between day-aligned streams the combinator remains canonical, and rewriting to coincides is a
  regression. Cross-tz composition of "the **same date**" (TSE × NYSE joint business days) is the
  third branch — re-anchor by date-label correspondence with [`rebase`](rebase.md), then `&`
  (`(tseBiz |> rebase(to: "America/New_York")) & nyseBiz`; ADR-40 · F69).

## Related

[`filter`](filter.md) · [`roll`](roll.md) (deriving substitutes) ·
[`snapTo`](snapTo.md) (explicit alignment conformance) ·
[`coincides`](coincides.md) (window-membership composition) ·
[`rebase`](rebase.md) (cross-tz date correspondence) ·
ADR-01/04/22/36 · [representative example §7.5](../spec/90-examples.md).
