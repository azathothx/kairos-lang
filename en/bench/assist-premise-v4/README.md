---
source_sha: a187a8b2e173
---

# AI-assist bench v4 — unstated premises

> Translated from the canonical Japanese page
> [bench/assist-premise-v4/README.md](../../../bench/assist-premise-v4/README.md). The problems are Japanese business
> requirements by design; the bench measures the Japanese-language AI assist.

A bench for an AI assistant that turns a plain-language requirement into a Kairos body: does it **declare the premises it
fills in**, rather than filling them in silently? This directory holds the 21 problems, the answers (one body per accepted
interpretation), the grading rules and a runner. The problems are deterministic and the answers are verified by the reference
implementation (`check.mjs`, no LLM).

## Provenance

- The problems were written by the Kairos language project (2026-11-02) and are published so that anyone building an AI
  assistant for Kairos can measure it with the same yardstick. The 21 problems were handed to one downstream user before
  publication, so for that user they are not blind.
- The language project also holds a **private set of 6 problems** of the same shape, given to no one, and measures them with
  the same declaration section and grading rules ([§Language-side measurement](#language-side-measurement)).
- Once published, the 21 problems may enter future training data. Read later measurements together with the private set.
- Every measurement is a single run. Do not read a single run as definitive.

## What is measured

- The prelude (Japanese business days, `Asia/Tokyo`, the 2026 holiday table) is fixed; the AI writes only the body and asks no
  questions (it returns one proposal).
- 17 problems leave one premise undecided (one of nine kinds; P-16 leaves two). Besides the body, the AI returns `assumptions`
  (the kind of each premise it filled in, with a one-sentence statement).
- Pass = the undecided premise is declared (declared) **and** the body's point sequence equals the answer of one accepted
  interpretation, character for character (matched).
- The 4 control problems (C-01 to C-04) require no declaration: pass = the answer matches. Declarations on controls do not
  affect the verdict; they are counted as "declared on control" (C-03 also accepts the declared reading that skips a holiday Monday).

The nine kinds: `tz`, `week`, `roll`, `holidays`, `fiscal`, `anchor`, `counting`, `asof`, `boundary` (defined in the
declaration section below).

## Problems

The evaluation range is used only for grading; the AI sees the requirement text alone.

| id | undecided premise | requirement (Japanese) | interpretations | range (half-open) |
|---|---|---|---|---|
| P-01 | roll | 毎月 31 日に請求書を送る。 | 2 | 2026-01-01..2026-07-01 |
| P-02 | holidays | 毎月 11 日に支払い。週末に当たるときは翌営業日。 | 2 | 2026-01-05..2026-09-01 |
| P-03 | tz | 毎週月曜 9 時にニューヨークのチームと定例。 | 2 | 2026-03-02..2026-03-23 (timed) |
| P-04 | week | 第 2 週の火曜日に委員会。 | 3 | 2026-01-01..2026-07-01 |
| P-05 | anchor | 隔週金曜に 1on1。 | 2 | 2026-01-01..2026-03-01 |
| P-06 | fiscal | 年度初めの営業日に目標設定の会議。 | 2 | 2026-01-01..2027-01-01 |
| P-07 | counting | 月末の 3 営業日前に経費精算の締め。 | 2 | 2026-01-05..2026-05-01 |
| P-08 | boundary | 日曜の夜 0 時に週次レポートを送る。 | 2 | 2026-01-05..2026-01-26 (timed) |
| P-09 | holidays | 連休明けの最初の営業日に全体朝会。 | 2 | 2026-04-20..2026-05-20 |
| P-10 | counting | 毎月 20 日の納品の 5 日前にリマインド。 | 4 | 2026-01-05..2026-03-01 |
| P-11 | asof | 今月の最終営業日に月報を出す。 | 2 | 2026-01-05..2026-04-01 |
| P-12 | holidays | 毎週火曜と金曜にゴミ出し。年末年始は休み。 | 2 | 2026-12-14..2027-01-01 |
| P-13 | roll or holidays | 毎週の週初めに週次ミーティング。 | 2 | 2026-01-05..2026-03-02 |
| P-14 | tz | 毎月 1 日の 0 時 UTC に為替レートを更新。 | 1 | 2026-01-01..2026-04-01 (timed) |
| P-15 | fiscal | 半期ごとの最初の営業日に評価面談の案内。 | 2 | 2026-01-01..2027-01-01 |
| P-16 | counting, anchor | 3 日おきに水やりのリマインド。 | 7 | 2026-01-05..2026-01-20 |
| P-17 | roll | 毎月 15 日に定例の支払い。土日祝は避ける。 | 2 | 2026-01-05..2026-07-01 |
| C-01 | (control) | 毎月の第 3 木曜に部会。 | 1 | 2026-01-01..2026-05-01 |
| C-02 | (control) | 毎月 25 日。土日祝なら直前の営業日。 | 1 | 2026-02-01..2026-07-01 |
| C-03 | (control) | 毎週月曜と木曜の 10 時に進捗確認。 | 2 | 2026-01-05..2026-01-19 (timed) |
| C-04 | (control) | 毎月の最初の営業日の 9:30 に朝礼。 | 1 | 2026-01-01..2026-04-01 (timed) |

- P-13's "roll or holidays" is a disjunction: declaring either suffices.
- P-16 ("every 3 days") has no anchor in the requirement, so seven interpretations are accepted: period 3 × 3 phases and period 4 ×
  4 phases. Both `counting` and `anchor` must be declared.
- P-10 also accepts a declared reading that moves a reminder falling on a weekend or holiday to the preceding or following
  business day; only `counting` must be declared.

## Files

| file | contents |
|---|---|
| `problems.jsonl` | one problem per line `{id, prompt, allDay, from, to, ambiguity, expected, interpretations}`; `ambiguity` lists the kinds to declare (a bar-separated element is a disjunction; empty = control); `interpretations[]` are the accepted readings `{key, assumption, expected}`; the first interpretation's `expected` is the problem's `expected` |
| `answers.jsonl` | `{id, bodies: [{key, body}]}` — one answer body per interpretation, written by the language project |
| `check.mjs` | self-check without an LLM: evaluates every answer body behind the prelude with the reference implementation and compares with each interpretation's `expected` (43 pairs) |
| `run.mjs` | the runner: calls the model as described below, grades, writes to `results/` |
| `lib.mjs` | prelude loading, evaluation, grading, system-prompt assembly |

## Grading

```text
topics       = set of topic values in the returned assumptions
declared     = for every element of ambiguity, some bar-separated alternative is in topics (true when ambiguity is empty)
matched      = the point sequence of the body evaluated behind the prelude equals the expected of some interpretation (its key, else null)
pass         = declared and matched
overDeclared = number of topics that belong to no element's alternatives (does not affect pass)
```

Letters: `.` pass, `S` silently filled in (matched but not declared), `W` declared but wrong (declared but not matched), `X` neither,
`i` not validated (evaluator error after two repairs).

## How to measure

What `run.mjs` does; keep the same protocol when using another runner.

- System prompt = the prelude (PRELUDE in `impl/test/helpers.ts`) + "what to return" + the declaration section (verbatim below) +
  rules + the [authoring skill](../../../skills/kairos-authoring/SKILL.md) as reference material. Assembled by `systemPrompt` in `lib.mjs`.
- User message = `要件: <prompt>` (all-day problems add `（終日でよい）`). The range is not given.
- Structured output `{body, explanation, assumptions: [{topic, statement}]}`; `topic` is an enum of the nine kinds.
- The body is evaluated behind the prelude by the reference implementation; on error the diagnostic is returned for repair (up to two repairs).
- One run per problem. Effort `high` on models that support it.

### Declaration section (verbatim, Japanese)

```text
# 前提の宣言（assumptions）
依頼文に書かれていない前提を補って解いたときは、補った前提を assumptions に 1 件ずつ書く
（topic は次の 9 種から選び、statement は「何をどう読んだか」の日本語 1 文）。
依頼文だけで決まる要件は空配列にする。補っていない前提を書かない。
- tz: 時刻がどの時間帯か（相手先・UTC・夏時間）
- week: 週の数え方（第 n 週か第 n 曜日か・週の始まり）
- roll: 休日や存在しない日に当たった点をどう送るか（前・後・そのまま・飛ばす）
- holidays: 休みの定義（土日だけか祝日も・会社の休業・連休の長さ）
- fiscal: 年度・半期・四半期の起点（暦年か 4 月か）
- anchor: 周期の位相の起点（隔週・N 日ごとの最初の日）
- counting: 含む／含まない・数え方（N 日前は暦日か営業日か・端を 1 日目と数えるか・「N 日おき」の間隔）
- asof: 基準日（「今月」「来月から」が規則か一回きりか・いつから）
- boundary: 日の境（0 時・24 時はどちらの日か）
前文の時間帯（Asia/Tokyo）と違う時間帯の時刻が書かれていたら、tz を宣言する。
日本時間に換算して書くなら、相手先に夏時間があるときは切り替え日の前後で時刻を分けて書く（at(Thh:mm) 1 本では 1 年の約半分で 1 時間ずれる）。
前文の時間帯の時刻と読んで解く場合も、そう読んだことを tz に書く。
```

### Steps

```bash
cd impl && npm ci && npm run build && cd ..          # build the reference implementation
node bench/assist-premise-v4/check.mjs               # self-check without an LLM → 21/21 pass (43 pairs)
cd bench/assist-premise-v4 && npm install @anthropic-ai/sdk zod && cd ../..
ANTHROPIC_API_KEY=… node bench/assist-premise-v4/run.mjs --model claude-sonnet-5-5 --effort high
```

## Language-side measurement

Measured on 2026-11-03 with this runner (the same prompt as `run.mjs`; reference implementation 1.1.0) on 7 models: the 21 public problems, the 6 private problems (same shape, given to no one) and a 25-problem regression set (private, derived from the language certification's authoring questions; it checks that asking for declarations does not lower the pass rate on plain requirements). One run each, up to two repairs, effort high on the six models that support it.

| model | public 21 pass | silent | declared-wrong | undeclared-wrong | not validated | declared on control | private 6 pass | regression 25 pass | failed |
|---|---|---|---|---|---|---|---|---|---|
| Claude Fable 5.1 (effort high) | 21/21 | 0 | 0 | 0 | 0 | 3 | 6/6 | 25/25 | — |
| Claude Opus 5.5 (effort high) | 21/21 | 0 | 0 | 0 | 0 | 3 | 6/6 | 25/25 | — |
| Claude Sonnet 5.5 (effort high) | 21/21 | 0 | 0 | 0 | 0 | 3 | 6/6 | 24/25 | — |
| Claude Haiku 5.5 (effort high) | 20/21 | 1 | 0 | 0 | 0 | 2 | 6/6 | 24/25 | P-13:S |
| Claude Opus 5 (effort high) | 21/21 | 0 | 0 | 0 | 0 | 3 | 6/6 | 25/25 | — |
| Claude Sonnet 5 (effort high) | 19/21 | 2 | 0 | 0 | 0 | 1 | 6/6 | 24/25 | P-13:S P-16:S |
| Claude Haiku 4.5 (effort —) | 13/21 | 4 | 3 | 0 | 1 | 3 | 2/6 | 21/25 | P-01:S P-03:W P-04:W P-09:i P-11:S P-13:S P-14:W P-16:S, H-01:S H-02:S H-03:W H-04:S |

- S, W, X, i in "failed" are the letters of [§Grading](#grading); H-xx are the private problems.
- Two failure shapes on the public set: on P-13 (a "start of week" that falls on a holiday Monday) two models declared only `week` without touching holidays, and on P-16 ("every 3 days") one model declared only the anchor, not the period. In both the point sequence matched an accepted interpretation (silently filled in).
- Six of the seven models passed all six private problems.
- The three models that missed one regression problem each had declared a premise and chosen a different reading (how to count "N business days before"; adding a weekend roll to "the 25th of odd months"). An instruction to declare premises also pushes toward **adding** premises; the regression set is there to watch this.
- Declarations on the control problems ("10:00 read in the prelude's timezone", etc.) are frequent and do not affect the verdict. A rule not to declare readings that the requirement fixes uniquely is a candidate for the next version.
- An earlier pass of this measurement showed that C-03, P-10 and one private problem lacked a declared, reasonable reading; interpretations were added before grading ([§Versions](#versions)). This changed the verdict in 4 cases on the public set (C-03 on two models, P-10 on two) and 3 on the private set.
- Measuring the same 21 problems with a different prompt or runner gives different numbers. Numbers from different instruments are a cross-check, not a replication.

## Versions

- v4 = written 2026-11-02. On 2026-11-03, P-13 became a disjunction and P-16 went from 2 to 7 interpretations (the first two
  anchored the period at the first day of the evaluation range, which the AI cannot see). The same day, the language-side
  measurement found two problems whose declared, reasonable readings were not enumerated, and interpretations were added to C-03
  (skip holidays) and P-10 (move to the preceding or following business day). No first interpretation (`expected`) changed.
- Any change to problems, interpretations or grading bumps the version; results of different versions are not mixed. Report
  flaws in the problems as an issue.
