#!/usr/bin/env node
// stdlib/*.kairos を文字列モジュール src/stdlib-data.ts に埋め込む（1.1.1・組み込みの口 (1)）。
// - 参照実装の公開 API（dist/index.js）が読み込み時に node:fs で stdlib を読む形をやめ、fs の無い環境
//   （ブラウザの束・edge 実行環境）でも import できるようにする。Playground（tools/build-playground.mjs）と
//   exe（scripts/build-sea.mjs）が別々にやっていた差し替えも、この一本に畳む。
// - 読み込み順は依存順（派生は base の登録が先に要る）。readdir の辞書順は不可。
// - 生成物は commit する（vitest は src を直接読むので生成の手順を挟まない）。鮮度は impl/test/embedding-api.test.ts が
//   stdlib/*.kairos との一致で検査する＝*.kairos を直したら `npm run gen` で作り直す（npm run build でも走る）。
// 使い方: node impl/scripts/gen-stdlib-data.mjs   （どこから呼んでもよい）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMPL = dirname(dirname(fileURLToPath(import.meta.url)));
export const STDLIB_FILES = ['gregorian.kairos', 'fiscal.kairos', 'isoweek.kairos'];
export const stdlibSource = () => STDLIB_FILES.map(f => readFileSync(join(IMPL, 'stdlib', f), 'utf8')).join('\n');
export const render = () =>
  `// 生成物: impl/scripts/gen-stdlib-data.mjs（stdlib/*.kairos の埋め込み・依存順 ${STDLIB_FILES.join('→')}）。手で編集しない。\n`
  + `// stdlib/*.kairos を直したら \`npm run gen\` で作り直す（鮮度は test/embedding-api.test.ts が検査する）。\n`
  + `/** 標準 premise（Gregorian・Fiscal・ISOWeek）の Kairos ソース（依存順に連結）。公開 API の run() はこれを先に評価する。\n`
  + ` *  利用側が読むための export（1.1.1）——差し替えの口ではない（標準 premise の定義は言語の一部）。 */\n`
  + `export const STDLIB_SOURCE: string = ${JSON.stringify(stdlibSource())};\n`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = join(IMPL, 'src', 'stdlib-data.ts');
  writeFileSync(out, render());
  console.log(`${out} を出力した（${STDLIB_FILES.length} ファイル・${stdlibSource().length} 文字）`);
}
