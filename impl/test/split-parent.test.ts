// split の親受理拡張——実効パーティション規則（ADR-48・draft §1.29・F109）
// - 規則マーカー由来（覆域註釈のない segmentBy 製）の窓列を親・by: に受ける
// - データ由来（covering 付き）親・empties: drop 親・cycle は受理しない
// - 境界整合検査（親窓の両端が u の窓境界に一致・per-instance・端は免除）を新設
// - per-instance I5 総和不一致は警告からエラーへ昇格（「黙って 53 週目を落とさない」の保証）
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';

const G = `
premise JPX { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@JPX
`;
const DER = (body: string) => `
premise CAL = ${body}
premise JPX { calendar-system: CAL; tz: "Asia/Tokyo"; wkst: Mon }
@JPX
`;

// 4-4-5 の split 形: 53 週年は g(i) の分岐で 13 週目を最終期へ（i は親窓列の通し序数・
// i=0 は実体化端の擬似窓 [紀元, 最初の isoYearStart)＝ISO 年番号は 1970 + i）
const R445_SPLIT = `
premise R445S = ISOWeek with {
  pDow  = y => (y + y div 4 - y div 100 + y div 400) mod 7
  has53 = y => pDow(y) == 4 or pDow(y - 1) == 3
  q = i => has53(1970 + i) ? [4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 6] : [4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5]
  period = isoYear split (i => q(i)) by: isoWeek
}
premise JPR { calendar-system: R445S; tz: "Asia/Tokyo"; wkst: Mon }
@JPR
`;

describe('split の親受理拡張（ADR-48）', () => {
  it('標準 week を親に: 週の平日部/週末部が split で立つ（動機の最良ケース）', () => {
    const d = evalDates(DER('Gregorian with { weekPart = week split (_ => [5, 2]) by: day }')
      + `everyDay |> within(weekPart) |> first`,
      { from: '2026-01-05', to: '2026-01-19' });
    // 月曜（平日部の頭）と土曜（週末部の頭）が交互に
    expect(d).toEqual(['2026-01-05', '2026-01-10', '2026-01-12', '2026-01-17']);
  });

  it('4-4-5 の split 形: g(i) の 53 週分岐で segmentBy 正準形（11 §(m)）と外延一致', () => {
    const d = evalDates(R445_SPLIT + `everyDay |> within(period) |> first`,
      { from: '2025-12-01', to: '2027-03-01' });
    expect(d).toEqual([
      '2025-12-29', '2026-01-26', '2026-02-23', '2026-03-30', '2026-04-27', '2026-05-25',
      '2026-06-29', '2026-07-27', '2026-08-24', '2026-09-28', '2026-10-26', '2026-11-23',
      '2027-01-04', '2027-02-01']);
  });

  it('53 週年に定数リスト: per-instance 総和検査が明示エラー（警告からの昇格・黙って落ちない）', () => {
    expect(() => run(DER('ISOWeek with { period = isoYear split (_ => [4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5]) by: isoWeek }')
      + `everyDay |> within(period) |> first`,
      { from: '2026-01-01', to: '2026-06-01' })).toThrow(/幅総和 52 ≠ 親窓内の単位数 53/);
  });

  it('非整列の親×単位（暦年×isoWeek）は境界整合検査が弾く（G 同一では弾けない組）', () => {
    expect(() => run(DER('ISOWeek with { bad = year split (_ => [26, 26]) by: isoWeek }')
      + `everyDay |> within(bad) |> first`,
      { from: '2026-01-01', to: '2026-06-01' })).toThrow(/窓境界に一致しない/);
  });

  it('データ由来（covering 付き）マーカーの親は受理しない（覆域編集で g の序数が動く）', () => {
    expect(() => run(G + `
m = [2026-01-10, 2026-02-10, 2026-03-10] covering: 2026-01-01..2026-04-01
seg = everyDay |> segmentBy(m, edges: drop, empties: keep)
seg split (_ => [1]) by: day`,
      { from: '2026-01-01', to: '2026-04-01' })).toThrow(/データ由来.*受理しない/);
  });

  it('cycle は親にならない（並列ラベル束は分割対象の窓列ではない）', () => {
    expect(() => run(DER('Gregorian with { bad = weekday split (_ => [1]) by: day }')
      + `everyDay |> within(bad) |> first`,
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/cycle は並列ラベル束/);
  });

  it('empties: drop の親（非連続な窓列）は受理しない', () => {
    // 31 日だけを要素に週窓を張り drop——大半の週窓が空で落ち、窓列が非連続になる
    expect(() => run(G + `
d31 = everyDay |> filter(d => dayNo(d) == 31)
seg = d31 |> segmentBy(weekStart, edges: drop, empties: drop)
seg split (_ => [7]) by: day`,
      { from: '2026-01-01', to: '2026-06-01' })).toThrow(/連続でない|データ由来/);
  });
});
