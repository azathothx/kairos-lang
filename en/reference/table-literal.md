---
source_sha: 71ff6cafe682
---

# Table literal — a stream constant of an instant sequence

> Translated from the canonical Japanese page
> [reference/table-literal.md](../../reference/table-literal.md). The `source_sha` above records the
> source revision; a consistency check flags this page when the Japanese original changes.

**Category**: literal (the premise layer is its main ground) / Form:
`[instant, …] covering: range labels: [label, …]`; empty form `[] covering: range` (ADR-45) /
`covering:` and `labels:` settled (RC2, spec §5.4)

## Meaning

**A list of instant literals is promoted to a time-stream constant** (ADR-26). The intake that
brings into a premise, as data, the sequences that cannot be generated from periodic rules — the
gazette-proclaimed vernal and autumnal equinoxes, new moons, the twenty-four solar terms,
year-limited special days.

- The sequence must be **ascending** (out of order or duplicates are static errors).
- **`covering:`** — the effective range. Evaluation outside the range flows into the evaluation
  annotations as an **out-of-coverage** provenance, distinguished from an "accidental empty" (I6).
  When omitted, the range is the ends of the sequence. **The ends are inclusive on both sides** —
  in `a..b`, `b` runs to the end of that civil day (`..2027-01-01` **includes** 1/1 = the exclusive
  end is 00:00 on 1/2), and the year shorthand `2026..2026` is the whole year (ADR-37 decisions
  1/9. "`..2027-01-01` stops just short of 1/1" is a misreading — a step actually measured in the
  firing layer's implementation feedback).
- **The empty table `[] covering: range`** (ADR-45) — the primary form of "**zero points, but the
  coverage is to be claimed**". The vessel for writing the supply layer's "nothing at all yet"
  (first boot, year rollover) as a legal source; the coverage summary raises the runway
  (immediately negative) as an operational signal. The empty form makes `covering:` **explicitly
  mandatory** (the omission default "the ends of the sequence" is undefinable on an empty
  sequence); `labels:` is legal only as `[]`; the alignment is **vacuous conformance** (conforms to
  every alignment and passes the checks; in combination it inherits the partner. spec §4.5).
- **`labels:`** — a parallel label sequence of the **same length** as the instant sequence. It
  defines a point→label projection, and **the binding name is itself the projection name**
  (`sekki(d)`. ADR-30).
- The range literal `a..b` is sugar expanding to an enumeration of consecutive days.
- A premise containing a table is `source:` (provenance) declaration-required leaning; the edition
  is carried by `asof:` (provenance governance).

## Examples

Mixing with the date-range sugar:

```kairos
# eval: 2026-01-01..2027-01-01
@JP
[2026-02-10..2026-02-13, 2026-03-01]
#=> 2026-02-10 2026-02-11 2026-02-12 2026-02-13 2026-03-01
#~> 範囲外 2026-01-01..2026-02-10（(無名テーブル) covering 2026-02-10..2026-03-01）
#~> 範囲外 2026-03-01..2027-01-01（(無名テーブル) covering 2026-02-10..2026-03-01）
```

A labeled table — selecting 立春 (the "start of spring" solar term) **by name** (a table of
instants alone can select only by ordinal. F33):

```kairos
# eval: 2026-01-01..2026-03-01
@JP
sekki = [2026-01-05T17:23, 2026-01-20T10:45, 2026-02-04T05:02]
  covering: 2026..2026
  labels: [小寒, 大寒, 立春]
sekki |> filter(s => sekki(s) == 立春) |> snapTo(day)
#=> 2026-02-04
```

The empty table — writing "nothing at all yet" with the claim attached (zero points; the coverage
is only the observation day itself. The out-of-coverage annotations and the coverage summary's
runway (immediately negative) become the operational signal "put the data in". ADR-45):

```kairos
# eval: 2026-07-01..2026-08-01
@JP
sekki = [] covering: 2026-07-13..2026-07-13
sekki
#~> 範囲外 2026-07-01..2026-07-13（sekki covering 2026-07-13..2026-07-13）
#~> 範囲外 2026-07-14..2026-08-01（sekki covering 2026-07-13..2026-07-13）
```

## Pitfalls

- A calendar system that carves windows with data (a lunisolar calendar cut at new moons) is the
  same premise type — what calendar-system purity (I8) forbids is a generator's dependence on a
  **calendar** (business-day policy), not a calendar system's dependence on **data**. The purity
  distinction is drawn by provenance (`source:`/`asof:`) (ADR-26).
- `labels:` attaches not only to **points** (tables) but also to **window sequences**
  ([`segmentBy`](segmentBy.md)) (ADR-39) — data labels on points (this page), data labels on
  windows (`segmentBy`'s `labels:`; same-length is checked as window count = marker count), and
  computed labels on windows (the `label:` lambda = ADR-34) are a symmetric three-source family,
  read uniformly as `bindingName(d)`.
- `labels:` is a **one-to-one attachment to finite data**. For an infinite rhythm, use
  [`cycle`](cycle.md). Only the source differs; the reading side is binding-name projection either
  way.
- A table (a point sequence) has **no value-argument application** — when tempted to write
  `sekki(立春)`, the filter is canonical
  (`sekki |> filter(s => sekki(s) == 立春)` — the carrier's point sequence is at hand, so one line
  suffices. ADR-42 decision 5). Value arguments stand only on **window bindings** (`segmentBy` with
  `labels:`; window words with `label:`), and those return "the **days of the period** of the
  windows with that label" (window-instance reference).
- Automating the supply (the socket for external data) is written with [`external`](external.md)
  (ADR-46 = a table literal resolved at run time). The division of use: a literal is "data embedded
  in the expression", external is "data received in the vessel" (resolving what ADR-26 had
  deferred).
- **A single-element table = the vessel for "a given instant"** (`[2026-07-09T14:23] covering: ..`).
  Next-fire computations such as "3 business days after an injected instant" can be written with
  this vessel plus `snapTo`/`roll`/`shift` (of execution-origin relativity, only the feedback loop
  is out of scope — spec §7.7). Its dual is **the empty table = the vessel for "not yet"** (the
  example above).
- **The empty table's alignment changes once rows arrive** (vacuous conformance → the civil-day
  grid if the lexis is date-only, "none" if timed — a consequence of alignment being read from the
  literal text. A limit noted explicitly in ADR-45). If a vessel that will grow into a timed
  sequence is used in `&`/`\` compositions, inserting an explicit realignment (`snapTo`) keeps the
  checks from breaking on the first data arrival.
- Writing the empty table open-ended (`[] covering: ..`) is a completeness claim of "empty over all
  time", and **the runway signal disappears permanently** — the proper form for a boot-time "not
  yet" is a closed end (an honest minimal claim, such as the observation day itself).

## Related

[`segmentBy`](segmentBy.md) (cutting windows with data), [`snapTo`](snapTo.md),
[`cycle`](cycle.md), provenance governance (spec §3.8), ADR-26/30.
