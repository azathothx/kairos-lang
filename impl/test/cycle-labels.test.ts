// 窓列への周期ラベル——labels: の cycle 形（ADR-47・発報層還流 第 5 便 §3）
// - 意味論は窓束縛 cycle と同一「anchor の属する窓が先頭ラベル」: list[(i − i0) mod N]・負も法で正規化
// - 同長性検査は課さない（周期は任意の窓数を覆う）——位相保存は端の増減に限る（守るのは位相の宣言のみ）
// - anchor は窓列のいずれかの窓に区間所属する実日（頭側・範囲外は一般評価エラー・付け替え候補を文言で提示）
// - 締めの継承: edges: clip / empties: drop / label: 同居 / 規則マーカー＝静的エラー
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';

// 12 節（正確な節気日）・covering 一年
const SEKKI = (labelsArg: string) => `
premise T = Gregorian with {
  tz: "Asia/Tokyo"
  setsu = [2026-01-05, 2026-02-04, 2026-03-05, 2026-04-04, 2026-05-05, 2026-06-05,
           2026-07-07, 2026-08-07, 2026-09-07, 2026-10-08, 2026-11-07, 2026-12-07]
    covering: 2026-01-05..2026-12-07
  sekkiMonth = everyDay |> segmentBy(setsu, edges: drop, empties: error, ${labelsArg})
}
@T
`;
const CYC12 = 'labels: cycle [寅, 卯, 辰, 巳, 午, 未, 申, 酉, 戌, 亥, 子, 丑] anchor: 2026-02-04';
const Y2026 = { from: '2026-01-05', to: '2026-12-01' };

describe('labels: cycle——射影の位相（ADR-47）', () => {
  it('anchor の属する窓が先頭ラベル（寅月 = 立春〜啓蟄前日）', () => {
    const d = evalDates(SEKKI(CYC12) + `everyDay |> filter(d => sekkiMonth(d) == 寅)`, Y2026);
    expect(d[0]).toBe('2026-02-04');
    expect(d[d.length - 1]).toBe('2026-03-04');
  });

  it('anchor より前の窓は負の差の法正規化（丑月 = 小寒〜立春前日・(0−1) mod 12 = 11）', () => {
    const d = evalDates(SEKKI(CYC12) + `everyDay |> filter(d => sekkiMonth(d) == 丑)`, Y2026);
    expect(d[0]).toBe('2026-01-05');
    expect(d[d.length - 1]).toBe('2026-02-03');
  });

  it('静的 labels: と外延一致（同じ premise の二形が同じ結果）', () => {
    const cyc = evalDates(SEKKI(CYC12) + `everyDay |> filter(d => sekkiMonth(d) == 酉)`, Y2026);
    const stat = evalDates(
      SEKKI('labels: [丑, 寅, 卯, 辰, 巳, 午, 未, 申, 酉, 戌, 亥, 子]')
      + `everyDay |> filter(d => sekkiMonth(d) == 酉)`, Y2026);
    expect(cyc).toEqual(stat);
    expect(cyc.length).toBeGreaterThan(0);
  });

  it('非倍数周期（9 要素 × 12 窓・月家九星の逆順リスト）——2026 寅月=八白・頭側の丑月=九紫', () => {
    const NINE = 'labels: cycle [八白, 七赤, 六白, 五黄, 四緑, 三碧, 二黒, 一白, 九紫] anchor: 2026-02-04';
    const hachi = evalDates(SEKKI(NINE) + `everyDay |> filter(d => sekkiMonth(d) == 八白)`, Y2026);
    expect(hachi[0]).toBe('2026-02-04');            // 寅月 = list[0]
    const kyu = evalDates(SEKKI(NINE) + `everyDay |> filter(d => sekkiMonth(d) == 九紫)`, Y2026);
    expect(kyu[0]).toBe('2026-01-05');              // 丑月 = list[(0−1) mod 9] = list[8]
    // 9∤12: 窓 9（亥月 11/7〜）が list[8]=九紫 で二周目に入る
    expect(kyu.some(d => d.startsWith('2026-11'))).toBe(true);
  });

  it('リスト束縛名も許す（裁定 2026-07-25＝静的形と対称。数値リスト＝既存 monthNos と同型）', () => {
    const src = `
premise T = Gregorian with {
  tz: "Asia/Tokyo"
  nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  setsu = [2026-01-05, 2026-02-04, 2026-03-05, 2026-04-04, 2026-05-05, 2026-06-05,
           2026-07-07, 2026-08-07, 2026-09-07, 2026-10-08, 2026-11-07, 2026-12-07]
    covering: 2026-01-05..2026-12-07
  sekkiMonth = everyDay |> segmentBy(setsu, edges: drop, empties: error,
    labels: cycle nums anchor: 2026-02-04)
}
@T
everyDay |> filter(d => sekkiMonth(d) == 1)
`;
    expect(evalDates(src, Y2026)[0]).toBe('2026-02-04');   // anchor 窓 = list[0] = 1
  });

  it('covering 延伸で式不変（マーカー 12→24・anchor そのまま・翌年の寅月も正しい）', () => {
    const TWO_YEARS = `
premise T = Gregorian with {
  tz: "Asia/Tokyo"
  setsu = [2026-01-05, 2026-02-04, 2026-03-05, 2026-04-04, 2026-05-05, 2026-06-05,
           2026-07-07, 2026-08-07, 2026-09-07, 2026-10-08, 2026-11-07, 2026-12-07,
           2027-01-05, 2027-02-04, 2027-03-06, 2027-04-05, 2027-05-05, 2027-06-06,
           2027-07-07, 2027-08-08, 2027-09-08, 2027-10-08, 2027-11-07, 2027-12-07]
    covering: 2026-01-05..2027-12-07
  sekkiMonth = everyDay |> segmentBy(setsu, edges: drop, empties: error, ${CYC12})
}
@T
everyDay |> filter(d => sekkiMonth(d) == 寅)
`;
    const d = evalDates(TWO_YEARS, { from: '2026-01-05', to: '2027-12-01' });
    expect(d[0]).toBe('2026-02-04');
    expect(d.some(x => x === '2027-02-04')).toBe(true);   // 窓 13 = list[(13−1) mod 12] = 寅
  });
});

describe('labels: cycle——anchor の所属検査と締め', () => {
  it('anchor が頭側（覆域始端より前）は一般評価エラー（付け替え候補を文言で提示）', () => {
    expect(() => run(SEKKI(CYC12.replace('2026-02-04', '2026-01-02')) + 'sekkiMonth', Y2026))
      .toThrow(/anchor が窓列のいずれの窓にも属さない[\s\S]*進めれば全ラベル不変/);
  });

  it('anchor が範囲外（覆域端より後）も同エラー', () => {
    expect(() => run(SEKKI(CYC12.replace('2026-02-04', '2026-12-20')) + 'sekkiMonth', Y2026))
      .toThrow(/anchor が窓列のいずれの窓にも属さない/);
  });

  it('anchor: の欠落は構文エラー', () => {
    expect(() => run(SEKKI('labels: cycle [寅, 卯]') + 'sekkiMonth', Y2026))
      .toThrow(/labels: cycle は anchor: が必須/);
  });

  it('カンマ混入（…], anchor:）は専用文言の構文エラー', () => {
    expect(() => run(SEKKI('labels: cycle [寅, 卯], anchor: 2026-02-04') + 'sekkiMonth', Y2026))
      .toThrow(/anchor: はカンマなしで続ける/);
  });

  it('named-arg の二重指定（labels: 静的形と cycle 形の併用）は構文エラー', () => {
    expect(() => run(SEKKI('labels: [a, b], labels: cycle [寅, 卯] anchor: 2026-02-04') + 'sekkiMonth', Y2026))
      .toThrow(/labels: の二重指定/);
  });

  it('edges: clip とは組めない（締めの継承）', () => {
    expect(() => run(SEKKI(CYC12).replace('edges: drop', 'edges: clip') + 'sekkiMonth', Y2026))
      .toThrow(/segmentBy\(labels: cycle\): edges: clip とは組めない/);
  });

  it('empties: drop とは組めない（締めの継承）', () => {
    expect(() => run(SEKKI(CYC12).replace('empties: error', 'empties: drop') + 'sekkiMonth', Y2026))
      .toThrow(/segmentBy\(labels: cycle\): empties: drop とは組めない/);
  });
});

describe('labels: cycle——窓インスタンス参照 W(v)（ADR-42 との整合）', () => {
  it('周期ラベルは非一意キー——全マッチ和（2 か月分の寅の日々）', () => {
    const TWO = `
premise T = Gregorian with {
  tz: "Asia/Tokyo"
  m = [2026-01-05, 2026-02-04, 2026-03-05, 2026-04-04] covering: 2026-01-05..2026-04-04
  half = everyDay |> segmentBy(m, edges: drop, empties: error,
    labels: cycle [甲, 乙] anchor: 2026-01-05)
}
@T
half(甲)
`;
    const d = evalDates(TWO, { from: '2026-01-05', to: '2026-04-04' });
    expect(d[0]).toBe('2026-01-05');                          // 窓 0 = 甲
    expect(d.some(x => x === '2026-03-05')).toBe(true);       // 窓 2 = 甲（全マッチ和）
    expect(d.some(x => x === '2026-02-04')).toBe(false);      // 窓 1 = 乙は含まない
  });

  it('リスト外の値引数は域外の静的エラー（ADR-42 判断 7 (g)——cycle のリストが全値域）', () => {
    const NUM = 'labels: cycle [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] anchor: 2026-02-04';
    expect(() => run(SEKKI(NUM) + 'sekkiMonth(13)', Y2026))
      .toThrow(/ラベル値域（labels: リテラル）の外/);
  });
});
