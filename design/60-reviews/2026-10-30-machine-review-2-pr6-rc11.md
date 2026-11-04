# 2026-10-30 機械レビュー（PR #6＝rc-1.1 の候補 fbda65f・2 回目・3 件）

> **出所**: 2026-10-30 の機械レビュー（2 回目）。所見は PR #6 に 1 件のコメントで投稿された（issuecomment-6513754035）。
> 対象＝PR #6 の head fbda65f（2026-10-29 の 1 回目の所見 15 件を処置した後・差分掃引 2,604 本で差 0 を確かめた後）。
> 所見の本文（英語）は投稿どおりに収め、当方の検証と処置を後ろに置く。3 件とも 1 回目の 15 件とは別の所見。

---

## 所見（投稿どおり）

### 1. `impl/src/eval.ts` L3541-3546（nit）

> strideBy's new cap (est > 2^27) is off by one, and the RangeError catch around the push loop was removed. The loop pushes ceil(est) points, so when est is in (2^27−1, 2^27] it pushes 2^27 points. By the comment's own account that is the length at which a V8 push throws RangeError, so a raw RangeError now escapes where the base turned it into a guided error. Counts just under the cap (about 1 GiB of doubles) can still run out of heap fatally on default Node heaps.

### 2. `impl/src/eval.ts` L2463（nit）

> labelOrdinal hand-codes its own named-argument and argument-count checks, duplicating the `positionalArity(e, name, n, sig)` helper this same diff adds for epochOrdinal/ordinalIn.

### 3. `impl/src/eval.ts` L2385-2389（pre_existing）

> The named check on the stdlib sugar words at/since/before (checkStdlibSugarArgs, plus the stdAt windowed-input flag) only runs on the bare-name call path in evalCall (`e.callee.t === 'name'` → lookupBinding). A qualified call such as `Gregorian.at(2026-10-01T09:00)(everyDay)` or `Gregorian.since(T14:00)(S)` goes through `evalExpr` case 'qualified' (line 1982), then evalDef, which returns a plain lambda (line 1275), then applyValue. That path never runs checkStdlibSugarArgs and never sets stdAt, so every guard the PR says now applies 'whatever form the premise takes' is skipped. Fix: tie the check to the stdlib decl's application rather than to the call-site name.

各所見の検証の文（reasoning）は PR #6 のコメントにある。

## 当方の検証（fbda65f をビルドして実走）

**所見 3＝再現した（正しさ）。** 範囲 2026-01-01〜01-05・`premise P = Gregorian with { tz: "Asia/Tokyo"; wkst: Mon }`。

| 式 | fbda65f の結果 |
|---|---|
| `at(2026-01-03T07:00)(everyDay)` | 誘導つきの静的エラー（正しい） |
| `Gregorian.at(2026-01-03T07:00)(everyDay)` | 01-03・01-04 の 07:00 だけ・exit 0（01-01・01-02 が黙って消える。1.0.12 も同じ） |
| `P.at(2026-01-03T07:00)(everyDay)` | 同上 |
| `Gregorian.at(T07:00)(everyDay \|> within(month))` | 窓を黙って落として exit 0 |
| `Gregorian.since(T14:00)(空の列)` | 0 点・exit 0（裸名の形は誘導つきで止まる） |
| `Gregorian.before(3)(空の列)` | 0 点・exit 0 |

空でない列に `Gregorian.before(T14:00)` を当てる形は、順序比較の検査（ADR-55）で止まっていた。

**所見 2＝本物（軽微）。** 同じ規則が 2 か所にあり、文言も違っていた。

**所見 1＝反証。** V8 の push は 2^27 個まで通り、RangeError は 2^27+1 個目で起きる（Node 24.16・packed double で実測＝長さ 134,217,728 の配列への次の push で `Invalid array length`）。
上限 `est > 2^27` を通った個数（ceil(est) ≤ 2^27）では投げない。1 回目の所見 15 の測定とも一致。
上限付近のヒープ枯渇（2^27 点で RSS 2.9 GB・この機械の既定ヒープは 4.3 GB）は 1.0.12 からの既存で、90-open 3-19（範囲に応じた実体化）の論点。上限を下げると今は通る入力がエラーに変わるので、値は変えない。

## 処置（rc-1.1 ca58cc8・972→973 テスト）

| # | 処置 | witness |
|---|---|---|
| 1 | 反証（上記）。コードは変えない | — |
| 2 | `labelOrdinal` の引数個数の検査を `positionalArity` に（射影語 3 つで同じ規則・同じ文言）。label-ordinal.test の期待値 2 本を新しい文言に | 既存 |
| 3 | `evalDef` が stdlib の引数付き定義から作る関数値に出自（`std`＝語と decl）を付け、`applyValue` で `checkStdlibSugarArgs` を通す（`at` は返る変換に `stdAt` を付ける＝`evalCall` と同じ）。利用側の再定義（派生 `with` の上書き）は従来どおり検査の外。CHANGELOG 1.1 節・reference/at.md 日英（source_sha） | F157 |

F157 は上の表の 5 形が fbda65f のビルドで exit 0 になることを実測してから足し、`stdAt` の受け渡しを外す変異で赤になることも確かめた。
検査＝typecheck・973（JST／UTC）・check-test-count・doc-consistency・mcp 12・BANNED 0・Playground 指紋 `d9b1839737b2`（runbook）。push＝rc-1.1 は fast-forward（PR #6 head ca58cc8）・PR #6 に返信。
