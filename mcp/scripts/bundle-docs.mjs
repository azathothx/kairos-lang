#!/usr/bin/env node
// 配布物に同梱する文書を集める（prepack／build で実行）: 記述語リファレンス（日本語が正・英訳併記）と llms.txt。
// 出所は公開リポジトリの reference/・en/reference/・llms.txt（このパッケージは同じリポジトリの mcp/ に住む）。
// npm パッケージ kairos-lang には入っていないので、ここで束ねる（Apache-2.0・同一リポジトリ）。
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));   // リポジトリのルート
const OUT = join(ROOT, 'mcp', 'docs');
const SRC = { ja: join(ROOT, 'reference'), en: join(ROOT, 'en', 'reference') };
for (const [lang, dir] of Object.entries(SRC)) {
  if (!existsSync(dir)) throw new Error(`reference が見つからない: ${dir}（公開リポジトリの mcp/ で実行する）`);
  mkdirSync(join(OUT, 'reference', lang), { recursive: true });
  for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) copyFileSync(join(dir, f), join(OUT, 'reference', lang, f));
}
copyFileSync(join(ROOT, 'llms.txt'), join(OUT, 'llms.txt'));
const words = readdirSync(SRC.ja).filter(f => f.endsWith('.md') && f !== 'README.md').map(f => f.replace(/\.md$/, ''));
writeFileSync(join(OUT, 'words.json'), JSON.stringify(words, null, 2) + '\n');
console.log(`mcp/docs/ へ reference（ja ${words.length + 1}・en）と llms.txt を束ねた`);
