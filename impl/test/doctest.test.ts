// reference/・stdlib/・design/40-examples/ の実行例を検証する doctest（規約は reference/README.md）
// - ```kairos フェンスのうち `# eval: FROM..TO` 行を持つブロックが実行対象
//   （任意後置 `tz: Zone` で実行・表示 tz を上書き——多 TZ 例の期待値を premise の壁時計で書くため）
// - `#=>` 行が期待値（最後の本体式の日付列。空白区切り・複数行可。行が無ければ空列を期待）
// - `@JP` を使い `premise JP` を自前定義しないブロックには標準前提（helpers の PRELUDE）を前置
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { evalDates } from '../src/index.ts';
import { PRELUDE } from './helpers.ts';

for (const sub of ['reference', 'stdlib', 'design/40-examples']) {
  const dir = new URL(`../../${sub}/`, import.meta.url);
  const files = readdirSync(dir).filter(f => f.endsWith('.md')).sort();

  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    const blocks = [...src.matchAll(/```kairos\n([\s\S]*?)```/g)].map(m => m[1]);
    const runnable = blocks
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => /^# eval: /m.test(b));
    if (runnable.length === 0) continue;

    describe(`${sub}/${f}`, () => {
      for (const { b, i } of runnable) {
        const evalLine = /^# eval: (\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})(?: tz: ([A-Za-z0-9_/+-]+))?\s*$/m.exec(b);
        it(`実行例 ${i + 1}`, () => {
          if (!evalLine) throw new Error(`# eval: FROM..TO [tz: Zone] の形式が不正:\n${b}`);
          const expected = [...b.matchAll(/^#=> (.+)$/gm)].flatMap(m => m[1].trim().split(/\s+/));
          // @JP の判定は語境界（@JPX 等の別 premise 名に PRELUDE を誤注入しない）
          const source = (/@JP\b/.test(b) && !b.includes('premise JP ')) ? PRELUDE + b : b;
          const dates = evalDates(source, { from: evalLine[1], to: evalLine[2], ...(evalLine[3] ? { tz: evalLine[3] } : {}) });
          expect(dates).toEqual(expected);
        });
      }
    });
  }
}
