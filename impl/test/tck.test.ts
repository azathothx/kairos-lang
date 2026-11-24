// 適合試験一式（TCK）の witness——束（tck/kairos-tck.json）・スキーマ（schema/tck.schema.json）・生成器（tck/build.mjs）・走行器（tck/run.mjs）。
// 根拠は spec/60-firing-layer-profile.md A.1「自前の評価器を持つ場合」の MUST 3 本（判定の同一性・診断の文言も仕様の一部・doctest の期待値一致）。
//   (a) 束がスキーマに通る（事例 1 件も通る・余計な鍵・欠落は落ちる）
//   (b) 束の全事例が手元の参照実装で strict／text／uid とも一致＝自己適合（走行器の照合をそのまま使う）
//   (c) 生成が決定的（2 回作って同一）
//   (d) 委ねた束が最新＝作り直すと差分ゼロ（Playground の指紋検査と同じ役。割れたら node tck/build.mjs を再実行）
//   (e) 層 1 の件数が doctest の実行対象ブロック数と等しい（走査は doctest.test.ts と同じ 5 箇所）
//   (f) 走行器が赤を出せる＝期待を 1 点ずらした束・点を 1 つ落とす偽の評価器で終了コード 1（--lenient-text／--check-uid の集計も）
// 変異で赤を実測してから数えた: 走行器の points 照合を外す（f-1 が緑のまま→赤）・偽の評価器の点落としを外す（f-2）・生成器の id 整列を外す（d）・
// DOCTEST_DIRS から skills を外す（e・d）・束の 1 事例の expect.warnings を書き換える（b・d）・スキーマの additionalProperties を外す（a）。
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import type { CliReport, CliErrorReport } from '../src/cli.ts';

// 道具は依存ゼロの .mjs（tck/ 直下＝公開面。tools/ は公開同期で落ちるので置かない）。型宣言を持たないので、使う面だけをここで宣言して動的に読む
interface TckCase { id: string; layer: 'doctest' | 'manifest'; origin: string; command: 'list' | 'next'; source: string; from: string; to?: string; tz: string;
  supply?: Record<string, unknown>; n?: number; horizonYears?: number; expect: Record<string, unknown> }
interface Bundle { kairosLang: string; implSha: string; cases: TckCase[] }
type Report = CliReport | CliErrorReport;
interface Mismatch { item: string; expected: unknown; actual: unknown }
interface Row { id: string; strict: Mismatch[]; text: Mismatch[]; uid: Mismatch[] }
interface BuildModule {
  DOCTEST_DIRS: string[];
  implSha(): string;
  buildBundle(opts?: { onReport?: (c: TckCase, rep: Report) => void }): Promise<Bundle>;
  serialize(b: Bundle): string;
}
interface RunModule {
  compareCase(c: TckCase, actual: Report | { parseError: string }): Row;
  summarize(rows: Row[], opts?: { lenientText?: boolean; checkUid?: boolean }): { summary: Record<string, { ok: number; ng: number }>; exitCode: number };
}
const TOOLS = new URL('../../tck/', import.meta.url);
const build = await import(new URL('build.mjs', TOOLS).href) as BuildModule;
const runner = await import(new URL('run.mjs', TOOLS).href) as RunModule;

const ROOT = new URL('../../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), 'utf8');
const committedText = read('tck/kairos-tck.json');
const committed = JSON.parse(committedText) as Bundle;
const schema = JSON.parse(read('schema/tck.schema.json'));
const ajv = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
const valid = ajv.compile(schema);
const errorsOf = () => JSON.stringify(valid.errors);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const PAYDAY = 'manifest/coverage-example-payday-list';   // 12 点・註釈 1・被覆サマリ 1 の事例（f の変異の的）

describe('TCK の束とスキーマ（schema/tck.schema.json）', () => {
  it('(a) 束がスキーマに通る・事例 1 件だけでも通る・余計な鍵・欠落・不正な kind は落ちる', () => {
    expect(valid(committed), errorsOf()).toBe(true);
    expect(valid(committed.cases[0]), errorsOf()).toBe(true);
    expect(valid(committed.cases.find(c => c.layer === 'manifest')), errorsOf()).toBe(true);
    const mut = (f: (b: Bundle) => void) => { const b = clone(committed); f(b); return valid(b); };
    expect(mut(b => { (b as unknown as Record<string, unknown>).extra = 1; })).toBe(false);
    expect(mut(b => { (b.cases[0] as unknown as Record<string, unknown>).version = '1.1.0'; })).toBe(false);   // CliReport の写しは入れない
    expect(mut(b => { delete (b.cases[0] as Partial<TckCase>).tz; })).toBe(false);                            // tz は必ず明示
    expect(mut(b => { const c = b.cases.find(x => x.command === 'list')!; delete c.to; })).toBe(false);
    expect(mut(b => { const c = b.cases.find(x => x.command === 'next')!; (c as Partial<TckCase>).to = '2027-01-01'; })).toBe(false);
    expect(mut(b => { const c = b.cases.find(x => 'error' in x.expect)!; (c.expect.error as { kind: string }).kind = 'runtime'; })).toBe(false);
    expect(mut(b => { const c = b.cases.find(x => 'results' in x.expect)!; (c.expect.results as { points: number[] }[])[0].points.push(1.5); })).toBe(false);
  });

  it('束の頭: kairosLang は impl/package.json の版・implSha は impl ソースの指紋（Playground と同じ式）・id は整列済みで重複なし', () => {
    expect(committed.kairosLang).toBe(JSON.parse(read('impl/package.json')).version);
    expect(committed.implSha).toBe(build.implSha());
    expect(committed.implSha).toBe(/IMPL_SOURCE_SHA = '([0-9a-f]{12})'/.exec(read('playground/js/build-info.js'))![1]);
    const ids = committed.cases.map(c => c.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('(e) 層 1 の件数が doctest の実行対象ブロック数と等しい（走査は doctest.test.ts と同じ: ```kairos のうち # eval: を持つもの）・層 2 は目録と同数で origin が全件に', () => {
    let runnable = 0;
    for (const sub of ['reference', 'stdlib', 'design/40-examples', 'recipes', 'skills/kairos-authoring']) {
      expect(build.DOCTEST_DIRS).toContain(sub);
      const dir = new URL(`${sub}/`, ROOT);
      for (const f of readdirSync(dir).filter(x => x.endsWith('.md'))) {
        const blocks = [...readFileSync(new URL(f, dir), 'utf8').matchAll(/```kairos\n([\s\S]*?)```/g)].map(m => m[1]);
        runnable += blocks.filter(b => /^# eval: /m.test(b)).length;
      }
    }
    expect(build.DOCTEST_DIRS).toHaveLength(5);
    expect(committed.cases.filter(c => c.layer === 'doctest')).toHaveLength(runnable);
    const manifest = JSON.parse(read('tck/manifest.json')) as Record<string, { origin: string }>;
    const layer2 = committed.cases.filter(c => c.layer === 'manifest');
    expect(layer2.map(c => c.id)).toEqual(Object.keys(manifest).sort().map(k => `manifest/${k}`));
    expect(layer2.length).toBeGreaterThanOrEqual(40);
    for (const c of committed.cases) expect(c.origin, c.id).toMatch(/\S/);
    // 3 種の error.kind がどれも層 2 に居る
    const kinds = new Set(layer2.map(c => (c.expect.error as { kind: string } | undefined)?.kind).filter(Boolean));
    expect([...kinds].sort()).toEqual(['static', 'supply', 'usage']);
  });
});

describe('自己適合と決定性（参照実装で評価し直す）', () => {
  let fresh: Bundle;
  const reports = new Map<string, Report>();
  beforeAll(async () => { fresh = await build.buildBundle({ onReport: (c, rep) => reports.set(c.id, rep) }); }, 600_000);

  it('(d) 委ねた束が最新＝作り直すと差分ゼロ（割れたら node tck/build.mjs を再実行して commit）', () => {
    expect(build.serialize(fresh)).toBe(committedText);
  });

  it('(b) 全事例が手元の参照実装で strict／text／uid とも一致＝自己適合（走行器の照合で不一致 0）', () => {
    const rows = committed.cases.map(c => runner.compareCase(c, reports.get(c.id)!));
    const bad = rows.filter(r => r.strict.length || r.text.length || r.uid.length).map(r => `${r.id}: ${JSON.stringify([r.strict, r.text, r.uid])}`);
    expect(bad).toEqual([]);
    expect(runner.summarize(rows, { checkUid: true })).toEqual({ summary: { strict: { ok: rows.length, ng: 0 }, text: { ok: rows.length, ng: 0 }, uid: { ok: rows.length, ng: 0 } }, exitCode: 0 });
    // 照合そのものが働いている: 期待を書き換えれば段階ごとに不一致が立つ
    const c = clone(committed.cases.find(x => x.id === PAYDAY)!);
    const rep = reports.get(PAYDAY)!;
    const e = c.expect as { results: { points: number[]; dates: string[]; annotations: { toMs: number }[]; labels?: string[]; uid: string }[]; coverage: { runwayDays: number | null }[]; warnings: string[] };
    // strict の全項目を 1 つずつ壊す（2026-10-30 機械レビュー所見 3＝points と warnings と uid だけでは照合の網が見えない）
    e.results[0].points[0] += 1; e.results[0].dates.pop(); e.results[0].annotations[0].toMs += 1; e.results[0].labels = ['x'];
    e.results[0].uid = 'kairos-000000000000-series@kairos-lang.org'; e.coverage[0].runwayDays = 999; e.warnings.push('x'); e.results.push({ ...e.results[0] });
    const row = runner.compareCase(c, rep);
    expect(row.strict.map(m => m.item)).toEqual(['results.length', 'results[0].points', 'results[0].dates', 'results[0].annotations', 'results[0].labels', 'coverage']);
    expect(row.text.map(m => m.item)).toEqual(['warnings']);
    expect(row.uid.map(m => m.item)).toEqual(['results[0].uid']);
    expect(runner.summarize([row]).exitCode).toBe(1);
    expect(runner.summarize([{ ...row, strict: [] }], { lenientText: true }).exitCode).toBe(0);
    expect(runner.summarize([{ ...row, strict: [], text: [] }], { checkUid: true }).exitCode).toBe(1);
  });

  it('(c) 生成が決定的（2 回作って同一）', async () => {
    const again = await build.buildBundle();
    expect(build.serialize(again)).toBe(build.serialize(fresh));
  }, 600_000);
});

describe('走行器（tck/run.mjs）は赤を出せる——サブプロセスの実走', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kairos-tck-witness-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const RUN = fileURLToPath(new URL('run.mjs', TOOLS));
  const CLI = fileURLToPath(new URL('impl/src/cli.ts', ROOT));
  const run = (...args: string[]) => spawnSync(process.execPath, [RUN, ...args], { encoding: 'utf8', env: { ...process.env, TZ: 'UTC' } });   // 機械 tz に依存しない
  const put = (name: string, text: string) => { const f = join(dir, name); writeFileSync(f, text); return f; };

  it('対照: 手元の参照実装で 1 事例は全件一致・終了コード 0・--json の形・--list', () => {
    const r = run('--only', PAYDAY);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('strict 一致 1 / 不一致 0');
    expect(r.stdout).toContain('全件一致');
    const j = run('--only', PAYDAY, '--json');
    expect(j.status).toBe(0);
    const out = JSON.parse(j.stdout);
    expect(out).toMatchObject({ bundle: { kairosLang: committed.kairosLang, implSha: committed.implSha }, evaluatorVersion: committed.kairosLang,
      summary: { strict: { ok: 1, ng: 0 }, text: { ok: 1, ng: 0 }, uid: { ok: 1, ng: 0 } }, exitCode: 0 });
    expect(out.cases).toEqual([{ id: PAYDAY, layer: 'manifest', strict: [], text: [], uid: [] }]);
    const l = run('--list', '--only', 'manifest/supply-');
    expect(l.status).toBe(0);
    expect(l.stdout.split('\n').filter(x => x.startsWith('manifest/supply-'))).toHaveLength(committed.cases.filter(c => c.id.startsWith('manifest/supply-')).length);
  });

  it('(f-1) 期待を 1 点ずらした束は終了コード 1・不一致は id・項目・期待・実測を並べる', () => {
    const b = clone(committed);
    const c = b.cases.find(x => x.id === PAYDAY)!;
    const e = c.expect as { results: { points: number[] }[] };
    e.results[0].points[0] += 1;
    const bundle = put('shifted.json', build.serialize(b));
    const r = run('--bundle', bundle, '--only', PAYDAY);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(`✗ ${PAYDAY} [strict] results[0].points`);
    expect(r.stdout).toMatch(/期待: \[\d+/);
    expect(r.stdout).toMatch(/実測: \[\d+/);
    expect(r.stdout).toContain('strict 一致 0 / 不一致 1');
    expect(r.stdout).toContain('不一致あり');
  });

  it('(f-2) 点を 1 つ落とす偽の評価器（参照実装を呼んで末尾の点を捨てる）は終了コード 1', () => {
    const fake = put('fake.mjs', `
import { spawnSync } from 'node:child_process';
const r = spawnSync(process.execPath, [${JSON.stringify(CLI)}, ...process.argv.slice(2)], { encoding: 'utf8' });
const rep = JSON.parse(r.stdout);
if (rep.results) { rep.results[0].points.pop(); rep.results[0].dates.pop(); if (rep.results[0].labels) rep.results[0].labels.pop(); }
console.log(JSON.stringify(rep));
process.exitCode = r.status;
`);
    const r = run('--cmd', `"${process.execPath}" "${fake}"`, '--only', PAYDAY);   // 空白を含むパスは "…" で囲む（所見 5）
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toContain(`✗ ${PAYDAY} [strict] results[0].points`);
    expect(r.stdout).toContain(`✗ ${PAYDAY} [strict] results[0].dates`);
    expect(r.stdout).toContain('strict 一致 0 / 不一致 1');
  });

  it('(f-3) 評価器の出力が JSON でない（--json を知らない版）も strict の不一致＝終了コード 1', () => {
    const silent = put('silent.mjs', 'console.log("not json"); process.exitCode = 1;\n');
    const r = run('--cmd', `"${process.execPath}" "${silent}"`, '--only', PAYDAY);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(`✗ ${PAYDAY} [strict] 出力`);
    expect(r.stdout).toContain('stdout が JSON でない');
  });

  it('(f-4) 文言だけ違う束: 既定は終了コード 1（診断の文言も仕様の一部）・--lenient-text なら 0 で text の件数だけ立つ。uid だけ違う束: 既定は 0・--check-uid で 1', () => {
    const errCase = committed.cases.find(c => c.id === 'manifest/static-core-word-redefinition')!;
    const b1 = clone(committed);
    (b1.cases.find(c => c.id === errCase.id)!.expect.error as { message: string }).message = '別の文言';
    const textOnly = put('text.json', build.serialize(b1));
    const r1 = run('--bundle', textOnly, '--only', errCase.id);
    expect(r1.status).toBe(1);
    expect(r1.stdout).toContain(`✗ ${errCase.id} [text] error.message`);
    const r2 = run('--bundle', textOnly, '--only', errCase.id, '--lenient-text');
    expect(r2.status).toBe(0);
    expect(r2.stdout).toContain('text   一致 0 / 不一致 1（終了コードに数えない）');
    const b2 = clone(committed);
    (b2.cases.find(c => c.id === PAYDAY)!.expect.results as { uid: string }[])[0].uid = 'kairos-000000000000-series@kairos-lang.org';
    const uidOnly = put('uid.json', build.serialize(b2));
    expect(run('--bundle', uidOnly, '--only', PAYDAY).status).toBe(0);
    const r3 = run('--bundle', uidOnly, '--only', PAYDAY, '--check-uid');
    expect(r3.status).toBe(1);
    expect(r3.stdout).toContain(`✗ ${PAYDAY} [uid] results[0].uid`);
  });

  it('(f-5) next の found／requested／to を書き換える偽の評価器は終了コード 1（探索の結果も strict・2026-10-30 機械レビュー所見 1）', () => {
    const fakeNext = put('fake-next.mjs', `
import { spawnSync } from 'node:child_process';
const r = spawnSync(process.execPath, [${JSON.stringify(CLI)}, ...process.argv.slice(2)], { encoding: 'utf8' });
const rep = JSON.parse(r.stdout);
if (rep.command === 'next') { rep.found = 99; rep.requested = 1; rep.to = '1999-01-01'; }
console.log(JSON.stringify(rep));
process.exitCode = r.status;
`);
    const r = run('--cmd', `"${process.execPath}" "${fakeNext}"`, '--only', 'manifest/next-');
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toContain('[strict] found');
    expect(r.stdout).toContain('[strict] to');
    expect(r.stdout).not.toContain('全件一致');
  });

  it('(f-6) 評価器の出力が JSON だが object でない（null）は strict の不一致＝終了コード 1・束や --cmd の不備は使い方の 2（所見 4）', () => {
    const nul = put('null.mjs', 'console.log("null");\n');
    const r = run('--cmd', `"${process.execPath}" "${nul}"`, '--only', PAYDAY);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('CliReport の形でない');
    const noCmd = run('--cmd', '', '--only', PAYDAY);
    expect(noCmd.status).toBe(2);
    expect(noCmd.stderr).toContain('--cmd が空');
    const noBundle = run('--bundle', join(dir, 'nonexistent.json'), '--only', PAYDAY);
    expect(noBundle.status).toBe(2);
    expect(noBundle.stderr).toContain('束が読めない');
  });

  it('使い方: 未知のオプションと合う事例の無い --only は終了コード 2', () => {
    expect(run('--bogus').status).toBe(2);
    expect(run('--only', 'nothing/').status).toBe(2);
  });
});
