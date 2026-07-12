// 窓列への並行ラベル列（ADR-39・F62）: segmentBy の labels: 一般化
// - 読みは束縛名射影 名前(d) ≡ labels[窓列序数]・窓はラベルを格納しない
// - 同長性検査は覆域基準（期待窓数＝マーカー数。評価範囲・実体化範囲に依存しない）
// - 締め: edges: clip / empties: drop / label: 同居 / 規則マーカー / 合成マーカー＝静的エラー
// - 未知 named-arg を黙って捨てない（段・gen 語・糖衣の全部）
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';

const JP2 = `
premise JPX { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@JPX
`;

// 2026 年の朔 12 件（covering 2026..2026 → 覆域端確定の最終窓込みで 12 窓＝マーカー数）
const KYU = (labels: string) => `
premise Kyu = Gregorian with {
  source: "test"
  asof: 2026-02-02
  tz: "Asia/Tokyo"
  newMoons = [2026-01-19T04:52, 2026-02-17T21:01, 2026-03-19T10:23, 2026-04-17T20:52,
              2026-05-17T05:01, 2026-06-15T11:54, 2026-07-14T18:44, 2026-08-13T02:37,
              2026-09-11T12:27, 2026-10-11T00:50, 2026-11-09T16:02, 2026-12-09T09:52]
    covering: 2026..2026
  lunarStart = newMoons |> snapTo(day)
  monthNos = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  lunarMonth = day |> segmentBy(lunarStart, edges: drop, empties: error, labels: ${labels})
}
premise Koyomi { calendar-system: Kyu; tz: "Asia/Tokyo"; wkst: Mon }
@Koyomi
`;
const Y2026 = { from: '2026-01-01', to: '2027-01-01' };

describe('labels: の束縛名射影（ADR-39 判断 1/3）', () => {
  it('lunarMonth(d) が窓のラベル（月番号）を返す——旧イディオムの添字引きと一致', () => {
    const canonical = evalDates(KYU('monthNos') + `
lunarMonth |> filter(d => lunarMonth(d) == 1)
`, Y2026);
    const legacy = evalDates(KYU('monthNos') + `
plain = day |> segmentBy(lunarStart, edges: drop, empties: error)
plain |> filter(d => monthNos[epochOrdinal(plain, d)] == 1)
`, Y2026);
    expect(canonical).toEqual(legacy);                       // 生添字は合法のまま（非正準）
    expect(canonical[0]).toBe('2026-02-17');                 // 旧正月
    expect(canonical.length).toBe(30);                       // 一月は大の月（2/17〜3/18）
  });

  it('リストはリテラルでも書ける・空窓のラベルもマーカー点から読める（欠ティティ）', () => {
    // ティティ 6 の窓（01-05T09:00〜01-06T02:30）はどの日の出も含まない空窓——番号は立つ
    const dates = evalDates(JP2 + `
sunrises = [2026-01-01T06:51, 2026-01-02T06:51, 2026-01-03T06:51,
            2026-01-04T06:51, 2026-01-05T06:51, 2026-01-06T06:51]
tithiB   = [2026-01-01T03:00, 2026-01-02T01:00, 2026-01-02T22:30, 2026-01-03T19:00,
            2026-01-04T14:30, 2026-01-05T09:00, 2026-01-06T02:30]
tithiW   = sunrises |> segmentBy(tithiB, edges: drop, empties: keep, labels: [1, 2, 3, 4, 5, 6, 7])
tithiB |> filter(t => tithiW(t) == 6)
`, { from: '2026-01-01', to: '2026-01-07' });
    expect(dates).toEqual(['2026-01-05T09:00']);
  });

  it('窓列序数は「実効被覆域内の先頭マーカー起点の窓が 0」——紀元を跨いでも 0 起点', () => {
    const dates = evalDates(JP2 + `
m = [1969-12-15, 1970-01-20] covering: 1969-12-15..1970-02-28
w = everyDay |> segmentBy(m, edges: drop, empties: keep, labels: [10, 11])
everyDay |> filter(d => w(d) == 10)
`, { from: '1970-01-01', to: '1970-01-10' });
    // 窓 0 は紀元前（1969-12-15）に始まる——ラベル 10 が読めること＝窓列序数は epochOrdinal と別座標
    expect(dates.length).toBe(9);
    expect(dates[0]).toBe('1970-01-01');
  });

  it('覆域外の点の射影は分類器（落として註釈）——labels: 射影も label: と同じ経路', () => {
    const r = run(KYU('monthNos') + `
(lunarMonth | ([2027-03-01] covering: ..)) |> filter(d => lunarMonth(d) == 1)
`, { from: '2026-01-01', to: '2028-01-01' });
    expect(r.results[0].dates[0]).toBe('2026-02-17');
    expect(r.results[0].dates.length).toBe(30);              // 2027-03-01 は落ちて註釈
    expect(r.results[0].annotations.length).toBeGreaterThan(0);
  });

  it('評価範囲を狭めても同長性検査は偽陽性を出さない（窓数は覆域基準）', () => {
    // 窓 4 = [2026-05-17, 2026-06-15)——狭い評価はその途中の 4 日だけを返し、検査はエラーにならない
    const dates = evalDates(KYU('monthNos') + `
lunarMonth |> filter(d => lunarMonth(d) == 4)
`, { from: '2026-06-01', to: '2026-06-05' });
    expect(dates).toEqual(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04']);
  });
});

describe('同長性検査（覆域基準。ADR-39 判断 2）', () => {
  it('短い方向: 期待/実際つきの静的エラー', () => {
    expect(() => run(KYU('[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]') + 'lunarMonth\n', Y2026))
      .toThrow(/ラベル列の長さ 11 ≠ 窓数 12/);
  });

  it('長い方向（F62 の黙る方向）も割れる', () => {
    expect(() => run(KYU('[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]') + 'lunarMonth\n', Y2026))
      .toThrow(/ラベル列の長さ 13 ≠ 窓数 12/);
  });
});

describe('前提条件と締め（ADR-39 判断 4——全部静的エラー）', () => {
  const T2 = `
m = [2026-01-10, 2026-02-10] covering: 2026..2026
`;

  it('edges: clip とは組めない', () => {
    expect(() => run(JP2 + T2 + `
everyDay |> segmentBy(m, edges: clip, empties: keep, labels: [1, 2])
`, Y2026)).toThrow(/edges: clip とは組めない/);
  });

  it('empties: drop とは組めない', () => {
    expect(() => run(JP2 + T2 + `
everyDay |> segmentBy(m, edges: drop, empties: drop, labels: [1, 2])
`, Y2026)).toThrow(/empties: drop とは組めない/);
  });

  it('label: ラムダと同居できない（ラベル源の二重化）', () => {
    expect(() => run(JP2 + T2 + `
everyDay |> segmentBy(m, edges: drop, empties: keep, labels: [1, 2], label: (p => 1))
`, Y2026)).toThrow(/同居できない/);
  });

  it('規則マーカー（無限の点列）は静的エラー——cycle / ordinalIn / label: へ誘導', () => {
    expect(() => run(JP2 + `
mondays = everyDay |> filter(d => weekday(d) == Mon)
everyDay |> segmentBy(mondays, edges: drop, empties: keep, labels: [1, 2, 3])
`, Y2026)).toThrow(/規則マーカー.*cycle・計算番号は ordinalIn か label:/s);
  });

  it('合成マーカー（覆域が単一の無註釈区間でない）は安全側エラー・被覆主張で通る', () => {
    expect(() => run(JP2 + `
t1 = [2026-01-10] covering: 2026-01-01..2026-01-31
t2 = [2026-02-10] covering: 2026-02-01..2026-02-28
everyDay |> segmentBy((t1 | t2), edges: drop, empties: keep, labels: [1, 2])
`, Y2026)).toThrow(/単一の無註釈区間でない/);
    // 束縛後置の covering:（被覆主張）で覆域を確定すれば通る（ADR-37 判断 5 の口）
    const dates = evalDates(`
premise CM = Gregorian with {
  tz: "Asia/Tokyo"
  t1 = [2026-01-10] covering: 2026-01-01..2026-01-31
  t2 = [2026-02-10] covering: 2026-02-01..2026-02-28
  m = (t1 | t2) covering: 2026-01-01..2026-02-28
  w = everyDay |> segmentBy(m, edges: drop, empties: keep, labels: [1, 2])
}
premise JPC2 { calendar-system: CM; tz: "Asia/Tokyo"; wkst: Mon }
@JPC2
w |> filter(d => w(d) == 2)
`, { from: '2026-02-10', to: '2026-02-14' });
    expect(dates).toEqual(['2026-02-10', '2026-02-11', '2026-02-12', '2026-02-13']);
  });

  it('ラベル値の型域: 非リスト・空リスト・非等質は静的エラー（ADR-34 判断 3 と同一）', () => {
    const seg = (labels: string) => JP2 + T2 + `
everyDay |> segmentBy(m, edges: drop, empties: keep, labels: ${labels})
`;
    expect(() => run(seg('42'), Y2026)).toThrow(/リスト（リテラルまたはリスト束縛名）を取る/);
    expect(() => run(seg('[]'), Y2026)).toThrow(/空リストは不可/);
    expect(() => run(seg('[1, "x"]'), Y2026)).toThrow(/等質/);
  });
});

describe('未知の名前付き引数を黙って捨てない（ADR-39 判断 4）', () => {
  it('core 段のタイポ（edgs:）は静的エラー', () => {
    expect(() => run(JP2 + `
m = [2026-01-10, 2026-02-10] covering: 2026..2026
everyDay |> segmentBy(m, edgs: drop, empties: keep)
`, Y2026)).toThrow(/未知の名前付き引数 edgs:/);
  });

  it('roll の on: のタイポも静的エラー', () => {
    expect(() => run(JP2 + `
monthEnd |> roll(Preceding, onn: everyDay)
`, Y2026)).toThrow(/未知の名前付き引数 onn:/);
  });

  it('gen 語への labels:（cycle・grid）は未知キーとして静的エラー', () => {
    expect(() => run(JP2 + `
premise X = Gregorian with { wd = day cycle [A, B] anchor: 2026-01-05 labels: [1, 2] }
X.wd
`, Y2026)).toThrow(/cycle: 未知の名前付き引数 labels:/);
    expect(() => run(JP2 + `
premise Y = Gregorian with { g = chronos grid 10d labels: [1, 2] }
Y.g
`, Y2026)).toThrow(/grid: 未知の名前付き引数 labels:/);
  });

  it('糖衣・値関数の未知 named-arg も静的エラー', () => {
    expect(() => run(JP2 + `
f(on: p) = filter(on: p)
everyDay |> f(on: everyDay, off: everyDay)
`, Y2026)).toThrow(/未知の名前付き引数 off:/);
  });
});
