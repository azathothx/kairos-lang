---
source_sha: 074ed27c59d2
---

# `span` — variable aggregation of a unit sequence (bottom-up)

> Translated from the canonical Japanese page [reference/span.md](../../reference/span.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: window-generating word (premise layer) / **Signature**:
`span(f) : Stream -> Stream(partitioned)`, phase via `phase:` / name settled (spec §5.4)

## Meaning

**Bundles** a sequence of finer units into consecutive windows according to `f = n => count`
(bottom-up aggregation). `n` is the **0-based ordinal of the complete windows about to be
generated**; the count may be variable (`month`'s 28–31 days) or constant (`year`'s 12 months).
`phase:` is the phase at which bundling starts (a fiscal calendar's April start is `phase: 3`).
Without `phase:`, `n` coincides with the coordinate read by [`epochOrdinal`](epochOrdinal.md)
(see the pitfall below — with a phase they differ by 1).

The Gregorian backbone stands on this word — **the dependency runs chiefly bottom-up**
(`day → month → year`):

```text
month = day   span daysInMonth        # day counts are a value expression (leap is "a value, not a window")
year  = month span (_ => 12) phase: 0 # the standard label: is omitted (full form: stdlib/gregorian.md §1)
```

The key is making "whether February has 28 or 29 days" not a dependency on the `year` **window**
but a **value** computation from the month ordinal `m` (`daysInMonth`) — with this, `month` does
not depend on `year`, so reworking `year` in a derivation (a fiscal calendar) creates no cycle
(spec §3.6).

## Examples

Five-day windows (a constant span; the 5-day steps run from the epoch, so in 2026 they start on
Jan 2):

```kairos
# eval: 2026-01-01..2026-01-20
premise P5 = Gregorian with { pentad = day span (_ => 5) }
premise JP5 { calendar-system: P5; tz: "Asia/Tokyo"; wkst: Mon }
@JP5
everyDay |> within(pentad) |> first
#=> 2026-01-02 2026-01-07 2026-01-12 2026-01-17
```

The fiscal year (April start) is the representative example of `phase:` — see [`with`](with.md).

## `label:` (ADR-34)

`span … label: (p => expr)` attaches a label to each window. `p` is the window's **first point**;
the semantics is `name(d)` ≡ attachment-expression(first point of the window containing d) (at
projection time, lazily evaluated). The canonical form of the fiscal-year label,
`year = month span (_ => 12) phase: 3 label: (p => yearNo(p))`, is
[`../stdlib/fiscal.md`](../stdlib/fiscal.md) §1 (promoted to the full definition).

## Pitfalls

- The ordinal `f` receives is **epoch-based** — to align the phase to a particular date origin, use
  `phase:`, or, for uniform widths, [`grid`](grid.md) with `anchor:` is more natural (this is why
  the pentad above does not start on Jan 1).
- **With `phase:`, the generator-side ordinal of `f` and the reader-side ordinal of
  `epochOrdinal` differ by 1** (F108): the head stub window ([epoch, phase end) — the phase
  remainder `f` does not control) occupies ordinal **0** on the reader side (“the running ordinal
  of the windows that exist”, ADR-31 revision = F60). The same window is called `n` by the
  generator and `n + 1` by the reader — in premises that compute labels from ordinals (custom
  calendars with a phase), offset the two bases by 1 (worked example = the Hijri calendar in
  design/40-examples/10). Reading via a `label:` expression (computed from the head instant),
  as `fiscal` does, is unaffected.
- What it bundles is **a sequence of unit windows** (`day`, `month`) — it does not take the
  continuous axis itself (that is `grid`).

## Related

[`grid`](grid.md) · [`split`](split.md) · [`with`](with.md) (a worked example of the `phase:`
shift) · [`rephase`](rephase.md) (sugar over a span phase shift) · the epoch (ADR-31).
