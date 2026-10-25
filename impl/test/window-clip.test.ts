// window-clip 警告（手当て (b)・2026-09-29 裁定・1.0 追補 22）——witness:
// 評価範囲 [from, to) の内側にあった点が roll／shift／snapTo で外側へ動くと、その点は出力に含まれない
// （§7.8 の切り取り＝意味論は不変）。旧実装はそれを黙って 0 点にしていた（レッドチーム監査 ③「within→nth→roll の
// 前月落ち」の実測＝8 月だけの窓では無言・exit 0）。参照実装は warnings に window-clip を積む。
// 対照＝範囲内→範囲内は警告なし・範囲外→範囲外（実体化域 to+400 日の点）も対象外・値は不変。
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { run } from '../src/index.ts';
import { cmdList, cmdNext } from '../src/cli.ts';

const PRE = `premise Cal { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon
  nonWorking = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
}
premise JP = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon }
@JP
`;
const AUG = { from: '2026-08-01', to: '2026-09-01' };
const TAIL = '（評価範囲 [from, to) の外へ動いた点は出力に含まれない——範囲を広げて評価する。§7.8）';

describe('window-clip: 範囲内の点が段で範囲外へ動いたら警告（出力は §7.8 どおり含まれない）', () => {
  it('① roll(Preceding): 8 月窓で 8/1（土）が 7/31 へ——from 側', () => {
    const r = run(PRE + 'everyDay |> within(month) |> nth(1) |> roll(Preceding, on: bizDay)\n', AUG);
    expect(r.results[0].dates).toEqual([]);
    expect(r.warnings).toEqual([`window-clip: roll(Preceding) 2026-08-01 → 2026-07-31${TAIL}`]);
  });
  it('② roll(Following): 10 月窓で 10/31（土）が 11/2 へ——to 側', () => {
    const r = run(PRE + 'everyDay |> filter(d => dayNo(d) == 31) |> roll(Following, on: bizDay)\n',
      { from: '2026-10-01', to: '2026-11-01' });
    expect(r.results[0].dates).toEqual([]);
    expect(r.warnings).toEqual([`window-clip: roll(Following) 2026-10-31 → 2026-11-02${TAIL}`]);
  });
  it('③ shift(-1, unit: bizDay): 8 月窓で 8/3（月）が 7/31（金）へ（他の月の 3 日は roll で寄せてから動かす＝範囲外→範囲外は警告なし）', () => {
    const r = run(PRE + 'everyDay |> filter(d => dayNo(d) == 3) |> roll(Following, on: bizDay) |> shift(-1, unit: bizDay)\n', AUG);
    expect(r.results[0].dates).toEqual([]);
    expect(r.warnings).toEqual([`window-clip: shift(-1) 2026-08-03 → 2026-07-31${TAIL}`]);
  });
  it('④ shift(-1, unit: month)（窓単位）: 8 月窓で 8/20 が 7/20 へ——範囲外の 9/20 が 8/20 へ入ってくるのは従来どおり出力される（範囲外→範囲内は警告なし）', () => {
    const r = run(PRE + 'everyDay |> filter(d => dayNo(d) == 20) |> shift(-1, unit: month)\n', AUG);
    expect(r.results[0].dates).toEqual(['2026-08-20']);
    // 既存の horizon-clip（実体化の下限 1970 年側の点）が並走するので window-clip 行だけを見る
    expect(r.warnings.filter(w => w.startsWith('window-clip'))).toEqual([`window-clip: shift(-1) 2026-08-20 → 2026-07-20${TAIL}`]);
  });
  it('⑤ snapTo(month): 範囲が月の途中から始まると 8/20 が 8/1（範囲外）へ', () => {
    const r = run(PRE + 'everyDay |> filter(d => dayNo(d) == 20) |> snapTo(month)\n', { from: '2026-08-15', to: '2026-09-01' });
    expect(r.results[0].dates).toEqual([]);
    expect(r.warnings).toEqual([`window-clip: snapTo 2026-08-20 → 2026-08-01${TAIL}`]);
  });
  it('対照: 範囲を広げれば点は出て警告なし（7〜9 月窓で ① の式は 7/31 を含む 3 点）', () => {
    const r = run(PRE + 'everyDay |> within(month) |> nth(1) |> roll(Preceding, on: bizDay)\n',
      { from: '2026-07-01', to: '2026-10-01' });
    expect(r.results[0].dates).toEqual(['2026-07-01', '2026-07-31', '2026-09-01']);
    expect(r.warnings).toEqual([]);
  });
  it('対照: 範囲内→範囲内の寄せは警告なし（8/15（土）→ 8/14（金））', () => {
    const r = run(PRE + 'everyDay |> filter(d => dayNo(d) == 15) |> roll(Preceding, on: bizDay)\n', AUG);
    expect(r.results[0].dates).toEqual(['2026-08-14']);
    expect(r.warnings).toEqual([]);
  });
});

// next の確定再評価は window-clip を報告しない（1.0 追補 29・90-open 2-6）——witness:
// cmdNext は見つかった後に [from, 最終発火日の翌日) で確定再評価する。右端は答えから決まるので、shift(+1) で最終発火日の翌日へ
// 動く中間点が毎回 window-clip になっていた（同梱例 jp-holidays の next 既定で再現・値は正しい・助言「範囲を広げる」は next では
// 実行できない）。外へ動いた点は from より前（次の発火ではない）か最終発火日の翌日以降（N 件の後）で、答えに含まれ得ない。
// 対照＝同じ範囲の list は従来どおり警告する・地平線まで探して不足のとき（to＝地平線＝--horizon で広げられる）は従来どおり報告する。
// 抑止を外すと ①③ の warnings で赤・to を 1 日余らせる案（不採）は ① の to と残走路で赤。
describe('next の確定再評価は window-clip を報告しない（list は従来どおり）', () => {
  const JP_HOLIDAYS = readFileSync(new URL('../examples/jp-holidays.kairos', import.meta.url), 'utf8');

  it('① 同梱例 jp-holidays: next は 10/12・11/3 を返し window-clip なし（to＝11/4・残走路 58 日は不変）', () => {
    const rep = cmdNext(JP_HOLIDAYS, { from: '2026-10-01', n: 2, horizonYears: 10 });
    expect(rep.results[0].dates).toEqual(['2026-10-12', '2026-11-03']);
    expect(rep).toMatchObject({ command: 'next', found: 2, to: '2026-11-04' });
    expect(rep.coverage[0].runwayDays).toBe(58);   // 2026-11-04 → 2027-01-01
    expect(rep.warnings).toEqual([]);
  });

  it('② 対照: 同じ範囲 [10/1, 11/4) の list は dates が同じで window-clip を出す（shift(1) 11/3 → 11/4）', () => {
    const rep = cmdList(JP_HOLIDAYS, { from: '2026-10-01', to: '2026-11-04' });
    expect(rep.results[0].dates).toEqual(['2026-10-12', '2026-11-03']);
    expect(rep.warnings).toEqual([`window-clip: shift(1) 2026-11-03 → 2026-11-04${TAIL}`]);
  });

  it('③ from 側も同じ（from＝10/12: shift(1) で 10/13 へ・shift(-1) で 10/11 へ）: next は答え 10/12 だけ・list は 2 本', () => {
    const rep = cmdNext(JP_HOLIDAYS, { from: '2026-10-12', n: 1, horizonYears: 10 });
    expect(rep.results[0].dates).toEqual(['2026-10-12']);
    expect(rep.to).toBe('2026-10-13');
    expect(rep.warnings).toEqual([]);
    const list = cmdList(JP_HOLIDAYS, { from: '2026-10-12', to: '2026-10-13' });
    expect(list.results[0].dates).toEqual(['2026-10-12']);
    expect(list.warnings).toEqual([
      `window-clip: shift(1) 2026-10-12 → 2026-10-13${TAIL}`,
      `window-clip: shift(-1) 2026-10-12 → 2026-10-11${TAIL}`,
    ]);
  });

  it('④ 対照: 地平線まで探して不足のときは従来どおり報告する（to＝地平線は --horizon で広げられる）', () => {
    const rep = cmdNext(PRE + 'edge = [2027-08-05] covering: 2027..2027\nedge |> shift(+1, unit: day)\n',
      { from: '2026-08-06', n: 1, horizonYears: 1 });
    expect(rep).toMatchObject({ found: 0, to: '2027-08-06' });
    expect(rep.results[0].dates).toEqual([]);
    expect(rep.warnings).toEqual([`window-clip: shift(1) 2027-08-05 → 2027-08-06${TAIL}`]);
  });
});
