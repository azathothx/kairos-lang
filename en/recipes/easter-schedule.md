---
source_sha: d4ad26eecb61
---

# Computing Easter as a schedule expression — zero-data Computus

> Translated from the canonical Japanese page
> [recipes/easter-schedule.md](../../recipes/easter-schedule.md).

Easter is a **movable feast** — "the first Sunday after the first full moon on or after the
spring equinox" — and recurrence-rule languages have uniformly given up on it. In Kairos it is
**eight lines of pure arithmetic** with zero external data.

## What happens with existing recurrence rules

- Neither iCalendar RRULE (RFC 5545) nor its calendar extension (RFC 7529) can express it.
- Python dateutil's `byeaster` is [documented by dateutil itself as an extension "outside RFC"](https://dateutil.readthedocs.io/en/stable/rrule.html).
- The existence of [a repository of approximating RRULEs valid only for 1900–2099](https://github.com/sappjw/calendars)
  is itself evidence that the rule cannot be written.

## Writing it in Kairos

Transcribe the Western-church (Gregorian) Computus — the Anonymous Gregorian algorithm — directly
into value functions. Only `div`, `mod`, and projections (`year`, `month`, `ordinalIn`); no
dependency on calendar data:

```kairos
# eval: 2024-01-01..2029-01-01 tz: UTC
premise W {
  calendar-system: Gregorian
  tz: "UTC"
  wkst: Mon
}
@W
a = y => y mod 19
b = y => y div 100
h = y => (19*a(y) + b(y) - b(y) div 4 - (b(y) - (b(y)+8) div 25 + 1) div 3 + 15) mod 30
l = y => (32 + 2*(b(y) mod 4) + 2*((y mod 100) div 4) - h(y) - (y mod 100) mod 4) mod 7
m = y => (a(y) + 11*h(y) + 22*l(y)) div 451
eMonth = y => (h(y) + l(y) - 7*m(y) + 114) div 31
eDay   = y => ((h(y) + l(y) - 7*m(y) + 114) mod 31) + 1
everyDay |> filter(d => month(d) == eMonth(year(d)) and ordinalIn(day, month, d) == eDay(year(d)))
#=> 2024-03-31 2025-04-20 2026-04-05 2027-03-28 2028-04-16
```

All five years match the publicly known Easter dates. Related days such as Good Friday and Easter
Monday are just `shift(±n, unit: day)` applied to this stream — being able to **feed a derived
stream into the next rule** (closure) is what lets the whole family of related movable feasts grow
one definition at a time.

## Scope, stated explicitly

This is the **Western-church, Gregorian-calendar** computation. The Orthodox Easter (based on the
Julian calendar) is different arithmetic, and in either tradition **the official liturgical
calendar is upstream** — this recipe transcribes a rule; it does not replace the authority that
sets the dates. Days decided by official announcement rather than by rule (national holiday
practice, for example) are properly handled by bringing in data (`external`, `covering:`/`asof:`),
not by arithmetic.

## Try it in your browser

[Run it in the Playground](https://kairos-lang.org/en/playground/#s=cHJlbWlzZSBXIHsKICBjYWxlbmRhci1zeXN0ZW06IEdyZWdvcmlhbgogIHR6OiAiVVRDIgogIHdrc3Q6IE1vbgp9CgpAVwphID0geSA9PiB5IG1vZCAxOQpiID0geSA9PiB5IGRpdiAxMDAKaCA9IHkgPT4gKDE5KmEoeSkgKyBiKHkpIC0gYih5KSBkaXYgNCAtIChiKHkpIC0gKGIoeSkrOCkgZGl2IDI1ICsgMSkgZGl2IDMgKyAxNSkgbW9kIDMwCmwgPSB5ID0-ICgzMiArIDIqKGIoeSkgbW9kIDQpICsgMiooKHkgbW9kIDEwMCkgZGl2IDQpIC0gaCh5KSAtICh5IG1vZCAxMDApIG1vZCA0KSBtb2QgNwptID0geSA9PiAoYSh5KSArIDExKmgoeSkgKyAyMipsKHkpKSBkaXYgNDUxCmVNb250aCA9IHkgPT4gKGgoeSkgKyBsKHkpIC0gNyptKHkpICsgMTE0KSBkaXYgMzEKZURheSAgID0geSA9PiAoKGgoeSkgKyBsKHkpIC0gNyptKHkpICsgMTE0KSBtb2QgMzEpICsgMQpldmVyeURheSB8PiBmaWx0ZXIoZCA9PiBtb250aChkKSA9PSBlTW9udGgoeWVhcihkKSkgYW5kIG9yZGluYWxJbihkYXksIG1vbnRoLCBkKSA9PSBlRGF5KHllYXIoZCkpKQ&f=2024-01-01&t=2029-01-01&z=UTC)
— widen the evaluation range to check any year.

## Related

- The line between "days written by rule" and "days set by official announcement":
  [study 11's three-way classification](../design/40-examples/11-impossible-schedules.md)
- Vocabulary: [`filter`](../reference/filter.md) · [`ordinalIn`](../reference/ordinalIn.md) ·
  value functions in the [spec §3](../spec/20-premise-layer.md)
- Bringing in astronomical/observed dates (equinox holidays etc.) as data:
  [`external`](../reference/external.md)
