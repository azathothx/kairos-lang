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
  for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) {
    writeFileSync(join(OUT, 'reference', lang, f), absolutize(readFileSync(join(dir, f), 'utf8'), lang));
  }
}
copyFileSync(join(ROOT, 'llms.txt'), join(OUT, 'llms.txt'));

/** 相対リンクと画像参照を公開サイトの絶対 URL に書き換える（外部レビュー第 13 回 E5）。
 *  同梱文書は kairos://reference/{lang}/{word} として AI が読むため、`../spec/…`・`<img src="../assets/…">` は解決できない。
 *  Markdown の .md は Jekyll の公開面では .html（README.md はディレクトリの index）。 */
function absolutize(text, lang) {
  const base = lang === 'ja' ? 'https://kairos-lang.org/reference/' : 'https://kairos-lang.org/en/reference/';
  const toUrl = rel => {
    const u = new URL(rel, base);
    u.pathname = u.pathname.replace(/\/README\.md$/, '/').replace(/\.md$/, '.html');
    return u.href;
  };
  const isRel = t => !/^(?:[a-z]+:|#|\/)/i.test(t);
  return text
    .replace(/(\]\()([^)\s]+)(\))/g, (m, open, target, close) => isRel(target) ? `${open}${toUrl(target)}${close}` : m)
    .replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/g, (m, open, target, close) => isRel(target) ? `${open}${toUrl(target)}${close}` : m);
}
const words = readdirSync(SRC.ja).filter(f => f.endsWith('.md') && f !== 'README.md').map(f => f.replace(/\.md$/, ''));
writeFileSync(join(OUT, 'words.json'), JSON.stringify(words, null, 2) + '\n');
console.log(`mcp/docs/ へ reference（ja ${words.length + 1}・en）と llms.txt を束ねた`);
