---
source_sha: 21a92a8e1640
---

# Patch Tuesday: the second Tuesday at 10:00 Pacific, shown in any time zone

> Translated from the canonical Japanese page
> [recipes/patch-tuesday.md](../../recipes/patch-tuesday.md).

Microsoft publishes its monthly security update on **the second Tuesday of each month, typically at 10:00 AM
Pacific Time (PST/PDT)** ([Microsoft Learn: Update release cycle for Windows clients](https://learn.microsoft.com/windows/deployment/update/release-cycle);
the fourth Tuesday carries the optional preview release, out-of-band updates ship as needed). It is one
instant for the whole world, yet on local calendars **both the date and the time move** — Pacific Time
observes daylight saving. In Japan it lands on Wednesday at 2 or 3 am; in London on Tuesday at 18:00
(17:00 in March only); in Sydney on Wednesday between 3 and 5 am.

Whether and when an update ships is Microsoft's call, announced by Microsoft. This page covers one thing:
producing the *scheduled* points, in any time zone, from a single definition.

## What happens with the tools you already have

- cron has no notion of a time zone. Read the rule as "second Wednesday, 3 am" in Tokyo and write
  `0 3 8-14 * 3`, and 2026 is wrong in 10 months out of 12 — eight of them by an hour (daylight saving),
  and in April and July the month starts on a Wednesday, so the right day is the **third** Wednesday and the
  line is off by a full week (see the wrong example below).
- iCalendar can express it: `DTSTART;TZID=America/Los_Angeles` plus `FREQ=MONTHLY;BYDAY=2TU`. What breaks
  is translating that point by hand into each site's scheduler (cron, Task Scheduler) — a translation that
  has to be redone at every daylight-saving switch.
- Windows Task Scheduler can pick "the Nth weekday" in a monthly trigger (`schtasks /sc monthly /mo SECOND /d TUE`),
  but the time of day is the machine's local time or UTC ("Synchronize across time zones") — nothing else. Register
  "second Wednesday, 3 am" in local time on a Tokyo machine and first of all **the date is off by a full week in April
  and July**: the release does land on a Wednesday in Tokyo, but in a month that starts on a Wednesday the day after
  the second Tuesday is the **third** Wednesday, and a monthly trigger has no "the day after the second Tuesday" — so
  no single simple trigger expresses it. An hour of daylight-saving drift can be absorbed with a margin; a week cannot.
  Register "second Tuesday, 17:00" with UTC synchronization and the date holds, but now the hour moves between
  17:00 and 18:00 with daylight saving.
- Group Policy's "Configure Automatic Updates" (auto download and schedule the install) knows a weekday and a time
  (local; every day at 3:00 AM by default) — neither "the second Tuesday" nor "the day after the release". Windows
  Update for Business deferrals (quality updates up to 30 days; the ring example is 0/5/10 days) are "release date +
  N days", the same idea as the relative-date section below — but that is an installation rule, not a way to produce
  the release points themselves ([Microsoft Learn: Use Group Policy to configure Windows Update](https://learn.microsoft.com/windows/deployment/update/waas-wufb-group-policy)).
- Running machines in Pacific Time "for Windows Update" is a workaround for not being able to put the time
  zone into the definition. Once the definition carries it, the workaround is unnecessary.

## Writing it in Kairos

One definition, in Pacific Time. The time of day is attached with `at` (the wall-clock 10:00 survives the
daylight-saving switches):

```kairos
# eval: 2026-01-01..2027-01-01 tz: America/Los_Angeles
premise PT {
  calendar-system: Gregorian
  tz: "America/Los_Angeles"
  wkst: Sun
}
@PT
patchDay = everyDay |> filter(d => weekday(d) == Tue) |> within(month) |> nth(2)
patchDay |> at(T10:00)
#=> 2026-01-13T10:00 2026-02-10T10:00 2026-03-10T10:00 2026-04-14T10:00 2026-05-12T10:00 2026-06-09T10:00
#=> 2026-07-14T10:00 2026-08-11T10:00 2026-09-08T10:00 2026-10-13T10:00 2026-11-10T10:00 2026-12-08T10:00
```

**The same definition, shown in Tokyo.** The `tz:` in `# eval:` is the display zone — the definition does
not change by a single character (`--tz Asia/Tokyo` in the CLI, or the display-zone switch in the Playground):

```kairos
# eval: 2026-01-01..2027-01-01 tz: Asia/Tokyo
premise PT {
  calendar-system: Gregorian
  tz: "America/Los_Angeles"
  wkst: Sun
}
@PT
patchDay = everyDay |> filter(d => weekday(d) == Tue) |> within(month) |> nth(2)
patchDay |> at(T10:00)
#=> 2026-01-14T03:00 2026-02-11T03:00 2026-03-11T02:00 2026-04-15T02:00 2026-05-13T02:00 2026-06-10T02:00
#=> 2026-07-15T02:00 2026-08-12T02:00 2026-09-09T02:00 2026-10-14T02:00 2026-11-11T03:00 2026-12-09T03:00
```

3 am in January, February, November and December; 2 am from March to October. The date is always a
Wednesday, but **in April and July it is the third Wednesday** — those months start on a Wednesday, so the
day after the second Tuesday (the 14th) is the month's third Wednesday. "Second Wednesday" and "second
Tuesday" do not name the same point.

London sees Tuesday 18:00, and 17:00 in March only (the US switches to daylight saving three weeks before
the UK):

```kairos
# eval: 2026-01-01..2027-01-01 tz: Europe/London
premise PT {
  calendar-system: Gregorian
  tz: "America/Los_Angeles"
  wkst: Sun
}
@PT
patchDay = everyDay |> filter(d => weekday(d) == Tue) |> within(month) |> nth(2)
patchDay |> at(T10:00)
#=> 2026-01-13T18:00 2026-02-10T18:00 2026-03-10T17:00 2026-04-14T18:00 2026-05-12T18:00 2026-06-09T18:00
#=> 2026-07-14T18:00 2026-08-11T18:00 2026-09-08T18:00 2026-10-13T18:00 2026-11-10T18:00 2026-12-08T18:00
```

Sydney, with the southern hemisphere's daylight saving running the other way, sees three different hours
(5, 4 and 3 am):

```kairos
# eval: 2026-01-01..2027-01-01 tz: Australia/Sydney
premise PT {
  calendar-system: Gregorian
  tz: "America/Los_Angeles"
  wkst: Sun
}
@PT
patchDay = everyDay |> filter(d => weekday(d) == Tue) |> within(month) |> nth(2)
patchDay |> at(T10:00)
#=> 2026-01-14T05:00 2026-02-11T05:00 2026-03-11T04:00 2026-04-15T03:00 2026-05-13T03:00 2026-06-10T03:00
#=> 2026-07-15T03:00 2026-08-12T03:00 2026-09-09T03:00 2026-10-14T04:00 2026-11-11T05:00 2026-12-09T05:00
```

**The wrong one — "second Wednesday, 3 am, in Tokyo".** Rewritten under a Tokyo premise, the list agrees
with the correct one only in January, February, November and December (an hour off from March to
October, a week off in April and July):

```kairos
# eval: 2026-01-01..2027-01-01 tz: Asia/Tokyo
premise Tokyo {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  wkst: Mon
}
@Tokyo
everyDay |> filter(d => weekday(d) == Wed) |> within(month) |> nth(2) |> at(T03:00)
#=> 2026-01-14T03:00 2026-02-11T03:00 2026-03-11T03:00 2026-04-08T03:00 2026-05-13T03:00 2026-06-10T03:00
#=> 2026-07-08T03:00 2026-08-12T03:00 2026-09-09T03:00 2026-10-14T03:00 2026-11-11T03:00 2026-12-09T03:00
```

**What follows the release is a relative date.** Staged rollouts (dev → test → production) are defined
relative to the release day. "Production on the second Saturday at 22:00 Pacific" is the release-day set
shifted by four days with a time attached:

```kairos
# eval: 2026-01-01..2027-01-01 tz: America/Los_Angeles
premise PT {
  calendar-system: Gregorian
  tz: "America/Los_Angeles"
  wkst: Sun
}
@PT
patchDay = everyDay |> filter(d => weekday(d) == Tue) |> within(month) |> nth(2)
patchDay |> shift(+4, unit: day) |> at(T22:00)
#=> 2026-01-17T22:00 2026-02-14T22:00 2026-03-14T22:00 2026-04-18T22:00 2026-05-16T22:00 2026-06-13T22:00
#=> 2026-07-18T22:00 2026-08-15T22:00 2026-09-12T22:00 2026-10-17T22:00 2026-11-14T22:00 2026-12-12T22:00
```

The fourth-Tuesday preview release is the same shape with `nth(4)`:

```kairos
# eval: 2026-01-01..2027-01-01 tz: America/Los_Angeles
premise PT {
  calendar-system: Gregorian
  tz: "America/Los_Angeles"
  wkst: Sun
}
@PT
everyDay |> filter(d => weekday(d) == Tue) |> within(month) |> nth(4) |> at(T10:00)
#=> 2026-01-27T10:00 2026-02-24T10:00 2026-03-24T10:00 2026-04-28T10:00 2026-05-26T10:00 2026-06-23T10:00
#=> 2026-07-28T10:00 2026-08-25T10:00 2026-09-22T10:00 2026-10-27T10:00 2026-11-24T10:00 2026-12-22T10:00
```

## Scope

- 10:00 is the **publication** time, not the time an update reaches or installs on any given machine.
  Ordering and delays belong to the delivery side (Windows Update, WSUS, Intune); the authority is
  Microsoft's announcements and each service's documentation.
- As Microsoft itself says "typically": out-of-band updates and postponements are outside the expression.
  The expression yields the *scheduled* points.
- The subject is the monthly update for Windows clients. Windows Server, Microsoft 365 Apps and others have
  their own cadences (mostly the same second Tuesday, but each documented separately).

## Try it in your browser

The same definition, with only the display zone changed (the Playground's display-zone switch does the
same):

[Pacific (the definition as is)](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBQVCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTG9zX0FuZ2VsZXMiCiAgd2tzdDogU3VuCn0KQFBUCnBhdGNoRGF5ID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBUdWUpIHw-IHdpdGhpbihtb250aCkgfD4gbnRoKDIpCnBhdGNoRGF5IHw-IGF0KFQxMDowMCk&f=2026-01-01&t=2027-01-01&z=America%2FLos_Angeles) ·
[shown in Tokyo](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBQVCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTG9zX0FuZ2VsZXMiCiAgd2tzdDogU3VuCn0KQFBUCnBhdGNoRGF5ID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBUdWUpIHw-IHdpdGhpbihtb250aCkgfD4gbnRoKDIpCnBhdGNoRGF5IHw-IGF0KFQxMDowMCk&f=2026-01-01&t=2027-01-01&z=Asia%2FTokyo) ·
[shown in London](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBQVCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTG9zX0FuZ2VsZXMiCiAgd2tzdDogU3VuCn0KQFBUCnBhdGNoRGF5ID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBUdWUpIHw-IHdpdGhpbihtb250aCkgfD4gbnRoKDIpCnBhdGNoRGF5IHw-IGF0KFQxMDowMCk&f=2026-01-01&t=2027-01-01&z=Europe%2FLondon) ·
[shown in Sydney](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBQVCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTG9zX0FuZ2VsZXMiCiAgd2tzdDogU3VuCn0KQFBUCnBhdGNoRGF5ID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBUdWUpIHw-IHdpdGhpbihtb250aCkgfD4gbnRoKDIpCnBhdGNoRGF5IHw-IGF0KFQxMDowMCk&f=2026-01-01&t=2027-01-01&z=Australia%2FSydney) ·
[the wrong one (second Wednesday, 3 am Tokyo)](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBUb2t5byB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFzaWEvVG9reW8iCiAgd2tzdDogTW9uCn0KQFRva3lvCmV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgPT0gV2VkKSB8PiB3aXRoaW4obW9udGgpIHw-IG50aCgyKSB8PiBhdChUMDM6MDAp&f=2026-01-01&t=2027-01-01&z=Asia%2FTokyo) ·
[production (second Saturday, 22:00)](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBQVCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTG9zX0FuZ2VsZXMiCiAgd2tzdDogU3VuCn0KQFBUCnBhdGNoRGF5ID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBUdWUpIHw-IHdpdGhpbihtb250aCkgfD4gbnRoKDIpCnBhdGNoRGF5IHw-IHNoaWZ0KCs0LCB1bml0OiBkYXkpIHw-IGF0KFQyMjowMCk&f=2026-01-01&t=2027-01-01&z=America%2FLos_Angeles) ·
[preview (fourth Tuesday)](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBQVCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTG9zX0FuZ2VsZXMiCiAgd2tzdDogU3VuCn0KQFBUCmV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgPT0gVHVlKSB8PiB3aXRoaW4obW9udGgpIHw-IG50aCg0KSB8PiBhdChUMTA6MDAp&f=2026-01-01&t=2027-01-01&z=America%2FLos_Angeles)

— move from/to, change `at(T10:00)`, and see what happens. Everything runs in the browser; nothing is sent anywhere.

## Related

- Why the time zone belongs in the definition: the blog post [Which "9 o'clock" does your code remember?](https://selog.tech/?p=360) (Japanese)
- Vocabulary: [`at`](../reference/at.md) (attaching a wall-clock time) · [`nth`](../reference/nth.md) · [`within`](../reference/within.md) ·
  [`shift`](../reference/shift.md)
- Migrating from cron in general: [Last day of the month](cron-last-day-of-month.md)
- The catalogue of schedules long said to be inexpressible: [Study 11](../design/40-examples/11-impossible-schedules.md)
