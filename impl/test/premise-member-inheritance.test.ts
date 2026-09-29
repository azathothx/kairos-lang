// 前文メンバーの派生継承（ADR-35 改訂 3＝還流 2026-09-23 定期便 §3・1.0.2）——witness:
// `premise Mine = Base with { … }` を @ の入口にしたとき、本体層が直接引く前文メンバー
// （calendar:→bizDay の標準導出・axis:・tz:）が基底連鎖から見える。修正前は
// ①「未解決の名前: bizDay」②「軸がない」③ tz が黙って機械 tz に落ちる（同じ式が束縛の内側なら
// 基底の tz を見る非対称）だった。source: も同じ集合で継承する（⑤。判断 5 の「必須寄り」は未執行）。
// roll: メンバー（spec §3.3）も同時に実装。末尾の describe は還流 2026-09-28 定期便 #2 の写経（roll: の意味を
// 崩す変異 5 つが指紋照合以外で捕まらなかった）。
import { describe, it, expect } from 'vitest';
import { run, evalDates } from '../src/index.ts';

const CAL = `
premise Cal { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon
  hol = [2026-02-11, 2026-02-23, 2026-03-20] covering: 2026..2026
  nonWorking = (everyDay |> filter(d => weekday(d) == Sat or weekday(d) == Sun)) | hol
}
`;
const W = { from: '2026-02-01', to: '2026-04-01' };

describe('ADR-35 改訂 3: with 派生の入口から基底の前文メンバーが見える', () => {
  it('① calendar: を Base だけに宣言し @Mine の本体で roll(on: bizDay)（修正前＝未解決の名前: bizDay）', () => {
    expect(evalDates(CAL + `
premise Base = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon }
premise Mine = Base with { marker = everyDay |> within(month) |> nth(1) }
@Mine
marker |> roll(Following, on: bizDay)`, W)).toEqual(['2026-02-02', '2026-03-02']);
  });

  it('② axis: を Base だけに宣言し @Mine の本体で軸を省略（修正前＝roll: 軸がない）', () => {
    expect(evalDates(CAL + `
premise Base = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon; axis: bizDay }
premise Mine = Base with { marker = everyDay |> within(month) |> nth(1) }
@Mine
marker |> roll(Following) |> shift(+1)`, W)).toEqual(['2026-02-03', '2026-03-03']);
  });

  it('③ tz: を Base だけに宣言・実行 tz は UTC・@Mine の本体で at(T09:00)（修正前＝09:00 UTC に落ちた）', () => {
    const src = `
premise Base = Gregorian with { tz: "Asia/Tokyo"; wkst: Mon }
premise Mine = Base with { marker = everyDay |> within(month) |> nth(1) }
@Mine
marker |> at(T09:00)`;
    const mine = run(src, { ...W, tz: 'UTC' }).results[0].points;
    const base = run(src.replace('@Mine', '@Base').replace('marker |>', 'everyDay |> within(month) |> nth(1) |>'), { ...W, tz: 'UTC' }).results[0].points;
    expect(mine).toEqual(base);                       // 同じ瞬間（09:00 JST＝00:00Z）
    expect(mine[0]).toBe(Date.UTC(2026, 1, 1, 0, 0)); // 2026-02-01T00:00Z
  });

  it('③\' ブロックの宣言は基底を上書きする（Mine が tz を再宣言すれば Mine の値）', () => {
    const pts = run(`
premise Base = Gregorian with { tz: "Asia/Tokyo"; wkst: Mon }
premise Mine = Base with { tz: "UTC"; marker = everyDay |> within(month) |> nth(1) }
@Mine
marker |> at(T09:00)`, { ...W, tz: 'UTC' }).results[0].points;
    expect(pts[0]).toBe(Date.UTC(2026, 1, 1, 9, 0)); // 09:00Z
  });

  it('④ 対照: 派生を経ない平坦形は従来どおり（変更なし）', () => {
    expect(evalDates(CAL + `
premise Flat { calendar-system: Gregorian; calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon }
@Flat
everyDay |> within(month) |> nth(1) |> roll(Following, on: bizDay)`, W)).toEqual(['2026-02-02', '2026-03-02']);
  });

  it('⑤ source: も基底連鎖から継承される（判断 8 の overlay と同じ集合＝公開語の external は従来から基底の source: を見ていた。判断 5 の「必須寄り」は未執行）', () => {
    expect(() => run(CAL + `
premise Base = Gregorian with { tz: "Asia/Tokyo"; wkst: Mon; source: "base/src"
  hol = external(kind: dates)
}
premise Mine = Base with { hol = external(kind: dates) }
@Mine
hol`, W)).toThrow(/source: "base\/src"/);   // 供給が無いので解決エラー——その文言に継承した source: が出る
  });
});

describe('spec §3.3: 前文メンバー roll:（規約の畳み込み）', () => {
  it('roll: Following を宣言すると位置引数を省略できる', () => {
    expect(evalDates(CAL + `
premise Base = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon; roll: Following }
@Base
everyDay |> within(month) |> nth(1) |> roll(on: bizDay)`, W)).toEqual(['2026-02-02', '2026-03-02']);
  });

  it('宣言も位置引数も無ければ誘導つき静的エラー（I3）', () => {
    expect(() => run(CAL + `
premise Base = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon }
@Base
everyDay |> within(month) |> nth(1) |> roll(on: bizDay)`, W)).toThrow(/roll は規約が必要/);
  });

  it('派生の入口でも roll: は継承される', () => {
    expect(evalDates(CAL + `
premise Base = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon; roll: Following }
premise Mine = Base with { marker = everyDay |> within(month) |> nth(1) }
@Mine
marker |> roll(on: bizDay)`, W)).toEqual(['2026-02-02', '2026-03-02']);
  });
});

// 還流 2026-09-28 定期便 #2: roll: の意味を崩す変異 5 つ（宣言を位置引数より優先／常に Following／後置より在圏 premise を
// 優先／後置を無視／on: 無しで rollMember へ落ちない）が、上記 9 本では Playground の指紋照合以外に捕まらなかった。
// 供給側の witness 7 本（先方リポジトリ tests/kairos-premise-members.test.ts 130-183 行・main 072548b）を式と期待値ごと写経。
describe('還流 2026-09-28 定期便 #2: roll: の意味を固定する witness（供給側 7 本の写経）', () => {
  it('1. roll: Preceding を宣言して位置引数を省略すると Preceding で寄る（常に Following を返す変異を殺す）', () => {
    // 2/1（日）は窓の前（1/30）へ寄って窓外・3/1（日）は 2/27（金）へ
    expect(evalDates(CAL + `
premise Base = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon; roll: Preceding }
@Base
everyDay |> within(month) |> nth(1) |> roll(on: bizDay)`, W)).toEqual(['2026-02-27']);
  });

  it('2. 位置引数は宣言より優先する（roll: Following の在圏で roll(Preceding, …) は Preceding）', () => {
    expect(evalDates(CAL + `
premise Base = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon; roll: Following }
@Base
everyDay |> within(month) |> nth(1) |> roll(Preceding, on: bizDay)`, W)).toEqual(['2026-02-27']);
  });

  it('3. 軽量形の後置 @Base roll: Preceding でも宣言値を使う（spec §3.3「束定義または軽量形の後置」）', () => {
    expect(evalDates(CAL + `
premise Base = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon }
@Base roll: Preceding
everyDay |> within(month) |> nth(1) |> roll(on: bizDay)`, W)).toEqual(['2026-02-27']);
  });

  it('4. 本体層では後置の roll: が premise の roll: より優先する（最内優先＝spec §3.3。premise 自身の公開語の内側では逆に premise の宣言が勝つ＝ADR-35 判断 8）', () => {
    expect(evalDates(CAL + `
premise Base = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon; roll: Following }
@Base roll: Preceding
everyDay |> within(month) |> nth(1) |> roll(on: bizDay)`, W)).toEqual(['2026-02-27']);
  });

  it('5. 3 段の連鎖では中間の段の宣言が基底に勝つ（Base Following → Mid Preceding → Mine＝Mid with {}）', () => {
    expect(evalDates(CAL + `
premise Base = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon; roll: Following }
premise Mid = Base with { roll: Preceding }
premise Mine = Mid with {}
@Mine
everyDay |> within(month) |> nth(1) |> roll(on: bizDay)`, W)).toEqual(['2026-02-27']);
  });

  it('6. axis: と roll: を両方畳むと roll() だけで寄る（派生の入口・on: も位置引数も無い形）', () => {
    expect(evalDates(CAL + `
premise Base = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon; axis: bizDay; roll: Preceding }
premise Mine = Base with {}
@Mine
everyDay |> within(month) |> nth(1) |> roll()`, W)).toEqual(['2026-02-27']);
  });

  it('7. 宣言も位置引数も無いときの誘導文言は全文一致（両端を固定）', () => {
    expect(() => run(CAL + `
premise Base = Gregorian with { calendar: Cal; tz: "Asia/Tokyo"; wkst: Mon }
@Base
everyDay |> within(month) |> nth(1) |> roll(on: bizDay)`, W)).toThrow(
      /^roll は規約が必要（I3）——位置引数で Following\/Preceding を書くか前文で roll: を宣言$/,
    );
  });
});
