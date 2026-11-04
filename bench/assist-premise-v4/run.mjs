#!/usr/bin/env node
// AI 補助ベンチ v4 の測定器（LLM あり）。README「測り方」のとおりに呼び、採点して results/ に書き出す。
// 依存: このディレクトリで `npm install @anthropic-ai/sdk zod`（node_modules は git 管理外）。鍵は環境変数 ANTHROPIC_API_KEY。
// 使い方: node bench/assist-premise-v4/run.mjs --model claude-sonnet-5-5 [--effort high] [--repairs 2] [--ids P-01,P-16] [--problems <jsonl>] [--material <file>] [--out <dir>] [--tag v4]
//   --effort は対応するモデルだけ（low|medium|high|xhigh|max）。省略＝送らない。
// 結果ファイルは問題文と解釈の文を持たない（モデルが返した body・explanation・assumptions は持つ）。
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { HERE, ROOT, TOPICS, readJsonl, evaluate, judgePremise, systemPrompt } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const MODEL = opt('--model', 'claude-sonnet-5-5');
const EFFORT = opt('--effort', '');
const REPAIRS = Number(opt('--repairs', '2'));
const IDS = opt('--ids', '') ? opt('--ids').split(',') : null;
const OUT = opt('--out', join(HERE, 'results'));
const TAG = opt('--tag', 'v4');
const problems = readJsonl(opt('--problems', join(HERE, 'problems.jsonl'))).filter(p => !IDS || IDS.includes(p.id));
const material = readFileSync(opt('--material', join(ROOT, 'skills/kairos-authoring/SKILL.md')), 'utf8');
const SYSTEM = systemPrompt(material);
if (!process.env.ANTHROPIC_API_KEY) { console.error('環境変数 ANTHROPIC_API_KEY を置く'); process.exit(1); }
const client = new Anthropic({ maxRetries: 5 });
const Proposal = z.object({ body: z.string(), explanation: z.string(), assumptions: z.array(z.object({ topic: z.enum(TOPICS), statement: z.string() })) });
const SYSTEM_BLOCKS = [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }];

async function solve(p) {
  const messages = [{ role: 'user', content: `要件: ${p.prompt}${p.allDay ? '（終日でよい）' : ''}` }];
  const rec = { id: p.id, attempts: 0, validated: false, pass: false, body: null, explanation: null, assumptions: null, errors: [], usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
  let got = null;
  for (let attempt = 1; attempt <= 1 + REPAIRS; attempt++) {
    rec.attempts = attempt;
    const res = await client.messages.parse({ model: MODEL, max_tokens: 16000, system: SYSTEM_BLOCKS, messages, output_config: { format: zodOutputFormat(Proposal), ...(EFFORT ? { effort: EFFORT } : {}) } });
    rec.usage.input += res.usage.input_tokens; rec.usage.output += res.usage.output_tokens;
    rec.usage.cacheRead += res.usage.cache_read_input_tokens || 0; rec.usage.cacheWrite += res.usage.cache_creation_input_tokens || 0;
    if (res.stop_reason !== 'end_turn' || !res.parsed_output) { rec.errors.push(`stop_reason ${res.stop_reason}`); break; }
    const out = res.parsed_output;
    rec.body = out.body; rec.explanation = out.explanation; rec.assumptions = out.assumptions;
    try { got = evaluate(out.body, p); rec.validated = true; break; }
    catch (e) {
      rec.errors.push(String(e && e.message || e));
      messages.push({ role: 'assistant', content: JSON.stringify(out) });
      messages.push({ role: 'user', content: `検証エラー:\n${e.message}\n\n本体だけを修正し、同じ JSON 形式で返してください。` });
    }
  }
  Object.assign(rec, judgePremise(p, got, rec.assumptions));
  if (got) rec.got = got.slice(0, 12);
  return rec;
}

mkdirSync(OUT, { recursive: true });
const base = `${TAG}-${MODEL}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
const results = [];
for (const p of problems) {
  let rec;
  try { rec = await solve(p); }
  catch (e) { rec = { id: p.id, attempts: 0, validated: false, pass: false, letter: 'i', errors: [`harness: ${String(e && e.message || e).slice(0, 200)}`], usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }; }
  results.push(rec);
  appendFileSync(join(OUT, `${base}.partial.jsonl`), JSON.stringify(rec) + '\n');
  console.log(`${rec.pass ? '✓' : '×'} ${p.id} [${rec.letter}] attempts=${rec.attempts} declared=${rec.declared} matched=${rec.matched ?? '-'} topics=${(rec.topics || []).join('+') || '-'}${rec.errors?.length ? ` | ${rec.errors[rec.errors.length - 1].slice(0, 70)}` : ''}`);
}
const n = l => results.filter(r => r.letter === l).length;
const summary = {
  tag: TAG, model: MODEL, effort: EFFORT || null, repairs: REPAIRS, problems: results.length,
  pass: results.filter(r => r.pass).length, silentCorrect: n('S'), declaredWrong: n('W'), undeclaredWrong: n('X'), invalid: n('i'),
  controlDeclared: results.filter(r => r.control && (r.topics || []).length > 0).length,
  overDeclared: results.reduce((a, r) => a + (r.overDeclared || 0), 0),
  letters: results.map(r => `${r.id}:${r.letter}`).join(' '),
  repairsUsed: results.filter(r => r.attempts > 1).length,
  inputTokens: results.reduce((a, r) => a + r.usage.input, 0), outputTokens: results.reduce((a, r) => a + r.usage.output, 0),
  cacheReadTokens: results.reduce((a, r) => a + r.usage.cacheRead, 0), cacheWriteTokens: results.reduce((a, r) => a + r.usage.cacheWrite, 0),
};
writeFileSync(join(OUT, `${base}.json`), JSON.stringify({ summary, system: SYSTEM.length, results }, null, 2));
console.log(JSON.stringify(summary));
console.log('書き出し', join(OUT, `${base}.json`));
