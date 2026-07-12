// 営業時間の供給規約と標準導出（ADR-41）の検証
// - 供給規約 sessionOpens/sessionCloses: 対宣言（with 継承込み）・実体 tz の市民座標の事実・深夜セッション合法
// - 整合性検査: 結合実効被覆域∩実体化範囲の局所交互・端の切り欠き・同時刻対は両点保持（文脈順序）
// - 標準導出 bizOpen/bizClose/isOpen: 実体相対（F89）・開場日固定（F85）・覆域は証人規則の三分岐
// - premise は ADR-41 判断 1 の TSE 二部制の例をそのまま使う（9:00–11:30・12:30–15:00・半日休 12/30）
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';

const JAN = { from: '2026-01-01', to: '2026-02-01' };

// ADR-41 判断 1 の例そのまま: 二部制・半日休（大納会級）は前場のみ
const TSE_ENT = `
premise TSE {
  calendar-system: Gregorian
  tz:     "Asia/Tokyo"
  source: "jpx.co.jp/trading-calendar"
  satSun     = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  holidays   = [2026-01-01] covering: 2026..2026
  nonWorking = satSun | holidays
  am9   = chronos grid 1d anchor: 2026-01-01T09:00
  pm30  = chronos grid 1d anchor: 2026-01-01T12:30
  am30c = chronos grid 1d anchor: 2026-01-01T11:30
  pm3c  = chronos grid 1d anchor: 2026-01-01T15:00
  halfDays = [2026-12-30] covering: 2026..2026
  sessionOpens  = (am9 |> first) | (pm30 |> first |> filter(t => not coincides(halfDays, day, t)))
  sessionCloses = (am30c |> first) | (pm3c |> first |> filter(t => not coincides(halfDays, day, t)))
}
`;
const TSE = TSE_ENT + `
premise Biz {
  calendar-system: Gregorian
  calendar:        TSE
  tz:              "Asia/Tokyo"
  wkst:            Mon
}
@Biz
`;

// 単一セッション 9:00–17:00（同時刻対・with 派生・接するセッションの素材）
const SHOP_ENT = `
premise Shop {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "example"
  nonWorking = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  o9  = chronos grid 1d anchor: 2026-01-01T09:00
  o15 = chronos grid 1d anchor: 2026-01-01T15:00
  c15 = chronos grid 1d anchor: 2026-01-01T15:00
  c17 = chronos grid 1d anchor: 2026-01-01T17:00
  sessionOpens  = (o9 |> first) | (o15 |> first)
  sessionCloses = (c15 |> first) | (c17 |> first)
}
`;
const SHOP = SHOP_ENT + `
premise ShopUse { calendar-system: Gregorian; calendar: Shop; tz: "Asia/Tokyo"; wkst: Mon }
@ShopUse
`;

describe('ADR-41: isOpen（導出値述語・半開区間の和）', () => {
  it('二部制の真偽: 前場内 真・昼休み 偽・後場内 真・引け後 偽・境界は半開（9:00 真・11:30 偽）', () => {
    const kept = evalDates(TSE + `
[2026-01-05T09:00, 2026-01-05T09:30, 2026-01-05T11:30, 2026-01-05T11:45, 2026-01-05T12:45, 2026-01-05T15:30] |> filter(t => isOpen(t))
`, JAN);
    expect(kept).toEqual(['2026-01-05T09:00', '2026-01-05T09:30', '2026-01-05T12:45']);
    // 補集合（not isOpen）が対称に立つ＝偽は覆域完全の側（範囲外の取りこぼしではない）
    const dropped = evalDates(TSE + `
[2026-01-05T09:00, 2026-01-05T09:30, 2026-01-05T11:30, 2026-01-05T11:45, 2026-01-05T12:45, 2026-01-05T15:30] |> filter(t => not isOpen(t))
`, JAN);
    expect(dropped).toEqual(['2026-01-05T11:30', '2026-01-05T11:45', '2026-01-05T15:30']);
  });

  it('半日休 12/30: 前場 10:00 真・後場 13:00 偽（例外データが sessionOpens/sessionCloses の合成で効く）', () => {
    const kept = evalDates(TSE + `
[2026-12-30T10:00, 2026-12-30T13:00] |> filter(t => isOpen(t))
`, { from: '2026-12-01', to: '2027-01-01' });
    expect(kept).toEqual(['2026-12-30T10:00']);
  });

  it('祝日 1/1: 開場 tick が bizOpen から落ちセッションごと偽（覆域完全の側の偽・範囲外ではない）', () => {
    const kept = evalDates(TSE + '[2026-01-01T10:00] |> filter(t => not isOpen(t))\n', JAN);
    expect(kept).toEqual(['2026-01-01T10:00']);
  });

  it('実体相対（F89）: 別 tz の premise から isOpen が読める（東証が開いているかは東証の文化で決まる）', () => {
    // NY 1/4(日) 19:30 ＝ JST 1/5(月) 09:30（前場中）・NY 1/5 02:00 ＝ JST 1/5 16:00（引け後）
    const kept = evalDates(TSE_ENT + `
premise NYDesk { calendar-system: Gregorian; calendar: TSE; tz: "America/New_York"; wkst: Mon }
@NYDesk
[2026-01-04T19:30, 2026-01-05T02:00] |> filter(t => isOpen(t))
`, { from: '2026-01-01', to: '2026-02-01', tz: 'America/New_York' });
    expect(kept).toEqual(['2026-01-04T19:30']);
  });
});

describe('ADR-41: bizOpen / bizClose（導出ストリーム・開場日固定）', () => {
  it('bizOpen は営業日の開場だけを流す（元日・土日の 9:00 が無い）', () => {
    // 1/1(木)=祝・1/2(金)=営業・1/3(土)/1/4(日)=休・1/5(月)=営業
    const sessionOpens = evalDates(TSE + 'bizOpen\n', { from: '2026-01-01', to: '2026-01-06' });
    expect(sessionOpens).toEqual(['2026-01-02T09:00', '2026-01-02T12:30', '2026-01-05T09:00', '2026-01-05T12:30']);
  });

  it('bizClose は対応する引け——半日休 12/30 は前場引け 11:30 だけ（後場が無い）', () => {
    const sessionCloses = evalDates(TSE + 'bizClose\n', { from: '2026-01-01', to: '2026-01-06' });
    expect(sessionCloses).toEqual(['2026-01-02T11:30', '2026-01-02T15:00', '2026-01-05T11:30', '2026-01-05T15:00']);
    const dec = evalDates(TSE + 'bizClose\n', { from: '2026-12-28', to: '2026-12-31' });
    expect(dec).toEqual(['2026-12-28T11:30', '2026-12-28T15:00',
      '2026-12-29T11:30', '2026-12-29T15:00', '2026-12-30T11:30']);
  });
});

describe('ADR-41 判断 2: 同時刻対・深夜セッション・整合性検査', () => {
  it('同時刻の close/open（両点保持）: 15:00 は営業中＝連続営業・bizClose は和の右端 17:00 だけ', () => {
    const kept = evalDates(SHOP + `
[2026-01-05T15:00, 2026-01-05T16:30, 2026-01-05T17:00] |> filter(t => isOpen(t))
`, JAN);
    expect(kept).toEqual(['2026-01-05T15:00', '2026-01-05T16:30']);   // [9,15)∪[15,17)=[9,17)・半開
    const sessionCloses = evalDates(SHOP + 'bizClose\n', { from: '2026-01-05', to: '2026-01-06' });
    expect(sessionCloses).toEqual(['2026-01-05T17:00']);   // 接する断片は融合——15:00 は右端に現れない
  });

  it('深夜セッション（開 22:00・閉 翌 03:00）: 金曜夜の尾部（土曜未明）が真・土日の夜は全偽（F85＝開場日固定）', () => {
    // 実体化範囲の頭は close 始まり（孤立 close）＝切り欠きとして合法（エラーにならないこと自体が検証）
    const kept = evalDates(`
premise NightClub {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "example"
  nonWorking = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  o22 = chronos grid 1d anchor: 2026-01-01T22:00
  c3  = chronos grid 1d anchor: 2026-01-01T03:00
  sessionOpens  = o22 |> first
  sessionCloses = c3 |> first
}
premise NightUse { calendar-system: Gregorian; calendar: NightClub; tz: "Asia/Tokyo"; wkst: Mon }
@NightUse
[2026-01-09T23:00, 2026-01-10T01:00, 2026-01-10T23:00, 2026-01-11T01:00, 2026-01-11T23:00, 2026-01-12T01:00] |> filter(t => isOpen(t))
`, JAN);
    // 1/9(金) 開場のセッション [1/9 22:00, 1/10 03:00) だけが営業——土日の開場は丸ごと落ちる
    expect(kept).toEqual(['2026-01-09T23:00', '2026-01-10T01:00']);
  });

  it('交互性違反（同一覆域内で close が連続）はデータ相対エラー', () => {
    expect(() => run(`
premise BadAlt {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "example"
  nonWorking = [2026-01-01] covering: 2026..2026
  sessionOpens  = [2026-01-05T09:00, 2026-01-05T13:00] covering: 2026-01-05..2026-01-05
  sessionCloses = [2026-01-05T11:00, 2026-01-05T12:00] covering: 2026-01-05..2026-01-05
}
premise BadUse { calendar-system: Gregorian; calendar: BadAlt; tz: "Asia/Tokyo"; wkst: Mon }
@BadUse
[2026-01-05T10:00] |> filter(t => isOpen(t))
`, JAN)).toThrow(/開場列\/閉場列の交互が破れている/);
  });
});

describe('ADR-41: 統治（対宣言・予約名・with 継承）', () => {
  it('sessionOpens だけの宣言は静的エラー（対——検査は細粒度導出の初回使用時）', () => {
    expect(() => run(`
premise OnlyOpens {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "example"
  nonWorking = [2026-01-01] covering: 2026..2026
  sessionOpens = [2026-01-05T09:00] covering: 2026-01-05..2026-01-05
}
premise OUse { calendar-system: Gregorian; calendar: OnlyOpens; tz: "Asia/Tokyo"; wkst: Mon }
@OUse
[2026-01-05T10:00] |> filter(t => isOpen(t))
`, JAN)).toThrow(/sessionOpens\/sessionCloses は対で宣言する/);
  });

  it('with 派生は継承込みで対を判定——sessionOpens だけ上書きし sessionCloses を継承する派生は合法', () => {
    const kept = evalDates(`
premise Base9to17 {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "example"
  nonWorking = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  o9  = chronos grid 1d anchor: 2026-01-01T09:00
  c17 = chronos grid 1d anchor: 2026-01-01T17:00
  sessionOpens  = o9 |> first
  sessionCloses = c17 |> first
}
premise LateShop = Base9to17 with {
  source: "example-late"
  o10 = chronos grid 1d anchor: 2026-01-01T10:00
  sessionOpens = o10 |> first
}
premise LateUse { calendar-system: Gregorian; calendar: LateShop; tz: "Asia/Tokyo"; wkst: Mon }
@LateUse
[2026-01-05T09:30, 2026-01-05T10:30] |> filter(t => isOpen(t))
`, JAN);
    expect(kept).toEqual(['2026-01-05T10:30']);   // 開店が 10:00 に繰り下がる（継承 sessionCloses は 17:00）
  });

  it('calendar: 在圏の手動 bizOpen 束縛は静的エラー（言語予約・bizDay と同格）', () => {
    expect(() => run(TSE + `
bizOpen = everyDay
bizOpen
`, JAN)).toThrow(/bizOpen は言語予約の導出名/);
  });

  it('calendar: 在圏の手動 isOpen 束縛は静的エラー', () => {
    expect(() => run(TSE + `
isOpen = t => true
[2026-01-05T09:30] |> filter(t => isOpen(t))
`, JAN)).toThrow(/isOpen は言語予約の導出名/);
  });

  it('sessionOpens/sessionCloses 未宣言の実体で導出語は静的エラー', () => {
    expect(() => run(`
premise NoHours {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "example"
  nonWorking = [2026-01-01] covering: 2026..2026
}
premise NUse { calendar-system: Gregorian; calendar: NoHours; tz: "Asia/Tokyo"; wkst: Mon }
@NUse
bizOpen
`, JAN)).toThrow(/sessionOpens\/sessionCloses を宣言していない/);
  });
});

describe('ADR-41: 覆域の三分岐（範囲外側）と統合', () => {
  it('halfDays covering の外の isOpen は filter で落ちて範囲外の註釈（halfDays 由来）', () => {
    const r = run(TSE + '[2027-01-05T10:00] |> filter(t => isOpen(t))\n',
      { from: '2027-01-01', to: '2027-02-01' });
    expect(r.results[0].dates).toEqual([]);   // 真偽を答えない——落ちて註釈（ADR-37 判断 6）
    expect(r.results[0].annotations.some(a => a.source === 'TSE.halfDays')).toBe(true);
  });

  it('統合: 営業時間内の毎正時（40-examples/06 §6.3 と同じ期待値——正準は isOpen 一語に縮む）', () => {
    // §6.3 の仕様そのまま: 9:00–17:00・祝日 1/1 休業・半日休 1/6 は 11:30 引け
    const dates = evalDates(`
premise TSEx {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "example"
  satSunC    = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  holidays   = [2026-01-01] covering: 2026..2026
  nonWorking = satSunC | holidays
  halfDayCloses = [2026-01-06T11:30] covering: 2026..2026
  sessionOpens  = everyInstant |> strideBy(1d, from: 2026-01-01T09:00)
  close17 = everyInstant |> strideBy(1d, from: 2026-01-01T17:00)
  sessionCloses = (close17 |> filter(t => not coincides(halfDayCloses, day, t))) | halfDayCloses
}
premise BizX {
  calendar-system: Gregorian
  calendar:        TSEx
  tz:              "Asia/Tokyo"
  wkst:            Mon
  hourly = everyInstant |> strideBy(1h, from: 2026-01-01)
}
@BizX
hourly |> filter(t => isOpen(t))
`, { from: '2026-01-05', to: '2026-01-08' });
    expect(dates).toEqual([
      '2026-01-05T09:00', '2026-01-05T10:00', '2026-01-05T11:00', '2026-01-05T12:00',
      '2026-01-05T13:00', '2026-01-05T14:00', '2026-01-05T15:00', '2026-01-05T16:00',
      '2026-01-06T09:00', '2026-01-06T10:00', '2026-01-06T11:00',
      '2026-01-07T09:00', '2026-01-07T10:00', '2026-01-07T11:00', '2026-01-07T12:00',
      '2026-01-07T13:00', '2026-01-07T14:00', '2026-01-07T15:00', '2026-01-07T16:00',
    ]);
  });
});
