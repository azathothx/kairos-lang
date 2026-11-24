#!/usr/bin/env node
// 適合試験一式（TCK）の束の生成器: 2 層の事例を 1 つの JSON（tck/kairos-tck.json）に束ねる。依存ゼロ・リポジトリルートで実行。
//   層 1＝doctest … reference/・stdlib/・design/40-examples/・recipes/・skills/kairos-authoring/ の ```kairos ブロックのうち `# eval:` を持つもの全部。
//                   読み方は impl/test/doctest.test.ts と同じ（`# eval: FROM..TO [tz: Zone]`・`@JP` なら helpers の PRELUDE を前置・`# resolve:` は供給）
//   層 2＝目録     … tck/manifest.json と tck/cases/<id>.kairos（impl/test/*.test.ts から移した言語中立の witness）
// 期待値は文書の `#=>`／`#~>` を写すのではなく、参照実装の CLI（impl/src/cli.ts の main）で評価した CliReport から焼く
// （文書の期待値との一致は doctest が担保する）。生成は決定的: 事例は id で整列・JSON は 2 空白・末尾改行。
// 使い方: node tck/build.mjs [--out <path>]   （既定の出力は tck/kairos-tck.json）
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, DEFAULT_BUNDLE, cliArgs } from './run.mjs';

/** doctest の走査対象（impl/test/doctest.test.ts と同じ 5 箇所・同じ順） */
export const DOCTEST_DIRS = ['reference', 'stdlib', 'design/40-examples', 'recipes', 'skills/kairos-authoring'];

/** impl/src の指紋（tools/build-playground.mjs・doc-consistency の Playground 同期検査と同じ式）: sha256(SRC 7 ファイル連結 + stdlib 3 ファイル連結) の先頭 12 桁 */
export function implSha() {
  const SRC = ['ast.ts', 'lexer.ts', 'parser.ts', 'tz.ts', 'eval.ts', 'ics.ts', 'index.ts'];
  const STDLIB_FILES = ['gregorian.kairos', 'fiscal.kairos', 'isoweek.kairos'];
  return createHash('sha256')
    .update(SRC.map(f => readFileSync(join(ROOT, 'impl', 'src', f), 'utf8')).join('')
      + STDLIB_FILES.map(f => readFileSync(join(ROOT, 'impl', 'stdlib', f), 'utf8')).join(''))
    .digest('hex').slice(0, 12);
}

/** `# resolve: 束縛名 = dates 日付… covering: … asof: … [labels: …]` 行（doctest の external 固定材）を --supply の束の形に */
function parseResolveDirectives(b) {
  const lines = [...b.matchAll(/^# resolve: (\w+) = dates((?: \d{4}-\d{2}-\d{2})*) covering: (.+?) asof: (\S+)(?: labels:((?: \S+)+))?\s*$/gm)];
  if (lines.length === 0) return undefined;
  const supply = {};
  for (const m of lines) {
    supply[m[1]] = {
      dates: m[2].trim() === '' ? [] : m[2].trim().split(/\s+/),
      covering: m[3].trim(),
      asof: m[4],
      ...(m[5] ? { labels: m[5].trim().split(/\s+/) } : {}),
    };
  }
  return supply;
}

/** 層 1 の事例（期待値なし）。doctest.test.ts と同じ選別——`# eval:` を持つ ```kairos ブロック */
export async function doctestCases() {
  const { PRELUDE } = await import(pathToFileURL(join(ROOT, 'impl', 'test', 'helpers.ts')).href);
  const out = [];
  for (const sub of DOCTEST_DIRS) {
    const dir = join(ROOT, sub);
    for (const f of readdirSync(dir).filter(x => x.endsWith('.md')).sort()) {
      const src = readFileSync(join(dir, f), 'utf8');
      const blocks = [...src.matchAll(/```kairos\n([\s\S]*?)```/g)].map(m => m[1]);
      blocks.forEach((b, i) => {
        if (!/^# eval: /m.test(b)) return;
        const evalLine = /^# eval: (\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})(?: tz: ([A-Za-z0-9_/+-]+))?\s*$/m.exec(b);
        if (!evalLine) throw new Error(`${sub}/${f} 実行例 ${i + 1}: # eval: FROM..TO [tz: Zone] の形式が不正`);
        const source = (/@JP\b/.test(b) && !b.includes('premise JP ')) ? PRELUDE + b : b;
        const supply = parseResolveDirectives(b);
        out.push({
          id: `doctest/${sub}/${f}#${String(i + 1).padStart(2, '0')}`,
          layer: 'doctest',
          origin: `${sub}/${f} 実行例 ${i + 1}`,
          command: 'list',
          source,
          from: evalLine[1],
          to: evalLine[2],
          tz: evalLine[3] ?? 'Asia/Tokyo',   // doctest の既定 tz（必ず明示＝実行環境の TZ に依存しない）
          ...(supply ? { supply } : {}),
        });
      });
    }
  }
  return out;
}

/** 層 2 の事例（期待値なし）。tck/manifest.json の各項目と tck/cases/<id>.kairos */
export function manifestCases() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'tck', 'manifest.json'), 'utf8'));
  return Object.keys(manifest).sort().map(id => {
    const m = manifest[id];
    return {
      id: `manifest/${id}`,
      layer: 'manifest',
      origin: m.origin,
      command: m.command,
      source: readFileSync(join(ROOT, 'tck', 'cases', `${id}.kairos`), 'utf8'),
      from: m.from,
      ...(m.command === 'list' ? { to: m.to } : {}),
      tz: m.tz,
      ...(m.supply ? { supply: m.supply } : {}),
      ...(m.command === 'next' ? { n: m.n, horizonYears: m.horizonYears } : {}),
    };
  });
}

/** 参照実装の CLI をプロセス内で呼ぶ評価器（impl/src/cli.ts の main に、走行器と同じ引数列を渡す。stdout の JSON を返す）。
 *  main は --tz・--from を必ず受けるので機械の tz・今日に依存しない。一時ファイルは評価器に渡すだけで、期待値には残さない */
export async function makeEvaluator() {
  const cli = await import(pathToFileURL(join(ROOT, 'impl', 'src', 'cli.ts')).href);
  const dir = mkdtempSync(join(tmpdir(), 'kairos-tck-build-'));
  let k = 0;
  const evaluate = (c) => {
    const def = join(dir, `${k}.kairos`);
    const sup = join(dir, `${k}.json`);
    k++;
    writeFileSync(def, c.source);
    if (c.supply) writeFileSync(sup, JSON.stringify(c.supply));
    const saved = { log: console.log, error: console.error };
    let out = '';
    console.log = (s) => { out += `${s}\n`; };
    console.error = () => {};
    try { cli.main(cliArgs(c, def, sup)); } finally { console.log = saved.log; console.error = saved.error; }
    const rep = JSON.parse(out);
    if (JSON.stringify(rep).includes(dir)) throw new Error(`${c.id}: 報告に一時ファイルのパスが含まれる（期待値が環境に依存する）`);
    return rep;
  };
  evaluate.dispose = () => rmSync(dir, { recursive: true, force: true });
  return evaluate;
}

/** CliReport から事例の期待値だけを切り出す（version・command・from／to の写しは入れない） */
export function toExpect(rep) {
  if (rep.error) return { error: { kind: rep.error.kind, message: rep.error.message } };
  return {
    results: rep.results.map(r => ({
      points: r.points,
      dates: r.dates,
      annotations: r.annotations.map(a => ({ fromMs: a.fromMs, toMs: a.toMs, source: a.source, covering: a.covering, ...(a.asof !== undefined ? { asof: a.asof } : {}) })),
      ...(r.labels ? { labels: r.labels } : {}),
      uid: r.uid,
    })),
    coverage: rep.coverage.map(c => ({ source: c.source, covering: c.covering, ...(c.asof !== undefined ? { asof: c.asof } : {}), concluded: c.concluded, runwayDays: c.runwayDays })),
    warnings: rep.warnings,
    ...(rep.command === 'next' ? { requested: rep.requested, found: rep.found, to: rep.to } : {}),   // next の探索の結果も意味論（2026-10-30 機械レビュー所見 1）
  };
}

/** 束を組む（決定的: 事例は id で整列）。onReport を渡すと評価した CliReport そのものも受け取れる（witness の自己適合用） */
export async function buildBundle(opts = {}) {
  const cases = [...(await doctestCases()), ...manifestCases()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ids = new Set();
  for (const c of cases) { if (ids.has(c.id)) throw new Error(`id が重複: ${c.id}`); ids.add(c.id); }
  const evaluate = await makeEvaluator();
  try {
    for (const c of cases) {
      const rep = evaluate(c);
      if (opts.onReport) opts.onReport(c, rep);
      c.expect = toExpect(rep);
    }
  } finally { evaluate.dispose(); }
  return {
    kairosLang: JSON.parse(readFileSync(join(ROOT, 'impl', 'package.json'), 'utf8')).version,
    implSha: implSha(),
    cases,
  };
}

export const serialize = (bundle) => `${JSON.stringify(bundle, null, 2)}\n`;

const isMain = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const out = argv[0] === '--out' && argv[1] ? argv[1] : DEFAULT_BUNDLE;
  const bundle = await buildBundle();
  writeFileSync(out, serialize(bundle));
  const n = (layer) => bundle.cases.filter(c => c.layer === layer).length;
  const errors = bundle.cases.filter(c => c.expect.error).length;
  console.log(`${out} へ ${bundle.cases.length} 件（doctest ${n('doctest')}・manifest ${n('manifest')}・うち失敗期待 ${errors}）を出力した（kairos-lang ${bundle.kairosLang}・impl ${bundle.implSha}）`);
}
