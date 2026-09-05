# 米国の選挙日・ブラックフライデー・感謝祭の次の日曜——計算で決まる日を基準にした相対日

米国の**選挙日**は「11 月の第 1 月曜の翌日の火曜」、**感謝祭**は「11 月の第 4 木曜」、**ブラックフライデー**は
その翌日、**サイバーマンデー**はその次の月曜。どれも「別の規則で決まる日から n 日」という形で、法律や慣習は
その順に言葉で定義している。Kairos ではその言葉の順にそのまま書ける——先に決まる日を導き、その列を次の
規則の入力にする（閉包）。

## 既存の繰り返し規則で何が起きるか

- RRULE には「別規則の日 + n 日」が無い。選挙日は `BYDAY=TU;BYMONTHDAY=2,3,4,5,6,7,8`（火曜で、かつ 2〜8 日）
  という**意図の消えた符号化**でしか書けない——読んだ人が「第 1 月曜の翌日」に戻せない。
- 「感謝祭の次の日曜」は月を跨ぐ年（2024 年は 12/1）があり、[BYYEARDAY の負値で数えるハックは月跨ぎで破綻する](https://stackoverflow.com/questions/72777808/rrule-and-ical-complex-recurrence)。
- cron は曜日と日を OR で結ぶため、この種の条件はそもそも書けない（[レシピ: 月末最終営業日](cron-last-day-of-month.md) の冒頭を参照）。

## Kairos で書く——法律の言葉の順に

**選挙日**＝「11 月の第 1 月曜」を年の窓で選び、その翌日:

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

連邦選挙は偶数年だけなので、年の射影で絞れば「連邦選挙日」になる（奇数年は州・地方の選挙日）:

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

**ブラックフライデー**＝感謝祭（11 月の第 4 木曜）の翌日。感謝祭を束縛しておけば一行:

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

**サイバーマンデー**＝感謝祭の 4 日後:

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

**感謝祭の次の日曜**＝感謝祭から日曜へ前方ロール。2024 年は 12/1——**月跨ぎが正しく出る**（導いた列を次の
規則の入力にしているので、月の境界は関係ない）:

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

## 射程の明示

- 選挙日の定義は連邦法（2 U.S.C. §7・3 U.S.C. §1）の「11 月の第 1 月曜の次の火曜」。感謝祭は 5 U.S.C. §6103 の
  「11 月の第 4 木曜」。ブラックフライデーとサイバーマンデーは法定休日ではなく小売の慣習。
- 州・地方の選挙日や早期投票期間は州法で別に決まる——本ページの式は連邦の定義だけを扱う。
- 例の premise は米国東部時間。日付だけの定義なので tz は結果を変えない（Playground の表示 tz と揃えてある）。

## ブラウザで試す

[選挙日](https://kairos-lang.org/playground/#s=cHJlbWlzZSBVUyB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTmV3X1lvcmsiCiAgd2tzdDogU3VuCn0KQFVTCmZpcnN0TW9uTm92ID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBNb24gYW5kIG1vbnRoKGQpID09IDExKSB8PiB3aXRoaW4oeWVhcikgfD4gZmlyc3QKZmlyc3RNb25Ob3YgfD4gc2hpZnQoKzEsIHVuaXQ6IGRheSk&f=2024-01-01&t=2029-01-01&z=America%2FNew_York)・
[ブラックフライデー](https://kairos-lang.org/playground/#s=cHJlbWlzZSBVUyB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTmV3X1lvcmsiCiAgd2tzdDogU3VuCn0KQFVTCnRoYW5rc2dpdmluZyA9IGV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgPT0gVGh1IGFuZCBtb250aChkKSA9PSAxMSkgfD4gd2l0aGluKG1vbnRoKSB8PiBudGgoNCkKdGhhbmtzZ2l2aW5nIHw-IHNoaWZ0KCsxLCB1bml0OiBkYXkp&f=2024-01-01&t=2028-01-01&z=America%2FNew_York)・
[サイバーマンデー](https://kairos-lang.org/playground/#s=cHJlbWlzZSBVUyB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTmV3X1lvcmsiCiAgd2tzdDogU3VuCn0KQFVTCnRoYW5rc2dpdmluZyA9IGV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgPT0gVGh1IGFuZCBtb250aChkKSA9PSAxMSkgfD4gd2l0aGluKG1vbnRoKSB8PiBudGgoNCkKdGhhbmtzZ2l2aW5nIHw-IHNoaWZ0KCs0LCB1bml0OiBkYXkp&f=2024-01-01&t=2028-01-01&z=America%2FNew_York)・
[感謝祭の次の日曜](https://kairos-lang.org/playground/#s=cHJlbWlzZSBVUyB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTmV3X1lvcmsiCiAgd2tzdDogU3VuCn0KQFVTCnRoYW5rc2dpdmluZyA9IGV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgPT0gVGh1IGFuZCBtb250aChkKSA9PSAxMSkgfD4gd2l0aGluKG1vbnRoKSB8PiBudGgoNCkKdGhhbmtzZ2l2aW5nIHw-IHJvbGwoRm9sbG93aW5nLCBvbjogKGV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgPT0gU3VuKSkp&f=2024-01-01&t=2028-01-01&z=America%2FNew_York)

## 関連

- データゼロの純算術で決まる移動祝日: [イースター](easter-schedule.md)
- 点を動かす語彙: [`shift`](../reference/shift.md)・[`roll`](../reference/roll.md)・窓の中で選ぶ: [`within`](../reference/within.md)・[`nth`](../reference/nth.md)
- 「書けない」と言われてきた要求のカタログ: [調査研究 11 (f)](../design/40-examples/11-impossible-schedules.md)
