// window-clip 警告（手当て (b)・2026-09-29 裁定・1.0 追補 22）——witness:
// 評価範囲 [from, to) の内側にあった点が roll／shift／snapTo で外側へ動くと、その点は出力に含まれない
// （§7.8 の切り取り＝意味論は不変）。旧実装はそれを黙って 0 点にしていた（レッドチーム監査 ③「within→nth→roll の
// 前月落ち」の実測＝8 月だけの窓では無言・exit 0）。参照実装は warnings に window-clip を積む。
// 対照＝範囲内→範囲内は警告なし・範囲外→範囲外（実体化域 to+400 日の点）も対象外・値は不変。
import { describe, it, expect } from 'vitest';
import { run } from '../src/index.ts';

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
