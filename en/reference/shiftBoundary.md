---
source_sha: 30d67d05e95a
---

# `shiftBoundary` — sugar that shifts window cuts by a unit (placeholder name)

> Translated from the canonical Japanese page [reference/shiftBoundary.md](../../reference/shiftBoundary.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: derivation sugar (premise layer) · **Signature**:
`|> shiftBoundary(δ, on: W, unit: U) : premise -> premise` · **placeholder name** (the only one in
the language; deferred to 1.0; spec §5.4)

## Meaning

Sugar that builds a derived premise in which the cuts of window `W` are shifted by `δ` in units of
`U`. It is erasable by mechanical expansion into a [`with`](with.md) override:

```text
shiftBoundary(δ, on: W, unit: U)  ≡  W = U span (_ => k) phase: ((φ₀ + δ) mod k)   # negative δ is also normalized by the modulus (F65); the base's label: is preserved (F96)
#   k  = the number of U's contained in W (12 for year ⊃ month)
#   φ₀ = W's phase in the base (0 for the Gregorian year)
```

It merely views `W` as "a span bundling `U` in groups of `k`" and advances its phase by `δ` —
calendar dates do not move (I1).

## Examples

The everyday form of a fiscal calendar. It yields the same result as the core expansion (writing
the `with` directly):

```kairos
# eval: 2025-01-01..2028-01-01
premise Fiscal2 = Gregorian |> shiftBoundary(+3, on: year, unit: month)
premise FY2 { calendar-system: Fiscal2; tz: "Asia/Tokyo"; wkst: Mon }
@FY2
everyDay |> within(year) |> first
#=> 2025-04-01 2026-04-01 2027-04-01
```

## Pitfalls

- **The scope is pairs with constant `k`** (`year ⊃ month`) only. Pairs where `k` varies (shifting
  `month ⊃ day` in units of `day`, and the like) are not fiscal-calendar-type operations and are
  out of scope — if ever needed, a separate operator (open item). Because the naming is coupled to
  this scope question, the name stays a placeholder, deferred to 1.0.
- Only the **cuts** are shifted. "Whether the fiscal-year label reads 2025 or 2026" is a separate
  knob (the `label:` attachment expression; spec §4.9).

## See also

[`with`](with.md) (the expansion target) · [`span`](span.md) (the meaning of `phase:`) · spec §3.7
· the sugar expansion rules (§4.8).
