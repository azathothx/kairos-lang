# Windows Update の日（Patch Tuesday）——太平洋時間の第 2 火曜 10 時を、各地の時刻で

Microsoft の月例セキュリティ更新は**毎月第 2 火曜の 10:00 太平洋時間（PST/PDT）**に公開される
（[Microsoft Learn: Update release cycle for Windows clients](https://learn.microsoft.com/windows/deployment/update/release-cycle)。
「通常は」の但し書きつき。第 4 火曜は任意のプレビュー版、OOB〈臨時〉更新は随時）。世界中どこでも同じ一点なのに、
各地の暦では**日付も時刻も揺れる**——太平洋時間に夏時間があるからで、日本では水曜の 2 時か 3 時、ロンドンでは火曜の
18 時（3 月だけ 17 時）、シドニーでは水曜の 3〜5 時になる。

配信の有無と時刻の権威は Microsoft の告知にある。このページが扱うのは「公開予定の点を、定義 1 つから各地の時刻で
出す」ところまで。

## 既存の手段で何が起きるか

- cron は tz を持たない。「日本では第 2 水曜の 3 時」と読み替えて `0 3 8-14 * 3` と書くと、2026 年は 12 か月中
  10 か月が違う——夏時間で 1 時間ずれる月が 8 つ、さらに 4 月と 7 月は月が水曜始まりなので正解は**第 3 水曜**になり、
  丸 1 週間ずれる（下の誤り例）。
- iCalendar の RRULE は `DTSTART;TZID=America/Los_Angeles` に `FREQ=MONTHLY;BYDAY=2TU` で書ける。壊れるのは、
  その点を各地のスケジューラ（cron・タスクスケジューラ）へ手で翻訳するときで、翻訳は夏時間のたびにやり直しになる。
- Windows のタスク スケジューラは月次トリガーで「第 N 曜日」を選べる（`schtasks /sc monthly /mo SECOND /d TUE`）が、
  時刻は機械のローカル時刻か UTC（「タイム ゾーンをまたいで同期」）でしか持てない。東京の機械でローカル時刻のまま
  「第 2 水曜の 3 時」と登録すると、まず**日付が 4 月と 7 月に丸 1 週間ずれる**——公開は東京では水曜に落ちるが、月が
  水曜始まりの月は第 2 火曜の翌日が**第 3 水曜**になり、月次トリガーに「第 2 火曜の翌日」という形は無いので、単純な
  トリガー 1 本では書けない。夏時間の 1 時間は前後に余裕を持たせれば吸収できるが、1 週間は吸収できない。UTC 同期で
  「第 2 火曜の 17 時」と登録すれば日付は保てるが、今度は時刻が夏時間で 17 時／18 時に動く。
- グループ ポリシーの「自動更新を構成する」（自動ダウンロードしインストールを日時指定）が持つのは曜日と時刻（ローカル・
  既定は毎日 3 時）だけで、「第 2 火曜」も「公開の翌日」も書けない。Windows Update for Business の延期（品質更新は
  最大 30 日・リングの例は 0／5／10 日）は「公開日＋N 日」の相対で、下の相対日の節と同じ考え方——ただしそれは導入側の
  規則で、公開の点そのものを出すものではない（[Microsoft Learn: Group Policy で Windows Update を構成する](https://learn.microsoft.com/windows/deployment/update/waas-wufb-group-policy)）。
- 機械の tz を太平洋時間に合わせる運用は、定義側に tz を持てないことへの回避策——定義に tz が書ければ要らない。

## Kairos で書く

定義は太平洋時間で 1 つ。時刻は `at` で貼る（壁時計の 10:00 は夏時間を跨いでも保たれる）:

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

**同じ定義を日本時間で表示する**。`# eval:` の `tz:` は表示側の tz——定義は 1 文字も変えない
（CLI なら `--tz Asia/Tokyo`・Playground なら表示 tz の切り替え）:

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

1・2・11・12 月は 3 時、3〜10 月は 2 時。日付はつねに水曜だが、**4 月と 7 月は第 3 水曜**——月が水曜始まりなので、
第 2 火曜（14 日）の翌日は 3 つめの水曜になる。「第 2 水曜」と "second Tuesday" は同じ点を指さない。

ロンドンでは火曜の 18 時、3 月だけ 17 時（米国の夏時間入りは英国より 3 週間早い）:

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

シドニーでは南半球の夏時間が逆に効いて 3 段階（5 時・4 時・3 時）:

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

**誤り例——「日本では第 2 水曜の 3 時」と書き直す**。日本の premise で書き直した列は、上の正しい列と 1・2・11・12 月
しか一致しない（3〜10 月は 1 時間、4 月と 7 月は 1 週間ずれる）:

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

**公開の後の段取りは相対日で書く**。段階配信（開発→検証→本番）は公開日からの相対で決まる。たとえば「第 2 土曜の
22 時（太平洋時間）に本番」は、公開日の日集合を 4 日ずらして時刻を貼るだけ:

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

第 4 火曜のプレビュー版は `nth(4)` に変えるだけ:

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

## 射程の明示

- 10:00 は**公開**時刻であって、各機械への配信・導入の時刻ではない。配信の順序や遅延は Windows Update・WSUS・Intune
  など配信側の挙動で、権威は Microsoft の告知と各サービスの仕様にある。
- Microsoft 自身が「通常は」と書いているとおり、OOB 更新や延期は式の外。式が出すのは公開**予定**の点である。
- 対象は Windows クライアントの月例更新。Windows Server・Microsoft 365 Apps 等は別の周期を持つ（多くは同じ
  第 2 火曜だが、権威はそれぞれのドキュメント）。

## ブラウザで試す

同じ定義を表示 tz だけ変えて並べてある（Playground の表示 tz を切り替えても同じことができる）:

[太平洋時間（定義そのまま）](https://kairos-lang.org/playground/#s=cHJlbWlzZSBQVCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTG9zX0FuZ2VsZXMiCiAgd2tzdDogU3VuCn0KQFBUCnBhdGNoRGF5ID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBUdWUpIHw-IHdpdGhpbihtb250aCkgfD4gbnRoKDIpCnBhdGNoRGF5IHw-IGF0KFQxMDowMCk&f=2026-01-01&t=2027-01-01&z=America%2FLos_Angeles)・
[日本時間で表示](https://kairos-lang.org/playground/#s=cHJlbWlzZSBQVCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTG9zX0FuZ2VsZXMiCiAgd2tzdDogU3VuCn0KQFBUCnBhdGNoRGF5ID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBUdWUpIHw-IHdpdGhpbihtb250aCkgfD4gbnRoKDIpCnBhdGNoRGF5IHw-IGF0KFQxMDowMCk&f=2026-01-01&t=2027-01-01&z=Asia%2FTokyo)・
[ロンドンで表示](https://kairos-lang.org/playground/#s=cHJlbWlzZSBQVCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTG9zX0FuZ2VsZXMiCiAgd2tzdDogU3VuCn0KQFBUCnBhdGNoRGF5ID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBUdWUpIHw-IHdpdGhpbihtb250aCkgfD4gbnRoKDIpCnBhdGNoRGF5IHw-IGF0KFQxMDowMCk&f=2026-01-01&t=2027-01-01&z=Europe%2FLondon)・
[シドニーで表示](https://kairos-lang.org/playground/#s=cHJlbWlzZSBQVCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTG9zX0FuZ2VsZXMiCiAgd2tzdDogU3VuCn0KQFBUCnBhdGNoRGF5ID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBUdWUpIHw-IHdpdGhpbihtb250aCkgfD4gbnRoKDIpCnBhdGNoRGF5IHw-IGF0KFQxMDowMCk&f=2026-01-01&t=2027-01-01&z=Australia%2FSydney)・
[誤り例（日本の第 2 水曜 3 時）](https://kairos-lang.org/playground/#s=cHJlbWlzZSBUb2t5byB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFzaWEvVG9reW8iCiAgd2tzdDogTW9uCn0KQFRva3lvCmV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgPT0gV2VkKSB8PiB3aXRoaW4obW9udGgpIHw-IG50aCgyKSB8PiBhdChUMDM6MDAp&f=2026-01-01&t=2027-01-01&z=Asia%2FTokyo)・
[本番（第 2 土曜 22 時）](https://kairos-lang.org/playground/#s=cHJlbWlzZSBQVCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTG9zX0FuZ2VsZXMiCiAgd2tzdDogU3VuCn0KQFBUCnBhdGNoRGF5ID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBUdWUpIHw-IHdpdGhpbihtb250aCkgfD4gbnRoKDIpCnBhdGNoRGF5IHw-IHNoaWZ0KCs0LCB1bml0OiBkYXkpIHw-IGF0KFQyMjowMCk&f=2026-01-01&t=2027-01-01&z=America%2FLos_Angeles)・
[プレビュー版（第 4 火曜）](https://kairos-lang.org/playground/#s=cHJlbWlzZSBQVCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFtZXJpY2EvTG9zX0FuZ2VsZXMiCiAgd2tzdDogU3VuCn0KQFBUCmV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgPT0gVHVlKSB8PiB3aXRoaW4obW9udGgpIHw-IG50aCg0KSB8PiBhdChUMTA6MDAp&f=2026-01-01&t=2027-01-01&z=America%2FLos_Angeles)

——from/to を動かしたり、`at(T10:00)` を変えたりして試せる。ブラウザ内で完結し、何も送信しない。

## 関連

- 定義側に tz を持つ理由——ブログ[「どこの 9 時」かを、コードはどう覚えているか](https://selog.tech/?p=360)
- 語彙: [`at`](../reference/at.md)（壁時計の付与）・[`nth`](../reference/nth.md)・[`within`](../reference/within.md)・
  [`shift`](../reference/shift.md)
- cron からの引っ越し全般: [月末・月末最終営業日](cron-last-day-of-month.md)
- 「書けない」と言われてきた要求のカタログ: [調査研究 11](../design/40-examples/11-impossible-schedules.md)
