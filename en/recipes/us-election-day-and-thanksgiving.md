---
source_sha: afa4a3738b51
---

# US Election Day, Black Friday and the Sunday after Thanksgiving: dates relative to a computed date

> Translated from the canonical Japanese page
> [recipes/us-election-day-and-thanksgiving.md](../../recipes/us-election-day-and-thanksgiving.md).

US **Election Day** is "the Tuesday after the first Monday in November", **Thanksgiving** is "the fourth
Thursday in November", **Black Friday** is the day after it and **Cyber Monday** the Monday after that.
Each is "n days from a date that another rule decides", and the statutes and customs define them in exactly
that order of words. Kairos lets you write them in that order: derive the earlier date first, then feed
that stream into the next rule (closure).

## What happens with existing recurrence rules

- RRULE has no "the day another rule picks, plus n days". Election Day can only be encoded as
  `BYDAY=TU;BYMONTHDAY=2,3,4,5,6,7,8` (a Tuesday that falls on the 2nd through the 8th), an **encoding
  that loses the intent**: a reader cannot get back to "the day after the first Monday".
- "The Sunday after Thanksgiving" crosses a month boundary in some years (2024: December 1), and
  [the BYYEARDAY negative-offset hack breaks exactly there](https://stackoverflow.com/questions/72777808/rrule-and-ical-complex-recurrence).
- cron ORs the day-of-month and day-of-week fields, so conditions of this kind cannot be written at all
  (see the opening of [the last-business-day recipe](cron-last-day-of-month.md)).

## Writing it in Kairos, in the order the law states it

**Election Day**: pick "the first Monday in November" within the year window, then the next day:

```kairos
# eval: 2024-01-01..2029-01-01 tz: America/New_York
premise US {
  calendar-system: Gregorian
  tz: "America/New_York"
  wkst: Sun
}
@US
firstMonNov = everyDay |> filter(d => weekday(d) == Mon and month(d) == 11) |> within(year) |> first
firstMonNov |> shift(+1, unit: day)
#=> 2024-11-05 2025-11-04 2026-11-03 2027-11-02 2028-11-07
```

Federal elections are held in even-numbered years only, so a filter on the year gives "federal Election Day" (odd years are state and local elections):

```kairos
# eval: 2024-01-01..2031-01-01 tz: America/New_York
premise US {
  calendar-system: Gregorian
  tz: "America/New_York"
  wkst: Sun
}
@US
firstMonNov = everyDay |> filter(d => weekday(d) == Mon and month(d) == 11) |> within(year) |> first
firstMonNov |> shift(+1, unit: day) |> filter(d => year(d) mod 2 == 0)
#=> 2024-11-05 2026-11-03 2028-11-07 2030-11-05
```

**Black Friday**: the day after Thanksgiving (the fourth Thursday in November). With Thanksgiving bound, it is one line:

```kairos
# eval: 2024-01-01..2028-01-01 tz: America/New_York
premise US {
  calendar-system: Gregorian
  tz: "America/New_York"
  wkst: Sun
}
@US
thanksgiving = everyDay |> filter(d => weekday(d) == Thu and month(d) == 11) |> within(month) |> nth(4)
thanksgiving |> shift(+1, unit: day)
#=> 2024-11-29 2025-11-28 2026-11-27 2027-11-26
```

**Cyber Monday**: four days after Thanksgiving:

```kairos
# eval: 2024-01-01..2028-01-01 tz: America/New_York
premise US {
  calendar-system: Gregorian
  tz: "America/New_York"
  wkst: Sun
}
@US
thanksgiving = everyDay |> filter(d => weekday(d) == Thu and month(d) == 11) |> within(month) |> nth(4)
thanksgiving |> shift(+4, unit: day)
#=> 2024-12-02 2025-12-01 2026-11-30 2027-11-29
```

**The Sunday after Thanksgiving**: roll forward from Thanksgiving onto Sundays. 2024 gives December 1: **the month
boundary comes out right**, because the derived stream is simply the input of the next rule and month edges play no part:

```kairos
# eval: 2024-01-01..2028-01-01 tz: America/New_York
premise US {
  calendar-system: Gregorian
  tz: "America/New_York"
  wkst: Sun
}
@US
thanksgiving = everyDay |> filter(d => weekday(d) == Thu and month(d) == 11) |> within(month) |> nth(4)
thanksgiving |> roll(Following, on: (everyDay |> filter(d => weekday(d) == Sun)))
#=> 2024-12-01 2025-11-30 2026-11-29 2027-11-28
```

## Scope

- Election Day follows federal law (2 U.S.C. §7, 3 U.S.C. §1): "the Tuesday next after the first Monday in November".
  Thanksgiving follows 5 U.S.C. §6103: "the fourth Thursday in November". Black Friday and Cyber Monday are retail
  customs, not statutory holidays.
- State and local election dates and early-voting periods are set by state law; the expressions here cover the
  federal definition only.
- The example premise is US Eastern time. The definitions are date-only, so the time zone does not change the
  result (it is aligned with the Playground's display zone).

## Try it in your browser

[Election Day](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBVUyB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTmV3X1lvcmsiCiAgd2tzdDogU3VuCn0KQFVTCmZpcnN0TW9uTm92ID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBNb24gYW5kIG1vbnRoKGQpID09IDExKSB8PiB3aXRoaW4oeWVhcikgfD4gZmlyc3QKZmlyc3RNb25Ob3YgfD4gc2hpZnQoKzEsIHVuaXQ6IGRheSk&f=2024-01-01&t=2029-01-01&z=America%2FNew_York) ·
[Black Friday](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBVUyB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTmV3X1lvcmsiCiAgd2tzdDogU3VuCn0KQFVTCnRoYW5rc2dpdmluZyA9IGV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgPT0gVGh1IGFuZCBtb250aChkKSA9PSAxMSkgfD4gd2l0aGluKG1vbnRoKSB8PiBudGgoNCkKdGhhbmtzZ2l2aW5nIHw-IHNoaWZ0KCsxLCB1bml0OiBkYXkp&f=2024-01-01&t=2028-01-01&z=America%2FNew_York) ·
[Cyber Monday](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBVUyB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTmV3X1lvcmsiCiAgd2tzdDogU3VuCn0KQFVTCnRoYW5rc2dpdmluZyA9IGV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgPT0gVGh1IGFuZCBtb250aChkKSA9PSAxMSkgfD4gd2l0aGluKG1vbnRoKSB8PiBudGgoNCkKdGhhbmtzZ2l2aW5nIHw-IHNoaWZ0KCs0LCB1bml0OiBkYXkp&f=2024-01-01&t=2028-01-01&z=America%2FNew_York) ·
[the Sunday after Thanksgiving](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBVUyB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTmV3X1lvcmsiCiAgd2tzdDogU3VuCn0KQFVTCnRoYW5rc2dpdmluZyA9IGV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgPT0gVGh1IGFuZCBtb250aChkKSA9PSAxMSkgfD4gd2l0aGluKG1vbnRoKSB8PiBudGgoNCkKdGhhbmtzZ2l2aW5nIHw-IHJvbGwoRm9sbG93aW5nLCBvbjogKGV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgPT0gU3VuKSkp&f=2024-01-01&t=2028-01-01&z=America%2FNew_York)

## Related

- A moving holiday that is pure arithmetic, with zero data: [Easter](easter-schedule.md)
- Moving points: [`shift`](../reference/shift.md) · [`roll`](../reference/roll.md); selecting inside a window: [`within`](../reference/within.md) · [`nth`](../reference/nth.md)
- The catalog of schedules said to be unwritable: [study 11 (f)](../design/40-examples/11-impossible-schedules.md)
