---
source_sha: 22577ae1835d
---

# Non-delivery days and arrival dates — a logistics business-day calendar from one definition

> Translated from the canonical Japanese page
> [recipes/logistics-delivery.md](../../recipes/logistics-delivery.md).

A page for IT departments in logistics and e-commerce: people who maintain the "business-day master" and the
"non-delivery-day master" that a WMS, a TMS or an order-management system reads. Instead of filling those
tables by hand every year, generate them from rules and a holiday table, and run the yearly update as
regenerate-and-compare. You do not need to read the language specification.

Kairos does not replace a WMS or a TMS. It splits the roles: **which days are business days, and on which
day a shipment arrives** come out of a definition in Kairos; orders, stock and vehicle dispatch stay in the
systems you already have. Results are handed to the masters as tab-separated values (TSV)
([Handing it to the master](#handing-it-to-the-master-tsv)).

The authority on non-delivery days is the
carrier's official notice ([Upstream authority stays upstream](#upstream-authority-stays-upstream)).
The rules on this page are typical ones from public information; they differ from company to company.

## At a glance

| Requirement | Rule (typical) | Kairos |
|---|---|---|
| Non-delivery days | Sundays, national holidays, year-end 12/30–1/3, Obon 8/13–8/15 | the union of `sunday`, the holiday table and the company's closures |
| Business days (shipping and delivering) | every day that is not a non-delivery day | `everyDay` minus the non-delivery days |
| Arrival date | ship date + N business days (nearby 1, distant 2, remote islands 3 or more) | `shift(+N, unit: deliveryDay)` |
| Order cutoff | 15:00 on business days; later orders ship on the next business day | `at(T15:00)` |
| Scheduled pickup | every Tuesday and Friday; the next business day if it is a non-delivery day | `filter` and `roll(Following)` |
| Stocktaking | last business day of the month | `within(month)` and `last` |
| Year-end band | list 12/26–1/7 and send it around | `list --from --to` |

## Preamble — the holiday table and the company's closures

Three ingredients. Sundays are a rule; national holidays are a table; the company's own closures (year-end
and Obon) are a table too. Closures are decided year by year, so they go in a table, not in a rule.

(`@JP` in the block below is the doctest's standard premise, with `holidays2026` and `bizDay` included. To run it yourself, use the self-contained form behind the "▶ Open in Playground" link — see [recipes/README](README.md).)

```kairos
# 営業日（日祝・年末年始・お盆を除く）
# eval: 2026-01-01..2026-01-11
premise JP {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  wkst: Mon
}

@JP
holidays2026 = [2026-01-01, 2026-01-12, 2026-02-11, 2026-02-23, 2026-03-20,
                2026-04-29, 2026-05-03, 2026-05-04, 2026-05-05, 2026-05-06,
                2026-07-20, 2026-08-11, 2026-09-21, 2026-09-22, 2026-09-23,
                2026-10-12, 2026-11-03, 2026-11-23] covering: 2026..2026
closed = [2026-01-01..2026-01-03, 2026-08-13..2026-08-15, 2026-12-30..2026-12-31] covering: 2026..2026
sunday = everyDay |> filter(d => weekday(d) == Sun)
noDelivery = sunday | holidays2026 | closed
deliveryDay = everyDay \ noDelivery

deliveryDay
#=> 2026-01-05 2026-01-06 2026-01-07 2026-01-08 2026-01-09 2026-01-10
```

- The `# eval:` and `#=>` lines are verification comments for this site; you may delete them. The first
  comment line is the Japanese title of the definition ("business days, excluding Sundays, holidays,
  year-end and Obon"); you may delete it too.

- `2026-01-01..2026-01-11` means January 1 through January 10: the right end, 1/11, is excluded. Every
  range on this page reads the same way.
- `holidays2026` is Japan's 18 national holidays of 2026 (including the substitute holiday on 5/6 and the
  Citizens' Holiday on 9/22). `covering: 2026..2026` is "the range in which this table is valid".

- `closed` is the company's closures. `2026-01-01..2026-01-03` is shorthand for consecutive days.
- 1/1–1/3 are closures, 1/4 is a Sunday, 1/10 (Sat) is a business day.

If Saturdays are non-delivery days too, replace the `sunday` line with
`satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)` and put `satSun` in place of
`sunday` in `noDelivery`.

The examples below omit `premise JP` and `holidays2026` (in this site's verification, a standard premise
carrying the 2026 holiday table is prepended automatically). When you run them yourself, put the preamble
above the expression.

## Non-delivery days and business days

Non-delivery days in August: the three Obon days, Mountain Day (8/11) and the Sundays:

```kairos
# eval: 2026-08-01..2026-09-01
@JP
closed = [2026-01-01..2026-01-03, 2026-08-13..2026-08-15, 2026-12-30..2026-12-31] covering: 2026..2026
sunday = everyDay |> filter(d => weekday(d) == Sun)
noDelivery = sunday | holidays2026 | closed
noDelivery
#=> 2026-08-02 2026-08-09 2026-08-11 2026-08-13 2026-08-14 2026-08-15 2026-08-16 2026-08-23 2026-08-30
```

Business days are `deliveryDay` (`everyDay \ noDelivery`). For a whole year, make the range
`2026-01-01..2027-01-01` (2026 has 289 of them).

## Arrival date = ship date + N business days

Arrival dates are counted on the business-day scale. `shift(+N, unit: deliveryDay)` is "N steps ahead in
business days". For shipments on 4/30 (Thu), 5/1 (Fri) and 5/2 (Sat), just before Golden Week, to a nearby
prefecture (1 business day):

```kairos
# eval: 2026-04-27..2026-05-16
@JP
closed = [2026-01-01..2026-01-03, 2026-08-13..2026-08-15, 2026-12-30..2026-12-31] covering: 2026..2026
sunday = everyDay |> filter(d => weekday(d) == Sun)
noDelivery = sunday | holidays2026 | closed
deliveryDay = everyDay \ noDelivery
shipped = [2026-04-30, 2026-05-01, 2026-05-02] covering: 2026..2026
shipped |> shift(+1, unit: deliveryDay)
#=> 2026-05-01 2026-05-02 2026-05-07
```

For distant regions (2 business days), only the number changes:

```kairos
# eval: 2026-04-27..2026-05-16
@JP
closed = [2026-01-01..2026-01-03, 2026-08-13..2026-08-15, 2026-12-30..2026-12-31] covering: 2026..2026
sunday = everyDay |> filter(d => weekday(d) == Sun)
noDelivery = sunday | holidays2026 | closed
deliveryDay = everyDay \ noDelivery
shipped = [2026-04-30, 2026-05-01, 2026-05-02] covering: 2026..2026
shipped |> shift(+2, unit: deliveryDay)
#=> 2026-05-02 2026-05-07 2026-05-08
```

A shipment on 5/2 (Sat) arrives on 5/7 (Thu) even nearby, because 5/3–5/6 are non-delivery days. Distant
regions get 5/8. Remote islands are `+3`.

When you start from the order date, an order on a non-delivery day ships on the next business day, and the
count starts there. Put `roll(Following, on: deliveryDay)` first:

```kairos
# eval: 2026-04-27..2026-05-16
@JP
closed = [2026-01-01..2026-01-03, 2026-08-13..2026-08-15, 2026-12-30..2026-12-31] covering: 2026..2026
sunday = everyDay |> filter(d => weekday(d) == Sun)
noDelivery = sunday | holidays2026 | closed
deliveryDay = everyDay \ noDelivery
orders = [2026-05-02, 2026-05-03, 2026-05-04] covering: 2026..2026
orders |> roll(Following, on: deliveryDay) |> shift(+1, unit: deliveryDay)
#=> 2026-05-07 2026-05-08
```

An order on 5/2 (Sat) ships on 5/2 and arrives on 5/7. Orders on 5/3 (Sun) and 5/4 (holiday) both ship on
5/7 and arrive on 5/8. The result is a set of dates, so two orders that land on the same arrival date become
one point (the per-order mapping is looked up one order at a time on the order-system side).

`shift(unit: deliveryDay)` stops with an error when its input is not a business day, so keep `roll` first.

## Order cutoff (15:00)

Orders up to 15:00 ship the same day; orders after 15:00 ship on the next business day. Write the cutoff as
the sequence of points "15:00 on business days":

```kairos
# eval: 2026-04-30..2026-05-09
@JP
closed = [2026-01-01..2026-01-03, 2026-08-13..2026-08-15, 2026-12-30..2026-12-31] covering: 2026..2026
sunday = everyDay |> filter(d => weekday(d) == Sun)
noDelivery = sunday | holidays2026 | closed
deliveryDay = everyDay \ noDelivery
deliveryDay |> at(T15:00)
#=> 2026-04-30T15:00 2026-05-01T15:00 2026-05-02T15:00 2026-05-07T15:00 2026-05-08T15:00
```

- The cutoff points cut the time axis into windows. Orders between one cutoff and the next ship on the day
  of the next cutoff. An order at 15:30 on 5/2 (Sat) falls in the window of the next cutoff, 5/7 15:00, so
  it ships on 5/7.

- Which side 15:00 exactly belongs to is the company's rule. Here we read "exactly 15:00 ships on the next
  business day", so every window includes its earlier cutoff and excludes its later one (the same reading
  as the `# eval:` range).

- Which window an order falls in is looked up on the receiving side as "the first cutoff at or after the
  order time" (`XLOOKUP` with "next larger item" in Excel; in SQL, the smallest row whose cutoff is at or
  after the order time). Once the ship date is known, the arrival date is the `shift` above.
- `at` takes only a time of day. In the TSV, the `time` column holds `15:00`.

## Scheduled pickup (every Tuesday and Friday; the next business day if it is a non-delivery day)

Build it from weekdays, then move any non-delivery day forward to the next business day. Around the long
weekend in September (9/21 Respect for the Aged Day, 9/22 Citizens' Holiday, 9/23 Autumnal Equinox Day):

```kairos
# eval: 2026-09-14..2026-10-01
@JP
closed = [2026-01-01..2026-01-03, 2026-08-13..2026-08-15, 2026-12-30..2026-12-31] covering: 2026..2026
sunday = everyDay |> filter(d => weekday(d) == Sun)
noDelivery = sunday | holidays2026 | closed
deliveryDay = everyDay \ noDelivery
pickup = everyDay |> filter(d => weekday(d) == Tue or weekday(d) == Fri)
pickup |> roll(Following, on: deliveryDay)
#=> 2026-09-15 2026-09-18 2026-09-24 2026-09-25 2026-09-29
```

9/22 (Tue) moves to 9/24 (Thu), because 9/23 is a holiday as well. 9/25 (Fri) stays. `roll` does not move
a point that is already a business day.

## Month-end stocktaking (last business day of the month)

```kairos
# eval: 2026-01-01..2027-01-01
@JP
closed = [2026-01-01..2026-01-03, 2026-08-13..2026-08-15, 2026-12-30..2026-12-31] covering: 2026..2026
sunday = everyDay |> filter(d => weekday(d) == Sun)
noDelivery = sunday | holidays2026 | closed
deliveryDay = everyDay \ noDelivery
deliveryDay |> within(month) |> last
#=> 2026-01-31 2026-02-28 2026-03-31 2026-04-30 2026-05-30 2026-06-30
#=> 2026-07-31 2026-08-31 2026-09-30 2026-10-31 2026-11-30 2026-12-29
```

Saturdays are business days, so 1/31 (Sat) and 10/31 (Sat) stay. May gives 5/30 (Sat), just before 5/31
(Sun). December gives 12/29 (Tue), because 12/30–31 are closures.

## The year-end band (12/26–1/7)

The band for the "year-end and New Year business days" notice sent out in December. List 12/26 through 1/7:

```kairos
# eval: 2026-12-26..2027-01-08
@JP
closed = [2026-01-01..2026-01-03, 2026-08-13..2026-08-15, 2026-12-30..2026-12-31] covering: 2026..2026
sunday = everyDay |> filter(d => weekday(d) == Sun)
noDelivery = sunday | holidays2026 | closed
deliveryDay = everyDay \ noDelivery
deliveryDay
#=> 2026-12-26 2026-12-28 2026-12-29 2027-01-01 2027-01-02 2027-01-04 2027-01-05 2027-01-06 2027-01-07
#~> 範囲外 2027-01-01..2027-01-08（holidays2026 covering 2026-01-01..2026-12-31）
#~> 範囲外 2027-01-01..2027-01-08（closed covering 2026-01-01..2026-12-31）
```

12/30 and 12/31 are closures. **2027-01-01 and 01-02 come out as business days**, because both the holiday
table and the closure table end at 2026. The two lines under the points say so: `範囲外` means "out of
coverage".

In the CLI they appear as `# ⚠ 範囲外 …` lines, and the runway in the coverage summary
goes negative (`--lang en` puts the framing in English; the annotation text itself stays Japanese).

The points come out, but they come out without knowing the table. Extend the tables before sending this band.

Extending the tables means adding the 2027 rows and setting `covering:` to `2026..2027`:

```kairos
# 営業日（2027 年まで延ばした表）
# eval: 2026-12-26..2027-01-08
premise JP {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  wkst: Mon
}

@JP
holidays = [2026-01-01, 2026-01-12, 2026-02-11, 2026-02-23, 2026-03-20,
            2026-04-29, 2026-05-03, 2026-05-04, 2026-05-05, 2026-05-06,
            2026-07-20, 2026-08-11, 2026-09-21, 2026-09-22, 2026-09-23,
            2026-10-12, 2026-11-03, 2026-11-23,
            2027-01-01, 2027-01-11, 2027-02-11, 2027-02-23, 2027-03-21,
            2027-03-22, 2027-04-29, 2027-05-03, 2027-05-04, 2027-05-05,
            2027-07-19, 2027-08-11, 2027-09-20, 2027-09-23, 2027-10-11,
            2027-11-03, 2027-11-23] covering: 2026..2027
closed = [2026-01-01..2026-01-03, 2026-08-13..2026-08-15, 2026-12-30..2026-12-31,
          2027-01-01..2027-01-03] covering: 2026..2027
sunday = everyDay |> filter(d => weekday(d) == Sun)
noDelivery = sunday | holidays | closed
deliveryDay = everyDay \ noDelivery

deliveryDay
#=> 2026-12-26 2026-12-28 2026-12-29 2027-01-04 2027-01-05 2027-01-06 2027-01-07
```

The annotations disappear, and 1/4 (Mon) becomes the first business day of the year (the first comment line
is the Japanese title, "business days, with the tables extended through 2027"). Keep the year out of the
table's name (`holidays`) and the expression needs no edit each time the table is extended.

Next year's holidays are copied from the Cabinet Office announcement (every February). When to update, where
the data comes from and the steps are in the [maintenance guide](../../MAINTENANCE.md) (Japanese, with an
English summary).

## Handing it to the master (TSV)

`--tsv` (from 1.0.10) writes the results as tab-separated values, one point per line. Put two body
expressions in one file and the `expr` column distinguishes them as 1 and 2, so the business-day master and
the non-delivery-day master come out in one run. End the preamble with the two lines `deliveryDay` and
`noDelivery`:

```text
kairos list --tsv --from 2026-01-01 --to 2027-01-01 --tz Asia/Tokyo delivery.kairos > delivery.tsv
```

- `date` is the date; `time` is filled only for definitions that carry a time of day, such as the cutoff.
  `note` is the annotation text when the point falls in an interval "outside the table"; empty means the
  computation stayed inside the table. Annotations, the coverage summary and warnings go to standard error,
  so they do not get mixed into the file.

- Match `--tz` to the tz in the definition. If they differ, the dates come out with a time of day.

- Importing into Excel ("Data → From Text/CSV", UTF-8, Tab) and how to read the columns:
  [Schedules that are hard to write with Excel's WORKDAY and EOMONTH](excel-workday.md#handing-it-to-excel-tsv).
  For a daily check in PowerShell, use `--json` ([Kairos for Windows administrators](windows-admin.md)).

The yearly update: extend the tables, run the same command again, and diff against the old master. If the
difference is "only the rows of the added year", the check is done.

## Pitfalls

| Pitfall | What happens | What to do |
|---|---|---|
| Company differences | Some carriers deliver on Sundays and holidays. Saturday non-delivery, the Obon dates and the length of the year-end closure also differ by company | `satSun` in place of `sunday`; the `closed` rows exactly as the official notice says |
| Outside the table | Points still come out past the end of the table (without knowing the holidays). `⚠ 範囲外` and a negative runway tell you | Extend the table, including the end of `covering:` |
| Forgetting the yearly update | Every range that reaches into next year shows `⚠` and a negative runway | Add next year's rows every February ([maintenance guide](../../MAINTENANCE.md)) |
| `shift` fed a non-delivery day | `unit: deliveryDay` stops with an error when the input is not a business day | `roll(Following, on: deliveryDay)` first |
| The edge of the evaluation range | A point that `shift` moves outside the range does not come out (`window-clip` warning) | Widen the range by N business days |
| `roll(Following)` and the year-end | Listing a whole year raises `⚠` from 12/29 on (the next business day could fall outside the table) | The points themselves are correct. Extending the table removes it |
| `at` and the outside of the table | A point that falls outside the table disappears under `at`, leaving only the annotation | Extend the table before crossing the year. Evaluate inside the table |
| No `--tz` | Printed in the machine's tz; dates may come out with a time of day | `--tz Asia/Tokyo`, matching the tz in the definition |

## Upstream authority stays upstream

- The authority on non-delivery days is the carrier's official notice. Year-end and Obon non-delivery
  periods are announced every year, and both the dates and the length change from year to year. The
  12/30–1/3 and 8/13–8/15 on this page are typical examples; once the notice is out, set the `closed` rows
  exactly as it says.

- The authority on national holidays is the Cabinet Office ("National Holidays"). The expression only reads
  the table; it does not decide holidays.

- The authority on arrival dates is the carrier's service (days by region, remote islands, delays in peak
  season or bad weather). What `shift(+N)` gives is the scheduled date "if the rule holds"; delays are
  outside the expression.
- Kairos does not replace a WMS, a TMS or an order-management system. It produces "which days" from a
  definition and hands them to the master; that is where it stops.

## Try it in your browser

Self-contained forms (premise included; the holiday table and the closures inside the expression).
Everything runs in the browser; nothing is sent anywhere:

- [Business days (2026, 289 points)](https://kairos-lang.org/en/playground/#s=IyBCdXNpbmVzcyBkYXlzIChleGNsdWRpbmcgU3VuZGF5cywgaG9saWRheXMsIHllYXItZW5kIGFuZCBPYm9uKQpwcmVtaXNlIEpQIHsKICBjYWxlbmRhci1zeXN0ZW06IEdyZWdvcmlhbgogIHR6OiAiQXNpYS9Ub2t5byIKICB3a3N0OiBNb24KfQoKQEpQCmhvbGlkYXlzMjAyNiA9IFsyMDI2LTAxLTAxLCAyMDI2LTAxLTEyLCAyMDI2LTAyLTExLCAyMDI2LTAyLTIzLCAyMDI2LTAzLTIwLAogICAgICAgICAgICAgICAgMjAyNi0wNC0yOSwgMjAyNi0wNS0wMywgMjAyNi0wNS0wNCwgMjAyNi0wNS0wNSwgMjAyNi0wNS0wNiwKICAgICAgICAgICAgICAgIDIwMjYtMDctMjAsIDIwMjYtMDgtMTEsIDIwMjYtMDktMjEsIDIwMjYtMDktMjIsIDIwMjYtMDktMjMsCiAgICAgICAgICAgICAgICAyMDI2LTEwLTEyLCAyMDI2LTExLTAzLCAyMDI2LTExLTIzXSBjb3ZlcmluZzogMjAyNi4uMjAyNgpjbG9zZWQgPSBbMjAyNi0wMS0wMS4uMjAyNi0wMS0wMywgMjAyNi0wOC0xMy4uMjAyNi0wOC0xNSwgMjAyNi0xMi0zMC4uMjAyNi0xMi0zMV0gY292ZXJpbmc6IDIwMjYuLjIwMjYKc3VuZGF5ID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBTdW4pCm5vRGVsaXZlcnkgPSBzdW5kYXkgfCBob2xpZGF5czIwMjYgfCBjbG9zZWQKZGVsaXZlcnlEYXkgPSBldmVyeURheSBcIG5vRGVsaXZlcnkKIyBTd2FwIHRoZSBsYXN0IGxpbmUgdG8gdHJ5IHRoZSBvdGhlcnM6CiMgICBub0RlbGl2ZXJ5ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIOKApiBub24tZGVsaXZlcnkgZGF5cwojICAgZGVsaXZlcnlEYXkgfD4gd2l0aGluKG1vbnRoKSB8PiBsYXN0ICAgICAgICDigKYgbW9udGgtZW5kIHN0b2NrdGFraW5nIChsYXN0IGJ1c2luZXNzIGRheSBvZiB0aGUgbW9udGgpCmRlbGl2ZXJ5RGF5Cg&f=2026-01-01&t=2027-01-01&z=Asia%2FTokyo)
  — swap in the non-delivery days or the month-end stocktaking from the comments.
- [Arrival date (distant region, ship date + 2 business days)](https://kairos-lang.org/en/playground/#s=IyBBcnJpdmFsIGRhdGUgKGRpc3RhbnQgcmVnaW9uID0gc2hpcCBkYXRlICsgMiBidXNpbmVzcyBkYXlzKQpwcmVtaXNlIEpQIHsKICBjYWxlbmRhci1zeXN0ZW06IEdyZWdvcmlhbgogIHR6OiAiQXNpYS9Ub2t5byIKICB3a3N0OiBNb24KfQoKQEpQCmhvbGlkYXlzMjAyNiA9IFsyMDI2LTAxLTAxLCAyMDI2LTAxLTEyLCAyMDI2LTAyLTExLCAyMDI2LTAyLTIzLCAyMDI2LTAzLTIwLAogICAgICAgICAgICAgICAgMjAyNi0wNC0yOSwgMjAyNi0wNS0wMywgMjAyNi0wNS0wNCwgMjAyNi0wNS0wNSwgMjAyNi0wNS0wNiwKICAgICAgICAgICAgICAgIDIwMjYtMDctMjAsIDIwMjYtMDgtMTEsIDIwMjYtMDktMjEsIDIwMjYtMDktMjIsIDIwMjYtMDktMjMsCiAgICAgICAgICAgICAgICAyMDI2LTEwLTEyLCAyMDI2LTExLTAzLCAyMDI2LTExLTIzXSBjb3ZlcmluZzogMjAyNi4uMjAyNgpjbG9zZWQgPSBbMjAyNi0wMS0wMS4uMjAyNi0wMS0wMywgMjAyNi0wOC0xMy4uMjAyNi0wOC0xNSwgMjAyNi0xMi0zMC4uMjAyNi0xMi0zMV0gY292ZXJpbmc6IDIwMjYuLjIwMjYKc3VuZGF5ID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBTdW4pCm5vRGVsaXZlcnkgPSBzdW5kYXkgfCBob2xpZGF5czIwMjYgfCBjbG9zZWQKZGVsaXZlcnlEYXkgPSBldmVyeURheSBcIG5vRGVsaXZlcnkKc2hpcHBlZCA9IFsyMDI2LTA0LTMwLCAyMDI2LTA1LTAxLCAyMDI2LTA1LTAyXSBjb3ZlcmluZzogMjAyNi4uMjAyNgojIENoYW5nZSB0byArMSBmb3IgbmVhcmJ5IHByZWZlY3R1cmVzLCArMyBmb3IgcmVtb3RlIGlzbGFuZHMKc2hpcHBlZCB8PiBzaGlmdCgrMiwgdW5pdDogZGVsaXZlcnlEYXkpCg&f=2026-04-27&t=2026-05-16&z=Asia%2FTokyo)
  — the 3 points above come out. Change it to `+1` or `+3`.

- [Order cutoff (15:00 on business days)](https://kairos-lang.org/en/playground/#s=IyBPcmRlciBjdXRvZmYgKDE1OjAwIG9uIGJ1c2luZXNzIGRheXMpCnByZW1pc2UgSlAgewogIGNhbGVuZGFyLXN5c3RlbTogR3JlZ29yaWFuCiAgdHo6ICJBc2lhL1Rva3lvIgogIHdrc3Q6IE1vbgp9CgpASlAKaG9saWRheXMyMDI2ID0gWzIwMjYtMDEtMDEsIDIwMjYtMDEtMTIsIDIwMjYtMDItMTEsIDIwMjYtMDItMjMsIDIwMjYtMDMtMjAsCiAgICAgICAgICAgICAgICAyMDI2LTA0LTI5LCAyMDI2LTA1LTAzLCAyMDI2LTA1LTA0LCAyMDI2LTA1LTA1LCAyMDI2LTA1LTA2LAogICAgICAgICAgICAgICAgMjAyNi0wNy0yMCwgMjAyNi0wOC0xMSwgMjAyNi0wOS0yMSwgMjAyNi0wOS0yMiwgMjAyNi0wOS0yMywKICAgICAgICAgICAgICAgIDIwMjYtMTAtMTIsIDIwMjYtMTEtMDMsIDIwMjYtMTEtMjNdIGNvdmVyaW5nOiAyMDI2Li4yMDI2CmNsb3NlZCA9IFsyMDI2LTAxLTAxLi4yMDI2LTAxLTAzLCAyMDI2LTA4LTEzLi4yMDI2LTA4LTE1LCAyMDI2LTEyLTMwLi4yMDI2LTEyLTMxXSBjb3ZlcmluZzogMjAyNi4uMjAyNgpzdW5kYXkgPSBldmVyeURheSB8PiBmaWx0ZXIoZCA9PiB3ZWVrZGF5KGQpID09IFN1bikKbm9EZWxpdmVyeSA9IHN1bmRheSB8IGhvbGlkYXlzMjAyNiB8IGNsb3NlZApkZWxpdmVyeURheSA9IGV2ZXJ5RGF5IFwgbm9EZWxpdmVyeQpkZWxpdmVyeURheSB8PiBhdChUMTU6MDApCg&f=2026-04-30&t=2026-05-09&z=Asia%2FTokyo)
  — the 5 points above come out. "Add to calendar (.ics)" turns them into cutoff reminders.
- [Scheduled pickup (2026, 104 points)](https://kairos-lang.org/en/playground/#s=IyBTY2hlZHVsZWQgcGlja3VwIChldmVyeSBUdWVzZGF5IGFuZCBGcmlkYXk7IHRoZSBuZXh0IGJ1c2luZXNzIGRheSBpZiBpdCBpcyBhIG5vbi1kZWxpdmVyeSBkYXkpCnByZW1pc2UgSlAgewogIGNhbGVuZGFyLXN5c3RlbTogR3JlZ29yaWFuCiAgdHo6ICJBc2lhL1Rva3lvIgogIHdrc3Q6IE1vbgp9CgpASlAKaG9saWRheXMyMDI2ID0gWzIwMjYtMDEtMDEsIDIwMjYtMDEtMTIsIDIwMjYtMDItMTEsIDIwMjYtMDItMjMsIDIwMjYtMDMtMjAsCiAgICAgICAgICAgICAgICAyMDI2LTA0LTI5LCAyMDI2LTA1LTAzLCAyMDI2LTA1LTA0LCAyMDI2LTA1LTA1LCAyMDI2LTA1LTA2LAogICAgICAgICAgICAgICAgMjAyNi0wNy0yMCwgMjAyNi0wOC0xMSwgMjAyNi0wOS0yMSwgMjAyNi0wOS0yMiwgMjAyNi0wOS0yMywKICAgICAgICAgICAgICAgIDIwMjYtMTAtMTIsIDIwMjYtMTEtMDMsIDIwMjYtMTEtMjNdIGNvdmVyaW5nOiAyMDI2Li4yMDI2CmNsb3NlZCA9IFsyMDI2LTAxLTAxLi4yMDI2LTAxLTAzLCAyMDI2LTA4LTEzLi4yMDI2LTA4LTE1LCAyMDI2LTEyLTMwLi4yMDI2LTEyLTMxXSBjb3ZlcmluZzogMjAyNi4uMjAyNgpzdW5kYXkgPSBldmVyeURheSB8PiBmaWx0ZXIoZCA9PiB3ZWVrZGF5KGQpID09IFN1bikKbm9EZWxpdmVyeSA9IHN1bmRheSB8IGhvbGlkYXlzMjAyNiB8IGNsb3NlZApkZWxpdmVyeURheSA9IGV2ZXJ5RGF5IFwgbm9EZWxpdmVyeQpwaWNrdXAgPSBldmVyeURheSB8PiBmaWx0ZXIoZCA9PiB3ZWVrZGF5KGQpID09IFR1ZSBvciB3ZWVrZGF5KGQpID09IEZyaSkKcGlja3VwIHw-IHJvbGwoRm9sbG93aW5nLCBvbjogZGVsaXZlcnlEYXkpCg&f=2026-01-01&t=2027-01-01&z=Asia%2FTokyo)
  — one pair of `⚠` appears at the year-end (see `roll(Following)` and the year-end in the pitfalls table).

- [The year-end band (12/26–1/7, with `⚠`)](https://kairos-lang.org/en/playground/#s=IyBZZWFyLWVuZCBhbmQgTmV3IFllYXIgYnVzaW5lc3MgZGF5cyAo4pqgIGFwcGVhcnMgYmVjYXVzZSB0aGUgdGFibGVzIGVuZCBhdCAyMDI2KQpwcmVtaXNlIEpQIHsKICBjYWxlbmRhci1zeXN0ZW06IEdyZWdvcmlhbgogIHR6OiAiQXNpYS9Ub2t5byIKICB3a3N0OiBNb24KfQoKQEpQCmhvbGlkYXlzMjAyNiA9IFsyMDI2LTAxLTAxLCAyMDI2LTAxLTEyLCAyMDI2LTAyLTExLCAyMDI2LTAyLTIzLCAyMDI2LTAzLTIwLAogICAgICAgICAgICAgICAgMjAyNi0wNC0yOSwgMjAyNi0wNS0wMywgMjAyNi0wNS0wNCwgMjAyNi0wNS0wNSwgMjAyNi0wNS0wNiwKICAgICAgICAgICAgICAgIDIwMjYtMDctMjAsIDIwMjYtMDgtMTEsIDIwMjYtMDktMjEsIDIwMjYtMDktMjIsIDIwMjYtMDktMjMsCiAgICAgICAgICAgICAgICAyMDI2LTEwLTEyLCAyMDI2LTExLTAzLCAyMDI2LTExLTIzXSBjb3ZlcmluZzogMjAyNi4uMjAyNgpjbG9zZWQgPSBbMjAyNi0wMS0wMS4uMjAyNi0wMS0wMywgMjAyNi0wOC0xMy4uMjAyNi0wOC0xNSwgMjAyNi0xMi0zMC4uMjAyNi0xMi0zMV0gY292ZXJpbmc6IDIwMjYuLjIwMjYKc3VuZGF5ID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBTdW4pCm5vRGVsaXZlcnkgPSBzdW5kYXkgfCBob2xpZGF5czIwMjYgfCBjbG9zZWQKZGVsaXZlcnlEYXkgPSBldmVyeURheSBcIG5vRGVsaXZlcnkKIyBBZGQgdGhlIDIwMjcgcm93cyB0byBib3RoIHRhYmxlcyBhbmQgc2V0IGNvdmVyaW5nOiAyMDI2Li4yMDI3LCBhbmQgdGhlIOKaoCBnb2VzIGF3YXkKZGVsaXZlcnlEYXkK&f=2026-12-26&t=2027-01-08&z=Asia%2FTokyo)
  — the 9 points above and the 2 annotations come out. Extend the tables as the comment says and they disappear.

## Related

- Last business day of the month, payment on the 25th and the Nth business day side by side with Excel formulas:
  [Schedules that are hard to write with Excel's WORKDAY and EOMONTH](excel-workday.md)

- Asking "is today a shipping day?" automatically every morning (Task Scheduler, cron):
  [Kairos for Windows administrators](windows-admin.md) · [Last day of the month](cron-last-day-of-month.md)

- Extending the example holiday table every year, with sources: [maintenance guide](../../MAINTENANCE.md) (Japanese, with an English summary)

Vocabulary and where the specification is:

- Vocabulary: [`filter`](../reference/filter.md) · [`roll`](../reference/roll.md) · [`shift`](../reference/shift.md) · [`at`](../reference/at.md) ·
  [`within`](../reference/within.md) · [`last`](../reference/last.md) · [table literal](../reference/table-literal.md) (`covering:`, shorthand for consecutive days)

- Bringing in holiday data and its freshness (`covering:`, `asof:`): [spec §4.10](../spec/30-body-layer.md) · [`nonWorking` and `bizDay`](../reference/nonWorking.md)
