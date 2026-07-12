// 窓所属の述語 coincides（仮称）と stride の入力相対（ADR-38・F68/F70/F75）
// - coincides(S, w, d): 点 d の属する w 窓の中に S の点が在るか——値式の有界存在量化
// - 証人規則の三分岐（真＝非註釈区間の証人・範囲外＝証人なし∧交差・偽＝覆域完全）
// - tz 静的検査・窓語 S / cycle w の静的エラー・filter 輸送の逆像拡幅（F75）
// - stride: 入力相対の確定（n は 1 以上の整数・from: 以上の最初の入力点が第 0 歩）
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';
import { PRELUDE } from './helpers.ts';

const JP2 = `
premise JPX { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@JPX
`;

// 毎営業日 9 時の正準形（ADR-38 帰結の doctest と同じ二段構え）: hour 窓の派生一行＋自前の実体
const ENT_HOUR = `
premise HourG = Gregorian with { hour = chronos grid 1h }
premise Cal {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  satSunC = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  nonWorking = satSunC
}
premise Biz { calendar-system: HourG; calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon }
@Biz
`;

describe('coincides の基本（ADR-38 判断 1/2）', () => {
  it('積の形: S の点がある日だけ残す（時刻付き S＝整列なしも合法・整列要求は課さない）', () => {
    const dates = evalDates(JP2 + `
h = [2026-01-07T13:00] covering: 2026..2026
everyDay |> filter(d => coincides(h, day, d))
`, { from: '2026-01-01', to: '2026-02-01' });
    expect(dates).toEqual(['2026-01-07']);
  });

  it('差の形は not の有無だけ（F68 の対称）', () => {
    const dates = evalDates(JP2 + `
h = [2026-01-07T13:00] covering: 2026..2026
everyDay |> filter(d => not coincides(h, day, d))
`, { from: '2026-01-05', to: '2026-01-10' });
    expect(dates).toEqual(['2026-01-05', '2026-01-06', '2026-01-08', '2026-01-09']);
  });

  it('毎営業日 9 時の通知から臨時休業「日」を除く（F68 正準形）——前段差の回避形と同結果', () => {
    const range = { from: '2026-01-05', to: '2026-01-10' };
    const viaCoincides = evalDates(ENT_HOUR + `
closures = [2026-01-07] covering: ..
bizDay |> shift(+9, unit: hour) |> filter(t => not coincides(closures, day, t))
`, range);
    const viaPrestage = evalDates(ENT_HOUR + `
closures = [2026-01-07] covering: ..
(bizDay \\ closures) |> shift(+9, unit: hour)
`, range);
    expect(viaCoincides).toEqual(
      ['2026-01-05T09:00', '2026-01-06T09:00', '2026-01-08T09:00', '2026-01-09T09:00']);
    expect(viaPrestage).toEqual(viaCoincides);   // day 整列が立つ導出型では前段差も書ける（判断 8）
  });

  it('w には細粒度窓（elapsed の hour）も渡せる——区間所属・整列不問（判断 6）', () => {
    const dates = evalDates(ENT_HOUR + `
([2026-01-05T09:00] covering: ..)
  |> filter(t => coincides(([2026-01-05T09:30] covering: ..), hour, t))
`, { from: '2026-01-05', to: '2026-01-06' });
    expect(dates).toEqual(['2026-01-05T09:00']);
  });

  it('閏月の検出（純増の表現力）: 中気を含まない旧暦月＝閏六月 2025-07-25', () => {
    // 一次データは 95-reference-data.md（NAOJ 令和7年暦要項）——中気は黄経 30° の倍数の 12 件
    const dates = evalDates(`
premise Kyu25 = Gregorian with {
  source: "eco.mtk.nao.ac.jp/koyomi/yoko"
  asof: 2025-02-03
  tz: "Asia/Tokyo"
  newMoons25 = [2024-12-31T07:27, 2025-01-29T21:36, 2025-02-28T09:45, 2025-03-29T19:58,
                2025-04-28T04:31, 2025-05-27T12:02, 2025-06-25T19:32, 2025-07-25T04:11,
                2025-08-23T15:07, 2025-09-22T04:54, 2025-10-21T21:25, 2025-11-20T15:47,
                2025-12-20T10:43] covering: 2024-12-31..2025-12-31
  lunarStart25 = newMoons25 |> snapTo(day)
  lunarMonth25 = day |> segmentBy(lunarStart25, edges: drop, empties: error)
  chuki25 = [2025-01-20T05:00, 2025-02-18T19:07, 2025-03-20T18:01, 2025-04-20T04:56,
             2025-05-21T03:55, 2025-06-21T11:42, 2025-07-22T22:29, 2025-08-23T05:34,
             2025-09-23T03:19, 2025-10-23T12:51, 2025-11-22T10:36, 2025-12-22T00:03]
    covering: 2025..2025
  chukiDay25 = chuki25 |> snapTo(day)
}
premise Koyomi25 { calendar-system: Kyu25; tz: "Asia/Tokyo"; wkst: Mon }
@Koyomi25
lunarMonth25 |> first |> filter(p => not coincides(chukiDay25, lunarMonth25, p))
`, { from: '2025-01-01', to: '2026-01-01' });
    expect(dates).toEqual(['2025-07-25']);   // monthNos 手作業更新（F62）の照合検査を兼ねる形
  });
});

describe('証人規則の三分岐（ADR-38 判断 4——基準は実効被覆域）', () => {
  it('(i) 覆域端を跨ぐ窓でも、非註釈区間の証人が在れば真——註釈ゼロ（∃ は単調）', () => {
    const r = run(JP2 + `
closures3 = [2026-02-03] covering: 2026-01-01..2026-02-15
([2026-02-20T09:00] covering: ..) |> filter(t => coincides(closures3, month, t))
`, { from: '2026-02-01', to: '2026-03-01' });
    // 2 月窓は覆域端 2/15 を跨ぐが、証人 2026-02-03（覆域内）が真を単調確定する
    expect(r.results[0].dates).toEqual(['2026-02-20T09:00']);
    expect(r.results[0].annotations).toEqual([]);
  });

  it('(ii) 証人なし∧窓が註釈区間に交差 → 落として註釈・読んだ窓の逆像へ拡幅（F75）', () => {
    const r = run(JP2 + `
closures2 = [2026-01-07] covering: 2026-01-01..2026-02-15
([2026-02-03T09:00] covering: ..) |> filter(t => not coincides(closures2, month, t))
`, { from: '2026-02-01', to: '2026-03-01' });
    expect(r.results[0].dates).toEqual([]);   // 点は落ちる
    // 拡幅なしなら註釈は 2026-02-16 から——読んだ窓（2 月）の全域＝2026-02-01 からが正（F75）
    expect(r.results[0].annotations).toEqual([
      expect.objectContaining({ source: 'closures2', from: '2026-02-01', to: '2026-03-01' }),
    ]);
  });

  it('(ii) 退化 S の点は証人にならない——everyDay \\ holidays の尾部で範囲外になる', () => {
    const r = run(PRELUDE + `
everyDay |> filter(d => coincides(bizDay, day, d))
`, { from: '2026-12-28', to: '2027-01-05' });
    // 2026 内は証人（真）または覆域完全の偽（土日）。2027 は退化 bizDay の点が在っても証人でない
    expect(r.results[0].dates).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31']);
    expect(r.results[0].annotations).toEqual([
      expect.objectContaining({ source: 'holidays2026', from: '2027-01-01' }),
    ]);
  });

  it('(iii) 窓が完全に実効被覆域内なら偽が確定する（覆域完全性に依存する側）', () => {
    const r = run(JP2 + `
h = [2026-01-07] covering: 2026..2026
everyDay |> filter(d => coincides(h, day, d))
`, { from: '2026-03-01', to: '2026-03-05' });
    expect(r.results[0].dates).toEqual([]);   // 該当なし＝正当な空
    expect(r.results[0].annotations).toEqual([]);
  });

  it('d が w のどの窓にも属さない場合は分類器（覆域外＝落として註釈。判断 6 追記の失敗種）', () => {
    const r = run(JP2 + `
newMoons2 = [2026-01-19T04:52, 2026-02-17T21:01] covering: 2026-01-19..2026-03-31
lunarW = day |> segmentBy((newMoons2 |> snapTo(day)), edges: drop, empties: keep)
chukiD = [2026-01-20, 2026-02-19] covering: 2026..2026
([2026-05-01] covering: ..) |> filter(p => coincides(chukiD, lunarW, p))
`, { from: '2026-01-01', to: '2026-06-01' });
    expect(r.results[0].dates).toEqual([]);   // 2026-05-01 はマーカー覆域（〜2026-04-01）の外
    expect(r.results[0].annotations).toEqual([
      expect.objectContaining({ source: 'newMoons2', from: '2026-04-01' }),
    ]);
  });
});

describe('coincides の統治（静的エラー。ADR-38 判断 3/5）', () => {
  it('S に窓語は置けない（原子点列への暗黙降格は恒真化の罠）', () => {
    expect(() => run(JP2 + `
everyDay |> filter(d => coincides(month, month, d))
`, { from: '2026-01-01', to: '2026-01-05' })).toThrow(/S に窓語は置けない/);
  });

  it('w に cycle 名は立てられない（窓でなくラベル）', () => {
    expect(() => run(PRELUDE + `
everyDay |> filter(d => coincides(bizDay, weekday, d))
`, { from: '2026-01-01', to: '2026-01-05' })).toThrow(/cycle/);
  });

  it('tz 名の不一致は静的エラー（chronos 所属であり「同じ日付ラベル」ではない＝F69）', () => {
    expect(() => run(JP2 + `
premise U { calendar-system: Gregorian; tz: "UTC"; u = [2026-01-05] covering: .. }
everyDay |> filter(d => coincides(U.u, day, d))
`, { from: '2026-01-01', to: '2026-01-10' })).toThrow(/tz 名が不一致/);
  });

  it('引数は 3 つ（S, w, d）', () => {
    expect(() => run(JP2 + `
everyDay |> filter(d => coincides(everyDay, d))
`, { from: '2026-01-01', to: '2026-01-05' })).toThrow(/3 引数/);
  });

  it('ADR-36 の整列エラーは分岐案内を含む（点なら snapTo・所属〈日〉なら coincides）', () => {
    expect(() => run(JP2 + `
everyDay \\ [2026-01-05T13:00]
`, { from: '2026-01-01', to: '2026-02-01' })).toThrow(/snapTo で明示的に整合する（同じ所属〈日〉が意図なら coincides/);
  });
});

describe('stride は入力相対（ADR-38 判断 10〜12）', () => {
  it('n は 1 以上の整数——stride(0) の「黙って空」は静的エラーに', () => {
    const src = (n: string) => JP2 + `everyDay |> stride(${n}, from: 2026-01-05)\n`;
    const Y = { from: '2026-01-01', to: '2026-02-01' };
    expect(() => run(src('0'), Y)).toThrow(/1 以上の整数/);
    expect(() => run(src('-3'), Y)).toThrow(/1 以上の整数/);
    expect(() => run(src('1.5'), Y)).toThrow(/1 以上の整数/);
  });

  it('from: 規約——from: 以上の最初の入力点が第 0 歩（残る）。from: は入力の点でなくてよい', () => {
    const Y = { from: '2026-01-01', to: '2026-02-01' };
    expect(evalDates(JP2 + `
([2026-01-10, 2026-01-12, 2026-01-14] covering: ..) |> stride(2, from: 2026-01-11)
`, Y)).toEqual(['2026-01-12']);   // 01-11 は入力に無い——最初の入力点 01-12 が第 0 歩
    expect(evalDates(JP2 + `
([2026-01-10, 2026-01-12, 2026-01-14] covering: ..) |> stride(2, from: 2026-01-10)
`, Y)).toEqual(['2026-01-10', '2026-01-14']);   // 起点自身が入力点なら残る
  });

  it('入力の点を数える（何を数えるかは前段の filter が決める）——3 営業日ごとの正準形', () => {
    const r = run(PRELUDE + `
everyDay |> filter(on: bizDay) |> stride(3, from: 2026-01-05)
`, { from: '2026-01-01', to: '2026-01-23' });
    expect(r.results[0].dates).toEqual(
      ['2026-01-05', '2026-01-08', '2026-01-14', '2026-01-19', '2026-01-22']);
  });
});

// ---- F82: 窓リーダーの覆域検査（ADR-37 判断 4/6 の帰結・06-business-hours の検証で発見） ----
// 合成マーカー（openTick | closeTick）の帯は、closeTick の covering が尽きた側では
// 生き残った openTick だけから窓が張られ「黙って 24 時間帯」になる——窓境界が未知の窓の読みは
// 証人の有無以前に範囲外（filter は落として註釈・過小近似は不可）
describe('F82: 帯の覆域外読みは範囲外（黙って 24 時間帯化しない）', () => {
  const BAND = `
premise Cal {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  satSunC = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  nonWorking = satSunC
}
premise Biz {
  calendar-system: Gregorian
  calendar:        Cal
  tz:              "Asia/Tokyo"
  wkst:            Mon
  hourly    = everyInstant |> strideBy(1h, from: 2026-12-28)
  openTick  = everyInstant |> strideBy(1d, from: 2026-12-28T09:00)
  close17   = everyInstant |> strideBy(1d, from: 2026-12-28T17:00)
  halfDayCloses = [2026-12-30T11:30] covering: 2026..2026
  closeTick = (close17 |> filter(t => not coincides(halfDayCloses, day, t))) | halfDayCloses
  band      = hourly |> segmentBy(openTick | closeTick, edges: clip, empties: drop)
}
@Biz
hourly |> filter(t => coincides(openTick, band, t) and coincides(bizDay, day, t))
`;
  it('覆域内（2026 年末）は正しい帯・覆域外（2027 年）は落として註釈（24 時間帯を出さない）', () => {
    const r = run(BAND, { from: '2026-12-28', to: '2027-01-06' });
    const dates = r.results[0].dates;
    // 覆域内: 12/28(月) 9:00–16:00・12/29(火) 9:00–16:00・12/30(水・半日) 9:00–11:00・12/31(木) 9:00–16:00
    expect(dates.filter(d => d.startsWith('2026-12-28')).length).toBe(8);
    expect(dates.filter(d => d.startsWith('2026-12-30'))).toEqual(
      ['2026-12-30T09:00', '2026-12-30T10:00', '2026-12-30T11:00']);
    // 覆域外: 2027 年の点はゼロ（従来は 1/1・1/4・1/5 に 9:00〜翌 8:00 の 24 時間帯が黙って出ていた）
    expect(dates.filter(d => d.startsWith('2027')).length).toBe(0);
    // 落ちは無音でない——範囲外註釈が結果に随伴する
    expect(r.results[0].annotations.length).toBeGreaterThan(0);
    expect(r.results[0].annotations.some(a => a.source.includes('halfDayCloses'))).toBe(true);
  });
});
