---
source_sha: 75e92e77799f
---

# external — the external supply declaration (a table literal resolved at run time)

> Translated from the canonical Japanese page [reference/external.md](../../reference/external.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: declaration in a premise binding / Form:
`name = external(kind: dates | instants [, labels: [domain]] [, source: "…"])` / settled (ADR-46)

## Meaning

The socket for "**expressions are static, data resolves at run time**". The static properties that
a [table literal](table-literal.md) carries in its **literal text** are here claimed in advance by
**declaration**, standing in for the missing text — the resolved value (point sequence, covering,
asof, labels) is subject, as the **supply contract**, to **the same governance checks** as literals
(containment in the coverage, ascending order, same length). No new type and no new algebra: the
resolved value is a table value itself, and out-of-coverage annotations, the coverage summary, and
the runway (spec §4.10) ride on it unchanged.

- **`kind:`** — the **alignment claim** (mandatory). `dates` = a date sequence (aligned to the
  civil-day grid of the premise's `tz:`); `instants` = timed (no alignment). The alignment is
  decided statically from the declaration and **does not depend on the resolved value's row count
  or contents** (even empty, it is as declared — going from 0 rows to 1 row never changes the
  outcome of the alignment check).
- **`labels:`** — the **enumeration of the label value domain** (optional). The declaration is
  static knowledge, so bare-name label comparison (`filter(s => sekki(s) == 立春)`) can be written.
  The resolved value's labels must lie within the domain and match the instant sequence in length.
  With no declaration, no labels (if labels arrive anyway, that is a contract violation — they are
  not silently dropped).
- **`source:`** — provenance (**mandatory**: either the premise member `source:` or a per-binding
  named-arg override).
- **covering and asof are always carried by the resolved value** (absence of either = contract
  violation). "Nothing at all yet" is `dates: []` plus covering (the empty-table equivalent) = a
  **legitimate value**; a failure to resolve = a **supply error** (a machine-readable subclass —
  an implementation can exclude it from boot checks and fall back to degraded operation). The two
  are distinguished by type.
- Resolution is **an adjunct of the evaluation context** (an "input to the evaluation", like tz,
  wkst, and asof) — resolved only **once, at the first reference within the evaluation**, and
  pinned to that snapshot thereafter (never resolved if never referenced). The means of acquisition
  (DB, file, HTTP) is outside the language (ADR-15).

## Examples

Receiving a holiday table by external supply (the `# resolve:` line is the doctest's resolver
fixture — in production the implementation plugs in the resolver):

```kairos
# eval: 2026-01-01..2026-03-01
# resolve: holidays = dates 2026-01-01 2026-01-12 covering: 2026-01-01..2026-01-31 asof: 2026-01-15
premise HRDB { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "hr-db/holidays"
  holidays = external(kind: dates)
}
@HRDB
holidays
#=> 2026-01-01 2026-01-12
#~> 範囲外 2026-02-01..2026-03-01（HRDB.holidays covering 2026-01-01..2026-01-31, asof 2026-01-15）
```

The region outside the coverage (February onward) becomes an out-of-coverage annotation, and the
coverage summary raises source, covering, asof, and runway — securing lead time for data updates
(an operational signal for the firing layer) is observed in the same vessel as for literals.

## Pitfalls

- **Only as the right-hand side (its head) of a premise binding** — the body layer, top-level
  bindings under a preamble, lambda interiors, and argument positions are static errors (the
  governance of `source:`/`tz:` must live on the premise). Compose in the form
  `external(…) |> snapTo(day)`.
- **A premise with external must declare `tz:`** — the ends of the covering and the anchor of
  `kind: dates` resolve in the definition side's tz (an extension of ADR-37 decision 1).
- **The resolved value's dates are checked for existence** (`2026-02-30` is a contract violation) —
  a re-run, against resolved values, of the literal lexical checks (ADR-43). Silent rollover does
  not happen here either.
- **A disagreement between the premise's static `asof:` (the edition pin) and the resolved value's
  asof is displayed permanently in the coverage summary** — no silent overwrite. Preserving
  snapshots for reproduction and audit is the implementation's responsibility (under the generation
  approach the generating source itself was the evidence — the bearer moves).
- Responsibilities that stay on the supply side: keeping the point sequence ascending; the
  **truthfulness** of covering ("was that range really fetched exhaustively?" cannot be checked);
  the correctness of asof. What the language imposes stops at the checks (the face that makes
  absences and violations loud).
- The wire format is per kind — `dates` is the lexical form of dates (`"YYYY-MM-DD"`; the language
  side does the anchoring, so a derivation's `tz:` override can re-anchor), and `instants` is epoch
  ms (because a wall-clock lexical form can be two-valued under a DST overlap).

## Related

[`table-literal`](table-literal.md) (the same vessel written in literal text; the empty table),
provenance governance (spec §3.8), alignment (spec §4.5), ADR-45/46.
