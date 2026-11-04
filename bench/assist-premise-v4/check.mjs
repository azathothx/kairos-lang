#!/usr/bin/env node
// 正答の自己検査（LLM なし）: answers.jsonl の本体を前文に接いで参照実装で評価し、problems.jsonl の各解釈の expected と比べる。
// 使い方: node bench/assist-premise-v4/check.mjs [--problems <jsonl>] [--answers <jsonl>]   （先に impl/ で npm ci && npm run build）
import { join } from 'node:path';
import { HERE, readJsonl, evaluate, interpretationsOf } from './lib.mjs';
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const problems = readJsonl(opt('--problems', join(HERE, 'problems.jsonl')));
const answers = new Map(readJsonl(opt('--answers', join(HERE, 'answers.jsonl'))).map(a => [a.id, a]));
let pass = 0, pairs = 0, fail = 0;
for (const p of problems) {
  const a = answers.get(p.id);
  if (!a) { console.log(`  × ${p.id} 正答がない`); fail++; continue; }
  const interp = interpretationsOf(p);
  let ok = true;
  for (const x of interp) {
    pairs++;
    const b = a.bodies.find(y => y.key === x.key);
    if (!b) { console.log(`  × ${p.id}/${x.key} 本体がない`); ok = false; continue; }
    let got; try { got = evaluate(b.body, p); } catch (e) { console.log(`  × ${p.id}/${x.key} ${String(e.message || e).slice(0, 80)}`); ok = false; continue; }
    if (got.join() !== x.expected.join()) { console.log(`  × ${p.id}/${x.key} 不一致 got=${got.slice(0, 6).join(' ')}`); ok = false; }
  }
  for (const b of a.bodies) if (!interp.some(x => x.key === b.key)) { console.log(`  × ${p.id}/${b.key} 解釈に無い key`); ok = false; }
  if (p.interpretations?.length && p.interpretations[0].expected.join() !== p.expected.join()) { console.log(`  × ${p.id} expected が第 1 解釈と違う`); ok = false; }
  if (ok) pass++; else fail++;
}
console.log(`check: ${pass}/${problems.length} 問 pass（${pairs} 組）`);
process.exit(fail === 0 ? 0 : 1);
