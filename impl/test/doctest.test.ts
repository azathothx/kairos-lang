// reference/・stdlib/・design/40-examples/ の実行例を検証する doctest（規約は reference/README.md）
// - ```kairos フェンスのうち `# eval: FROM..TO` 行を持つブロックが実行対象
//   （任意後置 `tz: Zone` で実行・表示 tz を上書き——多 TZ 例の期待値を premise の壁時計で書くため）
// - `#=>` 行が期待値（最後の本体式の日付列。空白区切り・複数行可。行が無ければ空列を期待）
// - `#~>` 行が註釈・警告の期待値（最後の本体式の区間註釈＝formatAnnotation の正準形、警告＝`警告: ` 前置。
//   行が無ければ「註釈ゼロ・警告ゼロ」の主張——地平線降格（ADR-37）で年タイポ等が警告止まりになっても
//   doctest が黙って通る盲点の封止。被覆サマリは常時表示の監視面のため照合対象外）
// - `@JP` を使い `premise JP` を自前定義しないブロックには標準前提（helpers の PRELUDE）を前置
// - `# resolve: 束縛名 = dates 日付… covering: … asof: …` 行が external の解決子固定材
//   （ADR-46。データが文書内に書かれ CI で外部 IO なし。第一段は dates wire のみ——instants の
//   実行例は external.test.ts の関数注入で担保）
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { run, formatAnnotation, KairosError } from '../src/index.ts';
import type { ExternalData } from '../src/index.ts';
import { PRELUDE } from './helpers.ts';

/** `# resolve:` 行のパース（doctest の external 固定材）:
 *  `# resolve: h = dates 2026-01-01 2026-02-11 covering: 2026..2026 asof: 2026-01-15 [labels: a b]` */
function parseResolveDirectives(b: string): Map<string, ExternalData> | undefined {
  const lines = [...b.matchAll(/^# resolve: (\w+) = dates((?: \d{4}-\d{2}-\d{2})*) covering: (.+?) asof: (\S+)(?: labels:((?: \S+)+))?\s*$/gm)];
  if (lines.length === 0) return undefined;
  const table = new Map<string, ExternalData>();
  for (const m of lines) {
    table.set(m[1], {
      dates: m[2].trim() === '' ? [] : m[2].trim().split(/\s+/),
      covering: m[3].trim(),
      asof: m[4],
      ...(m[5] ? { labels: m[5].trim().split(/\s+/) } : {}),
    });
  }
  return table;
}

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
          const expectedNotes = [...b.matchAll(/^#~> (.+)$/gm)].map(m => m[1].trim());
          // @JP の判定は語境界（@JPX 等の別 premise 名に PRELUDE を誤注入しない）
          const source = (/@JP\b/.test(b) && !b.includes('premise JP ')) ? PRELUDE + b : b;
          const fixtures = parseResolveDirectives(b);
          const resolve = fixtures
            ? (_p: string, binding: string) => fixtures.get(binding)
                ?? (() => { throw new Error(`doctest に # resolve: ${binding} がない`); })()
            : undefined;
          const r = run(source, { from: evalLine[1], to: evalLine[2],
            ...(evalLine[3] ? { tz: evalLine[3] } : {}), ...(resolve ? { resolve } : {}) });
          if (r.results.length === 0) throw new KairosError('本体式がない');
          const last = r.results[r.results.length - 1];
          const notes = [
            ...last.annotations.map(formatAnnotation),
            ...r.warnings.map(w => `警告: ${w}`),
          ];
          expect(last.dates).toEqual(expected);
          expect(notes).toEqual(expectedNotes);
        });
      }
    });
  }
}
