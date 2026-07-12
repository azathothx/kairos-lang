# `with` — 派生的定義（公開語の上書き）

**分類**: 派生（premise 層 core） ／ **シグネチャ**: `Base with { w = … } : premise -> premise` ／ 名は確定（spec §5.4）

## 意味

既存 premise を土台に、指定した公開語だけ**差し替え・追加**して新しい premise を作る
（`premise → premise` の閉包）。会計暦・組織固有の暦・ラベルの追加はすべてこれ。

名前解決は**機構 A**（ADR-17）:

- **裸名は派生スコープで再解決**——上書きした語（`year`）に依存する継承語（`quarter`・`yearStart`）は
  自動で新しい定義に追従する。
- **`Base.word` は base の値にピン**——あえて元の定義に固定したいときの明示手段。

派生が動かすのは**窓の切れ目だけ**で、暦日は不動（I1）。2026-03-01 は会計暦でも「3 月 1 日」のまま、
所属する**年窓**だけが 2025 年度（Apr2025–Mar2026）に変わる。

## 例

会計暦（4 月始まり）は一行——`month` に触れないので暦日・月末は不動:

```kairos
# eval: 2025-01-01..2028-01-01
premise Fiscal = Gregorian with { year = month span (_ => 12) phase: 3 label: (p => yearNo(p)) }
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
everyDay |> within(year) |> first
#=> 2025-04-01 2026-04-01 2027-04-01
```

`quarter` は継承定義（`year split … by: month`）が新しい `year` に**自動追従**し、会計四半期になる:

```kairos
# eval: 2026-01-01..2027-01-01
premise Fiscal = Gregorian with { year = month span (_ => 12) phase: 3 label: (p => yearNo(p)) }
premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }
@FY
everyDay |> within(quarter) |> first
#=> 2026-01-01 2026-04-01 2026-07-01 2026-10-01
```

## 落とし穴

- 派生は原始へ**展開できない**（新しい規則だから）。糖衣 → core の展開（片方向）とは別の非対称
  （spec §2.4）。
- 会計暦で `month = Gregorian.month` のようなピンや循環回避は**不要**——`month` が `year` に依存しない
  設計（「閏は窓でなく値」）のおかげ（spec §3.6/§3.7）。
- 年度の**番号付け**（2025 年度＝開始暦年か終了暦年か）は窓の切断とは独立のラベルの問題
  （`label:` 付与式。spec §4.9）。

## 関連

[`shiftBoundary`](shiftBoundary.md)（with への糖衣）・[`span`](span.md)・[`split`](split.md)・機構 A（ADR-17）・I1。
