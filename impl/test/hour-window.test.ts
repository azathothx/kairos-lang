// hour 窓の標準化＋ordinalIn 整合検査（ADR-50・draft §1.31）
// - Gregorian 標準に hour = chronos grid 1h（経過 1 時間タイル・市民時ではない）
// - 整合検査（新設）: 経過幅グリッドの単位窓 × 枠窓で、枠窓の開始が単位の目盛り上にないとき明示エラー
//   ——破れの述語は「紀元差が単位幅の整数倍か」（tz 履歴依存・per-instance）。
//   Kolkata（恒常 +05:30）は整列して正しく動き、Kathmandu（1986 遷移）・Singapore（1981 遷移・
//   現行整数時なのに破れる反例）・Lord_Howe 冬（半時 DST）は検査が弾く
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';

const P = (tz: string) => `
premise T { calendar-system: Gregorian; tz: "${tz}"; wkst: Mon }
@T
`;

describe('hour 窓と整合検査（ADR-50）', () => {
  it('標準 hour が派生なしで使える（JST・壁+1 の序数読み・11 §(l) の形）', () => {
    const d = evalDates(P('Asia/Tokyo') + `
everyInstant |> strideBy(1h30m, from: 2026-01-05T09:00)
  |> filter(d => ordinalIn(hour, day, d) >= 10 and ordinalIn(hour, day, d) <= 17)`,
      { from: '2026-01-05', to: '2026-01-06' });
    expect(d).toEqual(['2026-01-05T09:00', '2026-01-05T10:30', '2026-01-05T12:00',
                       '2026-01-05T13:30', '2026-01-05T15:00', '2026-01-05T16:30']);
  });

  it('Kolkata（恒常 +05:30）は整列——非整数時オフセットでも紀元差ゼロなら正しく動く', () => {
    const d = evalDates(P('Asia/Kolkata')
      + `everyInstant |> strideBy(1d, from: 2026-06-01T05:10) |> filter(d => ordinalIn(hour, day, d) == 6)`,
      { from: '2026-06-01', to: '2026-06-03', tz: 'Asia/Kolkata' });
    expect(d).toEqual(['2026-06-01T05:10', '2026-06-02T05:10']);
  });

  it('Kathmandu（1986 に +05:30→+05:45）は整合検査が弾く——黙って半端な序数を出さない', () => {
    expect(() => run(P('Asia/Kathmandu')
      + `everyInstant |> strideBy(1d, from: 2026-06-01T05:10) |> filter(d => ordinalIn(hour, day, d) == 6)`,
      { from: '2026-06-01', to: '2026-06-03', tz: 'Asia/Kathmandu' })).toThrow(/目盛り上に/);
  });

  it('Singapore（1981 に +07:30→+08:00）も弾く——現行整数時オフセットなのに破れる反例', () => {
    expect(() => run(P('Asia/Singapore')
      + `everyInstant |> strideBy(1d, from: 2026-06-01T05:10) |> filter(d => ordinalIn(hour, day, d) == 6)`,
      { from: '2026-06-01', to: '2026-06-03', tz: 'Asia/Singapore' })).toThrow(/目盛り上に/);
  });

  it('Lord_Howe（半時 DST・季節で整列が反転）も弾く——実体化余白（+400 日）が反転季を必ず跨ぐ', () => {
    // 検査は per-instance（読んだ枠窓ごと）だが、filter は実体化範囲の全点に述語を当てるため、
    // 季節反転 tz では夏の評価でも冬の窓に当たって予告的にエラーになる（安全側・黙誤読ゼロ）
    expect(() => run(P('Australia/Lord_Howe')
      + `everyInstant |> strideBy(1d, from: 2026-01-05T05:10) |> filter(d => ordinalIn(hour, day, d) == 6)`,
      { from: '2026-01-05', to: '2026-01-07', tz: 'Australia/Lord_Howe' })).toThrow(/目盛り上に/);
  });

  it('NY の秋戻し日は境界一致のまま 25 タイル——序数は壁+1 とずれる（落とし穴の実測固定）', () => {
    const d = evalDates(P('America/New_York')
      + `everyInstant |> strideBy(1d, from: 2026-10-31T23:30) |> filter(d => ordinalIn(hour, day, d) == 25)`,
      { from: '2026-10-31', to: '2026-11-03', tz: 'America/New_York' });
    // 2026 の秋戻しは 11/1——この日だけ壁 23:30 が第 25 タイル
    expect(d).toEqual(['2026-11-01T23:30']);
  });
});
