// 日付ラベル保存の再錨（rebase・仮称＝ADR-40）と免除系の tz 名検査（ADR-36 改訂 2）
// - rebase(to: "tz"): day 整列の各点の日付ラベルを to tz の同日付の市民日の最初の瞬間へ（単射・順序保存）
// - snapTo＝chronos 所属・rebase＝ラベル対応・coincides＝時刻つき所属、の三分岐
// - 免除系（within・選択子・ordinalIn・cycle/値射影）の市民グリッド tz 名検査
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';

// 東京と NY の営業日カレンダー（1/12＝成人の日・1/19＝MLK。satSun は各 tz の市民日で読む）
const CROSS = `
premise Tok = Gregorian with {
  source: "test-tokyo"; asof: 2026-01-01
  tz: "Asia/Tokyo"
  hol = [2026-01-01, 2026-01-12] covering: 2026..2026
  ss  = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  biz = everyDay \\ (ss | hol)
}
premise NYk = Gregorian with {
  source: "test-ny"; asof: 2026-01-01
  tz: "America/New_York"
  hol = [2026-01-01, 2026-01-19] covering: 2026..2026
  ss  = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  biz = everyDay \\ (ss | hol)
}
premise UNY { calendar-system: Gregorian; tz: "America/New_York"; wkst: Mon }
`;
const NYU = CROSS + '@UNY\n';
const TOKU = `
premise TokU { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@TokU
`;

describe('rebase の意味論（ADR-40 判断 1〜5）', () => {
  it('共通営業日（TSE×NYSE 型の正準例）: rebase がラベル対応を宣言し & は既存の等値のまま', () => {
    const dates = evalDates(NYU + `
(Tok.biz |> rebase(to: "America/New_York")) & NYk.biz
`, { from: '2026-01-01', to: '2026-01-14', tz: 'America/New_York' });
    // 手計算: 東京休 1/1,1/12（成人の日）・NY 休 1/1・週末 1/3-4, 1/10-11 → 共通は日付の一致
    expect(dates).toEqual(['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07',
                           '2026-01-08', '2026-01-09', '2026-01-13']);
  });

  it('snapTo（chronos 所属）との対比: 東京の日先頭は NY の前日に floor される（F69 の字面）', () => {
    const range = { from: '2026-01-01', to: '2026-01-06', tz: 'America/New_York' };
    const byLabel = evalDates(NYU + 'Tok.biz |> rebase(to: "America/New_York")\n', range);
    const byChronos = evalDates(NYU + 'Tok.biz |> snapTo(NYk.day)\n', range);
    expect(byLabel).toEqual(['2026-01-02', '2026-01-05']);                      // 日付ラベル保存
    expect(byChronos).toEqual(['2026-01-01', '2026-01-04', '2026-01-05']);      // 系統的 1 日ずれ
  });

  it('source == to は恒等', () => {
    const range = { from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' };
    const a = run(NYU + 'Tok.biz\n', range).results[0].points;
    const b = run(NYU + 'Tok.biz |> rebase(to: "Asia/Tokyo")\n', range).results[0].points;
    expect(b).toEqual(a);
  });

  it('往復恒等（単射・順序保存の帰結）', () => {
    const range = { from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' };
    const a = run(NYU + 'Tok.biz\n', range).results[0].points;
    const b = run(NYU + `
Tok.biz |> rebase(to: "America/New_York") |> rebase(to: "Asia/Tokyo")
`, range).results[0].points;
    expect(b).toEqual(a);
  });

  it('DST 切替日への rebase: 着地が 23/25h の市民日でも日付ラベルは一致', () => {
    const dates = evalDates(TOKU + `
([2026-03-08, 2026-11-01] covering: ..) |> rebase(to: "America/New_York")
`, { from: '2026-01-01', to: '2027-01-01', tz: 'America/New_York' });
    expect(dates).toEqual(['2026-03-08', '2026-11-01']);   // 23h 日・25h 日の先頭へ
  });

  it('真夜中が DST の隙間に落ちる日への rebase は「最初の瞬間」（チリ 2026-09-06 は 01:00）', () => {
    const dates = evalDates(TOKU + `
([2026-09-06] covering: ..) |> rebase(to: "America/Santiago")
`, { from: '2026-09-01', to: '2026-09-10', tz: 'America/Santiago' });
    expect(dates).toEqual(['2026-09-06T01:00']);
  });

  it('存在しない日付（日付変更線の移動）は明示エラー——Pacific/Apia 2011-12-30', () => {
    expect(() => run(TOKU + `
([2011-12-30] covering: ..) |> rebase(to: "Pacific/Apia")
`, { from: '2011-12-01', to: '2012-01-10', tz: 'Asia/Tokyo' }))
      .toThrow(/存在しない日付 2011-12-30.*Pacific\/Apia/);
  });

  it('shift/roll は rebase の前段が規範——前段 shift の結果が日付ラベルで写る', () => {
    const dates = evalDates(TOKU + `
([2026-01-05] covering: ..) |> shift(2, unit: day) |> rebase(to: "America/New_York")
`, { from: '2026-01-01', to: '2026-02-01', tz: 'America/New_York' });
    expect(dates).toEqual(['2026-01-07']);
  });
});

describe('rebase の入力整列と to: の統治（ADR-40 判断 4/5）', () => {
  it('入力は既定整列の day グリッド——整列なし（時刻つきテーブル）は静的エラー', () => {
    expect(() => run(TOKU + `
([2026-01-05T13:00] covering: ..) |> rebase(to: "UTC")
`, { from: '2026-01-01', to: '2026-02-01' })).toThrow(/既定整列の day グリッド/);
  });

  it('日内オフセットつき（毎日 9 時級）は静的エラー——時刻保存の再錨は将来拡張', () => {
    expect(() => run(TOKU + `
everyInstant |> strideBy(1d, from: 2026-01-05T09:00) |> rebase(to: "UTC")
`, { from: '2026-01-01', to: '2026-02-01' })).toThrow(/既定整列の day グリッド/);
  });

  it('幅 1d 以外（anchor つき粗グリッド）は静的エラー', () => {
    expect(() => run(TOKU + `
everyInstant |> strideBy(2d, from: 2026-01-05) |> rebase(to: "UTC")
`, { from: '2026-01-01', to: '2026-02-01' })).toThrow(/既定整列の day グリッド/);
  });

  it('to: は tz 名の文字列リテラル（必須・premise 名は不可）', () => {
    const Y = { from: '2026-01-01', to: '2026-02-01' };
    expect(() => run(TOKU + 'everyDay |> rebase\n', Y)).toThrow(/to: が必須/);
    expect(() => run(TOKU + 'everyDay |> rebase(to: 42)\n', Y)).toThrow(/文字列リテラル/);
    expect(() => run(TOKU + 'everyDay |> rebase(tox: "UTC")\n', Y)).toThrow(/未知の名前付き引数 tox:/);
  });

  it('註釈の輸送: 端点は source の day 窓に膨らみ、ラベル対応で to tz の日界へ写る（ADR-37 輸送行）', () => {
    const r = run(NYU + `
Tok.biz |> rebase(to: "America/New_York")
`, { from: '2026-12-25', to: '2027-01-10', tz: 'UTC' });
    // Tok.hol の覆域端＝JST 2027-01-01 → 日付ラベル 2027-01-01 → NY の日界（UTC 05:00）へ
    expect(r.results[0].annotations[0]).toEqual(
      expect.objectContaining({ source: 'Tok.hol', from: '2027-01-01T05:00' }));
  });
});

describe('免除系の tz 名検査（ADR-36 改訂 2——ラベル 1 日ずれの束ねを黙って通さない）', () => {
  const range = { from: '2026-01-01', to: '2026-03-01', tz: 'America/New_York' };

  it('within: 市民グリッド入力 × 別 tz の窓要素グリッドは静的エラー・rebase 後は通る', () => {
    expect(() => run(NYU + 'Tok.biz |> within(month) |> first\n', range))
      .toThrow(/within: 入力と窓の tz 名が不一致.*rebase/);
    const dates = evalDates(NYU + `
(Tok.biz |> rebase(to: "America/New_York")) |> within(month) |> first
`, range);
    expect(dates).toEqual(['2026-01-02', '2026-02-02']);   // NY の月窓で東京営業日（日付）の月初
  });

  it('ordinalIn: 述語に流れる点の整列 × 枠窓の tz 不一致は静的エラー', () => {
    expect(() => run(NYU + `
Tok.biz |> filter(d => ordinalIn(day, month, d) == 15)
`, range)).toThrow(/ordinalIn: 入力と窓の tz 名が不一致/);
  });

  it('値射影（weekday）: cycle の対象グリッドと別 tz の入力は静的エラー・rebase 後は通る', () => {
    expect(() => run(NYU + `
Tok.biz |> filter(d => weekday(d) == Mon)
`, range)).toThrow(/cycle 射影: 入力と窓の tz 名が不一致/);
    const dates = evalDates(NYU + `
(Tok.biz |> rebase(to: "America/New_York")) |> filter(d => weekday(d) == Mon)
`, { from: '2026-01-01', to: '2026-02-01', tz: 'America/New_York' });
    expect(dates).toEqual(['2026-01-05', '2026-01-19', '2026-01-26']);   // 1/12 は東京休で欠ける
  });

  it('選択子: 別 tz マーカーの segmentBy 窓での first は静的エラー', () => {
    expect(() => run(NYU + `
Tok.biz |> segmentBy(NYk.biz, edges: drop, empties: keep) |> first
`, range)).toThrow(/選択子 first: 入力と窓の tz 名が不一致/);
  });

  it('snapTo は除外（chronos 所属が文書化済みの意味）——クロス tz でも検査なしで通る', () => {
    const dates = evalDates(NYU + 'Tok.biz |> snapTo(NYk.day)\n',
      { from: '2026-01-01', to: '2026-01-06', tz: 'America/New_York' });
    expect(dates.length).toBeGreaterThan(0);
  });
});
