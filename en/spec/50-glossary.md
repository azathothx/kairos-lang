---
source_sha: e46fef197c0c
---

# Kairos Language Specification — 6. Glossary

> Translated from the canonical Japanese chapter [spec/50-glossary.md](../../spec/50-glossary.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

An index for lookup while reading the specification. Each entry is 〈term｜one-line
definition｜references〉. Entries whose structure is settled but whose name is provisional are
marked **（仮称）** (placeholder) — the naming status is §5.4; the only placeholder left is
`shiftBoundary` (the batch confirmation F51 〈2026-07-09〉 settled everything else as official
names, and the supply pair was renamed to `sessionOpens`/`sessionCloses`). In the references, "§"
points to chapters of this specification and `stdlib/…` to the standard premise commentary.

## 6.1 Layers, types, and overall structure

| Term | Definition | References |
|---|---|---|
| Kairos | This language. A schedule definition language that, from the continuous base Chronos, weaves the set of meaningful instants at which things should fire (kairos) | §1.1 |
| Chronos | The single absolute continuous time axis, independent of TZ = the base. A uniform idealized scale without leap seconds (each UTC day = 86,400 s). Every calendar system and granularity is a projection onto it; it is never relativized. The lexical name is `chronos` (ADR-29/33) | §1.3 · §2.2 |
| TZ (`tz:`) | A TZ is a **versioned mapping** from chronos to civil coordinates (wall-clock labels). `tz:` is the premise context value that gives its name (I6; declaration leans mandatory; enforced at point of use). Values: IANA region identifiers, fixed offsets (strict unique form `"±HH:MM"` only = ADR-43), and `"UTC"`. Time literals that fall into a gap or overlap are errors (ADR-33) | §3.2 · §3.3 · §3.6 · §5.5 |
| kairos | A "meaningful instant at which something should fire", chosen on the base Chronos. The language's output (each point of a time stream) | §1.1 |
| premise layer（premise 層） | The layer that builds and supplies calendar systems and calendars (DDL-like, declarative, multi-line) | §2.1 · §3 |
| body layer（本体層） | The layer that weaves schedules with the supplied vocabulary (DML-like, pipe-styled, one-line oriented) | §2.1 · §4 |
| time stream type（時間ストリーム型） | A lazy, infinite, ordered sequence of points on the base. The body layer's first-class value = the **extension** | §2.2 |
| premise type（premise 型） | The generating rule itself for calendar systems and the like = the **intension**. Comes in primitive/derived variants, with `premise → premise` closure | §2.2 |
| value type（値型） | Numbers, booleans, enumerations, lists, strings (ADR-32), and instants (ADR-43 = bare value bindings are also legal). The third type, used for leap tests and the `n` of `shift(n)` | §2.2 · §3.5 |
| lambda (anonymous function)（ラムダ（無名関数）） | A nameless function passed in place. `args => expression` (the arrow `=>` is distinct from the type notation `->`) | §3.5 |
| higher-order function（高階関数） | An operator that takes a function as an argument. `filter`, `span`, `split` qualify (`cycle` takes a list) | §3.5 |
| predicate（述語） | A lambda returning a boolean. `filter` takes both premise predicates (`on:`) and value-expression predicates (lambdas) | §3.5 · §4.6 |
| extension / intension（外延 / 内包） | Extension = the generated sequence of points (a time stream); intension = the generating rule (a premise) | §2.2 |
| evaluation annotation (out-of-coverage)（評価註釈（範囲外）） | A sequence of annotation intervals running alongside the result 〔[a,b), kind, source, covering, asof〕. For now the only kind is "out-of-coverage" = intervals where the result may depend on data outside the coverage. Attached even to non-empty results. Absence of annotations is not a proof of correctness | §4.10 · ADR-15/37 |
| effective coverage（実効被覆域） | The settled region, computed via the transport table, of the bindings a reference actually reads (= the complement of the annotation intervals). The criterion for the error classifier (out-of-coverage vs. mix-up) — not the raw table's covering | §4.10 · ADR-37 |
| coverage claim（被覆主張） | A binding-postfix `covering:` = the unverifiable explicit claim "this composition is complete over this range" (the sole outlet for offsetting; governance on a par with source/asof) | §3.8 · ADR-37 |
| coverage summary / runway（被覆サマリ / 残走路） | For each data source the evaluation referenced: 〔source, covering, asof, completeness claim, days remaining from the evaluation `to` (the runway)〕. An unclipped vessel for monitoring (separate from annotations) | §4.10 · ADR-37 |
| closure（閉包） | Every operator is `(stream…, premise) → stream`. Derived results can be fed back in as inputs | §2.3 |
| core family（core 族） | The body layer's minimal, strict operator set (generators, point transforms, combinators, filters, windows, selectors, strides) | §2.4 · §4 |
| sugar（糖衣） | Shorthand that names a core composition. Erasable by expansion into core (one-way dependency) | §2.4 · §4.8 |
| primitive definition（原始的定義） | A calendar-system root with no derivation source (`Gregorian`, etc.). Carves windows from the base | §3.6 · `stdlib/gregorian.md` |
| derived definition（派生的定義） | A calendar system built by overriding an existing premise (fiscal calendars, etc.). `premise → premise` closure | §3.7 |

## 6.2 The premise and its components

| Term | Definition | References |
|---|---|---|
| premise（前提） | The umbrella term for the preconditions under which an expression's interpretation holds. Isomorphic to a contract's recitals | §3.1 |
| preamble（前文） | The declarations that set premises before the body expression. Definition `premise Name {…}` / lightweight `@name` / full form | §3.2 |
| calendar system（暦法） | A set of window-partition definitions on the base. Determines what a "month" is. Gregorian is just one instance | §3.6 |
| calendar（カレンダー） | A business-day calendar referenced by name (a weekend → holiday → organization-holiday cascade). Its version is fixed by asof | table §3.3 |
| calendar entity（カレンダー実体） | The premise installed at `calendar:`. Having the public word `nonWorking` and declaring `tz:` are the requirements for qualifying as one (ADR-35) | §3.9 |
| `nonWorking` | The calendar entity's reserved public word (time stream type; no arguments; day alignment in the entity's tz). Bundles the non-working set = the result of the cascade composition | §3.9 |
| `bizDay` (standard derivation)（標準導出） | The derivation sugar the language fixes uniformly: `everyDay \ C.nonWorking` (C = the in-scope `calendar:`). With a `calendar:` in scope it is a language-reserved derived name (manual binding is a static error). A premise name in axis position (`on: TSE`) is read as this derivation. **Consumer-relative** (an axis drawn from the reader's own days) | §3.9 |
| `sessionOpens`/`sessionCloses` | The entity's paired reserved public words = the opening sequence and closing sequence (the supply convention for business hours; optional declaration). Points are facts in the entity tz's civil coordinates (wall clock). A session = a union of half-open intervals; the consistency check is local alternation + joint effective coverage | §3.9.1 |
| `bizOpen`/`bizClose`/`isOpen` (standard derivations)（標準導出） | The business session's opening sequence, closing sequence, and membership predicate. **Entity-relative** (the judgment material resolves in the entity's culture = the entity's tz and holidays; a role distinct from bizDay's consumer-relative stance). Business-day-ness is read off the opening day | §3.9.1 |
| axis（軸） | The unit an operation counts in (`bizDay`/`day`/`hour`…). Named by `on:`/`unit:`, resolved against the in-scope calendar. A separate concept from the base `chronos` (ADR-29) | §3.3 |
| roll convention（ロール規約） | The convention that moves invalid points to valid ones (Following/Preceding/Modified). Axis-independent | §4.4 · §6.6 |
| granularity（粒度） | Year, month, day, hour, minute, second, week, quarter… A display projection of position on an axis. Not carried in the type | §2.2 |
| width (conventions)（幅（規約）） | The length of an offset. The convention set of elapsed time vs. civil time + roll. `grid`'s `1d` is a civil day (not `86400s` = elapsed time) | `stdlib/gregorian.md` §1 · ADR-11/12 |
| WKST | Where the week starts (the week window's cut; the origin of "week N"). A culture-dependent premise member | §3.3 · `stdlib/gregorian.md` §4 |
| asof | The temporal version that fixes the calendar version. Defaults to the evaluation instant when omitted | table §3.3 |
| source（出所） | The authority of the data (official / organization-local). A premise alongside asof | table §3.3 |
| name resolution (premise-relative)（名前解決（premise 相対）） | Names resolve under the in-scope premises. When ambiguous, qualify as `Gregorian.month` | §3.4 |
| scope defaults (folding)（スコープ既定（畳み込み）） | Declare `axis:`/`roll:` once in the preamble and omitted stages inherit them. Innermost wins (default → evaluation context → block → stage) | §3.3 |
| Mechanism A（機構 A） | Name resolution in derivations = bare names re-resolve in the derived scope (dependent words follow automatically); `Base.word` pins to the base value | §3.7 |

## 6.3 Calendar systems and windows (the premise layer's window-generating words)

| Term | Definition | References |
|---|---|---|
| window（窓） | A sub-stream bundled by period. Two kinds: partition-type and interval-sequence-type | §2.6 (I5) · §4.2 |
| partition-type window（パーティション型窓） | A window that partitions the axis without remainder. Exhaustiveness and non-overlap are checkable (I5) | §4.2 |
| interval-sequence window（区間列型窓） | A window cut by markers. Exhaustiveness is not guaranteed; the gap policy is made explicit | §4.2 |
| window-generating words（窓生成語） | The words with which a primitive definition carves the base into windows. `grid`/`span`/`split`/`cycle` | §3.6 |
| `chronos` (bare name)（裸名） | The lexical name referring to the continuous base Chronos (`day = chronos grid 1d`). Only `grid` accepts it. A separate concept from the operation axis `axis:` (ADR-29) | §3.6 · §1.3 |
| `grid(w)` | Uniformly divides the continuous axis at width `w` (the atoms of a calendar). Example: `day = chronos grid 1d`. The phase is the default alignment (civil-time widths = the opening instant of each civil day 〈tz midnight on ordinary days〉; elapsed-time widths = the epoch), overridable with `anchor:` (ADR-31) | §3.6 |
| epoch (`epoch:`)（紀元） | The origin for span window ordinals and `epochOrdinal`. Language default 1970-01-01T00:00 (in the in-scope tz = **a different point on chronos for a different tz**; ADR-33); overridable via the primitive definition's member `epoch:` (cannot be placed in the preamble). Ordinals are 0-based; before the epoch they are negative | §3.6 · ADR-31 |
| `span(f)` | Bundles finer units a variable/constant number at a time (bottom-up aggregation). `f = n => count` | §3.6 |
| `split(g) by: u` | Divides a parent window at variable widths in unit `u` (top-down). Used for dependent windows | §3.6 |
| `cycle(labels) anchor:` | Attaches repeating labels to a partition window. Labels, not windows. Period length and target are arbitrary (`year cycle` is fine). `anchor:`: the target window it falls in carries the head label. The binding name reads as a point → label value function | §3.6 · `stdlib/gregorian.md` §4 · ADR-27 |
| `week` window（`week` 窓） | The 7-day tiled window at WKST phase. A Gregorian public word that lazily resolves `wkst:`. Partition-hood is certified by the I5 check | §3.6 · `stdlib/gregorian.md` §4.5 |
| table literal（テーブルリテラル） | Promotion of an instant list to a time-stream constant (`[2026-03-20, …]`). Ascending order required; source governance; validity range via `covering:`. `labels:` gives a parallel label sequence (the definition of a point → label projection). The empty form `[] covering: …` requires an explicit covering (the primary form of "zero points but a coverage to claim"; ADR-45) | §3.8 · ADR-26/30/45 |
| `external` | The external-supply declaration = a table literal resolved at run time. Restricted to the right-hand side (head position) of a premise binding. `kind:` = the alignment claim (`dates`/`instants`; holds as declared even when empty); `labels:` = the enumeration of the label range; covering/asof are always carried by the resolved value (the supply contract). Resolution is an adjunct of the evaluation context (one resolution per evaluation, demand-driven); failure is a supply error (machine-readable subcategories) | §3.8 · ADR-46 |
| public word（公開語） | A top-level binding in a premise block. Referenced with `.` (`Gregorian.month`) | §3.6 |
| public boundary word（公開境界語） | A public word that derives boundaries by reusing selectors (`monthEnd = month \|> last`). What generators really are | §3.6 |
| `with` | The core of derivation. Overrides/adds the base's public words (`Fiscal = Gregorian with {…}`) | §3.7 |
| `shiftBoundary` **（仮称）** (placeholder) | Derivation sugar that shifts window `W`'s cuts by δ in unit `U`. Expands into a `span` phase shift | §3.7 |
| phase（位相） | The phase origin of `span`/`split` (a fiscal calendar's April start, etc.) | §3.7 |

## 6.4 The body layer's operator families

| Term | Definition | References |
|---|---|---|
| generator（生成子） | `() → stream`. Calendar-system-pure and calendar-independent (`everyDay`, `everyInstant`, public boundary words, table literals) | §4.2 · I8 |
| window `within(w)`（窓） | Partition-type windowing. `w` is a window name (month/week/…) | §4.2 |
| window `segmentBy(m, edges:, empties:)`（窓） | Interval-sequence windowing. Gap policy required | §4.2 |
| selectors `first`/`nth(n)`/`last`（選択子） | Pick the Nth / the last within a window. Default is the innermost window; make it explicit with `of:`. Window-relative | §4.3 · I4 |
| point transform `roll(conv, on:)`（点変換） | Moves invalid points to valid ones by conv. `on:` is an axis name or a derived stream | §4.4 |
| point transform `shift(n, unit:)`（点変換） | Moves by n (signed) in units of U. Direction is expressed by the sign | §4.4 |
| point transform `snapTo(w)`（点変換） | Maps each point to the head point of the `w` window containing it (floor; aligns granularity seams) = reconciliation by **chronos membership** | §4.4 · ADR-27/30 |
| point transform `rebase(to:)`（点変換） | Preserves the date label and maps to the head of the same date's civil day in the `to` tz = reconciliation by **label correspondence** (cross-tz "same date" composition = F69). Input restricted to the default-aligned day grid; nonexistent dates are explicit errors | §4.4 · ADR-40 |
| projection `ordinalIn(u, w, d)`（射影） | Within the `w` window containing point `d`, the ordinal of the `u` window containing `d` (1-based; granularity-independent). The reverse of `nth` | §4.9 · ADR-27/30 |
| projection `epochOrdinal(u, d)`（射影） | The running ordinal of `u` windows from the epoch (0-based; the epoch is the language default 1970-01-01, overridable with `epoch:`) | §4.9 · ADR-27/30/31 |
| label projection (binding name)（ラベル射影（束縛名）） | The binding name of a labeled window/cycle/table doubles as the projection name (`weekday(d)`, `sekki(d)`). Points store no labels; labels are read via projections (the generic word `labelOf` was retired; ADR-30) | §4.9 · §3.6 |
| window instance reference `W(v)`（窓インスタンス参照） | **Value** application to a label-sourced **window** binding = the preimage (`year(2020)` = the days of that year; returned as a time stream). Union of all matches; empty is legitimate; outside a statically enumerable label range is a static error. The dual of bound-name projection; point vs. value branches on the argument expression's type (decided after expansion = §2.7) | §4.9 · §2.7 · ADR-42 |
| element point sequence（要素点列） | Of the **input point sequence** that window binding W's definition bundled into windows, the points belonging to W's windows (grid/span/split chains = equivalent to the atomic grid ticks; segmentBy = the input points). The carrier of window instance references. An internal concept (not a word users write) | §4.9 · ADR-42 |
| combinator（結合子） | Stream × stream → stream. Union `\|`, intersection `&`, difference `\`. Intersection and difference require matching alignment on both sides | §4.5 |
| cascade（カスケード） | Prioritized overriding. Has no dedicated symbol; expressed by left-associative ordered application of union and difference (last wins) | §4.5 |
| alignment（整列） | The static property of a stream: "every point lies on the ticks of an atomic grid G = (width, normalized phase, tz name)". `&`/`\`/axis membership require the same G (mismatch is a static error); `snapTo` is the explicit re-alignment. Not a type (ADR-05/36). The value is a G, "none", or **vacuous conformance** (an empty table conforms vacuously to every alignment; it passes the check and combinations inherit the partner's. ADR-45) | §4.5 |
| filter `filter`（フィルタ） | Thins by predicate. Takes both premise predicates (`on:`) and value-expression predicates (lambdas) | §4.6 |
| stride `stride(n, from:)`（ストライド） | Thins the **input points** to "every nth" (input-relative; no axis argument — what gets counted is decided by the preceding stage = ADR-38). n is an integer ≥ 1. Consumes no windows; ignores boundaries; continuous. Origin `from:` required (the first input point at or after `from:` is step 0) | §4.7 · ADR-31/38 |
| stride `strideBy(w, from:)`（ストライド） | Steps by width (a physical magnitude across multiple axes; e.g. 1 sol). Origin `from:` required | §4.7 · ADR-31 |
| window-membership predicate `coincides(S, w, d)`（窓所属述語） | Whether the `w` window containing point `d` holds a point of S (boolean = bounded existential quantification). Interval membership, so alignment is not required (only the tz name is checked); settled by the witness rule (true = a point in a non-annotated interval; false = the window lies within the effective coverage). The receiving vessel for F68 | §4.9 · ADR-38 |
| sugar definition (base form B)（糖衣定義（基底 B）） | `name(args) = s => s \|> core-chain`. Binds the preceding stage with `s =>` | §4.8 |
| sugar definition (shorthand A)（糖衣定義（略記 A）） | When the preceding stage is straightforward, omit `s =>` — point-free (eta reduction) | §4.8 |

## 6.5 Symbols, prefixes, and named arguments

| Symbol | Meaning | References |
|---|---|---|
| `\|>` | Stage connection (body layer stream→stream / premise layer premise→premise) | §2.5 |
| `.` | premise qualification (`Gregorian.month`) | §2.5 |
| `\|` `&` `\` | Combinators: union, intersection, difference (`\` = U+005C, not the yen sign ¥) | §4.5 |
| `=` / `==` | Binding (definition) / equality comparison | §3.5 |
| `=>` | Lambda binding (distinct from the type notation `->`) | §3.5 |
| `+ - * /` `mod` `div` | Arithmetic (`mod` and `div` are words) | §3.5 |
| `[…]` / `l[i]` / `in` | List literal, indexing (0-based), membership predicate | §3.5 |
| `a..b` | Date range (sugar expanding to consecutive days) | §3.8 |
| `"…"` | String literal (values for TZ and source; no newlines, no escapes) | §5.5 · ADR-32 |
| `and` `or` `not` | Logic (words; the symbols are reserved for the combinators) | §3.5 |
| `? :` | Ternary conditional | §3.5 |
| `@name`（`@名前`） | Lightweight reference to a premise bundle | §3.2 |
| `on:` / `unit:` | Names the axis a stage counts in (roll/filter / shift; stride is input-relative = takes no axis; ADR-38) | §3.3 |
| `of:` | Makes a selector's target window explicit | §4.3 |
| `by:` | The unit of `split`'s widths | §3.6 |
| `axis:` | The axis default in the preamble (folding; settled by ADR-29) | §3.3 |
| `phase:` | The phase origin of `span`/`split` | §3.7 |
| `anchor:` | `cycle`'s label phase (which actual day carries the head label) | §3.6 |
| `from:` | The origin for the stride family (stride/strideBy). Always required (supply from windows was retired by ADR-31) | §4.7 |
| `edges:` / `empties:` | `segmentBy`'s gap policy | §4.2 |
| `roll:` | The roll-convention default in the preamble (folding; being explicit is recommended) | §3.3 |
| `covering:` | The validity range = the two-sided claim "complete inside, unknown outside". Does not touch the values (inclusion of every element is statically checked). Open-ended `2021..`/`..` (completeness claim, with governance), interval lists, and binding-postfix (coverage claim) are allowed. **Omission = the sequence's ends (narrowest) and `..` = complete everywhere (widest) are polar opposites** (an empty table has no ends, so omission is impossible = explicit covering required. ADR-45) | §3.8 · §4.10 · ADR-26/37/45 |
| `label:` | The label-assignment expression at window-generation time. The lambda receives the window's **head point**, and `name(d)` ≡ assignment-expression(head point) (at projection time, lazily evaluated). Window and projection references on the representative point are allowed; adjacent windows and self-reference are not | §4.9 · ADR-30/34 |
| `labels:` | The parallel label sequence (the projection's defining data). For tables = point labels (same length as the instant list; ADR-30) / for segmentBy window sequences = window labels (same length as the coverage-based window count, aligned by window-sequence ordinal; ADR-39 = the vessel for F62) | §3.8 · §4.2 · ADR-30/39 |

## 6.6 Roll conventions and enumeration values

| Term | Definition | References |
|---|---|---|
| Following / Preceding | Move an invalid point to the next / previous valid point | §4.4 |
| Modified | Takes a superordinate window as an argument and moves while staying within that window | §4.4 |
| Mon…Sun | Enumeration values for weekday labels (value type). Used in cycle's cyclic list | §3.6 |

## 6.7 Invariants I1–I8

| No. | One-liner | References |
|---|---|---|
| I1 | Fixed base (every element is a point on the single base Chronos) | §2.6 |
| I2 | Closure (every operator is `(stream…, premise) → stream`) | §2.6 |
| I3 | Explicit resolution (roll conventions and anchor resolution as mandatory arguments; silent bugs made syntactically impossible) | §2.6 |
| I4 | Window-relative (selectors are relative to a containing window; no window is a type error) | §2.6 |
| I5 | Exhaustiveness verification (partition-type is checkable for exhaustiveness and non-overlap; interval-sequence-type makes gaps explicit) | §2.6 |
| I6 | Context flow (TZ, WKST, asof, and out-of-coverage provenance 〈interval annotations〉 flow as evaluation context / annotations) | §2.6 · §4.10 |
| I7 | Pure and lazy (defined online over infinite streams) | §2.6 |
| I8 | Generator purity (generators depend only on the calendar system, never on calendars) | §2.6 |
