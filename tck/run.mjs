#!/usr/bin/env node
// 適合試験一式（TCK）の走行器: 束（tck/kairos-tck.json）を読み、評価器を外部コマンドとして呼び、CliReport を期待と比べる。
// 依存ゼロ（Node 標準のみ）。評価器の呼び方は参照実装の CLI と同じ引数規約:
//   <cmd> list --json --from F --to T --tz Z [--supply s.json] file.kairos
//   <cmd> next --json --from F -n N --horizon H --tz Z [--supply s.json] file.kairos
// 照合の段階（根拠は spec/60-firing-layer-profile.md A.1「自前の評価器を持つ場合」）:
//   strict … points・dates・annotations の区間と source・error.kind・labels・coverage の covering／concluded／runwayDays（MUST）
//   text   … error.message・warnings[]・asof の字面（「診断の文言も仕様の一部」＝既定で MUST。--lenient-text で別集計）
//   uid    … results[].uid（--check-uid のときだけ。uid は指紋で永続 ID ではない＝A.1）
// 使い方: node tck/run.mjs [--cmd "<評価器>"] [--bundle <束>] [--only <id の接頭辞>] [--list] [--json] [--lenient-text] [--check-uid]
//   --cmd 省略時は手元の参照実装（node impl/src/cli.ts）。終了コードは不一致があれば 1。
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));   // tck/ の親＝リポジトリルート
export const DEFAULT_BUNDLE = join(ROOT, 'tck', 'kairos-tck.json');
export const STAGES = ['strict', 'text', 'uid'];

/** 事例から CLI の引数列を組む（参照実装の CLI と同じ規約。生成器と走行器で共有） */
export function cliArgs(c, defPath, supplyPath) {
  const a = [c.command, '--json', '--from', c.from];
  if (c.command === 'list') a.push('--to', c.to);
  else a.push('-n', String(c.n), '--horizon', String(c.horizonYears));
  a.push('--tz', c.tz);
  if (c.supply) a.push('--supply', supplyPath);
  a.push(defPath);
  return a;
}

const show = (v) => {
  const s = v === undefined ? 'なし' : JSON.stringify(v);
  return s.length > 400 ? `${s.slice(0, 400)}…（全 ${s.length} 字）` : s;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const annKey = (a) => ({ fromMs: a.fromMs, toMs: a.toMs, source: a.source, covering: a.covering });
const covKey = (c) => ({ source: c.source, covering: c.covering, concluded: c.concluded, runwayDays: c.runwayDays });
const bySource = (x, y) => (x.source < y.source ? -1 : x.source > y.source ? 1 : x.covering < y.covering ? -1 : x.covering > y.covering ? 1 : 0);

/** 事例の期待（c.expect）と実測の CliReport を比べ、段階ごとの不一致を返す。
 *  actual が { parseError } なら評価器の出力そのものが読めなかった（strict の不一致） */
export function compareCase(c, actual) {
  const out = { strict: [], text: [], uid: [] };
  const ng = (stage, item, expected, got) => out[stage].push({ item, expected, actual: got });
  const e = c.expect;
  if (actual && actual.parseError) { ng('strict', '出力', e.error ? `error.kind ${e.error.kind}` : 'CliReport（JSON）', actual.parseError); return out; }
  if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) { ng('strict', '出力', e.error ? `error.kind ${e.error.kind}` : 'CliReport（JSON の object）', `CliReport の形でない: ${show(actual)}`); return out; }   // 所見 4
  if (e.error) {
    if (!actual.error) { ng('strict', 'error.kind', e.error.kind, 'なし（成功報告）'); return out; }
    if (actual.error.kind !== e.error.kind) ng('strict', 'error.kind', e.error.kind, actual.error.kind);
    if (actual.error.message !== e.error.message) ng('text', 'error.message', e.error.message, actual.error.message);
    return out;
  }
  if (actual.error) { ng('strict', 'error', 'なし（成功報告）', `${actual.error.kind}: ${actual.error.message}`); return out; }
  const results = Array.isArray(actual.results) ? actual.results : [];
  if (results.length !== e.results.length) ng('strict', 'results.length', e.results.length, results.length);
  e.results.forEach((er, i) => {
    const ar = results[i];
    if (!ar) return;
    if (!same(er.points, ar.points)) ng('strict', `results[${i}].points`, er.points, ar.points);
    if (!same(er.dates, ar.dates)) ng('strict', `results[${i}].dates`, er.dates, ar.dates);
    const aa = Array.isArray(ar.annotations) ? ar.annotations : [];
    if (!same(er.annotations.map(annKey), aa.map(annKey))) ng('strict', `results[${i}].annotations`, er.annotations.map(annKey), aa.map(annKey));
    else er.annotations.forEach((x, j) => { if (x.asof !== aa[j].asof) ng('text', `results[${i}].annotations[${j}].asof`, x.asof, aa[j].asof); });
    if (!same(er.labels, ar.labels)) ng('strict', `results[${i}].labels`, er.labels, ar.labels);
    if (er.uid !== ar.uid) ng('uid', `results[${i}].uid`, er.uid, ar.uid);
  });
  for (const k of ['requested', 'found', 'to']) if (e[k] !== undefined && e[k] !== actual[k]) ng('strict', k, e[k], actual[k]);   // next の探索の結果（所見 1）
  const ec = [...e.coverage].sort(bySource);
  const ac = (Array.isArray(actual.coverage) ? [...actual.coverage] : []).sort(bySource);
  if (!same(ec.map(covKey), ac.map(covKey))) ng('strict', 'coverage', ec.map(covKey), ac.map(covKey));
  else ec.forEach((x, j) => { if (x.asof !== ac[j].asof) ng('text', `coverage[${j}].asof`, x.asof, ac[j].asof); });
  if (!same(e.warnings, actual.warnings)) ng('text', 'warnings', e.warnings, actual.warnings);
  return out;
}

/** --cmd の文字列を引数列に（空白区切り。"…" で囲めば空白を含められる） */
export const splitCmd = (cmd) => [...cmd.matchAll(/"([^"]*)"|(\S+)/g)].map(m => m[1] ?? m[2]);

/** 手元の参照実装（node impl/src/cli.ts）＝--cmd 省略時 */
export const defaultCmd = () => [process.execPath, join(ROOT, 'impl', 'src', 'cli.ts')];

/** 外部コマンドの評価器を作る。parts＝コマンドと先頭の引数（事例ごとの引数はこの後ろに付く） */
export function spawnEvaluator(parts) {
  if (parts.length === 0) throw new Error('--cmd が空');
  // Windows の npx・kairos は .cmd シム＝シェル経由でないと起動しない。実在するファイル（node.exe のフルパス等）はシェルなしで呼ぶ
  const shell = process.platform === 'win32' && !existsSync(parts[0]);
  const dir = mkdtempSync(join(tmpdir(), 'kairos-tck-'));
  let k = 0;
  const evaluate = (c) => {
    const def = join(dir, `${k}.kairos`);
    const sup = join(dir, `${k}.json`);
    k++;
    writeFileSync(def, c.source);
    if (c.supply) writeFileSync(sup, JSON.stringify(c.supply));
    const r = spawnSync(parts[0], [...parts.slice(1), ...cliArgs(c, def, sup)],
      { encoding: 'utf8', shell, maxBuffer: 256 * 1024 * 1024 });
    if (r.error) return { parseError: `起動に失敗: ${r.error.message}` };
    try { return JSON.parse(r.stdout); } catch {
      return { parseError: `終了コード ${r.status}・stdout が JSON でない: ${(r.stdout || '').slice(0, 200)}${r.stderr ? ` / stderr: ${r.stderr.slice(0, 200)}` : ''}` };
    }
  };
  evaluate.dispose = () => rmSync(dir, { recursive: true, force: true });
  return evaluate;
}

/** 束の事例を評価器に掛け、事例ごとの不一致を集める */
export function runBundle(cases, evaluate) {
  let version;
  const rows = cases.map(c => {
    const actual = evaluate(c);
    if (version === undefined && actual && typeof actual.version === 'string') version = actual.version;
    return { id: c.id, layer: c.layer, ...compareCase(c, actual) };
  });
  return { version, rows };
}

/** 段階ごとの件数と終了コード */
export function summarize(rows, opts = {}) {
  const summary = {};
  for (const s of STAGES) {
    const ng = rows.filter(r => r[s].length > 0).length;
    summary[s] = { ok: rows.length - ng, ng };
  }
  const exitCode = (summary.strict.ng > 0 || (!opts.lenientText && summary.text.ng > 0) || (opts.checkUid && summary.uid.ng > 0)) ? 1 : 0;
  return { summary, exitCode };
}

function usage() {
  return `使い方: node tck/run.mjs [--cmd "<評価器のコマンド>"] [--bundle <束の JSON>] [--only <id の接頭辞>] [--list] [--json] [--lenient-text] [--check-uid]
  --cmd           評価器。事例ごとに <cmd> list|next --json … file.kairos の形で呼ぶ（省略時は手元の参照実装 node impl/src/cli.ts）
  --bundle        束（省略時は tck/kairos-tck.json）
  --only          id がこの接頭辞で始まる事例だけ（例: doctest/reference/・manifest/supply-）
  --list          事例の一覧だけを出して終わる
  --json          結果を機械可読（JSON）で stdout に
  --lenient-text  text 段階（error.message・warnings・asof の字面）の不一致を終了コードに数えない（件数は別に出す）
  --check-uid     uid 段階（results[].uid）も終了コードに数える
終了コード: 0＝数えた段階に不一致なし・1＝不一致あり・2＝使い方`;
}

function parseArgs(argv) {
  const o = { cmd: defaultCmd(), bundle: DEFAULT_BUNDLE, only: '', list: false, json: false, lenientText: false, checkUid: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${a} の値が無い`); return argv[++i]; };
    if (a === '--cmd') o.cmd = splitCmd(val());
    else if (a === '--bundle') o.bundle = val();
    else if (a === '--only') o.only = val();
    else if (a === '--list') o.list = true;
    else if (a === '--json') o.json = true;
    else if (a === '--lenient-text') o.lenientText = true;
    else if (a === '--check-uid') o.checkUid = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`未知のオプション: ${a}`);
  }
  return o;
}

export function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(e.message); console.error(usage()); return 2; }
  if (o.help) { console.log(usage()); return 0; }
  let bundle;
  try { bundle = JSON.parse(readFileSync(o.bundle, 'utf8')); } catch (e) { console.error(`束が読めない: ${o.bundle}（${e.message}）`); return 2; }
  const cases = bundle.cases.filter(c => c.id.startsWith(o.only));
  if (o.list) {
    for (const c of cases) console.log(`${c.id}\t${c.command}\t${c.origin}`);
    console.log(`${cases.length} 件（束: kairos-lang ${bundle.kairosLang}・impl ${bundle.implSha}）`);
    return 0;
  }
  if (cases.length === 0) { console.error(`--only ${o.only} に合う事例がない`); return 2; }
  let evaluate;
  try { evaluate = spawnEvaluator(o.cmd); } catch (e) { console.error(e.message); console.error(usage()); return 2; }
  let result;
  try { result = runBundle(cases, evaluate); } finally { evaluate.dispose(); }
  const { summary, exitCode } = summarize(result.rows, o);
  if (o.json) {
    console.log(JSON.stringify({ bundle: { kairosLang: bundle.kairosLang, implSha: bundle.implSha }, cmd: o.cmd.join(' '), evaluatorVersion: result.version ?? null,
      options: { lenientText: o.lenientText, checkUid: o.checkUid }, cases: result.rows, summary, exitCode }, null, 2));
    return exitCode;
  }
  console.log(`束: kairos-lang ${bundle.kairosLang}（impl ${bundle.implSha}）・事例 ${cases.length} 件・評価器の版: ${result.version ?? '不明'}`);
  for (const r of result.rows) {
    for (const s of STAGES) for (const m of r[s]) {
      console.log(`✗ ${r.id} [${s}] ${m.item}`);
      console.log(`    期待: ${show(m.expected)}`);
      console.log(`    実測: ${show(m.actual)}`);
    }
  }
  const counted = (s) => (s === 'strict') || (s === 'text' && !o.lenientText) || (s === 'uid' && o.checkUid);
  for (const s of STAGES) console.log(`${s.padEnd(6)} 一致 ${summary[s].ok} / 不一致 ${summary[s].ng}${counted(s) ? '' : '（終了コードに数えない）'}`);
  console.log(exitCode === 0 ? '全件一致' : '不一致あり');
  return exitCode;
}

const isMain = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) process.exitCode = main(process.argv.slice(2));
