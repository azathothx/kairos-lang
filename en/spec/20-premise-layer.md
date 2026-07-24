---
source_sha: d89003c356db
---

# Kairos Language Specification — 3. The Premise Layer

> Translated from the canonical Japanese chapter [spec/20-premise-layer.md](../../spec/20-premise-layer.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

The premise layer assembles and supplies the premises on which the body layer stands — calendar
systems, calendars, axes, roll conventions, and the like.

## 3.1 What a premise is

A **premise** is the collective term for the preconditions under which the interpretation of an
expression, clause, or phrase holds. It includes: calendar system (calendar-system), axis, calendar,
roll convention, granularity, TZ, asof, WKST, and provenance (source). It plays for expressions the
same role that a contract's preamble (recitals) plays for the clauses that follow — laying down in
advance the premises on which they stand. Streams (values) and operators (verbs) are evaluated on
top of premises, but are not premises.

## 3.2 The preamble (premise declarations)

A preamble is placed before body expressions and governs the expressions that follow (effective
until the next preamble). One and the same binding operation comes in three forms, long and short.

**Definition (multi-line allowed)** — defines the contents that `@name` bundles.

```text
premise JP {
  calendar-system: Gregorian      # calendar system (structure)
  calendar:        TSE            # calendar (policy: business days)
  tz:              "Asia/Tokyo"   # TZ and source are string literals (ADR-32)
  wkst:            Mon
  asof:            latest
  source:          "cao.go.jp/official"
}
```

**Lightweight form** — lays a predefined bundle down as the preamble. `@name` is the same reference
whether it names a single-value alias (`@TSE`) or a multi-member bundle (`@JP`).

```text
@JP
monthEnd |> roll(Preceding, on: bizDay) |> shift(-3, unit: bizDay)
```

**Full form, inline** — makes a preamble on the spot, without naming it.

```text
premise { calendar-system: Gregorian; calendar: TSE; tz: "Asia/Tokyo"; wkst: Mon }
```

To bracket the scope explicitly, use the block form `@name { … }` (its interior is a sequence of
bindings and body expressions). Stage arguments override the preamble innermost-first.

## 3.3 Member slots and the governance of omission

The members are calendar system, calendar, axis, roll, granularity, TZ, asof, WKST, and provenance.
**Dangerous members** — those whose mix-up produces silent wrong results — are declaration-required
leaning; safe members may default. A dangerous member that can be resolved neither in the preamble
nor at a stage is a static error.

| Member | When omitted | Why it is dangerous |
|---|---|---|
| `calendar-system` (calendar system) | May default (Gregorian) | A mix-up is caught by name ambiguity |
| `calendar` (business-day calendar) | Declaration required | No universal default exists / silently yields a different day. The value is a calendar entity (identity check, §3.9) |
| `axis` (axis) | Declaration required (no language default) | An axis mix-up gives a different result (shift's 3 days vs. 3 business days) |
| `roll` (roll convention) | Declaration required | Mixing up how invalid points are moved is a silent wrong result |
| `wkst` | Declaration-required leaning | The origin of "the Nth" flips |
| `tz` | Declaration-required leaning | The local day drifts |
| `source` (provenance) | Declaration-required leaning | Confusing the official edition with a local override |
| `granularity` (granularity) | May default ("day") | Explicit or default, the result is often unchanged |
| `asof` | May default (evaluation time) | Declare it when reproducibility matters |

### Folding axes and rolls (scope defaults)

`on:` (roll, filter) and `unit:` (shift) name, premise-relative, the **axis** being operated on
(`bizDay` / `day` / `hour` …; a cycle name (`weekday`) is a label and does not resolve to a stream,
so it cannot stand as an axis; `stride` is input-relative = takes no axis — ADR-38).
The axis resolves against the in-scope `calendar:` (`bizDay` under `@JP` is TSE's business days).
Because axis names resolve, in the in-scope premise, to a **stream of valid points**, a derived
stream may be passed directly as an axis (e.g. `roll(Following, on: nonHoliday)` for substitute
holidays. ADR-26). When a **premise name** stands in the axis position (`on: TSE`), the identity
check requires it to be a calendar entity, and it is reinterpreted as "override `calendar:` for
that stage only and read the standard derivation `bizDay`" (§3.9, ADR-35).
The redundancy of several stages writing the same axis can be folded by declaring the axis once as
the preamble member `axis:`; a stage that omits it resolves from the in-scope `axis:`. This is a
lexical scope default (default → evaluation context → block declaration → stage argument, innermost
wins), not back-stage inference, so each stage's locality is preserved. The same mechanism lets a
roll convention be declared once as the preamble member `roll:` (in a bundle definition, or
postfixed to the lightweight form) and inherited by stages. Being a dangerous member, however, the
convention is recommended to stay explicit.

```text
# explicit (write the axis at each stage)
@JP
monthEnd |> roll(Preceding, on: bizDay) |> shift(-3, unit: bizDay)

# folded (give the body the axis default as a postfix)
@JP axis: bizDay
monthEnd |> roll(Preceding) |> shift(-3)

# a different axis for one stage only (innermost wins)
@JP axis: bizDay
monthEnd |> roll(Preceding) |> shift(-3, unit: day)
```

## 3.4 Name resolution is premise-relative

Names resolve to values under the current premise. If several premises supply the same name, it is
ambiguous and requires qualification (`Gregorian.month`). "Meaning is premise-relative" extends
beyond values to names. Unique: bare name; ambiguous: qualify with the enclosing entity;
unresolved: error.

## 3.5 Value expressions and variables

The premise layer has value expressions that are not time streams. The operators are chosen so as
not to collide with the combinators (`&`, `|`, `\`).

| Kind | Symbols |
|---|---|
| Arithmetic | `+ - * /`, remainder `mod`, integer division `div` (words). `div` is **floor** division and `mod` the mathematical remainder (they disagree with trunc for negative dividends. ADR-31 revised, F63) |
| Comparison | `< <= > >= == !=` |
| Logic | `and`, `or`, `not` (words; the symbols `&`/`\|` are reserved for the combinators) |
| Conditional | ternary `cond ? a : b` |
| List | literal `[a, b, …]`, indexing `l[i]` (0-based), membership predicate `x in l` |
| String | literal `"…"` (no newlines, no escapes; used for TZ and source values. ADR-32) |
| Binding / equality | `=` is binding (definition), `==` is equality comparison |

Bindings of value functions and value constants may be written both inside premise blocks and at
file top level. Top-level bindings are lazily resolved in the in-scope premise, just like sugar
definitions (§4.8) — "`=` is the same binding everywhere" (ADR-28).

**Lambdas and higher-order functions** — some operators take not a value but a **function** as an
argument (**higher-order functions**). The window-generating words `span`/`split` (§3.6) and the
filter `filter` (§4.6) are all higher-order functions that receive "how to treat each element" as a
function (`cycle` takes a list of labels, so it does not count). An anonymous function passed on
the spot is called a **lambda**, written `arg => expr` (the arrow `=>` is distinct from the type
notation `->`). For example, `y => y mod 4 == 0` is the function "take a calendar year `y` and
return whether it is a multiple of 4." A lambda may be bound to a name (`isLeap = y => …`) or
passed directly to a higher-order function in place (`filter(x => …)`).

**Predicates and variables** — a predicate (a lambda returning a boolean) binds each element of its
subject. `where` is merged into `filter`: `filter` takes both premise predicates (`on:`) and
value-expression predicates (lambdas). References go through the binding name, so nesting is never
ambiguous.

```text
isLeap = y => y mod 4 == 0 and not(y mod 100 == 0 and y mod 400 != 0)
```

## 3.6 Primitive definitions of calendar systems

A primitive definition (`Gregorian` and the like — a root with no derivation source) builds a
calendar system by carving the continuous base Chronos into windows, and produces public words. The
window-generating words are three plus one (`grid`/`span`/`split`, which make windows, and `cycle`,
which produces **labels**, not windows). All three window-making words produce partition-type
windows (§4.2), so exhaustiveness and non-overlap are structurally guaranteed (I5). This section
explains **how to write** a primitive definition, with `Gregorian` as the example. For the
exhaustive account of `Gregorian` itself (each word, the separation of `weekday` and WKST, scope),
see [`stdlib/gregorian.md`](../stdlib/gregorian.md).

**Dependencies are primarily bottom-up aggregation**: the atom `day` is bundled into `month`, and
that `month` into `year` (`month` is the basic grouping). Only `year`'s dependent window
(`quarter`) is made by `split`-ting `year`, so that it tracks changes to `year` automatically.

| Word | Kind | Meaning |
|---|---|---|
| `grid(w)` | Uniform partition | Tiles the continuous axis into equal widths `w`. Makes the calendar's atoms. `w` follows the **civil-time width convention** (`1d` = 1 civil day, not a fixed `86400s`; a civil day is 23–25 hours on DST transition days. Leap seconds are out of scope = chronos is a uniform idealized axis without leap seconds (each UTC day = 86,400 seconds). ADR-11/12/33). Phase defaults: civil-time widths align to the start instant of each civil day in the in-scope `tz:` (midnight on ordinary days. ADR-31 revised); elapsed-time widths align to the epoch; overridable with `anchor:` (ADR-31) |
| `span(f)` | Variable aggregation (bottom-up) | Bundles a sequence of finer units into contiguous windows. `f = n => count` binds the ordinal `n` (epoch-origin) of the window being generated and returns the number of units to bundle. The count may be variable (`month`'s day counts) or constant (`year`'s 12) |
| `split(g) by: u` | Variable division (top-down) | Divides a parent window into contiguous subwindows. `g = y => [widths…]` binds the parent's ordinal `y` and returns the list of subwindow widths. `by: u` makes the width unit explicit. That the widths sum to the parent is checkable under I5. Used for dependent windows |
| `cycle(labels) anchor:` | Parallel labels | Attaches repeating labels to the target partition windows. Produces labels, not windows. The period length is arbitrary (7, 10, 12, 60, …) and so is the target window (not just `day`'s weekdays — `month` and `year` work too; the sexagenary cycle is `year cycle […]`). `anchor:` is an instant meaning "the target window it belongs to takes the first label". The binding name reads, in value expressions, as a point → label value function (`filter(d => weekday(d) == Mon)`; resolution is two steps: point → containing window → label. ADR-27) |

### Leap is a value, not a window (the pivot that fixes the dependency direction)

"Does February have 28 or 29 days?" looks like a dependency on the **window** `year`, but it is in
fact a **value** dependency computable from the month's serial number `m` (derive the calendar year
and month position from `m`, then decide with `isLeap`). Hence `month` need not depend on the
`year` window, and `month` can stand as the basic grouping (bundling `day`). If `month` were made a
child of `year` (`year split`), then when a derivation (the fiscal calendar, §3.7) re-bundles
`year` from `month`, `month ↔ year` would become circular. Viewing leap as a value dependency and
placing `month` as the parent keeps the cycle from ever arising — this is the ground on which the
fiscal calendar can be written in one line, with no workaround.

### Public words

Only bindings at the block's top level are public, referenced with `.` as in `Gregorian.month`.
Boundaries are derived by reusing the body layer's selectors (zero new machinery). The generator
`monthEnd` (yielding the calendar-day month end) is in reality this public boundary word
`month |> last` itself: a "generator" is a public boundary word of a primitive definition (not a
separate mechanism).

```text
premise Gregorian {
  day     = chronos grid 1d                                 # atom (carve the continuous axis into civil days)
  weekday = day cycle [Mon, Tue, Wed, Thu, Fri, Sat, Sun] anchor: 2000-01-03

  isLeap      = y => y mod 4 == 0 and not(y mod 100 == 0 and y mod 400 != 0)
  daysInMonth = m => monthLengths(isLeap(yearOf(m)))[monthOf(m)]  # leap computed as a value from m (no year window)
  month   = day   span daysInMonth label: (p => monthNo(p))        # basic grouping: bundles day (year-independent)
  year    = month span (_ => 12) phase: 0 label: (p => yearNo(p))  # bundles month twelve at a time
  quarter = year  split (_ => [3, 3, 3, 3]) by: month       # year's dependent window (auto-tracks in fiscal calendars)

  weekStart = day |> filter(d => weekday(d) == wkst)        # wkst lazily resolves the user-side preamble declaration
  week      = day |> segmentBy(weekStart, edges: clip, empties: error)

  monthStart = month |> first                               # public boundary words (selector reuse)
  monthEnd   = month |> last
  yearStart  = year  |> first
}
```

The auxiliary value functions `yearOf(m)` / `monthOf(m)` / `monthLengths(bool)` are value
expressions that return the calendar year, month position, and day-count list from a month ordinal
`m` (they do not reference the `year` window). Bindings resolve in dependency order
(`day → month → year → quarter`). Mutual reference is allowed; cycles are errors.

The **epoch** at which the window ordinals `n` and `m` originate is by language default
1970-01-01T00:00 (in-scope tz). A calendar system with a different basis (a Martian calendar, etc.)
may override it with the primitive-definition member **`epoch:`** (a value intrinsic to the
calendar system; it cannot be placed in the user-side preamble. Ordinals are 0-based — the
coordinate in which `monthOf(m) = m mod 12` holds. ADR-31). Since the epoch is a preimage under the
in-scope tz's mapping, **a different tz means a different point on chronos** — `epochOrdinal` and
span ordinals are premise-relative coordinates (ADR-33 decision 7).

`week` references `wkst:` (a preamble member) on its right-hand side and is **lazily resolved in
the user side's in-scope premise** (the same rule as sugar definitions, §4.8; `within(week)` with
no `wkst:` declared is a static error). Generation uses `segmentBy` (interval-sequence type), but
because the weekday cycle lets exhaustiveness and non-overlap be proven by the I5 check, it can be
used with `within(week)` — partition-hood is established by the check, not by the generating word
([`stdlib/gregorian.md`](../stdlib/gregorian.md) §4.5).

The right-hand side of a premise binding may contain, besides value expressions and
window-generating words, **body-layer stream expressions** (pipe sequences like `weekStart` above,
`segmentBy`, table literals §3.8) — a consequence of "vocabulary is shared with the body layer"
(ADR-25); the type of a public word is determined by the type of its right-hand side (window /
label / value / stream. ADR-26).

`Gregorian` is a mathematical model on an idealized continuous time axis; it bears no historical
facts (the date deletion/duplication of the 1582 calendar reform, regional differences, leap
seconds (positive and negative; chronos idealization = ADR-33), the calendar's period of validity).
When needed, handle them with a separate premise (a historically attested edition) or with
`asof`/`source` annotations.

**The firing point of `tz:` (ADR-33)**: `tz:` is declaration-required leaning and fires **at use**
(isomorphic to `wkst:`) — an evaluation that requires the chronos→civil-coordinate mapping — the
anchor of a date literal, civil-width `grid`, `snapTo(day)`, and the like — errors if it cannot
resolve `tz:` in scope. Expressions that do not use the mapping stand without a declaration. The
definition of TZ (mapping, civil day, gaps/overlaps, leap seconds, versions) is in ADR-33.

## 3.7 Derived definitions of calendar systems

A derived definition makes a new premise by overriding or extending an existing premise's public
words (the `premise → premise` closure). The core is `with` override — on top of the base, only the
named public words are replaced; the rest is inherited.

```text
premise Fiscal = Gregorian with {
  year = month span (_ => 12) phase: 3 label: (p => yearNo(p))   # April start. label: is not inherited on override = attach it alongside (F96)
  # month is untouched, so calendar months and month ends stay fixed (inherited from Gregorian as-is)
  # quarter's inherited definition (year split by month) auto-tracks the new year → fiscal quarters Apr-Jun/…
}
```

**Name resolution (mechanism A)**:

- **Bare names re-resolve in the derived scope** — the override (`year`) shadows, and the inherited
  words depending on it (`quarter`, `yearStart`) automatically follow the new word. This is why the
  fiscal calendar takes a single `year` line.
- **A qualified reference `Base.word` pins to the base's resolved value** — the explicit means for
  deliberately fixing an inherited word to the base value. The fiscal calendar does not override
  `month`, so no pin is needed (by §3.6's "leap is a value", no `month ↔ year` cycle arises).

**Dates do not move (base-fixedness I1)** — a derivation moves only the windows' **cut points**.
Calendar days, `day`/`month`, `monthStart` are fixed. 2026-03-01 remains "March 1"; only the **year
window** it belongs to changes (fiscal 2025 = Apr2025–Mar2026).

**The pipe is sugar; expansion is a single phase shift of span** — the everyday form is
`premise Fiscal = Gregorian |> shiftBoundary(+3, on: year, unit: month)`. `shiftBoundary` is sugar
expanding to the `with` above, with the expansion rule:

```text
shiftBoundary(δ, on: W, unit: U)  ≡  W = U span (_ => k) phase: ((φ₀ + δ) mod k)   # negative δ is also normalized by the modulus (F65)
#   k  = the number of U's contained in W (12 for year ⊃ month)
#   φ₀ = W's phase in the base (0 for Gregorian's year)
```

View `W` as "a `span` bundling `U` in groups of `k`" and simply advance its phase by δ. Pairs where
`k` is not constant (shifting `month ⊃ day` in units of `day`, etc.) are not fiscal-calendar-type
operations and lie outside `shiftBoundary`'s reach (a separate operator if ever needed).

**An orthogonal, separate knob** — year numbering ("fiscal 2025" = the starting calendar year /
US FY = the ending calendar year) is a projection of ordinals and labels independent of window
cutting, with conventions that differ by country. It is not baked into `shiftBoundary` but absorbed
into the labeling side (`label:` attachment expressions) of the window→value projection family
(§4.9, ADR-27). The binding rule of attachment expressions is settled by ADR-34 — the lambda
receives the window's **first point** (`label: (p => yearNo(p))` labels with the starting calendar
year); adjacent-window reference is out of reach (§4.9). `shiftBoundary` expands **preserving** the
base's `label:` (the cut knob and the label knob are orthogonal), and the composite phase is
normalized modulo `k` (F65).

## 3.8 The intake for data (table literals)

Sequences that cannot be generated from periodic rules — the gazette-proclaimed vernal and autumnal
equinoxes, new moons, the twenty-four solar terms, year-limited special days — are brought into a
premise with a **table literal** (ADR-26). A list of instant literals is promoted to a time-stream
constant (the syntax is identical to value lists, §3.5; the type is determined by the elements).
The sequence must be ascending (out of order or duplicates are static errors).
**The empty list `[]` is promoted only when `covering:` is postfixed** (the empty table = the
primary form of "zero points, but the coverage is to be claimed". ADR-45 — the vessel for writing
the supply layer's "nothing at all yet" as a legal source. Having no elements, its type is
determined by the presence of covering:, and each of the containment, ascending-order, and
`labels:` same-length checks (only `labels: []` is legal) holds vacuously; alignment is vacuous
conformance = §4.5).

```text
premise JPGazette {
  source: "cao.go.jp/official"      # provenance (declaration-required leaning: mixing up data provenance is dangerous. string = ADR-32)
  asof:   2025-02-03                # edition (data as of this gazette)
  tz:     "Asia/Tokyo"              # fixes the data's civil days on the inside (ADR-33 decision 10, F54)
  vernalEquinoxDay = [2025-03-20, 2026-03-20, 2027-03-21] covering: 2025..2027
}
```

- A premise containing a table literal is `source:` declaration-required leaning. The edition is
  carried by `asof:`. **A premise with `covering:` or a date table must declare `tz:`** (the ends
  of the coverage resolve as civil days of the premise's tz; undeclared, the coverage would move
  with the user side's tz. ADR-37).
- **Coverage `covering:`**: a two-faced **claim** — "**complete inside the range, unknown outside
  it**" — that **does not touch the values** (the values are exactly the written sequence).
  Consistency of claim and values is a static check — **every element of the sequence must be
  contained in covering** (a violation is a static error of the same rank as out-of-order and
  duplicates). Evaluation outside the range flows into the evaluation annotations (I6, §4.10) as an
  **out-of-coverage** provenance, distinguished from an "accidental empty". When omitted, the range is
  the ends of the sequence (closed interval) — **the empty table, having no ends, requires an
  explicit covering:** (omission is a static error with guidance. ADR-45).
  - **Open-ended**: `covering: 2021..`, `..2027`, `..` (a claim of **completeness** over all time =
    produces no annotations; the receptacle for a one-off exclusion table
    `[2026-01-05] covering: ..`). Completeness is an unverifiable claim, so governance applies —
    `source:`/`asof:` declaration-required leaning, and permanent display in the coverage summary
    (§4.10). Note that omission (narrowest) and `..` (widest) are **opposite** claims.
  - **Interval lists**: `covering: 2020..2022, 2024..2027` (an honest declaration of gapped data).
  - **Binding-postfix = explicit coverage claim**: the composition
    `nonWorking = (satSun | h2024 | h2025) covering: 2024..2025` claims "this composition is
    complete over this range" (the component coverages' annotations are replaced by this binding's
    claim — the sole outlet for cancellation; there is no automatic cancellation).
    Necessary-condition static check: within the claimed range, every interval that would carry an
    annotation must be contained in the covering of some **data component** (a rule component's
    "all time" does not count — a completeness claim over an interval no data component can speak
    for is pushed down to an open-ended covering on the component table's side. ADR-37 decision 5,
    revised).
- The range literal `2024-02-10..2024-02-17` is sugar expanding to an enumeration of consecutive
  days.
- **Labeled tables** (`labels:`. ADR-30): attach to the instant sequence a label sequence of the
  same length, defining a point→label projection. **The binding name is itself the projection
  name** (the same rule as cycle binding names) —
  `sekki = [2026-01-05T17:23, …] labels: [小寒, 大寒, …]` makes `sekki(d)` return the solar-term
  name. Points do not store labels; labels are read through the projection (§4.9) = no record type
  is introduced. cycle (infinite rhythm) and label sequences (finite data) differ only in their
  source.
- A calendar system that carves windows with data (a lunisolar calendar cut at new moons) is the
  same premise type. What calendar-system purity (I8) forbids is a generator's dependence on a
  **calendar** (business-day policy), not a calendar system's dependence on **data** — the purity
  distinction is drawn not by type but by provenance (`source:`/`asof:`) (ADR-26).
- **The external supply declaration `external`** (ADR-46) — the socket for "expressions are static,
  data resolves at run time". `name = external(kind: dates | instants [, labels: [domain]] [, source: "…"])`
  may be written **only as the right-hand side (its head) of a premise binding** (body-layer and
  under-preamble bindings are static errors — the governance of source:/tz: must live on the
  premise). The resolved value is a table value itself, and the same governance checks as for
  literals apply as the **supply contract**: covering and asof are always carried by the resolved
  value (absence = contract violation); containment / ascending order / same length / date
  existence are likewise checked at resolution. `kind:` is the **alignment claim** (`dates` = the
  civil-day grid of the definition side's tz; `instants` = none — the declaration stands in for the
  literal text; even when empty, as declared = independent of the resolved value's row count).
  `labels:` is the **enumeration of the value domain** (static knowledge for bare-name label
  comparison). Resolution is **an adjunct of the evaluation context** (once per evaluation, at
  first reference; snapshot-pinned; the means of acquisition is outside the language = ADR-15). A
  resolution failure is a **supply error** (a machine-readable subclass — distinguished by type
  from "nothing yet" (empty data + covering)). A premise with external must declare `tz:`. Details
  in [`reference/external.md`](../reference/external.md). The resolution flow (one resolution
  per evaluation, the supply contract, the type distinction between "nothing yet" and failure):

  ```mermaid
  sequenceDiagram
      participant E as Evaluation (body layer)
      participant X as external binding (the expression is static)
      participant R as Resolver (means of acquisition outside the language = ADR-15)
      E->>X: First reference in the evaluation (demand-driven — no resolution if never referenced)
      X->>R: Resolve (once per evaluation)
      alt Acquisition succeeded
          R-->>X: Table value [point sequence, covering, asof (required), labels?]
          X->>X: Supply-contract check = the same governance as literals<br/>(kind alignment, containment, ascending order, labels domain/length, date existence)
          Note over X: A contract violation is an evaluation error<br/>(boot-checked — the same wording system as literals)
          X-->>E: Snapshot-pinned — later references in the evaluation see the same value<br/>(determinism is "relative to the same snapshot". §7.8)
          Note over E,X: "Nothing yet" is a legitimate empty = [] covering: … (ADR-45) —<br/>passes the checks by vacuous conformance. The value is empty, the danger observed via annotations (§4.10)
      else Acquisition failed
          R--xX: Resolution failure
          X--xE: Supply error (a machine-readable subclass of evaluation error — distinguished by type from "nothing yet")
      end
  ```

The naming status is in §5.4: `grid`, `span`, `split`, `cycle`, `anchor:`, `phase:`, `by:`, `with`,
`chronos` (the lexical name of the base. ADR-29), and `axis:` (the operating axis) are settled, and
RC2 also settled `covering:`, `labels:`, and `label:` (table and attachment sides). The sole
placeholder is `shiftBoundary` (carried to 1.0 — the batch confirmation F51 (2026-07-09) made all
others official. §5.4). The lexis of date and width literals is settled (ADR-28/43, §5.5).

## 3.9 Calendar entities (ADR-35)

The entity given to the `calendar:` member (TSE, JPCal, etc.) is a **premise that has the reserved
public word `nonWorking`**. There is no dedicated declaration syntax — the syntax for bundling
"stream bindings + `source:`/`asof:`" already exists in premise definitions (§3.2) and the
layer-crossing rule (end of §3.6, ADR-26); the only thing specific to calendar entities is the
designation of "which binding is the non-working set".

```text
premise TSE {
  calendar-system: Gregorian          # needed to resolve weekday (the definition of satSun)
  tz:     "Asia/Tokyo"                # fixes which civil day a non-working "day" is (inner-fixed, ADR-33)
  source: "jpx.co.jp/trading-calendar"
  asof:   2026-01-05

  satSun     = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  holidays   = [2026-01-01, 2026-01-12, …] covering: 2026..2026
  nonWorking = satSun | holidays      # reserved public word = the entity's "identity"
}

premise JP {
  calendar-system: Gregorian
  calendar:        TSE                # only a premise publishing nonWorking may stand here
  tz:              "Asia/Tokyo"
  wkst:            Mon
}
```

- **The type requirement is an identity check** (an extension of ADR-19): only "a premise with the
  public word `nonWorking` (time-stream type, argument-less binding)" may stand at `calendar:`.
  Placing a premise without it is a static error. The identity check further requires (a)
  **`nonWorking` is aligned to the civil-day grid of the entity's tz** (§4.5 — the operational
  definition of "read the entity at day granularity"), and (b) **the entity declares `tz:`
  (required)** (the enforcement point of inner-fixing (ADR-33) is the declaration), and it runs at
  the **first use as an entity** (resolution of `calendar:`; reinterpretation at an axis position).
  Calendar-system premises and calendar premises are the same premise type, distinguished by
  identity = the aspect of their public words (the reverse mistake — placing an entity in the
  `calendar-system:` position — is caught by "a premise with `nonWorking` may not stand at
  `calendar-system:`"). **Granularity is not part of the type** — fine-grained points such as
  half-day-holiday non-working time bands and business hours are also in reach, as **other**
  time-stream bindings within the same entity (`nonWorking` alone is the day-aligned reserved
  word; the fine-grained layer's conventions are below, ADR-41).
- **The standard derivation of `bizDay` is prescribed uniformly by the language**: with the
  in-scope `calendar:` entity as C, a derivation sugar equivalent to
  `bizDay = everyDay \ C.nonWorking` (lazily resolved; the same rule as §4.8). The bare name
  `everyDay` resolves in the **user side's in-scope premise**, while `C.nonWorking` is **pinned**
  to C (mechanism A). **Where `calendar:` is in scope, `bizDay` is a language-reserved derived
  name** (a manual binding is a static error; out of that scope it remains a free binding name as
  before). A derivation in which the entity's `tz:` and the user side's `tz:` disagree is stopped
  by the alignment check (§4.5, ADR-36) as a safe-side error. The standard derivation
  **propagates** `nonWorking`'s evaluation annotations (the out-of-coverage provenance of
  `covering:`) (I6; the propagation rules are §4.10, ADR-37 — the difference `\` takes the union
  of both sides' annotations, so the degeneration beyond where holiday data runs out **does occur
  but is observable**).
- **Premise names in the axis position** (F53's convention): a name at `on:`/`unit:`/`axis:`
  resolves normally if it resolves as a binding; is reinterpreted if it resolves only as a premise
  name; and is ambiguous = a static error if it resolves as both (ADR-17). A premise name P is
  required by the identity check to be a calendar entity, and is reinterpreted as "override
  `calendar:` to P for that stage (or that scope) only and read the standard derivation `bizDay`" —
  `roll(Preceding, on: TSE)` ≡ "`roll(Preceding, on: bizDay)` in the context of `calendar: TSE`".
  A premise name that is not an entity is a static error. The reinterpretation's ripple extends
  only to the resolution of that axis. The full resolution path (the axis-position face of §2.7
  "position-dependent name interpretation"):

  ```mermaid
  flowchart TD
    X["Axis-position name X (on: / unit: / axis:)"]
    X --> B{"Resolves as a binding (stream)?"}
    B -- "yes" --> C{"Also resolves as a premise name?"}
    C -- "yes" --> AMB["Ambiguous = static error (never chosen silently)"]
    C -- "no" --> S["Normal resolution — the derived stream is the axis"]
    B -- "no" --> P{"Resolves as a premise name?"}
    P -- "no" --> E1["Unresolved = static error"]
    P -- "yes" --> ID["Identity check: nonWorking (day-aligned, argument-less) + tz: declared"]
    ID -- "fail" --> E2["Static error (not a calendar entity)"]
    ID -- "pass" --> DER["Reinterpretation: read the standard derivation bizDay in the context of calendar: X"]
  ```

- **Member resolution rule** (the codification of "pin to the resolved value", ADR-35): the
  preamble members of definitions evaluated under a qualified pin (`C.word`) or an entity
  reinterpretation follow **definition-side precedence** — members that C (and its base chain)
  declares are fixed to C's values, and only undeclared members resolve in the user side's scope
  (the inner-fixing of `tz:` and the lazy resolution of `wkst:` fold into this one line).
- **Overriding uses the existing `with`** (§3.7):
  `premise MyCompany = TSE with { source: "intra.example.com/holidays"; nonWorking = TSE.nonWorking | companyHolidays }`.
  Base references on the right-hand side use the qualified pin (a bare name would be a
  self-reference to the word being defined). **A derivation that overrides `nonWorking` overrides
  `source:` as well (declaration-required leaning)** — inheriting it silently would let altered
  data claim the official provenance.
- **Squaring with cascades** (ADR-01): add-back and inversion override compositions are expressed
  on the **right-hand side** of `nonWorking` (declaration order and left association per §4.5;
  China's tiaoxiu is `nonWorking = (satSun | holidays) \ workdaysSpecial`). Filtering appears only
  at the final stage of the standard derivation, and the composition leading up to it carries the
  cascade — not a regression to "the residue of filtering".
- **Governance is demand-driven**: an entity premise does not itself require `calendar:`. If a
  binding inside the entity uses a bizDay-family axis, it requires the entity's own `calendar:`;
  self- and mutual cycles are static errors.
- Orthogonal to the external supply declaration: the right-hand side of `holidays` may be a table
  literal or `external(kind: dates)` (§3.8, ADR-46) (the vessel's alignment claim is carried by
  `kind:` — resolving the ADR-36 corollary; even with empty data the entity boots and bizDay
  degenerates to everyDay (observably)).
- Cross-tz use (using the Tokyo entity from an NY premise, etc.) is outside the reach of the
  axis-position sugar — the explicit form `everyDay \ (TSE.nonWorking |> snapTo(day))` means "read
  the overlap on chronos through the user side's day boundaries", while an explicit reconciliation
  of "the same date label" is written with `rebase(to:)` (§4.4, ADR-40).


### 3.9.1 The fine-grained layer — business-hours supply conventions and standard derivations (ADR-41)

Besides `nonWorking`, an entity may declare **the paired reserved public words `sessionOpens` and
`sessionCloses`** — the opening sequence and the closing sequence (time-stream type,
argument-less) (optional; the declaration is a pair = declaring only one is a static error; under
`with` derivation the judgment includes inheritance). The points are **facts in the civil
coordinates of the entity's tz** (wall clock — the enforcement form of "whether DST shifts them or
not is a decision of the premise layer's culture"; the rules are the civil grid of a time-of-day
anchor (§3.6, ADR-31 revision 2) or civil-time widths with `strideBy`; the exceptions are
compositions of time-of-day tables). A session = the union of half-open intervals
`[open_i, close_i)`. Overnight sessions (crossing days) are legal; 24-hour operation is outside
this vessel (express it at the day-granularity layer).

**Consistency check** (data-relative layer; at first use of a fine-grained derivation): over the
domain = joint effective coverage ∩ materialization range, adjacent markers must alternate in kind
(an isolated close/open at an edge is legal as a notch). **For a simultaneous open/close both
points must exist**, and their order is unique from the alternation requirement (close→open =
continuous operation / open→close = zero width) — the handling of firing for simultaneous events
belongs to the firing layer (out of scope).

**Standard derivations** (reserved where `calendar:` is in scope, when entity C declares the
pair): `bizOpen` = the points of C.sessionOpens whose opening day (a civil day in C's tz) is a
business day of C; `bizClose` = each session's closing point; `isOpen(t)` = whether t lies in the
union of the bizOpen sessions' intervals (a value predicate). **The derivations are
entity-relative** — the decision inputs (holidays, tz) resolve in the entity's culture and do not
depend on the reader's premise (a different role from day-granularity `bizDay` = user-side
relative). A session's business-day-ness is read from its **opening day** (an overnight session's
tail follows its opening day). Coverage follows the witness rule's three branches (true = an
unannotated decision; out-of-coverage = the decision depends on annotated intervals of
sessionOpens/sessionCloses/nonWorking; false = coverage complete. §4.10). No `bizHour`-style point
sequence is derived — granularity is the expression's choice (`hourly |> filter(t => isOpen(t))`).
