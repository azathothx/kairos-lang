// 範囲外出自と covering: の活性化（ADR-37・I6・F61）
// - covering は値に触れない主張（包含の静的検査）・範囲外は区間註釈として結果に並走する
// - 輸送表（spec §4.10）: 結合子の和・shift の平行移動像・roll の依存像・選択子の窓拡幅・
//   stride の位相汚染・segmentBy の覆域端発火・filter の「落として註釈」
// - 実効被覆域の分類器（三分岐）・明示の被覆主張・被覆サマリ（残走路）・defCache×asof
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';
import { PRELUDE } from './helpers.ts';

const JP2 = `
premise JPX { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@JPX
`;

const days = (from: string, toExcl: string): string[] => {
  const out: string[] = [];
  for (let t = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
       t < Date.UTC(+toExcl.slice(0, 4), +toExcl.slice(5, 7) - 1, +toExcl.slice(8, 10));
       t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
};

// ---- 判断 1: covering は値に触れない——包含の静的検査 ----

describe('包含の静的検査（ADR-37 判断 1）', () => {
  it('列の要素が covering の外なら静的エラー（乱順・重複と同格）', () => {
    expect(() => run(JP2 + `
h = [2026-01-01, 2027-01-05] covering: 2026..2026
h
`, { from: '2026-01-01', to: '2026-02-01' })).toThrow(/covering の外/);
  });

  it('境界（覆域最終日）の要素は包含に通り、値は列そのまま', () => {
    const r = run(JP2 + `
[2026-01-01, 2026-12-31] covering: 2026..2026
`, { from: '2026-01-01', to: '2027-01-01' });
    expect(r.results[0].dates).toEqual(['2026-01-01', '2026-12-31']);
    expect(r.results[0].annotations).toEqual([]);   // 評価は覆域内＝註釈ゼロ
  });

  it('区間リスト covering の中抜けに落ちる要素は静的エラー', () => {
    expect(() => run(JP2 + `
h = [2024-05-03, 2025-05-03] covering: 2024..2024, 2026..2026
h
`, { from: '2026-01-01', to: '2026-02-01' })).toThrow(/covering の外/);
  });
});

// ---- 判断 9: 開端・区間リスト ----

describe('開端・区間リストの covering（ADR-37 判断 9）', () => {
  it('covering: ..（全域完結）は註釈を生まない——単発除外テーブルの受け皿', () => {
    const r = run(JP2 + `
everyDay \\ ([2026-01-05] covering: ..)
`, { from: '2026-01-01', to: '2026-02-01' });
    expect(r.results[0].dates).toEqual(days('2026-01-01', '2026-02-01').filter(d => d !== '2026-01-05'));
    expect(r.results[0].annotations).toEqual([]);
  });

  it('covering 省略（列の端＝最狭の主張）は端の外を註釈する——`..` と正反対', () => {
    const r = run(JP2 + `
everyDay \\ [2026-01-05]
`, { from: '2026-01-01', to: '2026-02-01' });
    expect(r.results[0].dates).toEqual(days('2026-01-01', '2026-02-01').filter(d => d !== '2026-01-05'));
    expect(r.results[0].annotations.length).toBeGreaterThan(0);
    expect(r.results[0].annotations[0].source).toBe('(無名テーブル)');
  });

  it('covering: 2026..（以後完結）は始端の外だけを註釈する', () => {
    const r = run(JP2 + `
everyDay \\ ([2026-02-11] covering: 2026..)
`, { from: '2025-12-25', to: '2026-01-10' });
    expect(r.results[0].annotations).toEqual([
      expect.objectContaining({ kind: 'out-of-coverage', from: '2025-12-25', to: '2026-01-01' }),
    ]);
  });

  it('区間リスト（中抜けの申告）は隙間だけを註釈する', () => {
    const r = run(JP2 + `
everyDay \\ ([2024-05-03, 2026-05-03] covering: 2024..2024, 2026..2026)
`, { from: '2024-01-01', to: '2027-01-01' });
    expect(r.results[0].annotations).toEqual([
      expect.objectContaining({ from: '2025-01-01', to: '2026-01-01' }),
    ]);
  });

  it('開端 covering の直後の labels: を食わない（束縛名射影が生きる）', () => {
    const dates = evalDates(JP2 + `
s = [2026-02-04T05:02] covering: 2026.. labels: [立春]
s |> filter(x => s(x) == 立春)
`, { from: '2026-01-01', to: '2027-01-01' });
    expect(dates).toEqual(['2026-02-04T05:02']);
  });
});

// ---- 判断 3/8: 区間註釈とクリップ枠 ----

describe('区間註釈とクリップ枠（ADR-37 判断 3/8)', () => {
  it('覆域内に収まる狭い評価は註釈ゼロで走る——狭い評価範囲を殺さない', () => {
    const r = run(JP2 + `
everyDay \\ ([2026-02-11] covering: 2026..2026)
`, { from: '2026-06-01', to: '2026-07-01' });
    expect(r.results[0].annotations).toEqual([]);
  });

  it('註釈は空でない結果にも付く（範囲外区間に規則由来の点は出続ける）', () => {
    const r = run(JP2 + `
everyDay \\ ([2026-02-11] covering: 2026..2026)
`, { from: '2026-12-25', to: '2027-01-10' });
    expect(r.results[0].dates).toContain('2027-01-05');   // 値は退化して出続ける
    expect(r.results[0].annotations).toEqual([
      expect.objectContaining({ from: '2027-01-01', to: '2027-01-10' }),   // [from, to) にクリップ
    ]);
  });
});

// ---- 判断 4: 輸送表 ----

describe('輸送表: 結合子は両辺の和・自動相殺なし（ADR-37 判断 4）', () => {
  it('A | B で B の覆域でも A の註釈は消えない（恒常註釈＝被覆主張の動機）', () => {
    const r = run(JP2 + `
h2026 = [2026-02-11] covering: 2026..2026
h2027 = [2027-02-11] covering: 2027..2027
h2026 | h2027
`, { from: '2026-06-01', to: '2026-07-01' });
    // 2026 の評価でも h2027 の補集合（〜2027-01-01）が全域を註釈する
    expect(r.results[0].annotations).toEqual([
      expect.objectContaining({ source: 'h2027', from: '2026-06-01', to: '2026-07-01' }),
    ]);
  });

  it('bizDay 標準導出の退化は、するが観測可能（ADR-35 判断 3 の要請）', () => {
    const ENT = `
premise TSE2 {
  calendar-system: Gregorian
  tz: "Asia/Tokyo"
  source: "test-calendar"
  asof: 2026-01-05
  satSun2 = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
  holidays = [2026-01-01, 2026-02-11] covering: 2026..2026
  nonWorking = satSun2 | holidays
}
premise JP3 { calendar-system: Gregorian; calendar: TSE2; tz: "Asia/Tokyo"; wkst: Mon }
@JP3
`;
    const r = run(ENT + 'bizDay\n', { from: '2026-12-25', to: '2027-01-10' });
    expect(r.results[0].dates).toContain('2027-01-01');   // 祝日データの尽きた先: satSun のみへ退化（金曜）
    expect(r.results[0].annotations).toEqual([
      expect.objectContaining({ source: 'TSE2.holidays', from: '2027-01-01', asof: '2026-01-05' }),
    ]);
  });
});

describe('輸送表: shift の平行移動像（ADR-37 判断 4——満了 90 日前通知の漏れを塞ぐ）', () => {
  it('註釈区間も n·U 平行移動する（覆域内へ移った先が註釈される）', () => {
    const r = run(JP2 + `
dues = [2026-03-01, 2026-09-01] covering: 2026..2026, 2028..2028
dues |> shift(90, unit: day)
`, { from: '2028-01-01', to: '2028-06-01' });
    // 中抜け [2027-01-01, 2028-01-01) の +90d 像が 2028 側（覆域内）に掛かる
    expect(r.results[0].annotations).toEqual([
      expect.objectContaining({ from: '2028-01-01', to: '2028-03-31' }),
    ]);
  });
});

describe('輸送表: roll の依存像と軸の尽き（ADR-37 判断 4）', () => {
  it('軸（bizDay）の覆域外へ掛かる roll は値を出しつつ註釈する', () => {
    const r = run(PRELUDE + `
monthEnd |> roll(Preceding, on: bizDay)
`, { from: '2027-01-01', to: '2027-04-01' });
    expect(r.results[0].dates.length).toBeGreaterThan(0);           // 退化した値は出る
    expect(r.results[0].annotations.length).toBeGreaterThan(0);     // が、観測可能
    expect(r.results[0].annotations[0].source).toBe('holidays2026');
  });

  it('着地先が無い＝軸の覆域外で尽きた → 空＋註釈（②）', () => {
    const r = run(JP2 + `
sekkiA = [2026-02-04, 2026-05-05] covering: 2026..2026
[2027-03-01] |> roll(Following, on: sekkiA)
`, { from: '2027-01-01', to: '2027-06-01' });
    expect(r.results[0].dates).toEqual([]);
    expect(r.results[0].annotations.length).toBeGreaterThan(0);
    expect(r.warnings.filter(w => w.startsWith('horizon-clip'))).toEqual([]);
  });

  it('完結軸（開端 covering）の尽きは註釈なしの空（正当な該当なし・③）', () => {
    const r = run(JP2 + `
sekkiA = [2026-02-04, 2026-05-05] covering: 2026..
([2027-03-01] covering: ..) |> roll(Following, on: sekkiA)
`, { from: '2027-01-01', to: '2027-06-01' });
    expect(r.results[0].dates).toEqual([]);
    expect(r.results[0].annotations).toEqual([]);
    expect(r.warnings.filter(w => w.startsWith('horizon-clip'))).toEqual([]);
  });
});

describe('輸送表: 選択子の窓拡幅（ADR-37 判断 4）', () => {
  it('対象窓が註釈区間に交差したら窓全域へ拡幅（真の first は覆域外だったかもしれない）', () => {
    const r = run(JP2 + `
hh = [2026-01-05] covering: ..2026-01-15
(everyDay \\ hh) |> within(month) |> first
`, { from: '2026-01-01', to: '2026-03-01' });
    // 註釈は 2026-01-16 からだが、1 月窓に交差するので窓頭 2026-01-01 まで拡幅される
    expect(r.results[0].annotations[0].from).toBe('2026-01-01');
  });
});

describe('輸送表: stride の位相汚染（ADR-37 判断 4）', () => {
  it('歩行が註釈区間に交差したら最初の交差点から先すべて（覆域が再開しても汚染は残る）', () => {
    const r = run(JP2 + `
h = [2026-02-11] covering: 2026..2026, 2028..2028
(everyDay \\ h) |> stride(3, from: 2026-12-01)
`, { from: '2028-02-01', to: '2028-03-01' });
    // 中抜け [2027, 2028) を跨いだ歩行——2028 は覆域内だが位相は汚染されたまま
    expect(r.results[0].annotations).toEqual([
      expect.objectContaining({ from: '2028-02-01', to: '2028-03-01' }),
    ]);
  });
});

// ---- segmentBy: edges:/empties: の発火は覆域の端 ----

describe('segmentBy の覆域端（ADR-37 判断 4——「覆域内・窓なし」帯を作らない）', () => {
  const MINI = `
newMoons2 = [2026-01-19T04:52, 2026-02-17T21:01] covering: 2026-01-19..2026-03-31
lunarStart2 = newMoons2 |> snapTo(day)
`;

  it('最終マーカー起点の窓も覆域端まで確定して張る（edges: drop でも落ちない）', () => {
    const r = run(JP2 + MINI + `
everyDay |> segmentBy(lunarStart2, edges: drop, empties: keep) |> last
`, { from: '2026-01-01', to: '2026-05-01' });
    // [2026-01-19, 2026-02-17) の last と、最終窓 [2026-02-17, 覆域端 2026-04-01) の last
    expect(r.results[0].dates).toEqual(['2026-02-16', '2026-03-31']);
    expect(r.results[0].annotations).toEqual([
      expect.objectContaining({ from: '2026-01-01', to: '2026-01-19', source: 'newMoons2' }),  // 覆域始端の前
      expect.objectContaining({ from: '2026-04-01', to: '2026-05-01', source: 'newMoons2' }),  // 覆域端の先
    ]);
  });

  it('covering 省略（列の端）では最終マーカー起点の窓は張られない（最狭の主張）', () => {
    const r = run(JP2 + `
newMoons3 = [2026-01-19T04:52, 2026-02-17T21:01]
everyDay |> segmentBy((newMoons3 |> snapTo(day)), edges: drop, empties: keep) |> last
`, { from: '2026-01-01', to: '2026-05-01' });
    expect(r.results[0].dates).toEqual(['2026-02-16']);
  });

  it('覆域外の点は edges: error を発火しない（範囲外＝註釈が引き受ける）', () => {
    const r = run(JP2 + MINI + `
everyDay |> segmentBy(lunarStart2, edges: drop, empties: error) |> first
`, { from: '2026-01-19', to: '2026-05-01' });
    expect(r.results[0].dates).toEqual(['2026-01-19', '2026-02-17']);
  });
});

// ---- 判断 6: 実効被覆域の分類器（filter の「落として註釈」と硬エラーの維持） ----

describe('分類器（ADR-37 判断 6）: 実効被覆域の外は範囲外・内は硬エラー', () => {
  const SEKKI = `
sekki = [2026-02-04T05:02, 2026-05-05T20:49] covering: 2026..2026
  labels: [立春, 立夏]
`;

  it('filter: 覆域外の参照点は落として註釈（値は覆域内のぶんだけ正確に出る）', () => {
    const r = run(JP2 + SEKKI + `
(sekki | ([2027-02-04T05:00] covering: ..)) |> filter(s => sekki(s) == 立春)
`, { from: '2026-01-01', to: '2028-01-01' });
    expect(r.results[0].dates).toEqual(['2026-02-04T05:02']);
    expect(r.results[0].annotations).toEqual([
      expect.objectContaining({ source: 'sekki', from: '2027-01-01', to: '2028-01-01' }),
    ]);
  });

  it('filter: 覆域内で列にない参照点は従来どおり硬エラー（誤イディオムの検出は保つ）', () => {
    expect(() => run(JP2 + SEKKI + `
everyDay |> filter(d => sekki(d) == 立春)
`, { from: '2026-01-01', to: '2026-02-01' })).toThrow(/点が列にない/);
  });

  it('epochOrdinal の窓所属も同じ分類（覆域外は落として註釈）', () => {
    // 窓列は premise 公開語に置く（defCache が効く形——kyureki と同じ正準形）
    const r = run(`
premise K2 = Gregorian with {
  tz: "Asia/Tokyo"
  newMoons2 = [2026-01-19T04:52, 2026-02-17T21:01] covering: 2026-01-19..2026-03-31
  lunarW = day |> segmentBy((newMoons2 |> snapTo(day)), edges: drop, empties: keep)
}
premise JPK { calendar-system: K2; tz: "Asia/Tokyo"; wkst: Mon }
@JPK
everyDay |> filter(d => epochOrdinal(lunarW, d) == 0)
`, { from: '2026-01-19', to: '2026-05-01' });
    expect(r.results[0].dates).toEqual(days('2026-01-19', '2026-02-17'));
    expect(r.results[0].annotations.length).toBeGreaterThan(0);   // 2026-04-01 以降の照会が落ちて註釈
  });
});

// ---- 判断 8: 地平線 4 サイトの三分岐（①実装地平線＝クリップ＋警告） ----

describe('実装地平線の降格（ADR-37 判断 8——硬エラーからクリップ＋機械可読警告へ）', () => {
  it('snapTo: 計算範囲を越えたテーブル時点はクリップ＋警告（狭い評価範囲が書ける）', () => {
    const r = run(JP2 + `
[2026-01-19T04:52, 2126-01-19T04:52] |> snapTo(day)
`, { from: '2026-01-01', to: '2027-01-01' });
    expect(r.results[0].dates).toEqual(['2026-01-19']);
    expect(r.warnings.some(w => w.startsWith('horizon-clip: snapTo'))).toBe(true);
  });

  it('shift(unit: 窓語): 計算範囲を越えた着地はクリップ＋警告', () => {
    const r = run(JP2 + `
[2026-06-01] |> shift(100000, unit: day)
`, { from: '2026-01-01', to: '2027-01-01' });
    expect(r.results[0].dates).toEqual([]);
    expect(r.warnings.some(w => w.startsWith('horizon-clip: shift'))).toBe(true);
  });

  it('snapTo: 覆域内・窓の外（anchored grid の頭の隙間）は硬エラーを維持（③）', () => {
    expect(() => run(`
premise Dekad2 = Gregorian with { decade2 = chronos grid 10d anchor: 2026-01-01 }
premise JPD2 { calendar-system: Dekad2; tz: "Asia/Tokyo"; wkst: Mon }
@JPD2
[1970-01-02] |> snapTo(decade2)
`, { from: '1970-01-01', to: '1970-02-01' })).toThrow(/snapTo: 点が窓の外/);
  });

  it('shift(unit: 点列軸): 軸の覆域外の点は落として註釈（②）・覆域内の軸外は硬エラー', () => {
    const r = run(JP2 + `
sekkiA = [2026-02-04, 2026-05-05] covering: 2026..2026
[2027-02-04] |> shift(1, unit: sekkiA)
`, { from: '2026-01-01', to: '2028-01-01' });
    expect(r.results[0].dates).toEqual([]);
    expect(r.results[0].annotations.length).toBeGreaterThan(0);

    expect(() => run(JP2 + `
sekkiA = [2026-02-04, 2026-05-05] covering: 2026..2026
[2026-03-01] |> shift(1, unit: sekkiA)
`, { from: '2026-01-01', to: '2027-01-01' })).toThrow(/点が軸上にない/);
  });
});

// ---- 判断 5: 明示の被覆主張（相殺の唯一の口） ----

describe('明示の被覆主張（ADR-37 判断 5）', () => {
  it('束縛後置の covering: が成分の恒常註釈を主張の補集合で置き換える', () => {
    const r = run(JP2 + `
h2026 = [2026-02-11] covering: 2026..2026
h2027 = [2027-02-11] covering: 2027..2027
nw = (h2026 | h2027) covering: 2026..2027
nw
`, { from: '2026-06-01', to: '2026-07-01' });
    expect(r.results[0].annotations).toEqual([]);   // 名指しの主張が狼少年を止める
    expect(r.coverage).toContainEqual(
      expect.objectContaining({ source: 'nw', covering: '2026-01-01..2027-12-31', concluded: false }));
  });

  it('主張の外は主張の名で註釈される（源＝束縛名）', () => {
    const r = run(JP2 + `
h2026 = [2026-02-11] covering: 2026..2026
nw = (h2026) covering: 2026..2026
everyDay \\ nw
`, { from: '2026-12-25', to: '2027-01-10' });
    expect(r.results[0].annotations).toEqual([
      expect.objectContaining({ source: 'nw', from: '2027-01-01' }),
    ]);
  });

  it('必要条件検査: どの成分も語れない区間の完全性は主張できない', () => {
    expect(() => run(JP2 + `
h2026 = [2026-02-11] covering: 2026..2026
nw = (h2026) covering: 2026..2027
nw
`, { from: '2026-01-01', to: '2027-01-01' })).toThrow(/被覆主張が成分覆域を越える/);
  });

  it('規則ベースの成分（註釈なし）が混ざれば検査は通る', () => {
    const r = run(JP2 + `
satSun3 = everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)
h2026 = [2026-02-11] covering: 2026..2026
nw = (satSun3 | h2026) covering: 2026..2026
everyDay \\ nw
`, { from: '2026-06-01', to: '2026-07-01' });
    expect(r.results[0].annotations).toEqual([]);
  });
});

// ---- 判断 7: 被覆サマリ（残走路・完結主張の可観測化） ----

describe('被覆サマリ（ADR-37 判断 7 (b)——クリップしない監視面）', () => {
  it('参照したデータ源の覆域・asof・残走路が出る（覆域内の評価でも）', () => {
    const r = run(JP2 + `
premise G1 { calendar-system: Gregorian; tz: "Asia/Tokyo"; source: "cao.go.jp"; asof: 2026-02-02
  h = [2026-02-11] covering: 2026..2026 }
@JPX
everyDay \\ G1.h
`, { from: '2026-06-01', to: '2026-07-01' });
    const c = r.coverage.find(x => x.source === 'G1.h');
    expect(c).toBeDefined();
    expect(c!.covering).toBe('2026-01-01..2026-12-31');
    expect(c!.asof).toBe('2026-02-02');
    expect(c!.concluded).toBe(false);
    expect(c!.runwayDays).toBe(184);   // 2026-07-01 → 2027-01-01
  });

  it('完結主張（開端 covering）は concluded として常時観測できる（残走路 null）', () => {
    const r = run(JP2 + `
ex = [2026-01-05] covering: ..
everyDay \\ ex
`, { from: '2026-01-01', to: '2026-02-01' });
    expect(r.coverage).toContainEqual(
      expect.objectContaining({ source: 'ex', covering: '..', concluded: true, runwayDays: null }));
  });
});

// ---- 判断 4 補（I6）: premise 束縛は評価ごとに註釈を得る——defCache×asof ----

describe('defCache と註釈の属性（ADR-37——版差の誤共有防止）', () => {
  it('asof だけ違う premise 間でキャッシュが誤共有されない（註釈が各 asof を運ぶ）', () => {
    const r = run(`
premise D1 { calendar-system: Gregorian; tz: "Asia/Tokyo"; asof: 2026-01-01
  t = [2026-03-01] covering: 2026..2026 }
premise D2 = D1 with { asof: 2027-02-02 }
premise JPY { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }
@JPY
everyDay \\ D1.t
everyDay \\ D2.t
`, { from: '2026-12-25', to: '2027-01-10' });
    expect(r.results[0].annotations[0]).toEqual(
      expect.objectContaining({ source: 'D1.t', asof: '2026-01-01' }));
    expect(r.results[1].annotations[0]).toEqual(
      expect.objectContaining({ source: 'D2.t', asof: '2027-02-02' }));
  });
});
