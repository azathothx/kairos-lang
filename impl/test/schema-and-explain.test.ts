// 1.0 追補 23（87 段 1・設計者裁定 2026-10-05〜06）: 機械可読の契約——JSON Schema 2 本（schema/cli-report.schema.json・
// schema/supply.schema.json）の witness・`results[].source`／`line`・`--json` のエラー表面（CliErrorReport）・`--explain`（軽量 explain）・
// 表示形の一意性（秒未満は .SSS・DST の重複はオフセット付き＝dates と points は一対一）。
// witness の対＝「実物の出力が Schema に通る」と「壊れた形は通らない」。検証器は ajv（devDependency＝利用者には配られない）。
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { run } from '../src/index.ts';
import { cmdList, cmdNext, errorReport } from '../src/cli.ts';
import type { CliReport, CliErrorReport } from '../src/cli.ts';

const ROOT = new URL('../../', import.meta.url);
const IMPL = fileURLToPath(new URL('..', import.meta.url));
const readJson = (p: string) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
// strict（未知キーワード・型の取り違えを拒む）のうち strictRequired だけ外す——oneOf の枝の required は親の properties で定義済み
const ajv = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });   // 和の型（integer|null・labels の値型）は明示許可
const validReport = ajv.compile(readJson('schema/cli-report.schema.json'));
const validSupply = ajv.compile(readJson('schema/supply.schema.json'));
const errorsOf = (v: { errors?: unknown }) => JSON.stringify(v.errors);

const JP = 'premise JP { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon }\n@JP\n';
const NY = 'premise NY { calendar-system: Gregorian; tz: "America/New_York"; wkst: Sun }\n@NY\n';
const H = `premise H { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "x"
  h = [2026-01-12, 2026-02-11] covering: 2026-01-01..2026-02-28
}
@H
everyDay \\ h
`;
const W = { from: '2026-01-01', to: '2026-03-01' };

describe('JSON Schema の witness（schema/cli-report.schema.json・schema/supply.schema.json）', () => {
  it('Schema 文書 2 本は draft 2020-12 として妥当（strict で compile できる）', () => {
    expect(typeof validReport).toBe('function');
    expect(typeof validSupply).toBe('function');
  });

  it('list の実出力（註釈・被覆サマリ・警告つき）が CliReport Schema に通る', () => {
    const rep = cmdList(H, { from: '2026-01-01', to: '2026-04-01', tz: 'Asia/Tokyo' });   // 覆域の先 [03-01, 04-01) が註釈
    expect(rep.results[0].annotations.length).toBe(1);
    expect(rep.coverage.length).toBe(1);
    expect(validReport(rep), errorsOf(validReport)).toBe(true);
    const rep2 = cmdList(JP + 'everyDay |> within(month) |> last |> shift(1, unit: day)\n', { from: '2026-01-01', to: '2026-02-01', tz: 'Asia/Tokyo' });
    expect(rep2.warnings.length).toBeGreaterThan(0);                 // window-clip 警告
    expect(validReport(rep2), errorsOf(validReport)).toBe(true);
  });

  it('next の実出力（requested／found／horizonYears）が通る', () => {
    const rep = cmdNext(JP + 'everyDay |> within(month) |> nth(25)\n', { from: '2026-01-01', n: 2, horizonYears: 1, tz: 'Asia/Tokyo' });
    expect(rep.found).toBe(2);
    expect(validReport(rep), errorsOf(validReport)).toBe(true);
  });

  it('--explain の実出力（results[].stages）が通る', () => {
    const rep = cmdList(JP + 'everyDay |> within(month) |> last\n', { ...W, tz: 'Asia/Tokyo', explain: true });
    expect(rep.results[0].stages?.map(s => [s.stage, s.count])).toEqual([['everyDay', 59], ['within(month)', 59], ['last', 2]]);
    expect(validReport(rep), errorsOf(validReport)).toBe(true);
  });

  it('エラー表面（CliErrorReport）が通る——kind は usage／supply／static の 3 値', () => {
    for (const kind of ['usage', 'supply', 'static'] as const) {
      expect(validReport(errorReport('list', kind, 'x')), errorsOf(validReport)).toBe(true);
    }
    expect(validReport({ command: 'list', version: '1', error: { kind: 'bogus', message: 'x' } })).toBe(false);
    expect(validReport({ command: 'list', version: '1', error: { kind: 'static', message: 'x' }, results: [] })).toBe(false);   // 成功と失敗の混在
  });

  it('壊れた形は通らない（必須キーの欠落・dates の形・points の型・未知のキー）', () => {
    const ok = cmdList(JP + 'everyDay |> within(month) |> last\n', { ...W, tz: 'Asia/Tokyo' });
    const mut = (f: (r: CliReport) => void) => { const c = JSON.parse(JSON.stringify(ok)) as CliReport; f(c); return validReport(c); };
    expect(mut(r => { delete (r.results[0] as Partial<CliReport['results'][0]>).line; })).toBe(false);
    expect(mut(r => { delete (r.results[0] as Partial<CliReport['results'][0]>).uid; })).toBe(false);     // 1.0 追補 26: uid は必須
    expect(mut(r => { r.results[0].uid = 'kairos-xyz-series@kairos-lang.org'; })).toBe(false);         // 形＝12 桁 hex
    expect(mut(r => { r.results[0].dates[0] = '2026/01/31'; })).toBe(false);
    expect(mut(r => { (r.results[0].points as unknown[])[0] = '1769785200000'; })).toBe(false);
    expect(mut(r => { (r as unknown as Record<string, unknown>).extra = 1; })).toBe(false);
    expect(mut(r => { delete (r as Partial<CliReport>).coverage; })).toBe(false);
  });

  it('供給 JSON: dates 形・instants 形・labels つきは通り、asof 欠落・日付の形・dates も instants も無い形・両方ある形は通らない', () => {
    expect(validSupply({ h: { dates: ['2026-01-05'], covering: '2026..2026', asof: '2026-01-01' } })).toBe(true);
    expect(validSupply({ 'P.h': { instants: [1767193200000], covering: '2026-01-01..', asof: 'v3', labels: ['a'] } })).toBe(true);
    expect(validSupply({ h: { dates: ['2026-01-05'], covering: '2026..2026' } })).toBe(false);
    expect(validSupply({ h: { dates: ['2026-1-5'], covering: '2026..2026', asof: '2026-01-01' } })).toBe(false);
    expect(validSupply({ h: { covering: '2026..2026', asof: '2026-01-01' } })).toBe(false);
    expect(validSupply({ h: { dates: [], covering: '', asof: '2026-01-01' } })).toBe(false);
    expect(validSupply({ h: { dates: ['2026-01-05'], instants: [1], covering: '2026..2026', asof: '2026-01-01' } })).toBe(false);   // 同居は CLI も拒む
  });
});

describe('results[].source と line（1.0 追補 23・設計者裁定 2026-10-06）', () => {
  it('式の字面と 1 起点の行番号——複数行の pipe は改行を保つ・前文ブロックの内側も文書順', () => {
    const src = JP + 'everyDay |> within(month) |> last\n\n@JP wkst: Sun\neveryDay\n  |> within(week)\n  |> first\n@JP {\n  everyDay |> within(month) |> first\n}\n';
    const r = run(src, { from: '2026-01-01', to: '2026-02-01' });
    expect(r.results.map(x => [x.source, x.line])).toEqual([
      ['everyDay |> within(month) |> last', 3],
      ['everyDay\n  |> within(week)\n  |> first', 6],
      ['everyDay |> within(month) |> first', 10],
    ]);
  });
  it('同じ字面でも直前の前文が違えば line で区別できる', () => {
    const src = JP + 'everyDay |> within(week) |> first\n@JP wkst: Sun\neveryDay |> within(week) |> first\n';
    const r = run(src, { from: '2026-01-01', to: '2026-02-01' });
    expect(r.results[0].source).toBe(r.results[1].source);
    expect([r.results[0].line, r.results[1].line]).toEqual([3, 5]);
    expect(r.results[0].dates).not.toEqual(r.results[1].dates);
  });
});

describe('--explain（軽量 explain＝段ごとの途中値と点数・1.0 追補 23）', () => {
  it('pipe の先頭と各段の後の点数・先頭と末尾・交差する窓数を残す', () => {
    const r = run(JP + 'everyDay |> within(month) |> nth(31)\n', { from: '2026-01-01', to: '2026-03-01', explain: true });
    expect(r.results[0].stages).toEqual([
      { stage: 'everyDay', count: 59, first: '2026-01-01', last: '2026-02-28', annotations: 0 },
      { stage: 'within(month)', count: 59, first: '2026-01-01', last: '2026-02-28', windows: 2, annotations: 0 },
      { stage: 'nth(31)', count: 1, first: '2026-01-31', last: '2026-01-31', annotations: 0 },
    ]);
  });
  it('段の字面は引数を名前・数値・文字列だけ展開し、ラムダは λ・註釈数も段ごと', () => {
    const r = run(H.replace('everyDay \\ h\n', 'everyDay |> filter(d => not coincides(h, day, d)) |> within(month) |> last\n'),
      { from: '2026-01-01', to: '2026-04-01', explain: true });
    const st = r.results[0].stages!;
    expect(st.map(s => s.stage)).toEqual(['everyDay', 'filter(λ)', 'within(month)', 'last']);
    expect(st[1].annotations).toBe(1);                 // 覆域外 2026-03 は述語が落として註釈
    expect(st[3].count).toBe(2);                       // 3 月は覆域外＝last も註釈つきで空
  });
  it('pipe でない本体式は式全体で 1 段・explain 無しなら stages は無い', () => {
    const r = run(JP + 'everyDay\n', { from: '2026-01-01', to: '2026-01-04', explain: true });
    expect(r.results[0].stages).toEqual([{ stage: 'everyDay', count: 3, first: '2026-01-01', last: '2026-01-03', annotations: 0 }]);
    expect(run(JP + 'everyDay\n', { from: '2026-01-01', to: '2026-01-04' }).results[0].stages).toBeUndefined();
  });
});

describe('表示形の一意性（dates は points と一対一・1.0 追補 23＝90-open 1-2 の裁定）', () => {
  it('DST の重複（NY 2026-11-01 の 01:00〜01:59）は 1 回目・2 回目ともオフセット付き——それ以外の時刻は従来どおり', () => {
    const r = run(NY + 'everyInstant |> strideBy(30m, from: 2026-11-01T00:00)\n', { from: '2026-11-01', to: '2026-11-02', tz: 'America/New_York' }).results[0];
    expect(r.dates.slice(0, 7)).toEqual(['2026-11-01', '2026-11-01T00:30', '2026-11-01T01:00-04:00', '2026-11-01T01:30-04:00',
                                         '2026-11-01T01:00-05:00', '2026-11-01T01:30-05:00', '2026-11-01T02:00']);
    expect(new Set(r.dates).size).toBe(r.points.length);
  });
  it('春の隙間の日・固定オフセット tz・DST の無い tz ではオフセットが付かない', () => {
    const spring = run(NY + 'everyInstant |> strideBy(30m, from: 2026-03-08T00:00)\n', { from: '2026-03-08', to: '2026-03-09', tz: 'America/New_York' }).results[0];
    expect(spring.dates.every(d => !/[+-]\d\d:\d\d$/.test(d))).toBe(true);
    const fixed = run('premise F { calendar-system: Gregorian; tz: "-04:00"; wkst: Sun }\n@F\neveryInstant |> strideBy(30m, from: 2026-11-01T00:00)\n',
      { from: '2026-11-01', to: '2026-11-02', tz: '-04:00' }).results[0];
    expect(fixed.dates.every(d => !/[+-]\d\d:\d\d$/.test(d))).toBe(true);
    expect(fixed.dates.length).toBe(48);
  });
  it('秒未満は ms が 0 でないときだけ .SSS（秒と同じ適応表示）', () => {
    // 刻みの実体化（計算範囲 to+400 日まで）は重いので、ms 付きの日時リテラルの表で表示だけを見る
    const r = run(JP + 't = [2026-01-01T00:00, 2026-01-01T00:00:00.500, 2026-01-01T00:00:01, 2026-01-01T00:00:01.500] covering: 2026..2026\nt\n',
      { from: '2026-01-01', to: '2026-01-02' }).results[0];
    expect(r.dates).toEqual(['2026-01-01', '2026-01-01T00:00:00.500', '2026-01-01T00:00:01', '2026-01-01T00:00:01.500']);
    expect(new Set(r.dates).size).toBe(r.points.length);
  });
  it('導出点の規約（最初の出現）は不変——at(T01:30) は秋戻しの日に 1 点で、そのラベルにオフセットが付く', () => {
    const r = run(NY + 'everyDay |> at(T01:30)\n', { from: '2026-11-01', to: '2026-11-02', tz: 'America/New_York' }).results[0];
    expect(r.dates).toEqual(['2026-11-01T01:30-04:00']);
  });
});

describe('--json のエラー表面（CliErrorReport・stdout・終了コード 1）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kairos-errjson-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const put = (name: string, data: string) => { const f = join(dir, name); writeFileSync(f, data); return f; };
  const cli = (...args: string[]) => spawnSync(process.execPath, ['src/cli.ts', ...args], { cwd: IMPL, encoding: 'utf8' });
  const RANGE = ['--from', '2026-01-01', '--to', '2026-02-01', '--tz', 'Asia/Tokyo'];

  it('static: 定義のエラーは stdout に JSON（stderr は空）・Schema に通る', () => {
    const r = cli('list', ...RANGE, '--json', put('bad.kairos', JP + 'everyDay |> within(month) |> nth(0)\n'));
    expect(r.status).toBe(1);
    expect(r.stderr).toBe('');
    const rep = JSON.parse(r.stdout) as CliErrorReport;
    expect(rep.error.kind).toBe('static');
    expect(rep.error.message).toMatch(/^nth: n は 1 以上の整数/);
    expect(validReport(rep), errorsOf(validReport)).toBe(true);
  });
  it('usage: 未知のフラグ・無いファイル・壊れた --supply の JSON', () => {
    const r1 = cli('list', ...RANGE, '--json', '--bogus', put('ok.kairos', JP + 'everyDay\n'));
    expect(r1.status).toBe(1);
    expect((JSON.parse(r1.stdout) as CliErrorReport).error).toEqual({ kind: 'usage', message: '未知のオプション: --bogus' });
    const r2 = cli('list', ...RANGE, '--json', join(dir, 'missing.kairos'));
    expect((JSON.parse(r2.stdout) as CliErrorReport).error.kind).toBe('usage');
    const r3 = cli('list', ...RANGE, '--json', '--supply', put('broken.json', '{'), put('ok2.kairos', JP + 'everyDay\n'));
    expect((JSON.parse(r3.stdout) as CliErrorReport).error.kind).toBe('usage');
  });
  it('supply: 供給契約の違反（asof 欠落）は kind supply', () => {
    const def = put('ext.kairos', 'premise H { calendar-system: Gregorian; tz: "Asia/Tokyo"; wkst: Mon; source: "x"\n  h = external(kind: dates)\n}\n@H\nh\n');
    const sup = put('sup.json', JSON.stringify({ h: { dates: ['2026-01-05'], covering: '2026..2026' } }));
    const r = cli('list', ...RANGE, '--json', '--supply', sup, def);
    expect(r.status).toBe(1);
    const rep = JSON.parse(r.stdout) as CliErrorReport;
    expect(rep.error.kind).toBe('supply');
    expect(validReport(rep), errorsOf(validReport)).toBe(true);
  });
  it('--json 無しのエラーは従来どおり stderr（stdout は空）', () => {
    const r = cli('list', ...RANGE, put('bad2.kairos', JP + 'everyDay |> within(month) |> nth(0)\n'));
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/^nth: n は 1 以上の整数/);
  });
  it('実物の CLI --json --explain の出力も Schema に通る', () => {
    const r = cli('list', ...RANGE, '--json', '--explain', put('ex.kairos', JP + 'everyDay |> within(month) |> last\n'));
    expect(r.status).toBe(0);
    const rep = JSON.parse(r.stdout) as CliReport;
    expect(rep.results[0].line).toBe(3);
    expect(validReport(rep), errorsOf(validReport)).toBe(true);
  });
});
