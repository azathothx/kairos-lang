// 多 TZ 対応（ADR-33/35/36/37 の幾何側の実装検証）
// - IANA tz（Intl ベース・依存ゼロ）: DST のある tz の市民日グリッド・23/25h の切替日
// - premise 相対 TZ（射影パラメータモデル）: day グリッド・紀元・リテラル錨打ちが在圏 tz
// - DST の隙間・重複リテラルは明示エラー（ADR-33 判断 4）
// - covering 端の tz 解決（ADR-37 判断 1）・Kyureki 型の内側固定（ADR-33 判断 10・ADR-35 判断 8）
// - クロス tz の snapTo は「chronos の重なり」意味（F69 の前提の固定）
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';

const NY = `
premise NYCal { calendar-system: Gregorian; tz: "America/New_York"; wkst: Mon }
@NYCal
`;
const UTCP = `
premise UTCCal { calendar-system: Gregorian; tz: "UTC"; wkst: Mon }
@UTCCal
`;

describe('DST の市民日（ADR-11/12: 1d は市民日であって 86400s ではない）', () => {
  it('春の切替日（2026-03-08 NY）は 23 時間・秋（2026-11-01）は 25 時間', () => {
    const r = run(NY + 'everyDay\n', { from: '2026-03-07', to: '2026-03-10', tz: 'America/New_York' });
    const p = r.results[0].points;
    expect(r.results[0].dates).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
    expect(p[1] - p[0]).toBe(24 * 3600e3);
    expect(p[2] - p[1]).toBe(23 * 3600e3);   // 03-08 は 23h
    const r2 = run(NY + 'everyDay\n', { from: '2026-10-31', to: '2026-11-03', tz: 'America/New_York' });
    const q = r2.results[0].points;
    expect(q[2] - q[1]).toBe(25 * 3600e3);   // 11-01 は 25h
  });

  it('strideBy(24h)＝経過時間は切替日で市民日からずれる（everyDay と分岐）', () => {
    const dates = evalDates(NY + `
everyInstant |> strideBy(24h, from: 2026-03-07)
`, { from: '2026-03-07', to: '2026-03-10', tz: 'America/New_York' });
    expect(dates).toEqual(['2026-03-07', '2026-03-08', '2026-03-09T01:00']);   // 1d ≠ 86400s
  });

  it('strideBy(1d)＝市民時幅は壁時計を保存する（切替日を跨いでも真夜中）', () => {
    const dates = evalDates(NY + `
everyInstant |> strideBy(1d, from: 2026-03-07)
`, { from: '2026-03-07', to: '2026-03-10', tz: 'America/New_York' });
    expect(dates).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
  });

  it('切替日を跨ぐ shift(unit: day) は壁時計を保存する', () => {
    const dates = evalDates(NY + `
[2026-03-07] |> shift(2, unit: day)
`, { from: '2026-03-01', to: '2026-03-15', tz: 'America/New_York' });
    expect(dates).toEqual(['2026-03-09']);
  });

  it('切替日（日曜）を跨ぐ roll(Following) が月曜へ寄る', () => {
    const dates = evalDates(NY + `
wd = everyDay |> filter(d => not (weekday(d) == Sat or weekday(d) == Sun))
[2026-03-07] |> roll(Following, on: wd)
`, { from: '2026-03-01', to: '2026-03-15', tz: 'America/New_York' });
    expect(dates).toEqual(['2026-03-09']);
  });

  it('週窓（segmentBy 製）も可変幅の市民日から正しく組み上がる', () => {
    const dates = evalDates(NY + `
everyDay |> within(week) |> first
`, { from: '2026-03-02', to: '2026-03-16', tz: 'America/New_York' });
    expect(dates).toEqual(['2026-03-02', '2026-03-09']);   // 月曜始まり・DST 週も 7 市民日
  });
});

describe('DST の隙間・重複リテラルは明示エラー（ADR-33 判断 4）', () => {
  it('存在しない時刻（春の隙間）', () => {
    expect(() => run(NY + '[2026-03-08T02:30]\n', { from: '2026-03-01', to: '2026-04-01', tz: 'America/New_York' }))
      .toThrow(/存在しない時刻: 2026-03-08T02:30.*DST の隙間/);
  });

  it('二意の時刻（秋の重複）', () => {
    expect(() => run(NY + '[2026-11-01T01:30]\n', { from: '2026-10-01', to: '2026-12-01', tz: 'America/New_York' }))
      .toThrow(/二意の時刻: 2026-11-01T01:30.*DST の重複/);
  });

  it('日付リテラルは「その日付になる最初の瞬間」——真夜中が隙間なら遷移点（チリ 2026-09-06）', () => {
    const dates = evalDates(`
premise SCL { calendar-system: Gregorian; tz: "America/Santiago"; wkst: Mon }
@SCL
[2026-09-06]
`, { from: '2026-09-01', to: '2026-09-10', tz: 'America/Santiago' });
    expect(dates).toEqual(['2026-09-06T01:00']);   // 00:00 は存在しない——市民日は 01:00 に始まる
  });

  it('不正な tz 名は静的エラー', () => {
    expect(() => run(NY + 'everyDay\n', { from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokio' }))
      .toThrow(/不正な tz 名/);
  });
});

describe('premise 相対 TZ（ADR-33 射影パラメータモデル）', () => {
  it('同じ式が premise の tz で別の chronos 点列になる（day グリッドは premise ごと）', () => {
    const range = { from: '2026-01-01', to: '2026-01-02', tz: 'UTC' };
    const tokyo = evalDates(`
premise TK { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@TK
everyDay
`, range);
    const ny = evalDates(NY + 'everyDay\n', range);
    expect(tokyo).toEqual(['2026-01-01T15:00']);   // 東京の 1/2 の開始（UTC 表示）
    expect(ny).toEqual(['2026-01-01T05:00']);      // NY の 1/1 の開始（UTC 表示）
  });

  it('紀元は在圏 tz の写像の逆像——1970-01-01T00:00 は tz ごとに chronos 上の別の点（ADR-33 判断 7）', () => {
    const range = { from: '1970-01-01', to: '1970-01-03', tz: 'UTC' };
    expect(evalDates(NY + 'everyDay\n', range))
      .toEqual(['1970-01-01T05:00', '1970-01-02T05:00']);
    expect(evalDates(UTCP + 'everyDay\n', range))
      .toEqual(['1970-01-01', '1970-01-02']);
  });

  it('epochOrdinal・月窓の境界も premise 相対（NY の 1 月は NY の市民日で始まる）', () => {
    const dates = evalDates(NY + `
everyDay |> filter(d => epochOrdinal(month, d) mod 12 == 0) |> within(month) |> first
`, { from: '2026-01-01', to: '2026-02-01', tz: 'America/New_York' });
    expect(dates).toEqual(['2026-01-01']);
  });

  it('covering の端は premise の tz の市民日で解決する（ADR-37 判断 1）', () => {
    // NY の 2026-12-31T23:30 は UTC/東京では 2027 年——覆域が NY の市民日で解決されるから包含に通る
    const r = run(NY + `
h = [2026-12-31T23:30] covering: 2026..2026
everyDay \\ (h |> snapTo(day))
`, { from: '2026-12-25', to: '2027-01-10', tz: 'UTC' });
    // 註釈の始まり＝NY の 2027-01-01T00:00 ＝ UTC 05:00（覆域端が NY 市民日である証拠）
    expect(r.results[0].annotations[0].from).toBe('2027-01-01T05:00');
  });

  it('整列の tz 名不一致は実幾何の不一致として静的エラー（ADR-36——名札でなく実グリッド）', () => {
    expect(() => run(`
premise U { calendar-system: Gregorian; tz: "UTC"; u = [2026-01-05] covering: .. }
premise TK { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@TK
everyDay \\ U.u
`, { from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' }))
      .toThrow(/整列が同一でない.*UTC/s);
  });
});

describe('クロス tz の所属と内側固定（ADR-33 判断 10・F69 の前提）', () => {
  it('snapTo は「chronos の重なり」——東京の日先頭は NY の前日に floor される', () => {
    const dates = evalDates(`
premise NYd = Gregorian with { tz: "America/New_York" }
premise TK { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@TK
[2026-03-05] |> snapTo(NYd.day)
`, { from: '2026-03-01', to: '2026-03-10', tz: 'UTC' });
    // 東京 3/5 00:00 = UTC 3/4 15:00 = NY 3/4 10:00 → NY の 3/4 の先頭（UTC 05:00）へ floor
    expect(dates).toEqual(['2026-03-04T05:00']);
  });

  it('Kyureki 型の内側固定: 利用側 premise が別 tz でも朔日は動かない（member 解決規則）', () => {
    const KJ = `
premise KJ = Gregorian with {
  source: "test"; asof: 2027-01-01
  tz: "Asia/Tokyo"
  newMoons = [2027-02-07T00:56] covering: ..
  lunarStartJ = newMoons |> snapTo(day)
}
`;
    const range = { from: '2027-02-01', to: '2027-02-10', tz: 'UTC' };
    const fromTokyo = evalDates(KJ + `
premise TK { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@TK
KJ.lunarStartJ
`, range);
    const fromNY = evalDates(KJ + `
premise NYU { calendar-system: Gregorian; tz: "America/New_York"; wkst: Mon }
@NYU
KJ.lunarStartJ
`, range);
    expect(fromTokyo).toEqual(['2027-02-06T15:00']);   // JST 2/7 00:00（UTC 表示）
    expect(fromNY).toEqual(fromTokyo);                 // 利用側 tz に依らない（内側固定）
  });

  it('2027 春節の JST/CST 割れ: 同じ朔の瞬間が JST では 2/7・CST では 2/6 の朔日になる', () => {
    // 朔 = UTC 2027-02-06T15:56（JST 2/7 00:56・CST 2/6 23:56）——95-reference-data の素材
    const range = { from: '2027-02-01', to: '2027-02-10', tz: 'UTC' };
    const src = `
premise KJ = Gregorian with {
  source: "test"; asof: 2027-01-01
  tz: "Asia/Tokyo"
  newMoonsJ = [2027-02-07T00:56] covering: ..
  lunarStartJ = newMoonsJ |> snapTo(day)
}
premise KC = Gregorian with {
  source: "test"; asof: 2027-01-01
  tz: "Asia/Shanghai"
  newMoonsC = [2027-02-06T23:56] covering: ..
  lunarStartC = newMoonsC |> snapTo(day)
}
premise UTCCal2 { calendar-system: Gregorian; tz: "UTC"; wkst: Mon }
@UTCCal2
KJ.newMoonsJ
KC.newMoonsC
KJ.lunarStartJ
KC.lunarStartC
`;
    const r = run(src, range);
    // 同じ瞬間（壁時計が違うだけ）——UTC 表示で一致
    expect(r.results[0].dates).toEqual(['2027-02-06T15:56']);
    expect(r.results[1].dates).toEqual(r.results[0].dates);
    // 朔日は市民日への floor で割れる: JST → 2/7（UTC 2/6 15:00）・CST → 2/6（UTC 2/5 16:00）
    expect(r.results[2].dates).toEqual(['2027-02-06T15:00']);
    expect(r.results[3].dates).toEqual(['2027-02-05T16:00']);
  });
});

describe('時刻付き anchor/from: の窓境界＝壁時計ラベル読み（ADR-31 改訂 2・F87 の修正）', () => {
  it('切替日 anchor の grid 1d が全日 09:00 を刻み anchor 自身を通る（NY 2026-03-08T09:00）', () => {
    const dates = evalDates(NY + `
chronos grid 1d anchor: 2026-03-08T09:00
`, { from: '2026-03-07', to: '2026-03-10', tz: 'America/New_York' });
    expect(dates).toEqual(['2026-03-07T09:00', '2026-03-08T09:00', '2026-03-09T09:00']);
  });

  it('strideBy の時刻付き from: も同じ規定（切替日 from: でも全日 09:00）', () => {
    const dates = evalDates(NY + `
everyInstant |> strideBy(1d, from: 2026-03-08T09:00)
`, { from: '2026-03-08', to: '2026-03-11', tz: 'America/New_York' });
    expect(dates).toEqual(['2026-03-08T09:00', '2026-03-09T09:00', '2026-03-10T09:00']);
  });

  it('同じ壁時計 anchor の 2 本（通常日 1/1 と切替日 3/8）が同一 G——結合子 & が成立し点も一致', () => {
    const dates = evalDates(NY + `
(chronos grid 1d anchor: 2026-01-01T09:00) & (everyInstant |> strideBy(1d, from: 2026-03-08T09:00))
`, { from: '2026-03-08', to: '2026-03-11', tz: 'America/New_York' });
    expect(dates).toEqual(['2026-03-08T09:00', '2026-03-09T09:00', '2026-03-10T09:00']);
  });

  it('anchor の壁時計が存在しない市民日（DST の隙間）は隙間明けの最初の瞬間に目盛り', () => {
    const dates = evalDates(NY + `
chronos grid 1d anchor: 2026-01-01T02:30
`, { from: '2026-03-07', to: '2026-03-10', tz: 'America/New_York' });
    expect(dates).toEqual(['2026-03-07T02:30', '2026-03-08T03:00', '2026-03-09T02:30']);
  });

  it('二度ある市民日（秋戻し）は最初の出現に目盛り（01:30 は EDT 側）', () => {
    const r = run(NY + 'chronos grid 1d anchor: 2026-01-01T01:30\n',
      { from: '2026-10-31', to: '2026-11-03', tz: 'America/New_York' });
    expect(r.results[0].dates).toEqual(['2026-10-31T01:30', '2026-11-01T01:30', '2026-11-02T01:30']);
    const p = r.results[0].points;
    expect(p[1] - p[0]).toBe(24 * 3600e3);   // 最初の出現（EDT）——EST 側なら 25h になる
    expect(p[2] - p[1]).toBe(25 * 3600e3);
  });
});

describe('shift(unit: 市民窓語) の窓内オフセットは経過保存（ADR-31 改訂 2・F83 (a) の固定）', () => {
  it('切替日をまたぐ shift(+1, unit: day) は壁時計が変わる（3/7T09:00 → 3/8T10:00＝定義された挙動）', () => {
    const dates = evalDates(NY + `
[2026-03-07T09:00] |> shift(1, unit: day)
`, { from: '2026-03-01', to: '2026-03-15', tz: 'America/New_York' });
    expect(dates).toEqual(['2026-03-08T10:00']);
  });

  it('秋戻しの二重 01:00 は +1 day で 2 点のまま（01:00 と 02:00 へ単射着地・併合しない）', () => {
    const r = run(NY + 'everyInstant |> strideBy(1h, from: 2026-11-01) |> shift(1, unit: day)\n',
      { from: '2026-11-02', to: '2026-11-03', tz: 'America/New_York' });
    const d = r.results[0].dates;
    expect(d.length).toBe(24);   // 25h 日の先頭 24 点が 11/2 に単射着地（順序保存）
    expect(d.slice(0, 4)).toEqual(['2026-11-02', '2026-11-02T01:00', '2026-11-02T02:00', '2026-11-02T03:00']);
  });

  it('往復（+1 day → −1 day）は恒等——二重 01:00 の 2 点も元の 2 点へ戻る', () => {
    const range = { from: '2026-11-01', to: '2026-11-02', tz: 'America/New_York' };
    const orig = run(NY + 'everyInstant |> strideBy(1h, from: 2026-11-01)\n', range).results[0];
    const back = run(NY
      + 'everyInstant |> strideBy(1h, from: 2026-11-01) |> shift(1, unit: day) |> shift(-1, unit: day)\n',
      range).results[0];
    expect(back.points.slice(0, 4)).toEqual(orig.points.slice(0, 4));   // 00:00・01:00EDT・01:00EST・02:00
  });

  it('真夜中遷移 tz（Santiago）でも everyDay |> shift(+1, unit: day) は常に日開始に着地', () => {
    const dates = evalDates(`
premise SCL { calendar-system: Gregorian; tz: "America/Santiago"; wkst: Mon }
@SCL
everyDay |> shift(1, unit: day)
`, { from: '2026-09-05', to: '2026-09-08', tz: 'America/Santiago' });
    expect(dates).toEqual(['2026-09-05', '2026-09-06T01:00', '2026-09-07']);
  });
});

describe('tz: 宣言必須の執行（ADR-35 判断 1 / ADR-37 判断 1）', () => {
  it('covering:/日付テーブルを持つ premise は tz: 宣言必須（宣言時の静的エラー）', () => {
    expect(() => run(`
premise NoTz { calendar-system: Gregorian; h = [2026-01-01] covering: 2026..2026 }
NoTz.h
`, { from: '2026-01-01', to: '2026-02-01' })).toThrow(/premise は tz: を宣言する/);
  });

  it('base 連鎖の tz: 宣言でもよい（member 解決規則の内側固定）', () => {
    const dates = evalDates(`
premise HasTz { calendar-system: Gregorian; tz: "Asia/Tokyo" }
premise Derived = HasTz with { h = [2026-01-05] covering: 2026..2026 }
premise TK { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@TK
Derived.h
`, { from: '2026-01-01', to: '2026-02-01' });
    expect(dates).toEqual(['2026-01-05']);
  });
});
