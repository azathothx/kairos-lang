# 休配日と着日——物流の営業日カレンダーを定義から作る

物流・通販の情報システム部門向けのページ。WMS・TMS・受注システムが参照する「営業日マスタ」「休配日マスタ」を、
年ごとに手で埋めるのではなく、規則と祝日表から生成し、年次更新を再生成と検算で回す人を想定する。言語の仕様は読まなくてよい。

Kairos は WMS・TMS を置き換えない。役割を分ける。**どの日が営業日か・何日に着くか**を定義から出す係を Kairos に、
受注・在庫・配車はこれまでのシステムに。結果はタブ区切り（TSV）でマスタへ渡す（[§マスタへ渡す](#マスタへ渡すtsv)）。
休配日の正は運送会社の公式告知にある（[§上流の権威は上流に](#上流の権威は上流に)）。このページの規則は公開情報の典型で、
会社ごとに違う。

## 一覧

| 要求 | 規則（典型） | Kairos |
|---|---|---|
| 休配日 | 日曜・祝日・年末年始 12/30〜1/3・お盆 8/13〜8/15 | `sunday`・祝日表・会社の休業日の和 |
| 営業日（出荷・配達する日） | 休配日でない日 | `everyDay` から休配日を引く |
| 着日 | 出荷日＋N 営業日（近県 1・遠方 2・離島 3 以上） | `shift(+N, unit: deliveryDay)` |
| 受注の締め | 営業日の 15 時。以降は翌営業日出荷 | `at(T15:00)` |
| 定期便の集荷 | 毎週火・金。休配日なら翌営業日 | `filter` と `roll(Following)` |
| 棚卸 | 月末最終営業日 | `within(month)` と `last` |
| 年末年始の帯 | 12/26〜1/7 を一覧にして配る | `list --from --to` |

## 前文——祝日表と会社の休業日

材料は 3 つ。日曜は規則で、祝日は表で、会社の休業日（年末年始・お盆）も表で持つ。
会社の休業日は年ごとに決まるものなので、規則にせず表に書く。

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

- `# eval:` と `#=>` の行はこのサイトの検証用のコメントで、消してよい。`2026-01-01..2026-01-11` は 1/1 から 1/10 まで
  （右端の 1/11 は含まない。以下すべて同じ読み方）。
- `holidays2026` は 2026 年の祝日 18 日（振替休日 5/6・国民の休日 9/22 を含む）。`covering: 2026..2026` は「この表が有効な範囲」。
- `closed` が会社の休業日。`2026-01-01..2026-01-03` は連続した日の略記。
- 1/1〜1/3 は休業、1/4 は日曜、1/10（土）は営業日。

土曜も休配なら `sunday` の行を `satSun = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)` に替え、
`noDelivery` の `sunday` を `satSun` にする。

以下の例は `premise JP` と `holidays2026` を省いて書く（このサイトの検証では 2026 年の祝日表を持つ標準前提が自動で前置される）。
手元で動かすときは、上の前文を式の上に置く。

## 休配日と営業日

8 月の休配日。お盆の 3 日と山の日（8/11）、日曜が並ぶ:

```kairos
# eval: 2026-08-01..2026-09-01
@JP
closed = [2026-01-01..2026-01-03, 2026-08-13..2026-08-15, 2026-12-30..2026-12-31] covering: 2026..2026
sunday = everyDay |> filter(d => weekday(d) == Sun)
noDelivery = sunday | holidays2026 | closed
noDelivery
#=> 2026-08-02 2026-08-09 2026-08-11 2026-08-13 2026-08-14 2026-08-15 2026-08-16 2026-08-23 2026-08-30
```

営業日は `deliveryDay`（`everyDay \ noDelivery`）。1 年分なら範囲を `2026-01-01..2027-01-01` にする（2026 年は 289 日）。

## 着日＝出荷日＋N 営業日

着日は営業日の目盛りで数える。`shift(+N, unit: deliveryDay)` が「営業日で N つ先」。
ゴールデンウィーク前の 4/30（木）・5/1（金）・5/2（土）に出荷した荷物で、近県（1 営業日）:

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

遠方（2 営業日）は数字を変えるだけ:

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

5/2（土）出荷は近県でも 5/7（木）着——5/3〜5/6 が休配だから。遠方は 5/8。離島は `+3`。

受注日から出すときは、受注日が休配日なら翌営業日の出荷にしてから数える。`roll(Following, on: deliveryDay)` を先に置く:

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

5/2（土）受注は 5/2 出荷で 5/7 着。5/3（日）と 5/4（祝）の受注はどちらも 5/7 出荷で 5/8 着。結果は日付の集合なので、
同じ着日に落ちた 2 件は 1 点になる（件ごとの対応は受注システム側で 1 件ずつ引く）。
`shift(unit: deliveryDay)` は入力が営業日でないとエラーで止まるので、`roll` を先に置く順を守る。

## 受注の締め時刻（15 時）

15 時までの受注は当日出荷、15 時を過ぎた受注は翌営業日出荷。締めは「営業日の 15 時」の点列として書く:

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

- 締めの点列が時間軸を窓に切る。前の締めから次の締めまでの受注が、次の締めの日に出荷される。
  5/2（土）15:30 の受注は、次の締め 5/7 15:00 の窓に入るので 5/7 出荷。
- 15:00 ちょうどをどちらに入れるかは会社の規則。ここでは「ちょうどは翌営業日」と読み、窓を「前の締めを含み次の締めを含まない」
  で揃える（`# eval:` の範囲と同じ読み方）。
- 受注時刻がどの窓かは、受け側で「受注時刻以上の最初の締め」を引く（Excel なら `XLOOKUP` の「次に大きい項目」、
  SQL なら締め時刻が受注時刻以上の最小行）。出荷日が決まれば、着日は上の `shift`。
- `at` に渡すのは時刻だけ。TSV では `time` 列に `15:00` が入る。

## 定期便の集荷（毎週火・金・休配日なら翌営業日）

曜日で作って、休配日なら翌営業日へ寄せる。9 月の連休（9/21 敬老の日・9/22 国民の休日・9/23 秋分の日）で:

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

9/22（火）は翌 9/23 も祝日なので 9/24（木）へ。9/25（金）はそのまま。`roll` は営業日の点を動かさない。

## 月末の棚卸（月末最終営業日）

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

土曜が営業日なので 1/31（土）・10/31（土）はそのまま。5 月は 5/31（日）の手前の 5/30（土）。
12 月は 12/30〜31 が休業なので 12/29（火）。

## 年末年始の帯（12/26〜1/7）

年末に配る「年末年始の営業日のお知らせ」の帯。12/26 から 1/7 までを一覧にする:

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

12/30・12/31 は休業。**2027-01-01 と 01-02 が営業日として出ている**——祝日表も休業日の表も 2026 年で尽きているから。
点の下の 2 行がそれを言う（CLI では `# ⚠ 範囲外 …` の行と、被覆サマリの残走路がマイナスで出る）。
点は出るが、表を知らずに出ている。この帯を配る前に表を延ばす。

表を延ばす＝2027 年の行を足し、`covering:` を `2026..2027` にする:

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

註釈が消え、1/4（月）が年始の初営業日になる。表の名前に年を入れない（`holidays`）と、延ばすたびに式を直さずに済む。
翌年の祝日は内閣府の公示（毎年 2 月）から写す。年次更新の時期・出所・手順は[保守の手引き](../MAINTENANCE.md)にある。

## マスタへ渡す（TSV）

`--tsv`（1.0.10 から）は、結果を 1 点 1 行のタブ区切りで書き出す。1 つのファイルに本体式を 2 つ並べると
`expr` 列が 1・2 で区別されるので、営業日マスタと休配日マスタを 1 回で出せる。前文の末尾を `deliveryDay` と `noDelivery` の
2 行にして:

```text
kairos list --tsv --from 2026-01-01 --to 2027-01-01 --tz Asia/Tokyo delivery.kairos > delivery.tsv
```

- `date` 列が日付、`time` 列は締め時刻のような時刻付きの定義のときだけ埋まる。`note` 列はその点が「表の外」の区間に入るときの註釈文で、
  空なら表の内側の計算。註釈・被覆サマリ・警告は標準エラーに出るので、ファイルには混ざらない。
- `--tz` は定義の tz と揃える。違うと日付に時刻が付く。
- Excel への取り込み（「データ → テキストまたは CSV から」・UTF-8・タブ）と列の読み方は
  [Excel の WORKDAY・EOMONTH で書きにくいスケジュール](excel-workday.md#excel-に渡すtsv)。
  PowerShell で判定に使うなら `--json`（[Windows 管理者のための Kairos](windows-admin.md)）。

年次更新は、表を延ばして同じコマンドを再実行し、旧マスタと差分を取る。差分が「足した年の行だけ」なら検算は済み。

## 落とし穴

| 落とし穴 | 何が起きるか | 対処 |
|---|---|---|
| 会社差 | 日祝も配達する会社がある。土曜の休配・お盆の日付・年末年始の長さも会社ごとに違う | `sunday` を `satSun` に、`closed` の行を公式告知どおりに |
| 表の外 | 表が尽きた先も点は出る（祝日を知らずに）。`⚠ 範囲外` と残走路のマイナスが知らせる | 表を延ばす。`covering:` の終端も |
| 年次更新の忘れ | 翌年にかかる範囲を出すたびに `⚠` と残走路のマイナスが出る | 毎年 2 月、翌年分を足す（[保守の手引き](../MAINTENANCE.md)） |
| `shift` の入力が休配日 | `unit: deliveryDay` は入力が営業日でないとエラーで止まる | `roll(Following, on: deliveryDay)` を先に |
| 評価範囲の端 | `shift` で範囲の外へ動いた点は出ない（`window-clip` の警告） | 範囲を N 営業日ぶん広げて評価する |
| `roll(Following)` と年末 | 1 年分を出すと 12/29 から `⚠` が立つ（翌営業日が表の外に落ちうるため） | 点そのものは正しい。表を延ばせば消える |
| `at` と表の外 | 表の外に落ちた点が `at` で消え、註釈だけ残る | 年をまたぐ前に表を延ばす。表の内側で評価する |
| `--tz` を書かない | 機械の tz で印字され、日付に時刻が付くことがある | `--tz Asia/Tokyo`。定義の tz と揃える |

## 上流の権威は上流に

- 休配日の正は運送会社の公式告知。年末年始・お盆の休配は毎年告知され、年によって日付も長さも変わる。
  このページの 12/30〜1/3・8/13〜8/15 は典型例で、告知が出たら `closed` の行を告知どおりに直す。
- 祝日の正は内閣府「国民の祝日について」。式は表を読むだけで、祝日を決めない。
- 着日の正は運送会社のサービス（地域別の所要日数・離島・繁忙期や天候の遅れ）。`shift(+N)` が出すのは「規則どおりなら」の予定日で、
  遅延は式の外。
- Kairos は WMS・TMS・受注システムを置き換えない。「どの日か」を定義から出し、マスタへ渡すところまで。

## ブラウザで試す

前提込みの自己完結形（祝日表と休業日を式の中に持つ）。ブラウザ内で完結し、何も送信しない:

- [営業日（2026 年・289 点）](https://kairos-lang.org/playground/#s=IyDllrbmpa3ml6XvvIjml6XnpZ3jg7vlubTmnKvlubTlp4vjg7vjgYrnm4bjgpLpmaTjgY_vvIkKcHJlbWlzZSBKUCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFzaWEvVG9reW8iCiAgd2tzdDogTW9uCn0KCkBKUApob2xpZGF5czIwMjYgPSBbMjAyNi0wMS0wMSwgMjAyNi0wMS0xMiwgMjAyNi0wMi0xMSwgMjAyNi0wMi0yMywgMjAyNi0wMy0yMCwKICAgICAgICAgICAgICAgIDIwMjYtMDQtMjksIDIwMjYtMDUtMDMsIDIwMjYtMDUtMDQsIDIwMjYtMDUtMDUsIDIwMjYtMDUtMDYsCiAgICAgICAgICAgICAgICAyMDI2LTA3LTIwLCAyMDI2LTA4LTExLCAyMDI2LTA5LTIxLCAyMDI2LTA5LTIyLCAyMDI2LTA5LTIzLAogICAgICAgICAgICAgICAgMjAyNi0xMC0xMiwgMjAyNi0xMS0wMywgMjAyNi0xMS0yM10gY292ZXJpbmc6IDIwMjYuLjIwMjYKY2xvc2VkID0gWzIwMjYtMDEtMDEuLjIwMjYtMDEtMDMsIDIwMjYtMDgtMTMuLjIwMjYtMDgtMTUsIDIwMjYtMTItMzAuLjIwMjYtMTItMzFdIGNvdmVyaW5nOiAyMDI2Li4yMDI2CnN1bmRheSA9IGV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgPT0gU3VuKQpub0RlbGl2ZXJ5ID0gc3VuZGF5IHwgaG9saWRheXMyMDI2IHwgY2xvc2VkCmRlbGl2ZXJ5RGF5ID0gZXZlcnlEYXkgXCBub0RlbGl2ZXJ5CiMg5pyA5b6M44Gu6KGM44KS5YWl44KM5pu_44GI44Gm6Kmm44Gb44KLOgojICAgbm9EZWxpdmVyeSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICDigKYg5LyR6YWN5pelCiMgICBkZWxpdmVyeURheSB8PiB3aXRoaW4obW9udGgpIHw-IGxhc3QgICAgICAgIOKApiDmnIjmnKvjga7mo5rljbjvvIjmnIjmnKvmnIDntYLllrbmpa3ml6XvvIkKZGVsaXZlcnlEYXkK&f=2026-01-01&t=2027-01-01&z=Asia%2FTokyo)——コメントにある休配日・月末の棚卸と入れ替えて試せる。
- [着日（遠方・出荷日＋2 営業日）](https://kairos-lang.org/playground/#s=IyDnnYDml6XvvIjpgaDmlrnvvJ3lh7rojbfml6XvvIsyIOWWtualreaXpe-8iQpwcmVtaXNlIEpQIHsKICBjYWxlbmRhci1zeXN0ZW06IEdyZWdvcmlhbgogIHR6OiAiQXNpYS9Ub2t5byIKICB3a3N0OiBNb24KfQoKQEpQCmhvbGlkYXlzMjAyNiA9IFsyMDI2LTAxLTAxLCAyMDI2LTAxLTEyLCAyMDI2LTAyLTExLCAyMDI2LTAyLTIzLCAyMDI2LTAzLTIwLAogICAgICAgICAgICAgICAgMjAyNi0wNC0yOSwgMjAyNi0wNS0wMywgMjAyNi0wNS0wNCwgMjAyNi0wNS0wNSwgMjAyNi0wNS0wNiwKICAgICAgICAgICAgICAgIDIwMjYtMDctMjAsIDIwMjYtMDgtMTEsIDIwMjYtMDktMjEsIDIwMjYtMDktMjIsIDIwMjYtMDktMjMsCiAgICAgICAgICAgICAgICAyMDI2LTEwLTEyLCAyMDI2LTExLTAzLCAyMDI2LTExLTIzXSBjb3ZlcmluZzogMjAyNi4uMjAyNgpjbG9zZWQgPSBbMjAyNi0wMS0wMS4uMjAyNi0wMS0wMywgMjAyNi0wOC0xMy4uMjAyNi0wOC0xNSwgMjAyNi0xMi0zMC4uMjAyNi0xMi0zMV0gY292ZXJpbmc6IDIwMjYuLjIwMjYKc3VuZGF5ID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBTdW4pCm5vRGVsaXZlcnkgPSBzdW5kYXkgfCBob2xpZGF5czIwMjYgfCBjbG9zZWQKZGVsaXZlcnlEYXkgPSBldmVyeURheSBcIG5vRGVsaXZlcnkKc2hpcHBlZCA9IFsyMDI2LTA0LTMwLCAyMDI2LTA1LTAxLCAyMDI2LTA1LTAyXSBjb3ZlcmluZzogMjAyNi4uMjAyNgojIOi_keecjOOBquOCiSArMeODu-mbouWztuOBquOCiSArMyDjgavlpInjgYjjgaboqabjgZvjgosKc2hpcHBlZCB8PiBzaGlmdCgrMiwgdW5pdDogZGVsaXZlcnlEYXkpCg&f=2026-04-27&t=2026-05-16&z=Asia%2FTokyo)——上の 3 点が出る。`+1`・`+3` に変えて試せる。
- [受注の締め（営業日の 15:00）](https://kairos-lang.org/playground/#s=IyDlj5fms6jjga7nt6DjgoHvvIjllrbmpa3ml6Xjga4gMTU6MDDvvIkKcHJlbWlzZSBKUCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFzaWEvVG9reW8iCiAgd2tzdDogTW9uCn0KCkBKUApob2xpZGF5czIwMjYgPSBbMjAyNi0wMS0wMSwgMjAyNi0wMS0xMiwgMjAyNi0wMi0xMSwgMjAyNi0wMi0yMywgMjAyNi0wMy0yMCwKICAgICAgICAgICAgICAgIDIwMjYtMDQtMjksIDIwMjYtMDUtMDMsIDIwMjYtMDUtMDQsIDIwMjYtMDUtMDUsIDIwMjYtMDUtMDYsCiAgICAgICAgICAgICAgICAyMDI2LTA3LTIwLCAyMDI2LTA4LTExLCAyMDI2LTA5LTIxLCAyMDI2LTA5LTIyLCAyMDI2LTA5LTIzLAogICAgICAgICAgICAgICAgMjAyNi0xMC0xMiwgMjAyNi0xMS0wMywgMjAyNi0xMS0yM10gY292ZXJpbmc6IDIwMjYuLjIwMjYKY2xvc2VkID0gWzIwMjYtMDEtMDEuLjIwMjYtMDEtMDMsIDIwMjYtMDgtMTMuLjIwMjYtMDgtMTUsIDIwMjYtMTItMzAuLjIwMjYtMTItMzFdIGNvdmVyaW5nOiAyMDI2Li4yMDI2CnN1bmRheSA9IGV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgPT0gU3VuKQpub0RlbGl2ZXJ5ID0gc3VuZGF5IHwgaG9saWRheXMyMDI2IHwgY2xvc2VkCmRlbGl2ZXJ5RGF5ID0gZXZlcnlEYXkgXCBub0RlbGl2ZXJ5CmRlbGl2ZXJ5RGF5IHw-IGF0KFQxNTowMCkK&f=2026-04-30&t=2026-05-09&z=Asia%2FTokyo)——上の 5 点が出る。「カレンダーに入れる（.ics）」で締めの通知にできる。
- [定期便の集荷（2026 年・104 点）](https://kairos-lang.org/playground/#s=IyDlrprmnJ_kvr_jga7pm4bojbfvvIjmr47pgLHngavjg7vph5Hjg7vkvJHphY3ml6Xjgarjgonnv4zllrbmpa3ml6XvvIkKcHJlbWlzZSBKUCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFzaWEvVG9reW8iCiAgd2tzdDogTW9uCn0KCkBKUApob2xpZGF5czIwMjYgPSBbMjAyNi0wMS0wMSwgMjAyNi0wMS0xMiwgMjAyNi0wMi0xMSwgMjAyNi0wMi0yMywgMjAyNi0wMy0yMCwKICAgICAgICAgICAgICAgIDIwMjYtMDQtMjksIDIwMjYtMDUtMDMsIDIwMjYtMDUtMDQsIDIwMjYtMDUtMDUsIDIwMjYtMDUtMDYsCiAgICAgICAgICAgICAgICAyMDI2LTA3LTIwLCAyMDI2LTA4LTExLCAyMDI2LTA5LTIxLCAyMDI2LTA5LTIyLCAyMDI2LTA5LTIzLAogICAgICAgICAgICAgICAgMjAyNi0xMC0xMiwgMjAyNi0xMS0wMywgMjAyNi0xMS0yM10gY292ZXJpbmc6IDIwMjYuLjIwMjYKY2xvc2VkID0gWzIwMjYtMDEtMDEuLjIwMjYtMDEtMDMsIDIwMjYtMDgtMTMuLjIwMjYtMDgtMTUsIDIwMjYtMTItMzAuLjIwMjYtMTItMzFdIGNvdmVyaW5nOiAyMDI2Li4yMDI2CnN1bmRheSA9IGV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgPT0gU3VuKQpub0RlbGl2ZXJ5ID0gc3VuZGF5IHwgaG9saWRheXMyMDI2IHwgY2xvc2VkCmRlbGl2ZXJ5RGF5ID0gZXZlcnlEYXkgXCBub0RlbGl2ZXJ5CnBpY2t1cCA9IGV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgPT0gVHVlIG9yIHdlZWtkYXkoZCkgPT0gRnJpKQpwaWNrdXAgfD4gcm9sbChGb2xsb3dpbmcsIG9uOiBkZWxpdmVyeURheSkK&f=2026-01-01&t=2027-01-01&z=Asia%2FTokyo)——年末に `⚠` が 1 組出る（落とし穴の表の `roll(Following)` と年末）。
- [年末年始の帯（12/26〜1/7・`⚠` が出る）](https://kairos-lang.org/playground/#s=IyDlubTmnKvlubTlp4vjga7llrbmpa3ml6XvvIjooajjgYwgMjAyNiDlubTjgaflsL3jgY3jgovjgagg4pqgIOOBjOWHuuOCi--8iQpwcmVtaXNlIEpQIHsKICBjYWxlbmRhci1zeXN0ZW06IEdyZWdvcmlhbgogIHR6OiAiQXNpYS9Ub2t5byIKICB3a3N0OiBNb24KfQoKQEpQCmhvbGlkYXlzMjAyNiA9IFsyMDI2LTAxLTAxLCAyMDI2LTAxLTEyLCAyMDI2LTAyLTExLCAyMDI2LTAyLTIzLCAyMDI2LTAzLTIwLAogICAgICAgICAgICAgICAgMjAyNi0wNC0yOSwgMjAyNi0wNS0wMywgMjAyNi0wNS0wNCwgMjAyNi0wNS0wNSwgMjAyNi0wNS0wNiwKICAgICAgICAgICAgICAgIDIwMjYtMDctMjAsIDIwMjYtMDgtMTEsIDIwMjYtMDktMjEsIDIwMjYtMDktMjIsIDIwMjYtMDktMjMsCiAgICAgICAgICAgICAgICAyMDI2LTEwLTEyLCAyMDI2LTExLTAzLCAyMDI2LTExLTIzXSBjb3ZlcmluZzogMjAyNi4uMjAyNgpjbG9zZWQgPSBbMjAyNi0wMS0wMS4uMjAyNi0wMS0wMywgMjAyNi0wOC0xMy4uMjAyNi0wOC0xNSwgMjAyNi0xMi0zMC4uMjAyNi0xMi0zMV0gY292ZXJpbmc6IDIwMjYuLjIwMjYKc3VuZGF5ID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBTdW4pCm5vRGVsaXZlcnkgPSBzdW5kYXkgfCBob2xpZGF5czIwMjYgfCBjbG9zZWQKZGVsaXZlcnlEYXkgPSBldmVyeURheSBcIG5vRGVsaXZlcnkKIyAyMDI3IOW5tOOBruihjOOCkuihqOOBq-i2s-OBlyBjb3ZlcmluZzogMjAyNi4uMjAyNyDjgavjgZnjgovjgagg4pqgIOOBjOa2iOOBiOOCiwpkZWxpdmVyeURheQo&f=2026-12-26&t=2027-01-08&z=Asia%2FTokyo)——上の 9 点と 2 本の註釈が出る。コメントのとおり表を延ばすと消える。

## 関連

- 月末最終営業日・25 日払い・第 N 営業日を Excel の式と並べて: [Excel の WORKDAY・EOMONTH で書きにくいスケジュール](excel-workday.md)
- 毎日「今日は出荷日か」を自動で聞く型（タスク スケジューラ・cron）: [Windows 管理者のための Kairos](windows-admin.md)・
  [月末・月末最終営業日](cron-last-day-of-month.md)
- 例の祝日表を毎年延ばす手順と出所: [保守の手引き](../MAINTENANCE.md)

語彙と仕様の所在:

- 語彙: [`filter`](../reference/filter.md)・[`roll`](../reference/roll.md)・[`shift`](../reference/shift.md)・[`at`](../reference/at.md)・
  [`within`](../reference/within.md)・[`last`](../reference/last.md)・[テーブルリテラル](../reference/table-literal.md)（`covering:`・連続日の略記）
- 祝日データの持ち込みと鮮度（`covering:`・`asof:`）: [言語仕様 §4.10](../spec/30-body-layer.md)・[`nonWorking` と `bizDay`](../reference/nonWorking.md)
