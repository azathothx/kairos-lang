---
source_sha: 3a9a17fb6028
---

# Sugar definitions — naming transformations, and templates (placeholders)

> Translated from the canonical Japanese page
> [reference/sugar-definition.md](../../reference/sugar-definition.md).
> The `source_sha` above records the source revision; a consistency check flags this page when the
> Japanese original changes.

**Category**: a form of binding (§4.8; no dedicated syntax) / **Shapes**:
<code>name(args) = s => s &#124;> core-chain</code> (base form B) ·
<code>name = stage &#124;> stage</code> (shorthand A)

## Meaning

The mechanism for **naming a stream-to-stream transformation and reusing it**. There is no
dedicated syntax: an ordinary `=` binding becomes a sugar definition by the shape of its
right-hand side (sugar-hood is detected automatically by dependency analysis; redefining a core
word and circular definitions are static errors. §4.8). Expansion is mechanical insertion of the
right-hand side (one-way, into core), and **expansion is finite** — which is why recursion cannot
be written.

Arguments may be streams or values. A sugar definition therefore works as a placeholder for
**feeding streams and values into an already-written expression** — write a template like the
"payday on day `n`" schedule once, and let the caller fill the holes:

```kairos
# eval: 2026-07-01..2026-11-01
@JP
paydayOf(n) = s => s |> within(month) |> nth(n) |> roll(Preceding, on: bizDay)
everyDay |> paydayOf(25)
#=> 2026-07-24 2026-08-25 2026-09-25 2026-10-23
```

July's 25th is a Saturday, so it retreats to the previous business day 7/24 — the **shape of the
definition** ("day `n` of every month, previous business day on holidays") gets a name, and `25`
is the caller's hole-filling.

## Two ways to use one — pipe stage and application

A base-form (lambda) sugar can be used **both as a pipe stage and as a function application**.
The two notations of the same transformation agree extensionally:

```kairos
# eval: 2026-01-01..2026-04-01
@JP
monthFirstBiz = s => s |> within(month) |> first
monthFirstBiz(bizDay) | (bizDay |> monthFirstBiz)
#=> 2026-01-02 2026-02-02 2026-03-02
```

(2026-01-01 is a holiday, so the first business day of January is 1/2. The union
<code>&#124;</code> collapsing to a single sequence is the measured agreement of the two
notations.)

When the leading stage is plain, the `s =>` can be dropped — the **point-free shorthand**
(shorthand A; eta reduction):

```kairos
# eval: 2026-01-01..2026-04-01
@JP
firstSunday = filter(d => weekday(d) == Sun) |> within(month) |> first
everyDay |> firstSunday
#=> 2026-01-04 2026-02-01 2026-03-01
```

## The three placeholder layers (what gets plugged in where)

| What is plugged in | Mechanism | When |
|---|---|---|
| Streams and values (arguments of an expression) | sugar definitions (this page) | **static** (when the definition is written) |
| Free names inside an expression (what `bizDay` means, etc.) | premise derivation [`with`](with.md) (the same expression text evaluated under another premise) | static |
| Data decided at run time (holiday tables, injected origins) | [`external`](external.md) (governed injection with a supply contract; ADR-46) | **dynamic** (at evaluation) |

## Pitfalls

- **Circularity is a static error** (§4.8 dependency analysis). Self-recursion `f = s => f(s)`,
  mutual recursion, and circular argumentless bindings `x = y` / `y = x` all raise a static error
  with the path (`f → g → f`). Sugar expansion is a finite insertion; a recursive definition is
  not sugar.
- **Shorthand A is pipe-stage-only.** `monthFirst = within(month) |> first` is used as
  `everyDay |> monthFirst` — the application form `monthFirst(everyDay)` cannot be written (the
  leading stage enters name resolution instead of transformation and fails as "unresolved name").
  If you want the application form too, write base form B (with `s =>`).
- **Redefining a core word is a static error** (`filter = …` etc. §4.8).
- **A coverage claim (binding-postfix covering:) attaches only to argumentless bindings** — it
  cannot be attached to a binding with arguments (a lambda value) (ADR-37).

## Related

[`with`](with.md) (swapping on the premise side) · [`external`](external.md) (dynamic injection) ·
[`filter`](filter.md) (value-expression predicates = the value-layer side of the same arrow
notation) · spec §4.8 (sugar definitions) · §3.5 (bindings) · F110 (how the circularity check
came to be).
