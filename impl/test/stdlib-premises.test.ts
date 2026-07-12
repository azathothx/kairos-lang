// 同梱 stdlib premise（Fiscal・ISOWeek）と切れ端窓（I5）の回帰テスト
// - ISO 週暦は JS 実装の isocalendar を独立オラクルに全数照合（label: 不要の等価変形の検証）
// - span phase>0 の頭・split 末尾の切れ端窓（有界実体化と I5 の整合）
import { describe, it, expect } from 'vitest';
import { evalDates } from '../src/index.ts';
import { iso, addDays } from './helpers.ts';

const FY = 'premise FY { calendar-system: Fiscal; tz: "Asia/Tokyo"; wkst: Mon }\n@FY\n';
const ISO = 'premise ISO { calendar-system: ISOWeek; tz: "Asia/Tokyo"; wkst: Mon }\n@ISO\n';
const G = 'premise G { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }\n@G\n';

// ---- 独立オラクル: ISO 8601 週暦（JS Date・UTC 算術） ----

/** ISO 週暦の (isoYear, isoWeekNo, isoWeekday) を返す（isocalendar 相当） */
function isoCalendar(d: Date): [number, number, number] {
  const wd = ((d.getUTCDay() + 6) % 7) + 1;            // 月=1 … 日=7
  const thursday = addDays(d, 4 - wd);                 // その週の木曜
  const y = thursday.getUTCFullYear();
  const jan1 = new Date(Date.UTC(y, 0, 1));
  const week = Math.floor((thursday.getTime() - jan1.getTime()) / 86_400_000 / 7) + 1;
  return [y, week, wd];
}

describe('stdlib: Fiscal（会計暦）', () => {
  it('fiscalYearNo: FY2026 = 2026-04-01〜2027-03-31（開始暦年の規約）', () => {
    const opts = { from: '2025-01-01', to: '2028-01-01' };
    expect(evalDates(FY + 'everyDay |> filter(d => fiscalYearNo(d) == 2026) |> within(year) |> first', opts))
      .toEqual(['2026-04-01']);
    expect(evalDates(FY + 'everyDay |> filter(d => fiscalYearNo(d) == 2026) |> within(year) |> last', opts))
      .toEqual(['2027-03-31']);
  });

  it('fiscalMonthNo: 会計月番号（4 月=1 … 3 月=12）——span phase>0 の頭の切れ端窓の回帰', () => {
    // 修正前は「ordinalIn: 点が枠窓の外」（1970-01〜03 が year 窓に覆われない実装アーティファクト）
    expect(evalDates(FY + 'everyDay |> filter(d => fiscalMonthNo(d) == 3) |> within(month) |> first',
      { from: '2026-04-01', to: '2027-04-01' })).toEqual(['2026-06-01']);
    expect(evalDates(FY + 'everyDay |> filter(d => fiscalMonthNo(d) == 12) |> within(month) |> first',
      { from: '2026-04-01', to: '2027-04-01' })).toEqual(['2027-03-01']);
  });

  it('fiscalYearNo: 紀元直後（月序数が負）で floor 除算により 1969 を返す（F63 の挙動固定）', () => {
    // yearOf(epochOrdinal(month, d) - 3) の引数が 1970-01〜03 で -3〜-1 になる。
    // div が floor（実装）なら 1969、trunc なら 1970 に化ける——floor 挙動をここで固定する
    expect(evalDates(FY + 'everyDay |> filter(d => fiscalYearNo(d) == 1969) |> within(month) |> first',
      { from: '1970-01-01', to: '1970-06-01' })).toEqual(['1970-01-01', '1970-02-01', '1970-03-01']);
  });

  it('ordinalIn(month, quarter, d): split 末尾の切れ端窓の回帰（Gregorian 素で動く）', () => {
    // 修正前は実体化末尾の切れ端 quarter が張られず全点エラー
    expect(evalDates(G + 'everyDay |> filter(d => ordinalIn(month, quarter, d) == 2) |> within(month) |> first',
      { from: '2026-01-01', to: '2026-07-01' })).toEqual(['2026-02-01', '2026-05-01']);
  });
});

describe('stdlib: ISOWeek（ISO 週暦）', () => {
  it('境界の代表値（2026-W01・2026-W53・各年の W01-4）', () => {
    expect(evalDates(ISO + 'everyDay |> filter(d => isoYearNo(d) == 2026 and isoWeekNo(d) == 1)',
      { from: '2025-12-01', to: '2026-02-01' }))
      .toEqual(['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
    expect(evalDates(ISO + 'everyDay |> filter(d => isoYearNo(d) == 2026 and isoWeekNo(d) == 53)',
      { from: '2026-12-01', to: '2027-02-01' }))
      .toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
    expect(evalDates(ISO + 'everyDay |> filter(d => isoWeekNo(d) == 1 and isoWeekday(d) == 4)',
      { from: '2024-01-01', to: '2028-06-01' }))
      .toEqual(['2024-01-04', '2025-01-02', '2026-01-01', '2027-01-07', '2028-01-06']);
  });

  it('isocalendar 全数照合: isoYearNo ≠ 暦年の日の全集合（2024-01-01〜2028-06-01）', () => {
    const from = '2024-01-01', to = '2028-06-01';
    const expected: string[] = [];
    for (let d = new Date(`${from}T00:00:00Z`); iso(d) < to; d = addDays(d, 1)) {
      if (isoCalendar(d)[0] !== d.getUTCFullYear()) expected.push(iso(d));
    }
    const got = evalDates(ISO + 'everyDay |> filter(d => isoYearNo(d) != yearNo(d))', { from, to });
    expect(got).toEqual(expected);
  });

  it('isocalendar 全数照合: 週番号ごとの日集合が一致（2025-01-01〜2027-06-01）', () => {
    const from = '2025-01-01', to = '2027-06-01';
    const byWeek = new Map<number, string[]>();
    for (let d = new Date(`${from}T00:00:00Z`); iso(d) < to; d = addDays(d, 1)) {
      const [, wn] = isoCalendar(d);
      if (!byWeek.has(wn)) byWeek.set(wn, []);
      byWeek.get(wn)!.push(iso(d));
    }
    for (const wn of [1, 2, 9, 26, 52, 53]) {
      const got = evalDates(ISO + `everyDay |> filter(d => isoWeekNo(d) == ${wn})`, { from, to });
      expect(got, `W${String(wn).padStart(2, '0')}`).toEqual(byWeek.get(wn) ?? []);
    }
  });
});

// label: 付与式の「未実装＝明示エラー」の回帰 2 本は実装（ADR-34）に伴い撤去。
// 後継の統治テスト（cycle の label: 拒否・非ラムダの label: 拒否）は label.test.ts にある。
