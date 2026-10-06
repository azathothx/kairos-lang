// 覆域端で閉じた最終窓の終端は未確定（ADR-37 改訂 6・1.0 追補 23・90-open 1-1 の裁定＝案 A・2026-10-01）。
// データ由来の窓列（朔で切る旧暦）の最終窓は覆域端まで確定して張る（F72）が、その終端は次のマーカー（覆域外）に
// 依存する。終端を読む段（last・既知部分に要素の足りない nth・既知部分が空の first/nth・証人の無い coincides）は
// 窓を覆域端に始まる註釈区間に接するものとして扱う——点集合は変えず註釈だけを足す（判断 4 の規範「過小近似は不可」）。
// witness の対＝「終端を読む段は註釈が窓全域へ広がる」と「始端・所属を読む段・規則窓・地平線で切れた形は従来どおり」。
import { describe, it, expect } from 'vitest';
import { run } from '../src/index.ts';

// stdlib/kyureki.md §1 と同じ朔 38 件・月番号 38 件（covering: 2024-12-31..2027-12-31）
const KY = `premise Kyureki = Gregorian with {
  source: "eco.mtk.nao.ac.jp/koyomi/yoko"
  asof:   2026-02-02
  tz:     "Asia/Tokyo"
  newMoons = [2024-12-31T07:27,
              2025-01-29T21:36, 2025-02-28T09:45, 2025-03-29T19:58, 2025-04-28T04:31, 2025-05-27T12:02,
              2025-06-25T19:32, 2025-07-25T04:11, 2025-08-23T15:07, 2025-09-22T04:54, 2025-10-21T21:25,
              2025-11-20T15:47, 2025-12-20T10:43, 2026-01-19T04:52, 2026-02-17T21:01, 2026-03-19T10:23,
              2026-04-17T20:52, 2026-05-17T05:01, 2026-06-15T11:54, 2026-07-14T18:44, 2026-08-13T02:37,
              2026-09-11T12:27, 2026-10-11T00:50, 2026-11-09T16:02, 2026-12-09T09:52, 2027-01-08T05:24,
              2027-02-07T00:56, 2027-03-08T18:29, 2027-04-07T08:51, 2027-05-06T19:59, 2027-06-05T04:40,
              2027-07-04T12:02, 2027-08-02T19:05, 2027-09-01T02:41, 2027-09-30T11:36, 2027-10-29T22:37,
              2027-11-28T12:24, 2027-12-28T05:12] covering: 2024-12-31..2027-12-31
  lunarStart = newMoons |> snapTo(day)
  monthNos   = [12, 1, 2, 3, 4, 5, 6, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  lunarMonth = day |> segmentBy(lunarStart, edges: drop, empties: error, labels: monthNos)
}
premise Koyomi { calendar-system: Kyureki; tz: "Asia/Tokyo"; wkst: Mon }
@Koyomi
`;
const JP = 'premise JP { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }\n@JP\n';
// 覆域端 2027-12-31 を跨ぐ評価範囲。窓＝旧十一月 [2027-11-28, 2027-12-28)・旧十二月（最終窓）[2027-12-28, 2028-01-01)
const W = { from: '2027-12-01', to: '2028-02-01' };
const ev = (body: string, w = W) => {
  const r = run(KY + body + '\n', w).results[0];
  return { dates: r.dates, ann: r.annotations.map(a => `${a.from}..${a.to}`) };
};

describe('覆域端で閉じた最終窓の終端は未確定（ADR-37 改訂 6）', () => {
  it('last: 最終窓の「月末」は点を残したまま註釈が窓全域（2027-12-28〜）へ広がる——旧: 註釈は覆域端 2028-01-01 から', () => {
    const r = ev('lunarMonth |> last');
    expect(r.dates).toEqual(['2027-12-27', '2027-12-31']);   // 点集合は不変（旧十一月末は確定・旧十二月の 12/31 は候補）
    expect(r.ann).toEqual(['2027-12-28..2028-02-01']);       // 拡幅 [12/28, 1/1) と尾部 [1/1, ∞) が同属性で併合・評価範囲でクリップ
  });

  it('first: 始端は覆域内で確定——註釈は従来どおり覆域端から（拡幅しない）', () => {
    const r = ev('lunarMonth |> first');
    expect(r.dates).toEqual(['2027-12-28']);
    expect(r.ann).toEqual(['2028-01-01..2028-02-01']);
  });

  it('nth: 既知部分に足りていれば確定（註釈なし）・足りなければ空のまま註釈が窓全域へ', () => {
    const ok = ev('lunarMonth |> nth(4)');                   // 旧十一月の 4 日目＝12/01・旧十二月の 4 日目＝12/31（既知 4 日）
    expect(ok.dates).toEqual(['2027-12-01', '2027-12-31']);
    expect(ok.ann).toEqual(['2028-01-01..2028-02-01']);
    const short = ev('lunarMonth |> nth(5)');                // 旧十二月の 5 日目は覆域の先＝未知（旧: 黙って空）
    expect(short.dates).toEqual(['2027-12-02']);
    expect(short.ann).toEqual(['2027-12-28..2028-02-01']);
  });

  it('first/nth: 既知部分が空なら「正当な空」ではなく註釈（真の窓の先に要素があり得る）', () => {
    // 毎月 10 日は旧十二月の既知部分 [12/28, 1/1) に無い——真の旧十二月（〜1/26）には 1/10 がある
    const r = ev('tenth = day |> within(month) |> nth(10)\ntenth |> within(lunarMonth) |> first');
    expect(r.dates).toEqual(['2027-12-10']);
    expect(r.ann).toEqual(['2027-12-28..2028-02-01']);
  });

  it('coincides: 証人の無い最終窓は偽と確定できない＝範囲外（閏月検出 not coincides の偽陽性を塞ぐ）', () => {
    const body = 'tenth = day |> within(month) |> nth(10)\n';
    const neg = ev(body + 'lunarMonth |> first |> filter(p => not coincides(tenth, lunarMonth, p))');
    expect(neg.dates).toEqual([]);                            // 旧: 偽→not で真→12/28 が「10 日の無い月」として出ていた
    expect(neg.ann).toEqual(['2027-12-28..2028-02-01']);
    const pos = ev(body + 'lunarMonth |> first |> filter(p => coincides(tenth, lunarMonth, p))');
    expect(pos.dates).toEqual([]);
    expect(pos.ann).toEqual(['2027-12-28..2028-02-01']);
  });

  it('coincides: 既知部分に証人があれば真（∃ は単調）——註釈は従来どおり', () => {
    const r = ev('lunarMonth |> first |> filter(p => coincides(everyDay, lunarMonth, p))');
    expect(r.dates).toEqual(['2027-12-28']);
    expect(r.ann).toEqual(['2028-01-01..2028-02-01']);
  });

  it('規則生成の窓（Gregorian の month）は覆域の端を持たず無関係', () => {
    const r = run(JP + 'everyDay |> within(month) |> last\n', W).results[0];
    expect(r.dates).toEqual(['2027-12-31', '2028-01-31']);
    expect(r.annotations).toEqual([]);
  });

  it('計算範囲（to+400 日）で切れた最終窓は実装地平線の領分——印は付かず註釈も増えない（同梱例の 1 か月窓は不変）', () => {
    const r = ev('lunarMonth |> last', { from: '2026-01-01', to: '2026-02-01' });
    expect(r.dates).toEqual(['2026-01-18']);
    expect(r.ann).toEqual([]);
  });
});
