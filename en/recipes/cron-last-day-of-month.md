---
source_sha: e716afd73e1f
---

# Cron: run on the last day of the month — and the last business day

> Translated from the canonical Japanese page
> [recipes/cron-last-day-of-month.md](../../recipes/cron-last-day-of-month.md).

"Run at the end of every month" is one of cron's most common stumbling blocks
([325k views on Stack Overflow](https://stackoverflow.com/questions/6139189/cron-job-to-run-on-the-last-day-of-the-month)).
In Kairos, both variants are one-line expressions:

```text
monthEnd                                  # last day of the month
bizDay |> within(month) |> last           # last business day of the month
```

## What happens with cron

- Standard cron has no "last day". The usual workaround is listing `28-31` and testing in a
  script; Kubernetes CronJob sees [the same request re-raised in issues over and over](https://github.com/kubernetes/kubernetes/issues/121088).
- Quartz's dialect `L` (last day) and `LW` (last weekday) are handy but not portable across
  schedulers, and **holidays are out of reach** (the W in `LW` only avoids weekends).
- For the last *business* day, even Google Calendar
  [only accepts it via an ICS import that then carries an "uneditable" warning](https://www.garethjmsaunders.co.uk/2022/03/26/how-to-set-up-recurring-events-on-the-last-working-day-of-the-month-in-google-calendar/).

The root cause is not a missing feature but that **expressions do not compose** — even if you can
produce "month-end", you cannot feed the result into the next rule ("roll backward onto business
days").

## Writing it in Kairos

The holiday-aware last business day of the month, under the standard `@JP` premise (whose `bizDay`
is derived from weekends plus Japan's holiday data):

```kairos
# eval: 2026-01-01..2026-07-01
@JP
bizDay |> within(month) |> last
#=> 2026-01-30 2026-02-27 2026-03-31 2026-04-30 2026-05-29 2026-06-30
```

January (1/31 Sat) and May (5/30 Sat, 5/31 Sun) correctly retreat to Friday. "Build the stream of
business days, take the last point of each month" — the structure reads exactly as stated, the
holidays come from calendar data (with `covering:`), and when that data runs out the result
carries an annotation instead of silently degrading.

Counting back from month-end composes from the same vocabulary:

```text
monthEnd |> roll(Preceding, on: bizDay) |> shift(-3, unit: bizDay)   # 3 business days before month-end
```

## The same expression under a US calendar

The expression above does not depend on Japan's holiday data in any way. Load the same
expression onto the 2026 US federal holidays (observed dates):

```kairos
# eval: 2026-01-01..2026-07-01 tz: America/New_York
premise US {
  calendar-system: Gregorian
  tz: "America/New_York"
  wkst: Sun
}

@US
federal2026 = [2026-01-01, 2026-01-19, 2026-02-16, 2026-05-25, 2026-06-19,
               2026-07-03, 2026-09-07, 2026-10-12, 2026-11-11, 2026-11-26,
               2026-12-25] covering: 2026..2026
satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
bizDay = everyDay \ (satSun | federal2026)

bizDay |> within(month) |> last
#=> 2026-01-30 2026-02-27 2026-03-31 2026-04-30 2026-05-29 2026-06-30
```

Only the premise — the data and the timezone — changed; **the body expression is untouched,
character for character**. "Build the stream of business days, take the last point of each
month" is a structure independent of any one country's calendar — whichever calendar you run
under, what you swap is the data.
[Run the US version in the Playground](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBVUyB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTmV3X1lvcmsiCiAgd2tzdDogU3VuCn0KCkBVUwpmZWRlcmFsMjAyNiA9IFsyMDI2LTAxLTAxLCAyMDI2LTAxLTE5LCAyMDI2LTAyLTE2LCAyMDI2LTA1LTI1LCAyMDI2LTA2LTE5LAogICAgICAgICAgICAgICAyMDI2LTA3LTAzLCAyMDI2LTA5LTA3LCAyMDI2LTEwLTEyLCAyMDI2LTExLTExLCAyMDI2LTExLTI2LAogICAgICAgICAgICAgICAyMDI2LTEyLTI1XSBjb3ZlcmluZzogMjAyNi4uMjAyNgpzYXRTdW4gPSBldmVyeURheSB8PiBmaWx0ZXIoZCA9PiB3ZWVrZGF5KGQpID09IFNhdCBvciB3ZWVrZGF5KGQpID09IFN1bikKYml6RGF5ID0gZXZlcnlEYXkgXCAoc2F0U3VuIHwgZmVkZXJhbDIwMjYpCgpiaXpEYXkgfD4gd2l0aGluKG1vbnRoKSB8PiBsYXN0Cg&f=2026-01-01&t=2026-07-01&z=America%2FNew_York).

## Running it — keep one crontab line

Kairos stops at *when things should happen*; firing, retrying and logging stay with your runner
(systemd, a job queue, whatever you already trust — [spec §7.8](../spec/90-examples.md)). Two wiring
patterns, both working with the CLI as it ships (`npm i -g kairos-lang`).

**Pattern 1: cron stays the clock, Kairos makes the decision.** Keep a single crontab line and, every
morning at 9, ask "is there a point today?"; run the job if so. Labels and the `[--from, --to)` window
are read in the machine's time zone (pass `--tz` if the definition's `premise` zone differs):

```text
0 9 * * *  cd /srv/batch && ./run-if-today.sh month-end.kairos ./close-books.sh
```

```sh
#!/bin/sh
# run-if-today.sh <definition.kairos> <job> — exec the job if there is a point in [today, tomorrow)
today=$(date +%F); tomorrow=$(date -d "$today + 1 day" +%F)   # GNU date; macOS: date -v+1d +%F
n=$(kairos list --from "$today" --to "$tomorrow" --json "$1" | jq '.results[0].dates | length')
[ "$n" -gt 0 ] && exec "$2"
```

Count with `--json`: the human-readable output also prints the coverage summary as `#` lines.

**Pattern 2: schedule the next point, one at a time.** Put the time of day into the definition as well
(`… |> last |> at(T23:55)`) and ask `next --json` for the next firing. It comes back as wall-clock text
(machine's zone) and as epoch milliseconds; hand it to a one-shot OS timer and let the job re-register
the next point as its last step — the "re-materialize periodically" loop the spec describes:

```sh
t=$(kairos next --json month-end.kairos | jq -r '.results[0].dates[0]')   # e.g. 2026-09-30T23:55
systemd-run --user --on-calendar="$(echo "$t" | tr T ' '):00" ./close-books.sh
# same shape with at(1) on Linux, or schtasks /sc once on Windows
```

## Try it in your browser

A self-contained form (the holiday table inline) is
[ready to run in the Playground](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBKUCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFzaWEvVG9reW8iCiAgd2tzdDogTW9uCn0KCkBKUApob2xpZGF5czIwMjYgPSBbMjAyNi0wMS0wMSwgMjAyNi0wMS0xMiwgMjAyNi0wMi0xMSwgMjAyNi0wMi0yMywgMjAyNi0wMy0yMCwKICAgICAgICAgICAgICAgIDIwMjYtMDQtMjksIDIwMjYtMDUtMDMsIDIwMjYtMDUtMDQsIDIwMjYtMDUtMDUsIDIwMjYtMDUtMDYsCiAgICAgICAgICAgICAgICAyMDI2LTA3LTIwLCAyMDI2LTA4LTExLCAyMDI2LTA5LTIxLCAyMDI2LTA5LTIyLCAyMDI2LTA5LTIzLAogICAgICAgICAgICAgICAgMjAyNi0xMC0xMiwgMjAyNi0xMS0wMywgMjAyNi0xMS0yM10gY292ZXJpbmc6IDIwMjYuLjIwMjYKc2F0U3VuID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBTYXQgb3Igd2Vla2RheShkKSA9PSBTdW4pCmJpekRheSA9IGV2ZXJ5RGF5IFwgKHNhdFN1biB8IGhvbGlkYXlzMjAyNikKCmJpekRheSB8PiB3aXRoaW4obW9udGgpIHw-IGxhc3Q&f=2026-01-01&t=2026-07-01)
— move from/to around, add holidays, and watch the behavior.

## Related

- Same family: the 31st of every month (writing the two *different intents* for missing months as
  two different expressions), the Nth business day, every N business days —
  [study 11, measured section](../design/40-examples/11-impossible-schedules.md)
- Vocabulary: [`within`](../reference/within.md) · [`last`](../reference/last.md) ·
  [`roll`](../reference/roll.md) · [`shift`](../reference/shift.md)
- Bringing in holiday data and governing its freshness (`covering:`/`asof:`):
  [spec §4.10](../spec/30-body-layer.md)
