# 月末・月末最終営業日に実行する——cron の限界と Kairos の式

「毎月末に実行したい」は cron 最頻出の挫折点のひとつ
（[Stack Overflow 閲覧 32.5 万](https://stackoverflow.com/questions/6139189/cron-job-to-run-on-the-last-day-of-the-month)）。
Kairos ではどちらも 1 行の式になる:

```text
monthEnd                                  # 月末日
bizDay |> within(month) |> last           # 月末最終営業日
```

## cron で何が起きるか

- 標準 cron に「月末」は無い。`28-31` を並べて先頭でスクリプト判定するハックが定番で、
  Kubernetes CronJob では[同じ要望が issue で再提起され続けている](https://github.com/kubernetes/kubernetes/issues/121088)。
- Quartz 方言の `L`（最終日）・`LW`（最終平日）は便利だが処理系間で移植できず、**祝日は扱えない**
  （`LW` の W は土日回避のみ）。
- 「月末最終**営業日**」になると Google Calendar でも
  [編集不可警告つきの ICS 輸入でしか置けない](https://www.garethjmsaunders.co.uk/2022/03/26/how-to-set-up-recurring-events-on-the-last-working-day-of-the-month-in-google-calendar/)。

根にあるのは機能の不足ではなく**式が合成できない**こと——「月末」を出せても、その結果を
「営業日で前へ丸める」次の規則に流せない。

## Kairos で書く

営業日（祝日対応）の月末。`@JP` の標準前提（土日＋日本の祝日データから導出された `bizDay`）で:

```kairos
# eval: 2026-01-01..2026-07-01
@JP
bizDay |> within(month) |> last
#=> 2026-01-30 2026-02-27 2026-03-31 2026-04-30 2026-05-29 2026-06-30
```

1 月末（1/31 土）と 5 月末（5/30 土・5/31 日）が正しく金曜へ退いている。「営業日の列を作り、
月ごとに最後の点を取る」——読んだままの構造で、祝日はカレンダーデータ（`covering:` つき）から
来るので、データが尽きれば黙らず註釈が出る。

月末から数える変種も同じ語彙の合成:

```text
monthEnd |> roll(Preceding, on: bizDay) |> shift(-3, unit: bizDay)   # 月末の 3 営業日前
```

## ブラウザで試す

前提込みの自己完結形（祝日テーブルを式の中に持つ）を
[Playground で実行](https://kairos-lang.org/playground/#s=cHJlbWlzZSBKUCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFzaWEvVG9reW8iCiAgd2tzdDogTW9uCn0KCkBKUApob2xpZGF5czIwMjYgPSBbMjAyNi0wMS0wMSwgMjAyNi0wMS0xMiwgMjAyNi0wMi0xMSwgMjAyNi0wMi0yMywgMjAyNi0wMy0yMCwKICAgICAgICAgICAgICAgIDIwMjYtMDQtMjksIDIwMjYtMDUtMDMsIDIwMjYtMDUtMDQsIDIwMjYtMDUtMDUsIDIwMjYtMDUtMDYsCiAgICAgICAgICAgICAgICAyMDI2LTA3LTIwLCAyMDI2LTA4LTExLCAyMDI2LTA5LTIxLCAyMDI2LTA5LTIyLCAyMDI2LTA5LTIzLAogICAgICAgICAgICAgICAgMjAyNi0xMC0xMiwgMjAyNi0xMS0wMywgMjAyNi0xMS0yM10gY292ZXJpbmc6IDIwMjYuLjIwMjYKc2F0U3VuID0gZXZlcnlEYXkgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBTYXQgb3Igd2Vla2RheShkKSA9PSBTdW4pCmJpekRheSA9IGV2ZXJ5RGF5IFwgKHNhdFN1biB8IGhvbGlkYXlzMjAyNikKCmJpekRheSB8PiB3aXRoaW4obW9udGgpIHw-IGxhc3Q&f=2026-01-01&t=2026-07-01)
——from/to を動かしたり、祝日を足したりして挙動を確かめられる。

## 関連

- 似た型: 毎月 31 日（無い月をどうするかの**二義**を式で書き分ける）・第 N 営業日・N 営業日ごと
  ——[調査研究 11 の実測節](../design/40-examples/11-impossible-schedules.md)
- 語彙: [`within`](../reference/within.md)・[`last`](../reference/last.md)・
  [`roll`](../reference/roll.md)・[`shift`](../reference/shift.md)
- 祝日データの持ち込みと鮮度の統治（`covering:`/`asof:`）: [言語仕様 §4.10](../spec/30-body-layer.md)
