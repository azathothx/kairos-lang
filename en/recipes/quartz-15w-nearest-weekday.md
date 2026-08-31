---
source_sha: d67338bb31c3
---

# Nearest weekday to the 15th — Quartz 15W by composition

> Translated from the canonical Japanese page
> [recipes/quartz-15w-nearest-weekday.md](../../recipes/quartz-15w-nearest-weekday.md).

"The 15th of every month, or the nearest weekday if it falls on a weekend" is the requirement
known as Quartz's `15W`. RRULE has no such vocabulary, and even the Quartz dialect **cannot see
holidays**. Kairos has no dedicated `Nearest` roll convention — instead the requirement is a
**finite case split written as composition**, which is exactly why it extends to holidays.

## What happens elsewhere

- iCalendar RRULE has no "nearest weekday" (not expressible with BYSETPOS).
- Quartz `15W`'s W only avoids **weekends** — it cannot be combined with a holiday calendar.
- "Saturday rolls back to Friday, Sunday rolls forward to Monday" — two rolls in *different
  directions* — are folded into one token, so the moment you need a variant (avoid holidays too,
  don't cross month-end, …) it stops being writable.

## Writing it in Kairos

Split the stream of 15ths three ways — weekday as is, Saturday backward, Sunday forward — and
take the union:

```kairos
# eval: 2026-01-01..2026-12-31
@JP
weekdays = everyDay |> filter(d => weekday(d) != Sat and weekday(d) != Sun)
d15 = everyDay |> within(month) |> nth(15)
(d15 |> filter(d => weekday(d) != Sat and weekday(d) != Sun))
  | (d15 |> filter(d => weekday(d) == Sat) |> roll(Preceding, on: weekdays))
  | (d15 |> filter(d => weekday(d) == Sun) |> roll(Following, on: weekdays))
#=> 2026-01-15 2026-02-16 2026-03-16 2026-04-15 2026-05-15 2026-06-15
#=> 2026-07-15 2026-08-14 2026-09-15 2026-10-15 2026-11-16 2026-12-15
```

February, March, and November (15th on a Sunday) move to the following Monday; August (15th on a
Saturday) moves back to Friday 8/14. The case split hidden inside the single word "nearest" is
**visible as three lines of expression**.

The holiday support that `15W` cannot offer is just swapping `weekdays` for a business-day
stream:

```text
(d15 |> filter(…)) | (… |> roll(Preceding, on: bizDay)) | (… |> roll(Following, on: bizDay))
```

The roll targets become business days, and what to do when the 15th itself is a holiday is one
more condition on `d15 |> filter` — a dedicated token folds the spec shut, while composition
opens for repair.

## Holiday support with real data — the 2026 US federal calendar

Here is that swap performed with real data. The roll targets become business days derived
from the 2026 US federal holidays (observed dates):

```kairos
# eval: 2026-01-01..2026-12-31 tz: America/New_York
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

d15 = everyDay |> within(month) |> nth(15)
(d15 |> filter(d => weekday(d) != Sat and weekday(d) != Sun))
  | (d15 |> filter(d => weekday(d) == Sat) |> roll(Preceding, on: bizDay))
  | (d15 |> filter(d => weekday(d) == Sun) |> roll(Following, on: bizDay))
#=> 2026-01-15 2026-02-17 2026-03-16 2026-04-15 2026-05-15 2026-06-15
#=> 2026-07-15 2026-08-14 2026-09-15 2026-10-15 2026-11-16 2026-12-15
#~> 範囲外 2026-01-01..2026-01-02（federal2026 covering 2026-01-01..2026-12-31）
```

February is the one to watch. The weekday nearest to Sunday 2/15 is Monday 2/16 — but **2/16 is
Washington's Birthday, a federal holiday** — and because the roll targets are business days, the
result escapes one more day to **2/17**. The "nearest weekday that also avoids holidays", which
Quartz's `W` structurally cannot express, falls out of swapping a single axis. The trailing
annotation says that near the head of the window a roll target could lie before the coverage
claim — the data's edge made explicit instead of silently computed (the governing machinery:
[spec §4.10](../spec/30-body-layer.md)).
[Run the US version in the Playground](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBVUyB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTmV3X1lvcmsiCiAgd2tzdDogU3VuCn0KCkBVUwpmZWRlcmFsMjAyNiA9IFsyMDI2LTAxLTAxLCAyMDI2LTAxLTE5LCAyMDI2LTAyLTE2LCAyMDI2LTA1LTI1LCAyMDI2LTA2LTE5LAogICAgICAgICAgICAgICAyMDI2LTA3LTAzLCAyMDI2LTA5LTA3LCAyMDI2LTEwLTEyLCAyMDI2LTExLTExLCAyMDI2LTExLTI2LAogICAgICAgICAgICAgICAyMDI2LTEyLTI1XSBjb3ZlcmluZzogMjAyNi4uMjAyNgpzYXRTdW4gPSBldmVyeURheSB8PiBmaWx0ZXIoZCA9PiB3ZWVrZGF5KGQpID09IFNhdCBvciB3ZWVrZGF5KGQpID09IFN1bikKYml6RGF5ID0gZXZlcnlEYXkgXCAoc2F0U3VuIHwgZmVkZXJhbDIwMjYpCgpkMTUgPSBldmVyeURheSB8PiB3aXRoaW4obW9udGgpIHw-IG50aCgxNSkKKGQxNSB8PiBmaWx0ZXIoZCA9PiB3ZWVrZGF5KGQpICE9IFNhdCBhbmQgd2Vla2RheShkKSAhPSBTdW4pKQogIHwgKGQxNSB8PiBmaWx0ZXIoZCA9PiB3ZWVrZGF5KGQpID09IFNhdCkgfD4gcm9sbChQcmVjZWRpbmcsIG9uOiBiaXpEYXkpKQogIHwgKGQxNSB8PiBmaWx0ZXIoZCA9PiB3ZWVrZGF5KGQpID09IFN1bikgfD4gcm9sbChGb2xsb3dpbmcsIG9uOiBiaXpEYXkpKQo&f=2026-01-01&t=2026-12-31&z=America%2FNew_York).

## Try it in your browser

[Run it in the Playground](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBKUCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFzaWEvVG9reW8iCiAgd2tzdDogTW9uCn0KCkBKUAp3ZWVrZGF5cyA9IGV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgIT0gU2F0IGFuZCB3ZWVrZGF5KGQpICE9IFN1bikKZDE1ID0gZXZlcnlEYXkgfD4gd2l0aGluKG1vbnRoKSB8PiBudGgoMTUpCihkMTUgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSAhPSBTYXQgYW5kIHdlZWtkYXkoZCkgIT0gU3VuKSkKICB8IChkMTUgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBTYXQpIHw-IHJvbGwoUHJlY2VkaW5nLCBvbjogd2Vla2RheXMpKQogIHwgKGQxNSB8PiBmaWx0ZXIoZCA9PiB3ZWVrZGF5KGQpID09IFN1bikgfD4gcm9sbChGb2xsb3dpbmcsIG9uOiB3ZWVrZGF5cykp&f=2026-01-01&t=2026-12-31)
— change `nth(15)` for any other day of the month.

## Related

- The payday pattern (25th, rolling *one way* onto the previous business day):
  [spec §7](../spec/90-examples.md)
- Vocabulary: [`roll`](../reference/roll.md) · [`nth`](../reference/nth.md) ·
  the <code>&#124;</code> combinator in the [descriptor reference](../reference/combinators.md)
- Sources and the full catalogue of similar cases:
  [study 11](../design/40-examples/11-impossible-schedules.md)
