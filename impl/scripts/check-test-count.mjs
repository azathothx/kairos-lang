#!/usr/bin/env node
// 実スイート数と入口の記載の突合（外部レビュー第 13 回 H1・2026-10-16 新設）。
// doc-consistency は入口どうしの一致しか見ないので、「数値を手で書く」工程そのものを vitest の JSON レポートで検査する。
// 使い方: npx vitest run --reporter=default --reporter=json --outputFile=vitest-report.json && node scripts/check-test-count.mjs vitest-report.json
import { readFileSync } from 'node:fs';

const reportPath = process.argv[2];
if (!reportPath) { console.error('使い方: node scripts/check-test-count.mjs <vitest の JSON レポート>'); process.exit(2); }
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const actual = report.numTotalTests;
if (typeof actual !== 'number') { console.error('レポートに numTotalTests が無い'); process.exit(2); }

const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8');
const last = (text, re) => { let m, r; const g = new RegExp(re.source, 'g'); while ((m = g.exec(text))) r = m; return r; };
// 入口 6 箇所（doc-consistency の「テスト数の記載が入口間で一致する」と同じ面＋impl/README）
const ENTRIES = [
  ['README.md', /reference implementation \((\d+) tests\)/],
  ['README.ja.md', /(\d+) テスト）で実証済み/],
  ['llms.txt', /(\d+) tests including doctests/],
  ['en/spec/README.md', /`impl\/`, (\d+) tests\)/],
  ['impl/README.md', /(\d+) 本〔doctest 込み〕/],
  ['spec/CHANGELOG.md', /\*\*(\d+) テスト\*\*/],   // 最後の追補の値
];
const bad = [];
for (const [p, re] of ENTRIES) {
  const m = last(read(p), re);
  if (!m) { bad.push(`${p}: 記載が見つからない（${re}）`); continue; }
  const n = Number(m[1]);
  if (n !== actual) bad.push(`${p}: 記載 ${n} ≠ 実スイート ${actual}`);
}
if (bad.length) { console.error('テスト数の記載が実スイートと合わない:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`テスト数の突合 OK: 実スイート ${actual}＝入口 ${ENTRIES.length} 箇所`);
