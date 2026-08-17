// 先頭 N 選択 take(n, from:)（ADR-49・draft §1.30）
// - from: 以後の入力点の先頭 n 点だけを通す（入力カウント・評価範囲は外延の切り取り窓）
// - 「除外後に数える」が合成順で出る＝RRULE COUNT の轍（除外前に数える）を踏まない（rrule.js #456 型）
// - 輸送行: stride 行の同型＋縮小（第 n 点確定後に始まる註釈は輸送しない＝n 到達後は正当な空）
// - 窓付き入力・n<1 は静的エラー
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';

const JP = `
premise JP { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@JP
`;

describe('take——基本と COUNT の轍（ADR-49）', () => {
  it('講座 5 回・休講 2 回: 除外後に数えるので補充が出る（rrule.js #456 の対比）', () => {
    const d = evalDates(JP + `
lessons   = everyDay |> filter(d => weekday(d) == Tue)
cancelled = [2026-04-14, 2026-05-05] covering: 2026-04-01..2026-07-01
(lessons \\ cancelled) |> take(5, from: 2026-04-01)`,
      { from: '2026-04-01', to: '2026-08-01' });
    // COUNT=5＋EXDATE なら 4/7・4/21・4/28 の 3 回に痩せる——take は 5/12・5/19 へ補充
    expect(d).toEqual(['2026-04-07', '2026-04-21', '2026-04-28', '2026-05-12', '2026-05-19']);
  });

  it('from: より前の入力点は出ない（stride 一族の from: 規約）', () => {
    const d = evalDates(JP + `everyDay |> take(3, from: 2026-02-01)`,
      { from: '2026-01-01', to: '2026-03-01' });
    expect(d).toEqual(['2026-02-01', '2026-02-02', '2026-02-03']);
  });

  it('評価範囲は外延の切り取り窓——範囲が先頭 n 点の一部なら含む分だけ・再数えなし', () => {
    const d = evalDates(JP + `everyDay |> take(5, from: 2026-01-05)`,
      { from: '2026-01-07', to: '2026-03-01' });
    // 外延は 1/5..1/9 の 5 点。範囲 [1/7, 3/1) が含むのは 1/7・1/8・1/9 のみ（1/10 以降へ延びない）
    expect(d).toEqual(['2026-01-07', '2026-01-08', '2026-01-09']);
  });

  it('n 到達後は正当な空——第 n 点確定後に始まる覆域切れは輸送しない（縮小規定）', () => {
    const r = run(JP + `
a = [2026-01-05, 2026-01-06, 2026-01-07, 2026-01-08] covering: 2026-01-01..2026-01-10
a |> take(3, from: 2026-01-01)`,
      { from: '2026-01-01', to: '2026-03-01' });
    expect(r.results[0].dates).toEqual(['2026-01-05', '2026-01-06', '2026-01-07']);
    // covering は 1/10 で尽きるが、第 3 点（1/7）は交差より前に確定——註釈ゼロ
    expect(r.results[0].annotations).toEqual([]);
  });

  it('覆域切れが第 n 点より前なら以後すべて註釈（stride 行の同型・順位が暫定と可観測）', () => {
    const r = run(JP + `
a = [2026-01-05, 2026-01-06] covering: 2026-01-01..2026-01-10
a |> take(5, from: 2026-01-01)`,
      { from: '2026-01-01', to: '2026-03-01' });
    expect(r.results[0].dates).toEqual(['2026-01-05', '2026-01-06']);   // n 未達＝観測分のみ
    expect(r.results[0].annotations.length).toBeGreaterThan(0);         // 覆域外＝順位不確定の註釈
  });

  it('take(0)・負値は静的エラー（stride(0) 根絶と同規約・ADR-38 判断 12）', () => {
    expect(() => run(JP + `everyDay |> take(0, from: 2026-01-01)`,
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/1 以上の整数/);
  });

  it('from: 必須（ADR-31・一族共通）', () => {
    expect(() => run(JP + `everyDay |> take(3)`,
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/from: が必須/);
  });

  it('窓付き入力は誘導つき静的エラー（「窓ごとの先頭 N」は within＋nth へ）', () => {
    expect(() => run(JP + `everyDay |> within(month) |> take(3, from: 2026-01-01)`,
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/窓付き入力は取らない/);
  });
});
