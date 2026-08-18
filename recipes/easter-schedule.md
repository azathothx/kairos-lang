# イースター（復活祭）の日付を式で計算する——データゼロの Computus

イースターは「春分後の最初の満月の次の日曜」という**移動祝日**で、繰り返し規則の言語が
軒並み白旗を上げてきた代表例。Kairos では外部データゼロの**純算術 8 行**で書ける。

## 既存の繰り返し規則で何が起きるか

- iCalendar RRULE（RFC 5545）にも暦拡張（RFC 7529）にも表現手段が無い。
- Python dateutil の `byeaster` は[「RFC 外の拡張」とドキュメント自身が明記](https://dateutil.readthedocs.io/en/stable/rrule.html)。
- [1900〜2099 年限定の近似 RRULE 集](https://github.com/sappjw/calendars)という力技のリポジトリが
  存在すること自体が、規則で書けないことの傍証。

## Kairos で書く

西方教会（グレゴリオ暦）の Computus（Anonymous Gregorian algorithm）をそのまま値関数に写す。
`div`・`mod` と射影（`year`・`month`・`ordinalIn`）だけ——カレンダーデータへの依存が無い:

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

5 年分すべて公知の復活祭日と一致。聖金曜日・復活祭月曜のような関連日は、この列に
`shift(±n, unit: day)` を足すだけ——**導いた列を次の規則に流せる**（閉包）ことが、
「関連移動祝日の族」を 1 定義ずつ増やせる理由になる。

## 射程の明示

これは**西方教会・グレゴリオ暦**の計算規則。正教会の復活祭（ユリウス暦基準）は別の算術で、
また、いずれの教会暦でも**公式の暦が上流**である——本レシピは規則の写像であって、
典礼日の権威を置き換えるものではない。規則でなく公式発表で決まる日（各国の祝日実務など）は、
算術ではなくデータ持ち込み（`external`・`covering:`/`asof:`）が正しい受け皿になる。

## ブラウザで試す

[Playground で実行](https://kairos-lang.org/playground/#s=cHJlbWlzZSBXIHsKICBjYWxlbmRhci1zeXN0ZW06IEdyZWdvcmlhbgogIHR6OiAiVVRDIgogIHdrc3Q6IE1vbgp9CgpAVwphID0geSA9PiB5IG1vZCAxOQpiID0geSA9PiB5IGRpdiAxMDAKaCA9IHkgPT4gKDE5KmEoeSkgKyBiKHkpIC0gYih5KSBkaXYgNCAtIChiKHkpIC0gKGIoeSkrOCkgZGl2IDI1ICsgMSkgZGl2IDMgKyAxNSkgbW9kIDMwCmwgPSB5ID0-ICgzMiArIDIqKGIoeSkgbW9kIDQpICsgMiooKHkgbW9kIDEwMCkgZGl2IDQpIC0gaCh5KSAtICh5IG1vZCAxMDApIG1vZCA0KSBtb2QgNwptID0geSA9PiAoYSh5KSArIDExKmgoeSkgKyAyMipsKHkpKSBkaXYgNDUxCmVNb250aCA9IHkgPT4gKGgoeSkgKyBsKHkpIC0gNyptKHkpICsgMTE0KSBkaXYgMzEKZURheSAgID0geSA9PiAoKGgoeSkgKyBsKHkpIC0gNyptKHkpICsgMTE0KSBtb2QgMzEpICsgMQpldmVyeURheSB8PiBmaWx0ZXIoZCA9PiBtb250aChkKSA9PSBlTW9udGgoeWVhcihkKSkgYW5kIG9yZGluYWxJbihkYXksIG1vbnRoLCBkKSA9PSBlRGF5KHllYXIoZCkpKQ&f=2024-01-01&t=2029-01-01&z=UTC)
——評価範囲を広げて任意の年を確かめられる。

## 関連

- 「規則で書ける日」と「公式発表で決まる日」の線引き:
  [調査研究 11 の三分類](../design/40-examples/11-impossible-schedules.md)
- 語彙: [`filter`](../reference/filter.md)・[`ordinalIn`](../reference/ordinalIn.md)・
  値関数の定義は[言語仕様 §3](../spec/20-premise-layer.md)
- 天文・観測で決まる日（春分の日など）のデータ持ち込み:
  [`external`](../reference/external.md)
