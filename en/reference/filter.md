---
source_sha: 1d2ce77e41ef
---

# `filter` — thin by predicate

> Translated from the canonical Japanese page [reference/filter.md](../../reference/filter.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: filter (body-layer core) · **Signature**: `filter(on: P)` / `filter(x => condition)`
: `Stream -> Stream` · name settled (spec §5.4)

## Meaning

Keeps only the points that satisfy the predicate. Both forms are taken (`where` was folded into
`filter`; ADR-25):

- **Premise predicate** `filter(on: P)` — keeps only the points that **belong to** the axis `P`
  (a name that resolves to a valid-point stream under the in-scope premise, or a derived stream).
  Calendar dependence starts here (I8).
- **Value-expression predicate** `filter(x => condition)` — decides with a lambda binding each
  point `x`. Inside the lambda, the value functions of cycle labels (`weekday(x)`) and
  window-to-value projections ([`ordinalIn`](ordinalIn.md) and the like) are available.

## Examples

Keep business days only (2026-01-01 is a holiday; 1/3 and 1/4 are a weekend):

```kairos
# eval: 2026-01-01..2026-01-08
@JP
everyDay |> filter(on: bizDay)
#=> 2026-01-02 2026-01-05 2026-01-06 2026-01-07
```

Keep Mondays only (label predicate):

```kairos
# eval: 2026-01-01..2026-01-20
@JP
everyDay |> filter(d => weekday(d) == Mon)
#=> 2026-01-05 2026-01-12 2026-01-19
```

Combined with a projection, "select by window coordinates" — the 11th of every month:

```kairos
# eval: 2026-01-01..2026-04-01
@JP
everyDay |> filter(d => ordinalIn(day, month, d) == 11)
#=> 2026-01-11 2026-02-11 2026-03-11
```

## Pitfalls

- `filter` is not a generator — it is a transform (a stage), so it cannot stand at the head of an
  expression (F45; `everyDay |> filter(…)`).
- `on:` and the lambda are two mouths of the same word. Never pass both at once.
- Generator purity (I8): dependence on business days always goes at or after the filter. This
  keeps the front of the expression (the calendar-system part) stable under calendar swaps.
- `filter(on: P)` is membership by point **equality** — it requires the input and the axis to
  agree in alignment (ADR-36 · spec §4.5; a mismatch is a static error, never a silent no-match).
  `on:` also accepts direct entity names (`on: TSE`) (ADR-35).
- To thin by **window membership**, use [`coincides`](coincides.md) in a value-expression
  predicate — excluding ad-hoc closure "days" from timed notifications is
  `filter(t => not coincides(closures, day, t))` (not expressible as an equality difference;
  F68 = ADR-38).

## Related

[`roll`](roll.md) (nudges instead of thinning) · [`ordinalIn`](ordinalIn.md) ·
[`cycle`](cycle.md) (the source of label predicates) · I8 · ADR-25/26.
