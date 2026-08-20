// 日時刻の付与 at(Thh:mm)＋単独時刻リテラル（ADR-51・draft §1.32）
// - at は stdlib（Gregorian 公開語）の糖衣: 展開＝壁時計 tick（strideBy(1d, from:)）＋coincides
// - 単独時刻リテラル Thh:mm は epoch 錨日 1970-01-01（在圏 tz）で錨打ち——帯 [紀元, 錨) の欠落ゼロ
// - DST は展開先の規定（F81＝隙間繰り下げ・重複は最初の出現）を継承——経過算術形（F76）と違い壁時計を保存
// - 字句は T 接頭形限定（裸 hh:mm は三値演算子の合法式と衝突——互換保持を回帰で固定）
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';

const JP = `
premise JP { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@JP
`;
const NY = `
premise NY { calendar-system: Gregorian; tz: "America/New_York"; wkst: Sun }
@NY
`;

describe('at——日集合への壁時計時刻の付与（ADR-51）', () => {
  it('月末の 17:00（供給側の実運用形の置換——経過算術形と JST で外延同値）', () => {
    const at = run(JP + `monthEnd |> at(T17:00)`, { from: '2026-08-01', to: '2026-11-01' });
    const el = run(JP + `monthEnd |> snapTo(day) |> shift(+17, unit: hour)`,
      { from: '2026-08-01', to: '2026-11-01' });
    expect(at.results[0].dates).toEqual(['2026-08-31T17:00', '2026-09-30T17:00', '2026-10-31T17:00']);
    expect(at.results[0].dates).toEqual(el.results[0].dates);   // JST は DST 無し＝両者同値（F76 の顕在化なし）
  });

  it('DST 切替日も壁時計を保存（NY 春: 経過算術形は 10:00 へずれる——F76 の取り違え面が消える）', () => {
    const at = run(NY + `everyDay |> at(T09:00)`,
      { from: '2026-03-07', to: '2026-03-10', tz: 'America/New_York' });
    expect(at.results[0].dates).toEqual(['2026-03-07T09:00', '2026-03-08T09:00', '2026-03-09T09:00']);
    const el = run(NY + `everyDay |> shift(+9, unit: hour)`,
      { from: '2026-03-07', to: '2026-03-10', tz: 'America/New_York' });
    expect(el.results[0].dates).toContain('2026-03-08T10:00');   // 対照: 経過側は切替日にずれる（06 §の実測）
  });

  it('sub-hour（T07:30）も壁時計オフセット保存（F81）', () => {
    const d = evalDates(JP + `
marks = [2026-02-04, 2026-03-05] covering: 2026-01-01..2026-04-01
marks |> at(T07:30)`, { from: '2026-01-01', to: '2026-04-01' });
    expect(d).toEqual(['2026-02-04T07:30', '2026-03-05T07:30']);
  });

  it('epoch 錨日 1970-01-01 自身も欠けない（帯 [紀元, 錨) の欠落ゼロ——検証で 01-02 錨案を棄却した点）', () => {
    const d = evalDates(JP + `
marks = [1970-01-01, 1970-01-02] covering: 1970-01-01..1970-01-10
marks |> at(T07:00)`, { from: '1970-01-01', to: '1970-01-10' });
    expect(d).toEqual(['1970-01-01T07:00', '1970-01-02T07:00']);
  });

  it('横取りの回帰: coincides しない日には出ない・警告ゼロ（実体化域照合の経路が存在しない）', () => {
    const r = run(JP + `
marks = [2026-02-04, 2026-02-19, 2026-03-05] covering: 2026-01-01..2026-04-01
marks |> at(T07:00)`, { from: '2026-01-01', to: '2026-04-01' });
    expect(r.results[0].dates).toEqual(['2026-02-04T07:00', '2026-02-19T07:00', '2026-03-05T07:00']);
    expect(r.warnings).toEqual([]);
  });
});

describe('単独時刻リテラル——字句と静的エラー（ADR-51）', () => {
  it('T25:00・T07:60 は字句エラー（日時リテラルの時刻部と同じ域検査）', () => {
    expect(() => run(JP + `everyDay |> at(T25:00)`, { from: '2026-01-01', to: '2026-02-01' }))
      .toThrow(/時刻が範囲外/);
    expect(() => run(JP + `everyDay |> at(T07:60)`, { from: '2026-01-01', to: '2026-02-01' }))
      .toThrow(/時刻が範囲外/);
  });

  it('malformed（T07:x）は誘導つき字句エラー——黙って識別子に落とさない', () => {
    expect(() => run(JP + `everyDay |> at(T07:x)`, { from: '2026-01-01', to: '2026-02-01' }))
      .toThrow(/Thh:mm/);
  });

  it('互換保持: 三値演算子の裸 hh:mm 形（cond ? 10:30）は従来どおり数値に読める', () => {
    const d = evalDates(JP + `everyDay |> filter(d => (1 == 2 ? 10:30) == dayNo(d))`,
      { from: '2026-01-01', to: '2026-02-01' });
    expect(d).toEqual(['2026-01-30']);
  });

  it('strideBy の from: 以外の点位置では誘導つき静的エラー', () => {
    expect(() => run(JP + `everyDay |> stride(2, from: T07:00)`,
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/strideBy\(1d, from:\)（壁時計 tick）の位置でのみ/);
  });

  it('strideBy でも市民日幅 1d 以外は静的エラー（位相が黙って epoch 固定される罠の防止）', () => {
    expect(() => run(JP + `everyInstant |> strideBy(2d, from: T07:00)`,
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/市民日幅 1d 専用/);
    expect(() => run(JP + `everyInstant |> strideBy(90m, from: T07:00)`,
      { from: '2026-01-01', to: '2026-02-01' })).toThrow(/市民日幅 1d 専用/);
  });

  it('等値は日内時刻の一致（eq の時刻分岐——忘れると恒偽になる急所の固定）', () => {
    const d = evalDates(JP + `
t = T07:00
everyDay |> filter(d => dayNo(d) == 15 and t == T07:00)`,
      { from: '2026-01-01', to: '2026-02-01' });
    expect(d).toEqual(['2026-01-15']);
  });

  it('strideBy(1d, from: Thh:mm) の直書きも合法（at の展開形そのもの）', () => {
    const d = evalDates(JP + `everyInstant |> strideBy(1d, from: T06:15)`,
      { from: '2026-01-05', to: '2026-01-07' });
    expect(d).toEqual(['2026-01-05T06:15', '2026-01-06T06:15']);
  });
});
