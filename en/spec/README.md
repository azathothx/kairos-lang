# Kairos Language Specification (English orientation)

> The **Japanese specification is canonical**; English pages are added progressively under `en/`.
> Chapter links below point to the Japanese documents ([日本語版はこちら](../../spec/README.md)).

**Status: Release candidate (RC5, declared 2026-07-08; addenda through no. 6, 2026-07-09).**
Semantics, the operator family, the grammar (EBNF, §5.6), and the lexis are frozen. Naming is final
except one placeholder — `shiftBoundary` (tied to an out-of-scope variable-`k` family; deferred to 1.0;
see §5.4). Expressiveness is validated against 20 well-known schedule families
(`design/40-examples/`) and by the reference implementation (`impl/`, 363 tests). All remaining
homework items are catalogued in `design/90-open-questions.md`, and none of them changes the semantics.

For the RC-by-RC history, see the [changelog](../../spec/CHANGELOG.md) (Japanese).

## Chapters (Japanese)

1. [Introduction](../../spec/00-intro.md) — what Kairos is, comparison with cron/Quartz/RRULE, design spine
2. [Types and layers](../../spec/10-types.md) — the three types, the two layers, closure, core vs sugar, invariants
3. [Premise layer](../../spec/20-premise-layer.md) — preambles, name resolution, value expressions, defining calendars
4. [Body layer](../../spec/30-body-layer.md) — generators, windows, selectors, point transforms, combinators, filters, strides
5. [Grammar and symbols](../../spec/40-grammar.md) — symbols, operator signatures, naming status, lexis, EBNF
6. [Glossary](../../spec/50-glossary.md) — index of concepts, descriptors, symbols, and invariants
7. [Worked examples](../../spec/90-examples.md) — "3 business days before month-end", payday, holiday
   cascade, fiscal calendar, runtime integration (§7.7–7.8)

## Where things live

- Per-operator reference with doctested examples: [`reference/`](../../reference/README.md) (Japanese)
- Standard premises — Gregorian, Fiscal, ISOWeek, Kyureki: [`stdlib/`](../../stdlib/README.md) (Japanese)
- Design records — 44 ADRs, domain model, expressiveness studies: [`design/INDEX.md`](../../design/INDEX.md) (Japanese)
- The English overview with the capability comparison table is in the repository [README](../../README.md).
