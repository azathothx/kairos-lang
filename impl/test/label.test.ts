// label: 付与式（spec §4.9・ADR-30/34）の検証
// - 意味論: 名前(d) ≡ 付与式(d の属する窓の先頭点)。評価は射影時・遅延（I7）。束縛名がそのまま射影名（ADR-30）
// - premise 層の窓生成語 span/split/grid の後置 named-arg と、本体層 segmentBy の括弧内 named-arg の両方
// - 自己参照（定義中の束縛名自身のラベル射影）は明示エラー（隣接窓参照の裏面・I7）
// - 字句: 日時リテラルの時刻部は hh 00..23・mm/ss 00..59（23:59:60 は字句エラー。ADR-33 の帰結）
import { describe, it, expect } from 'vitest';
import { run, evalDates, lex } from '../src/index.ts';
import { iso, addDays } from './helpers.ts';

/** [from, toExcl) の連続日（独立オラクル用） */
function days(from: string, toExcl: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); iso(d) < toExcl; d = addDays(d, 1)) out.push(iso(d));
  return out;
}

describe('span 後置の label:（年度ラベル）', () => {
  // stdlib の Fiscal と衝突しないよう別名 premise。year の上書きに label: を足しただけの形
  const FISCAL_L = `
premise FiscalL = Gregorian with {
  year = month span (_ => 12) phase: 3 label: (p => yearNo(p))
}
premise JPL { calendar-system: FiscalL; tz: "Asia/Tokyo"; wkst: Mon }
@JPL
`;
  const opts = { from: '2025-01-01', to: '2028-01-01' };

  it('year(d) == 2026 の窓は 2026-04-01〜2027-03-31（束縛名射影・premise 相対の遅延解決）', () => {
    expect(evalDates(FISCAL_L + 'everyDay |> filter(d => year(d) == 2026) |> within(year) |> first', opts))
      .toEqual(['2026-04-01']);
    expect(evalDates(FISCAL_L + 'everyDay |> filter(d => year(d) == 2026) |> within(year) |> last', opts))
      .toEqual(['2027-03-31']);
  });

  it('既存 fiscalYearNo（射影の算術）と同じ観測になる', () => {
    const FY = 'premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }\n@FY\n';
    expect(evalDates(FISCAL_L + 'everyDay |> filter(d => year(d) == 2026) |> within(year) |> first', opts))
      .toEqual(evalDates(FY + 'everyDay |> filter(d => fiscalYearNo(d) == 2026) |> within(year) |> first', opts));
  });

  it('切れ端窓のラベル: phase>0 の頭の切れ端も「窓の先頭点」規則で評価される（挙動の固定）', () => {
    // 有界実体化の頭の切れ端 [1970-01-01, 1970-04-01) の先頭点は 1970-01-01 → yearNo = 1970。
    // 本来の FY1970 窓（1970-04-01〜）と同じラベルを帯びる——「前年度の切れ端」と読ませたいなら
    // 付与式側で fiscalYearNo 流の算術（yearOf(epochOrdinal(month, p) - 3)）を書く。ADR-34 の注記候補
    expect(evalDates(FISCAL_L + 'everyDay |> filter(d => year(d) == 1970) |> within(year) |> first',
      { from: '1970-01-01', to: '1971-06-01' })).toEqual(['1970-01-01', '1970-04-01']);
  });
});

describe('segmentBy 括弧内の label:（旧暦月名・データ窓）', () => {
  // 朔は stdlib/kyureki.md §1 の 2026 年分（NAOJ 暦要項・JST）。無ラベルの補助束縛 lunarMonthW を
  // 先に立て、label: 付与式は「並行する月名リストを epochOrdinal で引く」形（kyureki.md §7 (5) の正準形）
  const KYUREKI_L = `
premise KyurekiL = Gregorian with {
  tz: "Asia/Tokyo"
  newMoons = [2026-01-19T04:52, 2026-02-17T21:01, 2026-03-19T10:23, 2026-04-17T20:52,
              2026-05-17T05:01, 2026-06-15T11:54, 2026-07-14T18:44, 2026-08-13T02:37,
              2026-09-11T12:27, 2026-10-11T00:50, 2026-11-09T16:02, 2026-12-09T09:52]
    covering: 2026..2026
  lunarStart  = newMoons |> snapTo(day)
  lunarMonthW = day |> segmentBy(lunarStart, edges: drop, empties: error)
  monthNames  = ["十二月", "一月", "二月", "三月", "四月", "五月",
                 "六月", "七月", "八月", "九月", "十月", "十一月"]
  kyuMonth    = day |> segmentBy(lunarStart, edges: drop, empties: error,
                                 label: (p => monthNames[epochOrdinal(lunarMonthW, p)]))
}
premise Koyomi { calendar-system: KyurekiL; tz: "Asia/Tokyo"; wkst: Mon }
@Koyomi
`;
  const Y2026 = { from: '2026-01-01', to: '2027-01-01' };

  it('kyuMonth(d) == "五月" は朔日 6/15〜次の朔日前日 7/13 の 29 日（小の月）', () => {
    // 期待値は暦要項の朔から独立に導出: 五月 = [2026-06-15, 2026-07-14)（kyureki.md の月表と一致）
    expect(evalDates(KYUREKI_L + 'lunarMonthW |> filter(d => kyuMonth(d) == "五月")', Y2026))
      .toEqual(days('2026-06-15', '2026-07-14'));
  });

  it('kyuMonth(d) == "一月" の先頭は旧正月 2026-02-17・30 日（大の月）', () => {
    const got = evalDates(KYUREKI_L + 'lunarMonthW |> filter(d => kyuMonth(d) == "一月")', Y2026);
    expect(got).toEqual(days('2026-02-17', '2026-03-19'));
  });
});

describe('split / grid の label:', () => {
  it('split: quarter の label: (p => monthNo(p)) → 四半期頭の月番号で選べる', () => {
    const dates = evalDates(`
premise QuarterL = Gregorian with {
  quarterM = year split (_ => [3, 3, 3, 3]) by: month label: (p => monthNo(p))
}
premise JPQ { calendar-system: QuarterL; tz: "Asia/Tokyo"; wkst: Mon }
@JPQ
everyDay |> filter(d => yearNo(d) == 2026 and quarterM(d) == 7)
`, { from: '2026-01-01', to: '2027-01-01' });
    expect(dates).toEqual(days('2026-07-01', '2026-10-01'));   // Q3 = 7〜9 月の 92 日
  });

  it('grid: 旬（10 日区切り）の label: (p => dayNo(p)) → 旬頭の暦日で選べる', () => {
    // yearNo(d) == 2026 の短絡が必要: anchor: 由来の位相起点（1970-01-05）以前の実体化端は
    // どの窓にも属さず、label 射影が「点が窓の外」になる（kyureki.md §7 (3) と同型の端の制約）
    const dates = evalDates(`
premise DekadL = Gregorian with {
  decade = chronos grid 10d anchor: 2026-01-01 label: (p => dayNo(p))
}
premise JPD { calendar-system: DekadL; tz: "Asia/Tokyo"; wkst: Mon }
@JPD
everyDay |> filter(d => yearNo(d) == 2026 and decade(d) == 21)
`, { from: '2026-01-01', to: '2026-02-01' });
    expect(dates).toEqual(days('2026-01-21', '2026-01-31'));   // 旬 [1/21, 1/31) の 10 日
  });
});

describe('label: の統治（明示エラー）', () => {
  it('自己参照（span 形）: 付与式が定義中の束縛名自身を射影すると明示エラー', () => {
    expect(() => evalDates(`
premise SelfL = Gregorian with {
  fy = month span (_ => 12) phase: 3 label: (p => fy(p))
}
premise JPS { calendar-system: SelfL; tz: "Asia/Tokyo"; wkst: Mon }
@JPS
everyDay |> filter(d => fy(d) == 2026)
`, { from: '2026-01-01', to: '2027-01-01' })).toThrow(/定義中の束縛名（自己または相互）のラベル射影を呼べない/);
  });

  it('自己参照（segmentBy 形）も同じエラー', () => {
    expect(() => evalDates(`
premise SelfSeg = Gregorian with {
  w = day |> segmentBy(monthStart, edges: clip, empties: keep, label: (p => w(p)))
}
premise JPS2 { calendar-system: SelfSeg; tz: "Asia/Tokyo"; wkst: Mon }
@JPS2
everyDay |> filter(d => w(d) == 1)
`, { from: '2026-01-01', to: '2026-02-01' })).toThrow(/定義中の束縛名（自己または相互）のラベル射影を呼べない/);
  });

  it('cycle は label: を取らない（ラベル列は cycle 自身が持つ）', () => {
    expect(() => evalDates(`
premise CycL = Gregorian with {
  wd = day cycle [Mon, Tue, Wed, Thu, Fri, Sat, Sun] anchor: 2000-01-03 label: (p => 1)
}
premise JPC { calendar-system: CycL; tz: "Asia/Tokyo"; wkst: Mon }
@JPC
everyDay |> filter(d => wd(d) == Mon)
`, { from: '2026-01-01', to: '2026-02-01' })).toThrow(/cycle は label: を取らない/);
  });

  it('label: に非ラムダを渡すと明示エラー（付与式はラムダで書く。§4.9）', () => {
    expect(() => evalDates(`
premise BadL = Gregorian with {
  fy = month span (_ => 12) phase: 3 label: 2026
}
premise JPB { calendar-system: BadL; tz: "Asia/Tokyo"; wkst: Mon }
@JPB
everyDay |> within(fy) |> first
`, { from: '2026-01-01', to: '2026-02-01' })).toThrow(/label: はラムダ/);
  });
});

describe('字句: 日時リテラルの時刻部の妥当性（ADR-33 の帰結）', () => {
  it('23:59:60（うるう秒）は字句エラー', () => {
    expect(() => lex('t = [2026-01-01T23:59:60]')).toThrow(/時刻が範囲外/);
  });

  it('24:00 は字句エラー', () => {
    expect(() => lex('t = [2026-01-01T24:00]')).toThrow(/時刻が範囲外/);
  });

  it('分の範囲外（23:60）も字句エラー', () => {
    expect(() => lex('t = [2026-01-01T23:60]')).toThrow(/時刻が範囲外/);
  });

  it('23:59:59（日の最終秒）は通る', () => {
    expect(() => lex('t = [2026-01-01T23:59:59]')).not.toThrow();
  });
});
