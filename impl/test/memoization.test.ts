// 束縛メモ化の正しさ（ADR-53＝還流第 16 便）——2 つの不変量を固定する:
// §1 束縛右辺の名前解決は「束縛・premise 語・前文メンバー・列挙」で閉じる——呼び出し側の
//    ラムダ変数には落とさない（捕獲は誘導つき静的エラー。定義の意味は定義単体で閉じる）。
//    メモ化の誤共有（最初に評価された点の値の焼き付き＝黙って別の点集合）はこの遮断が根で断つ。
// §2 ADR-40 の tz 名検査は評価順序に依らず立つ——キャッシュヒット時にも記録済みの検査を
//    現在の predicateAlign で再実行（検査の順序独立性と、解決値のクロージャ同一性
//    〈labelStack ガードの前提＝ADR-34/42 判断 7 (f)〉の両立）。
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';

const G = `
premise G { calendar-system: Gregorian; tz: "Asia/Tokyo" }
@G
`;
const W = { from: '2026-01-01', to: '2026-03-01' };

describe('ADR-53 §1: 束縛右辺の呼び出し側ラムダ変数の遮断', () => {
  it('直接形は誘導つき静的エラー（旧挙動＝epoch 点の値が焼き付き黙って別の点集合。還流第 16 便 §1）', () => {
    expect(() => run(G + `T = ordinalIn(day, month, d)
everyDay |> filter(d => T == 3)`, W))
      .toThrow(/束縛の右辺から呼び出し側のラムダ変数は見えない: d/);
  });

  it('間接参照でも同じエラー（B = T + 0 経由——推移形も遮断が根で断つ）', () => {
    expect(() => run(G + `T = ordinalIn(day, month, d)
B = T + 0
everyDay |> filter(d => B == 3)`, W))
      .toThrow(/束縛の右辺から呼び出し側のラムダ変数は見えない: d/);
  });

  it('premise 公開語の右辺でも同じエラー（evalDef 経路——本体層束縛と同じ面）', () => {
    expect(() => run(`
premise P { calendar-system: Gregorian; tz: "Asia/Tokyo"; m = ordinalIn(day, month, d) }
@P
everyDay |> filter(d => m == 3)`, W))
      .toThrow(/束縛の右辺から呼び出し側のラムダ変数は見えない: d/);
  });

  it('正道 1＝インライン（束縛に名前を付けなければ従来どおり）', () => {
    expect(evalDates(G + 'everyDay |> filter(d => ordinalIn(day, month, d) == 3)', W))
      .toEqual(['2026-01-03', '2026-02-03']);
  });

  it('正道 2＝引数付き束縛（点依存はパラメータで明示——誘導先の外延固定）', () => {
    expect(evalDates(G + `T(x) = ordinalIn(day, month, x)
everyDay |> filter(d => T(d) == 3)`, W))
      .toEqual(['2026-01-03', '2026-02-03']);
  });

  it('右辺内で束縛したラムダ変数は従来どおり合法（遮断は呼び出し側 locals だけ）', () => {
    expect(evalDates(G + `thirds = everyDay |> filter(x => ordinalIn(day, month, x) == 3)
thirds`, W)).toEqual(['2026-01-03', '2026-02-03']);
  });
});

const TZPAIR = `
premise K = Gregorian with { tz: "+05:45" }
premise G { calendar-system: Gregorian; tz: "Asia/Tokyo" }
@G
T = weekday(2026-01-05)
`;
const W4 = { from: '2026-01-01', to: '2026-04-01' };
const ADR40 = /入力と窓の tz 名が不一致/;

describe('ADR-53 §2: tz 名検査（ADR-40）の評価順序独立性', () => {
  it('検査を通らない文が先でも ADR-40 エラー（旧挙動＝先に別文脈で評価されると検査ごと黙殺）', () => {
    expect(() => run(TZPAIR + `everyDay |> filter(d => T == Mon)
K.monthStart |> filter(d => T == Mon)`, W4)).toThrow(ADR40);
  });

  it('並び順を入れ替えても同じ診断（不変量＝順序に依らない。還流第 16 便 §2 の提案形）', () => {
    expect(() => run(TZPAIR + `K.monthStart |> filter(d => T == Mon)
everyDay |> filter(d => T == Mon)`, W4)).toThrow(ADR40);
  });

  it('単一の文の中の整列切替でも立つ（並び順は症状——本質は異 align 文脈からのキャッシュ参照）', () => {
    expect(() => run(TZPAIR
      + 'everyDay |> filter(d => T == Mon) |> snapTo(K.day) |> filter(d => T == Mon)', W4))
      .toThrow(ADR40);
  });

  it('同一 tz なら従来どおり素通り（検査の再実行は挙動を増やさない——偽陽性なし）', () => {
    const d = evalDates(G + `T = weekday(2026-01-05)
monthStart |> filter(d => T == Mon)`, W);
    expect(d).toEqual(['2026-01-01', '2026-02-01']);
  });
});
