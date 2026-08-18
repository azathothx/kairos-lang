# 毎月 15 日に最も近い平日——Quartz 15W を合成で書く

「毎月 15 日、ただし土日なら最も近い平日」は Quartz の `15W` 表記で知られる要求。
RRULE には存在せず、Quartz 方言でも**祝日は扱えない**。Kairos は `Nearest` という専用
ロール規約を持たないが、**有限場合分けの合成**でそのまま書ける——そして合成なので、
祝日対応にもそのまま伸びる。

## 既存側で何が起きるか

- iCalendar RRULE に「最も近い平日」の語彙は無い（BYSETPOS では書けない型）。
- Quartz `15W` は W が**土日回避のみ**——祝日カレンダーとは組み合わせられない。
- 「15 日が土曜なら前金曜・日曜なら翌月曜」という**方向の違う丸め**が 1 語に畳まれており、
  変種（祝日も避けたい・月末側は跨がない等）が要る途端に書けなくなる。

## Kairos で書く

15 日の列を「平日ならそのまま・土曜なら前へ・日曜なら後ろへ」の 3 系列に分けて合成する:

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

2 月・3 月・11 月（15 日が日曜）は翌月曜へ、8 月（15 日が土曜）は前金曜 8/14 へ。
「最も近い」という 1 語の中の場合分けが、**そのまま 3 行の式**として見える形になる。

`15W` にできない祝日対応は、`weekdays` を営業日列に差し替えるだけ:

```text
(d15 |> filter(…)) | (… |> roll(Preceding, on: bizDay)) | (… |> roll(Following, on: bizDay))
```

丸め先が営業日になり、15 日自身が祝日の場合の扱いも `d15 |> filter` の条件に書き足せる——
専用表記は畳まれた仕様が開けないが、合成は開いて直せる。

## ブラウザで試す

[Playground で実行](https://kairos-lang.org/playground/#s=cHJlbWlzZSBKUCB7CiAgY2FsZW5kYXItc3lzdGVtOiBHcmVnb3JpYW4KICB0ejogIkFzaWEvVG9reW8iCiAgd2tzdDogTW9uCn0KCkBKUAp3ZWVrZGF5cyA9IGV2ZXJ5RGF5IHw-IGZpbHRlcihkID0-IHdlZWtkYXkoZCkgIT0gU2F0IGFuZCB3ZWVrZGF5KGQpICE9IFN1bikKZDE1ID0gZXZlcnlEYXkgfD4gd2l0aGluKG1vbnRoKSB8PiBudGgoMTUpCihkMTUgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSAhPSBTYXQgYW5kIHdlZWtkYXkoZCkgIT0gU3VuKSkKICB8IChkMTUgfD4gZmlsdGVyKGQgPT4gd2Vla2RheShkKSA9PSBTYXQpIHw-IHJvbGwoUHJlY2VkaW5nLCBvbjogd2Vla2RheXMpKQogIHwgKGQxNSB8PiBmaWx0ZXIoZCA9PiB3ZWVrZGF5KGQpID09IFN1bikgfD4gcm9sbChGb2xsb3dpbmcsIG9uOiB3ZWVrZGF5cykp&f=2026-01-01&t=2026-12-31)
——`nth(15)` を変えれば任意の日付版になる。

## 関連

- 給料日の型（25 日・休日なら前営業日に**片方向**へ丸める）: [言語仕様 §7](../spec/90-examples.md)
- 語彙: [`roll`](../reference/roll.md)・[`nth`](../reference/nth.md)・
  結合子 <code>&#124;</code> は[記述語リファレンス](../reference/combinators.md)
- 出典と類例のカタログ: [調査研究 11](../design/40-examples/11-impossible-schedules.md)
