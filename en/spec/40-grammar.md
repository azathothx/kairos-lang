---
source_sha: 8ec68284f1af
---

# Kairos Language Specification — 5. Grammar and Symbols

> Translated from the canonical Japanese chapter [spec/40-grammar.md](../../spec/40-grammar.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

## 5.1 Symbol table

| Symbol | Layer / role | Meaning |
|---|---|---|
| `\|>` | Both layers | Stage piping (body layer: stream → stream / premise layer: premise → premise) |
| `.` | Both layers | Premise qualification (`Gregorian.month`) |
| `\|` | Both layers | Combinator: union |
| `&` | Both layers | Combinator: intersection |
| `\` | Both layers | Combinator: difference (U+005C — not the yen sign ¥) |
| `=` | Both layers | Binding (definition) |
| `==` `!=` `<` `<=` `>` `>=` | Value expr. | Comparison |
| `+ - * /` `mod` `div` | Value expr. | Arithmetic (`mod` = remainder and `div` = integer division are words) |
| `and` `or` `not` | Value expr. | Logic (words; symbols are reserved for the combinators) |
| `? :` | Value expr. | Ternary conditional |
| `in` | Value expr. | List-membership predicate |
| `[…]` / `l[i]` | Value expr. | List literal / indexing (0-based). A list of instant elements is a time-stream constant (§3.8) |
| `"…"` | Value expr. | String literal (no newlines, no escapes; the values of TZs and provenance. ADR-32) |
| `..` | Value expr. | Date range (sugar expanding to consecutive days) |
| `=>` | Both layers | Lambda binding (distinct from the type notation `->`) |
| `@name` | Preamble | Lightweight reference to a premise bundle |
| `#` | Both layers | Line comment |

## 5.2 Signatures of the body-layer core family

- `everyDay : () -> Stream` / `everyInstant : () -> Stream` — calendar-system-pure generators (the
  latter is every point of the continuous base).
- `within(w) : Stream -> Stream(partitioned)` — partition-type window. `w` is a window name.
  Coverage and non-overlap are checkable under I5.
- `segmentBy(m, edges:, empties:) : Stream -> Stream(interval)` — interval-sequence-type window.
  The gap policy (`edges:`/`empties:`) is mandatory (I5). An element's membership is decided by its
  representative point (for a window element, the first point) (§3.8, ADR-26).
- `first / nth(n) / last : Stream(windowed) -> Stream` — in-window selection. The default is the
  innermost window; `of: w` names the target window explicitly. Window-relative (I4).
- `filter(on: P) : Stream -> Stream` / `filter(x => condition) : Stream -> Stream` — thins by a
  premise predicate or a value-expression predicate.
- `roll(conv, on: P) : Stream -> Stream` — moves invalid points onto valid ones by conv
  (Following/Preceding/Modified…). `on:` is an axis name or a derived stream.
- `shift(n, unit: U) : Stream -> Stream` — moves by n (signed) in units of U. Direction is carried
  by the sign.
- `snapTo(w) : Stream -> Stream` — maps each point to the first point of the `w` window containing
  it (floor; §4.4).
- Projections (inside value expressions): `ordinalIn(u, w, d) : point -> number` (two-window,
  granularity-independent) / `epochOrdinal(u, d) : point -> number`. Labels are read through bound
  names (`weekday(d)` and the like; the generic word `labelOf` is abolished — points store no
  labels. §4.9, ADR-27/30).
- Combinators: `A \| B` union / `A & B` intersection / `A \ B` difference. Prioritized overriding
  is expressed by left-associative, order-sensitive application of union and difference (no
  dedicated symbol).
- Strides (a family separate from the selectors): `stride(n, from:)` input counting (every n
  **input points**; no axis argument; n is an integer ≥ 1 = ADR-38) / `strideBy(w, from:)` width
  stepping (a physical quantity over multiple axes). The origin `from:` is mandatory (ADR-31; the
  counting origin is the first input point at or after `from:`); no reset is defaulted.
- Window-membership predicate (projection family; §4.9): `coincides(S, w, d)` = whether a point of
  S lies in the w window containing point d (a boolean; witness rule and tz-name check = ADR-38).

## 5.3 Signatures of the premise layer

**Window-generating words of primitive definitions** (names final; §5.4):

- `grid(w) : Chronos -> Stream(partitioned)` — partitions the continuous axis uniformly at width
  `w` (the atom of a calendar). Phase is the default alignment (civil-time width = the starting
  instant of each civil day — tz midnight on ordinary days; elapsed-time width = the epoch),
  overridden with `anchor:` (ADR-31).
- `span(n => count) : Stream -> Stream(partitioned)` — bundles finer units (bottom-up). `n` is the
  ordinal of the window being generated (epoch-origin, 0-based; the epoch is the language default
  1970-01-01, overridable with the member `epoch:` = ADR-31). Phase via `phase:`.
- `split(y => [widths…]) by: u : Stream(windowed) -> Stream(partitioned)` — divides the parent
  window at variable widths in unit `u` (top-down). The widths sum to the parent (I5).
- `cycle(labels) anchor: r : Stream -> Stream(labeled)` — parallel repeating labels; produces
  labels, not windows. Cycle length and application target are free; `anchor:` makes the target
  window containing it carry the first label. The bound name reads as a point → label value
  function (ADR-27).
- Public words are the top-level bindings of a premise block (`Gregorian.month`). Boundaries are
  selector reuse (`monthStart = month |> first`).
- **Table literals** (§3.8, ADR-26): a list of instants is a time-stream constant. `covering:`
  states the valid range; `labels:` a parallel label sequence (defining the point → label
  projection. ADR-30). The empty list `[]` is promoted only with a `covering:` postfix (ADR-45).
- **`external(kind: dates | instants [, labels: [domain]] [, source: "…"]) : → Stream`** (§3.8,
  ADR-46): external-supply declaration = a table literal resolved at run time. Restricted to the
  right-hand side (head position) of a premise binding; the resolved value receives the same
  governance checks as a literal (the supply contract).
- The right-hand side of a premise binding may also be a body-layer stream expression (layer
  crossing; the definition of `week` is an example. §3.6).

**Derived definitions**:

- `Base with { w = … } : premise -> premise` — overrides/extends the base's public words. Bare
  names re-resolve in the derived scope; `Base.w` pins to the base value (mechanism A). Inherited
  words automatically track the overridden words they depend on.
- `\|> shiftBoundary(δ, on: W, unit: U) : premise -> premise` (placeholder name) — sugar that
  shifts the boundaries of window `W` by δ in unit `U`. The expansion is
  `W = U span (_ => k) phase: (φ₀+δ) mod k` (`k` = the count of `W ⊃ U`; `φ₀` = the base's phase;
  negative δ is also normalized by the modulus = F65). The base's `label:` is preserved.
  Variable-`k` pairs are out of scope. Dates do not move.

**Sugar definitions** (no dedicated syntax = the existing `=` binding):

- `name(params) = s => s |> core-chain` (base form B) / the point-free shorthand that omits `s =>`
  when the leading stage is plain (form A; eta reduction).
- No declaration marker (sugar-hood is detected automatically by dependency analysis; redefining a
  core word is a static error). Premises are not baked in — resolution is deferred. Expansion =
  mechanical insertion of the right-hand side (one-way, into core).

## 5.4 Naming status

**Final** (2026-07-07, as of RC2, plus ADR-31/32): the window-generating words
`grid`/`span`/`split`/`cycle`; the arguments `anchor:`/`phase:`/`by:`/`from:` (mandatory in the
stride family); the member `epoch:` (epoch); the string literal `"…"`; derivation's `with` (all
RC1 — no cracks in the 40-examples expressiveness verification). The base's lexical name
**`chronos`** (`day = chronos grid 1d`; the type name is likewise `Chronos`) and the operation
axis's **`axis:`** — the ambiguity between the two was dissolved in ADR-29, and both were
confirmed as final names. The projection family's **`ordinalIn`/`epochOrdinal`/`snapTo`** and the
attachment/data-side **`label:`/`labels:`/`covering:`** — confirmed at RC2, since the
internal-design confirmation (ADR-30) and the crack hunting (`40-examples/04-projections.md`,
F34–F42) surfaced no cracks in the names. The body layer's symbols and operator names (`|>`,
`within`, `segmentBy`, `roll`, `shift`, `stride`, `strideBy`, `filter`, the selectors, the
combinators) are final as well. The lexis of date and width literals was fixed in ADR-28 (§5.5).

**Final (2026-07-14, ADR-46 = designer ruling)**: the external-supply declaration **`external`**
(the rival candidate `socket` was rejected because it would be the same spelling with a different
sense as the "socket" metaphor of ADR-15 in the English-language documents) and the kind values
**`dates`/`instants`** (consistent in feel with `everyInstant` and the date literal; a sweep
confirmed no collisions with existing identifiers).

**Final (2026-07-09, the F51 batch confirmation = designer ruling)**: `nonWorking` (the reserved
public word for entities; §3.9), `coincides` (the window-membership predicate; §4.9 — the rival
candidates `hits`/`anyIn`/`sharesWindow` were rejected), `rebase` (re-anchoring; §4.4 — the rival
candidates `relabel`/`sameDate` were rejected), and `bizOpen`/`bizClose`/`isOpen` (the standard
derivations; §3.9.1) are **confirmed as final names unchanged**. The business-hours supply pair is
**renamed and finalized as `sessionOpens`/`sessionCloses`** (formerly the placeholders `opens`/`closes`
— ordinary English words with a wide collision surface against accidental
same-name bindings; ADR-41 revised). All have seen live use (16–35 files) with no cracks in the
names.

**Still placeholder** (words with remaining crack or ambiguity concerns):

- `shiftBoundary` — coupled to the out-of-scope problem of variable-`k` pairs (§3.7). Deferred to
  1.0 to keep room to rethink naming symmetry should a separate operator be introduced (left as is
  even in the 2026-07-09 batch confirmation — `shiftBoundary` is the sole remaining placeholder).

## 5.5 Lexis (ADR-28)

- **Date literals**: `YYYY-MM-DD` (day) and `YYYY-MM-DDThh:mm(:ss(.f+)?)?` (with time of day).
  **They carry no TZ specifier** — the anchor is struck by the in-scope premise's `tz:` (I6). That
  the same literal denotes different points on the base under different premises is by design.
  **Out-of-range date parts are lexical errors** (ADR-43 = F66 (a)): months are 01..12, and days
  only those that exist under the month and leap-year rules (proleptic Gregorian,
  premise-independent) — `2026-02-30` is rejected at the lexical layer (no silent rollover). The
  time part's digit ranges are `hh` = 00..23 and `mm`/`ss` = 00..59 (**`23:59:60` is a lexical
  error** = leap seconds are out of scope. ADR-33). A timed literal that falls into a DST gap or
  overlap of the in-scope tz is an error (the "exists and is unique" requirement. ADR-33 —
  relative to tz data, hence not necessarily static).
- **String literals**: from `"` to the next `"` (no newlines inside; no escape sequences = strings
  containing quotes are a future extension. ADR-32). Used as the member values of `tz:` and
  `source:`. The value domain of `tz:` is IANA tzdb region identifiers, fixed-offset notation, and
  `"UTC"` (ADR-33). **Fixed-offset notation admits only the strict canonical form** (ADR-43 =
  F66 (b)): `"±HH:MM"` (zero-padding mandatory; HH = 00..14, MM = 00..59). The likes of `"+9:00"`,
  `"+0900"`, `"Z"`, and `"UTC+9"` are lexical errors (the uniqueness that lets tz-name equality be
  literal-spelling equality — ADR-36).
- **Width literals**: a `number + unit` sequence. `d` = civil day (a conventional width);
  `h`/`m`/`s` = elapsed time. Compounds (`24h39m35.244s`) exist within elapsed time only. Mixing
  civil time and elapsed time (`1d12h`) is a static error (a width straddling the convention sets
  of ADR-12 is undefined).
- **Numbers**: integers and decimals. **Identifiers and enumeration labels**: Unicode letters are
  allowed (kanji labels such as `甲` and `子` are fine). The reserved symbols
  (`|> . | & \ = => < > [ ] ( ) { } : , ? @ #`) and whitespace cannot appear in identifiers.
- **Comments**: from `#` to the end of the line.
- **Statement separation and continuation** (ADR-44): statements (bindings, premise members, body
  expressions) are separated by newlines — except that (1) a newline while parentheses or brackets
  remain open, and (2) a line ending or beginning with the stage connection `|>` or a combinator `|`,
  `&`, `\`, continue the previous line (unambiguous, since a statement cannot begin with a
  combinator). There is no continuation symbol.

## 5.6 Grammar (EBNF)

The structure is final; some words are placeholder names (§5.4). The EBNF, too, writes placeholder
words under those names. Sugar (the `a..b` range, the point-free shorthand) disappears into core
on expansion.

```ebnf
(* ---- Program ---- *)
program        = { statement } ;
statement      = premise-def | preamble | binding | stream-expr ;

(* ---- Premise layer ---- *)
premise-def    = "premise" , name , ( premise-block | "=" , premise-expr ) ;
premise-expr   = name , [ "with" , premise-block ] , { "|>" , stage } ;
premise-block  = "{" , { member | binding } , "}" ;
member         = member-key , ":" , value-expr ;
member-key     = "calendar-system" | "calendar" | "axis" | "roll" | "granularity"
               | "tz" | "wkst" | "asof" | "source" | "epoch" ;
                 (* epoch is exclusive to primitive-definition blocks
                    (not allowed in user-side preambles. ADR-31) *)

(* Preamble (independent statement; governs what follows until the next preamble. §3.2) *)
preamble       = ( "@" , name , { member } )            (* lightweight form + postfix folding *)
               | ( "premise" , premise-block )          (* full inline form *)
               | ( "@" , name , "{" , { statement } , "}" ) ;   (* block form (explicit extent) *)

(* ---- Bindings (public words, sugar, and value functions share one mechanism) ---- *)
binding        = name , [ "(" , params , ")" ] , "=" , rhs ,
                 [ "covering" , ":" , covering-list ] ;  (* postfix on a binding = explicit coverage
                                                            claim for a composition (ADR-37 decision 5).
                                                            When the rhs is a bare table literal, read
                                                            as a table attribute (the canonical parse.
                                                            ADR-45) *)
params         = param , { "," , param } ;
param          = name | named-param ;
named-param    = param-key , ":" , name ;
rhs            = lambda | stream-expr | gen-expr | value-expr ;

(* ---- Body layer ---- *)
stream-expr    = pipe-expr , { combine-op , pipe-expr } ;     (* one precedence level, left-assoc. *)
combine-op     = "|" | "&" | "\" ;
pipe-expr      = stream-atom , { "|>" , stage } ;
stream-atom    = table-literal | ( name | qualified ) , [ "(" , args , ")" ] | "(" , stream-expr , ")" ;
                 (* qualified application = head-position application of a qualification pin
                    (Gregorian.year(2020). ADR-42) *)
stage          = ( name | qualified ) , [ "(" , args , ")" ] ;
qualified      = name , "." , name ;
args           = arg , { "," , arg } ;
arg            = named-arg | lambda | stream-expr | value-expr ;
named-arg      = param-key , ":" , ( lambda | stream-expr | value-expr ) ;
param-key      = "on" | "unit" | "of" | "from" | "edges" | "empties"
               | "by" | "anchor" | "phase" | "covering" | "label" | "labels"
               | "kind" | "source" ;                     (* kind:/source: are external's (ADR-46) *)

(* ---- Premise-layer window generation (infix) ---- *)
gen-expr       = operand , gen-word , gen-arg , { named-arg } ;
operand        = name ;                                  (* chronos, day, month, year, etc. *)
gen-word       = "grid" | "span" | "split" | "cycle" ;
gen-arg        = width-literal | lambda | list-literal | name | "(" , lambda , ")" ;

(* ---- Value expressions ---- *)
value-expr     = ternary ;
ternary        = or-expr , [ "?" , value-expr , ":" , value-expr ] ;
or-expr        = and-expr , { "or" , and-expr } ;
and-expr       = unary-not , { "and" , unary-not } ;
unary-not      = [ "not" ] , comparison ;                (* the function form not(x) is also allowed *)
comparison     = additive , [ comp-op , additive ] ;
comp-op        = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" ;
additive       = multiplicative , { ( "+" | "-" ) , multiplicative } ;
multiplicative = unary , { ( "*" | "/" | "mod" | "div" ) , unary } ;
unary          = [ "-" ] , postfix ;
postfix        = atom , { "[" , value-expr , "]" | "(" , args , ")" } ;
atom           = number | date-literal | width-literal | string-literal | name | qualified
               | list-literal | "(" , value-expr , ")" ;
lambda         = ( name | "_" | "(" , params , ")" ) , "=>" , ( value-expr | stream-expr ) ;

(* ---- Lists and tables ---- *)
list-literal   = "[" , [ list-elem , { "," , list-elem } ] , "]" ;
list-elem      = value-expr | date-range ;
date-range     = date-literal , ".." , date-literal ;    (* sugar expanded into consecutive days *)
table-literal  = list-literal , [ "covering" , ":" , covering-list ] ,
                 [ "labels" , ":" , list-literal ] ;     (* a stream constant when the elements are
                                                            instants (§3.8). Zero elements are a stream
                                                            constant only with a covering: postfix (the
                                                            empty table. ADR-45). labels: is a parallel
                                                            label sequence (ADR-30) *)
covering-list  = covering-range , { "," , covering-range } ;
                 (* interval list = declaring interior gaps (ADR-37) *)
covering-range = [ covering-edge ] , ".." , [ covering-edge ] ; (* omitted edge = open end (completeness
                                                                   claim). Bare ".." = complete everywhere.
                                                                   ADR-37 decision 9 *)
covering-edge  = date-literal | digit4 ;                 (* year-only shorthand allowed *)

(* ---- Lexis (§5.5) ---- *)
date-literal   = digit4 , "-" , digit2 , "-" , digit2 ,
                 [ "T" , digit2 , ":" , digit2 , [ ":" , digit2 , [ "." , digits ] ] ] ;
width-literal  = civil-width | elapsed-width ;
civil-width    = digits , "d" ;
elapsed-width  = [ digits , "h" ] , [ digits , "m" ] , [ digits , [ "." , digits ] , "s" ] ;
number         = digits , [ "." , digits ] ;
string-literal = '"' , { ? any character except " and newline ? } , '"' ;   (* no escapes. ADR-32 *)
name           = letter , { letter | digit } ;           (* letter = any Unicode letter (kanji allowed) *)
comment        = "#" , { ? any character up to end of line ? } ;
```

Note: enumeration labels (`Mon`, `甲`, `Following`) are lexically identical to `name` and are
distinguished by semantics (resolution against the in-scope premise). `table-literal` and
`list-literal` share one syntax, and the type is decided by the elements (ADR-26. **Zero elements
are decided by the presence of `covering:`** — with covering = an empty table, without = an empty
value list. ADR-45). The label sequence of `labels:` has the same length as the instant sequence
(a semantic check. ADR-30; for the empty table only `labels: []` is legal). Operator precedence is
defined exactly by the nesting of the production rules above (the combinators share one precedence
level and are left-associative; a check imposes the convention that mixing `&` requires
parentheses. §4.5). A preamble is grammatically an independent statement, and bindings and body
expressions may be listed under it (the holiday cascade of §7.5 is an example). Its effect lasts
until the next preamble (§3.2) — a scoping rule, not grammar. A body expression that reaches
evaluation with a dangerous member unresolved is a static error (§3.3 — likewise a governance
check, not grammar).

## 5.7 Open questions

The **canonical record of open questions and homework is `../../design/90-open-questions.md`**
(syntax-level details in `../../design/30-syntax/00-syntax-draft.md` §4). Within the scope of this
specification, `shiftBoundary` (the name, plus a separate operator for the out-of-scope
variable-`k` pairs) and anonymous-window labeling for `of:` remain open (the external-supply
declaration is **final as `external`** = ADR-46, §3.8). Neither changes the semantics (pure naming
or additive extension; the DoD classification is at the head of
`../../design/90-open-questions.md`).
