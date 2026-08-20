// 末尾 N 選択 takeLast(n, until:)（ADR-52・draft §1.33——take の鏡像）
// - until: 以前（until: の点を含む）の入力点の末尾 n 点だけを通す（入力カウント・until: 必須）
// - 直近 N は確定済みの過去側を数える＝定常状態（until ≤ 覆域尾）では註釈なしで確定的に出る
// - 輸送行: ADR-49 判断 5 の鏡像＋縮小（交差せず第 n 点確定なら、それより過去で完結する註釈は輸送しない）
// - 実装地平線ガード 2 面（until ≥ computeEnd の endless 入力・実体化下限）＝ADR-37 判断 8・F107 同族
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';

const JP = `
premise JP { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@JP
`;

// 年数回レシピの型（天赦日級・還流第 12 便 A-3/B-3 の motivating example）
const TENSHA = `
tensha = [2026-01-06, 2026-03-05, 2026-05-25, 2026-07-24, 2026-10-06, 2026-12-21] covering: 2026-01-01..2026-12-31
`;

describe('takeLast——基本と直近 N（ADR-52）', () => {
  it('直近 3 発火: until: 以前の末尾 3 点（366 日窓の代替が消える形）', () => {
    const d = evalDates(JP + TENSHA + `tensha |> takeLast(3, until: 2026-08-21)`,
      { from: '2026-01-01', to: '2026-12-31' });
    expect(d).toEqual(['2026-03-05', '2026-05-25', '2026-07-24']);
  });

  it('until: の点を含む（from: 対称・RFC 5545 UNTIL と同じ包含）', () => {
    const d = evalDates(JP + TENSHA + `tensha |> takeLast(2, until: 2026-07-24)`,
      { from: '2026-01-01', to: '2026-12-31' });
    expect(d).toEqual(['2026-05-25', '2026-07-24']);
  });

  it('粒度の罠: 日付リテラル until: は 00:00 錨——当日の時刻付き発火は含まない（文書必修の実測固定）', () => {
    const d = run(JP + `
marks = [2026-03-05, 2026-05-25] covering: 2026-01-01..2026-12-31
(marks |> at(T07:00)) |> takeLast(1, until: 2026-05-25)`,
      { from: '2026-01-01', to: '2026-12-31' });
    // 5/25T07:00 は 5/25T00:00 より後＝含まれない——直近は 3/5 側。正道は「数える段は日の層・時刻付与は後」
    expect(d.results[0].dates).toEqual(['2026-03-05T07:00']);
  });

  it('数える段は日の層・時刻付与は後——takeLast |> at の合成が推奨形', () => {
    const d = evalDates(JP + TENSHA + `tensha |> takeLast(2, until: 2026-08-21) |> at(T07:00)`,
      { from: '2026-01-01', to: '2026-12-31' });
    expect(d).toEqual(['2026-05-25T07:00', '2026-07-24T07:00']);
  });

  it('定常状態（until ≤ 覆域尾）は註釈なしで確定的——直近 N は確定済み過去側を数える', () => {
    const r = run(JP + TENSHA + `tensha |> takeLast(3, until: 2026-08-21)`,
      { from: '2026-01-01', to: '2026-10-01' });
    expect(r.results[0].annotations).toEqual([]);
  });

  it('until: が覆域尾を越えると全出力が暫定（未知のより直近があり得る——鏡像の輸送）', () => {
    const r = run(JP + TENSHA + `tensha |> takeLast(2, until: 2027-06-01)`,
      { from: '2026-01-01', to: '2026-12-31' });
    expect(r.results[0].dates).toEqual(['2026-10-06', '2026-12-21']);
    expect(r.results[0].annotations.length).toBeGreaterThan(0);
  });

  it('縮小規定: 交差せず第 n 点が確定したら、それより過去で完結する覆域切れは輸送しない', () => {
    const r = run(JP + `
a = [2026-03-05, 2026-05-25, 2026-07-24] covering: 2026-02-01..2026-12-31
a |> takeLast(2, until: 2026-08-21)`,
      { from: '2026-02-01', to: '2026-12-31' });
    // 覆域の頭（〜2/1）は第 n 点（5/25）より過去で完結——輸送されず註釈ゼロ
    expect(r.results[0].dates).toEqual(['2026-05-25', '2026-07-24']);
    expect(r.results[0].annotations).toEqual([]);
  });

  it('覆域の頭で第 n 点が前に落ちる（開始直後・まだ n 個ない）は註釈で可観測', () => {
    const r = run(JP + `
a = [2026-03-05, 2026-05-25] covering: 2026-02-01..2026-12-31
a |> takeLast(3, until: 2026-08-21)`,
      { from: '2026-01-01', to: '2026-12-31' });
    expect(r.results[0].dates).toEqual(['2026-03-05', '2026-05-25']);   // n 未達＝観測分のみ
    expect(r.results[0].annotations.length).toBeGreaterThan(0);         // 頭の覆域外＝順位が暫定
  });
});

describe('takeLast——実装地平線ガードと静的エラー（ADR-37 判断 8・F107 同族）', () => {
  it('endless 入力 × until ≥ computeEnd は警告（実体化済み末尾の取り違え防止）', () => {
    const r = run(JP + `everyDay |> filter(d => weekday(d) == Fri) |> takeLast(3, until: 2028-12-31)`,
      { from: '2026-01-01', to: '2026-02-01' });
    expect(r.warnings.some(w => /horizon-clip: takeLast until/.test(w))).toBe(true);
  });

  it('実体化下限で n 個に満たない生成子入力は警告（黙って n 未満にしない）', () => {
    const r = run(JP + `everyDay |> takeLast(3, until: 1970-01-02)`,
      { from: '2026-01-01', to: '2026-02-01' });
    expect(r.warnings.some(w => /実体化下限で切れ——n=3 個中 2 個のみ/.test(w))).toBe(true);
  });

  it('テーブル由来の n 未満は正当（警告なし・頭は註釈の経路が受け持つ）', () => {
    const r = run(JP + TENSHA + `tensha |> takeLast(10, until: 2026-08-21)`,
      { from: '2026-01-01', to: '2026-12-31' });
    expect(r.warnings.filter(w => /takeLast/.test(w))).toEqual([]);
  });

  it('takeLast(0)・負値は静的エラー（ADR-38 判断 12 と同規約）', () => {
    expect(() => run(JP + `everyDay |> takeLast(0, until: 2026-01-01)`,
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/1 以上の整数/);
  });

  it('until: 必須（ADR-31 の対称）', () => {
    expect(() => run(JP + `everyDay |> takeLast(3)`,
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/until: が必須/);
  });

  it('錨の取り違えは専用診断: takeLast(from:) → until: へ・take(until:) → from: へ', () => {
    expect(() => run(JP + `everyDay |> takeLast(3, from: 2026-01-01)`,
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/takeLast の錨は until:/);
    expect(() => run(JP + `everyDay |> take(3, until: 2026-01-01)`,
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/take の錨は from:/);
  });

  it('窓付き入力は誘導つき静的エラー（「窓ごとの最後の N」は last／shift(-k) の和へ）', () => {
    expect(() => run(JP + `everyDay |> within(month) |> takeLast(3, until: 2026-06-01)`,
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/窓付き入力は取らない/);
  });

  it('出力は静的有限（endless: false）——take も同時修正（ADR-39 の有限性分類との一致）', () => {
    // 生成子由来でも takeLast/take を通せば有限——labels: マーカー適格の副産物（ADR-49 判断 7 と同じ行）
    const r = run(JP + `everyDay |> takeLast(2, until: 2026-06-01)`,
      { from: '2026-01-01', to: '2026-12-31' });
    expect(r.results[0].dates).toEqual(['2026-05-31', '2026-06-01']);
  });
});
