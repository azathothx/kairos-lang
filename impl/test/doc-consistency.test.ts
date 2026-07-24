// 文書の整合性検査（機械化できる範囲の陳腐化を npm test で捕まえる）
// 発端: spec/00-intro の「ADR-01〜36」が 8 本分陳腐化していた（2026-07-11・ユーザー指摘）。
// doctest（例の実行検証）と同じ発想で、「現在形の文書」の機械検査可能な主張を実態と照合する。
// 対象は現在形の文書のみ——design/ の ADR・綻びログ・INDEX 現在地は歴史記録なので対象外。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');
const mdFiles = (dir: string) =>
  readdirSync(new URL(dir, root)).filter(f => f.endsWith('.md')).map(f => `${dir}${f}`);

// 現在形の文書（歴史記録を除く）
const CURRENT_DOCS = [
  'README.md',
  'README.ja.md',
  'impl/README.md',
  ...mdFiles('spec/'),
  ...mdFiles('reference/'),
  ...mdFiles('stdlib/'),
  ...mdFiles('en/spec/'), // 英語版ミラー（日本語が正・spec/reference/stdlib 全章ミラー）
  ...mdFiles('en/reference/'),
  ...mdFiles('en/stdlib/'),
];

describe('文書の整合性（現在形の文書 vs 実態）', () => {
  it('「ADR-01〜NN」の範囲表記が design/20-adr/ のファイル数と一致する', () => {
    const adrCount = readdirSync(new URL('design/20-adr/', root))
      .filter(f => /^adr-\d+.*\.md$/.test(f)).length;
    const targets = [...CURRENT_DOCS, 'design/00-overview.md'];
    const stale: string[] = [];
    for (const p of targets) {
      for (const m of read(p).matchAll(/ADR-01〜(\d+)/g)) {
        if (Number(m[1]) !== adrCount) stale.push(`${p}: ADR-01〜${m[1]}（実態は ${adrCount} 本）`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('改名済みの旧名 opens/closes が識別子として残っていない（F51・2026-07-09 改名）', () => {
    const stale: string[] = [];
    for (const p of CURRENT_DOCS) {
      for (const [i, line] of read(p).split('\n').entries()) {
        // 識別子の残存が趣旨——コードスパン内のみ検査（英語ミラーの自然動詞 opens/closes を誤検知しない）
        if (/`[^`]*\b(?:opens|closes)\b[^`]*`/.test(line) && !/旧仮称|改名|formerly|renamed/.test(line)) stale.push(`${p}:${i + 1}: ${line.trim().slice(0, 60)}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('仮称印は shiftBoundary（唯一の残存仮称）の行にしか付かない', () => {
    // 「（仮称）」を記法として説明する行（凡例・運用説明）は対象外
    const legend = /「（仮称）」|仮称印|と記す|\(placeholder\)/;   // 末尾は英語ミラーの凡例形
    // spec/CHANGELOG は RC 変更履歴（当時の記録）なので対象外
    const docs = CURRENT_DOCS.filter(p => p !== 'spec/CHANGELOG.md');
    const stale: string[] = [];
    for (const p of docs) {
      for (const [i, line] of read(p).split('\n').entries()) {
        if (/（仮称[）・]|\*\*仮称\*\*/.test(line) && !legend.test(line) && !line.includes('shiftBoundary')) {
          stale.push(`${p}:${i + 1}: ${line.trim().slice(0, 60)}`);
        }
      }
    }
    expect(stale).toEqual([]);
  });

  it('確定済みの綻び（F 番号）を「宿題」と書いている行がない', () => {
    // 90-findings の全件表から「処置が確定・解消・明文化済み」の F 番号を集める
    const findings = read('design/40-examples/90-findings.md');
    const confirmed = new Set<number>();
    for (const row of findings.matchAll(/^\| F(\d+) \|.*\|([^|]*)\|$/gm)) {
      if (/確定（|解消（|明文化済み/.test(row[2])) confirmed.add(Number(row[1]));
    }
    // spec/CHANGELOG の RC 差分ログは当時の記録なので対象外
    const docs = CURRENT_DOCS.filter(p => p !== 'spec/CHANGELOG.md');
    const stale: string[] = [];
    for (const p of docs) {
      for (const [i, line] of read(p).split('\n').entries()) {
        if (!/宿題/.test(line) || /確定|解消|だった/.test(line)) continue;
        for (const m of line.matchAll(/F(\d+)/g)) {
          if (confirmed.has(Number(m[1]))) stale.push(`${p}:${i + 1}: F${m[1]} を宿題と記載: ${line.trim().slice(0, 50)}`);
        }
      }
    }
    expect(stale).toEqual([]);
  });

  it('対話痕跡の役割語が文書に残っていない（公式体裁への正規化・2026-07-12）', () => {
    // 裁定・判断の主体は「設計者」、機械検証は「N 観点レビュー」（凡例は design/README）。
    // 「ユーザー」単独は言語の利用者の意（ユーザー定義 等）で正当——複合語だけを検査する。
    const banned = /ユーザー(裁定|判断|確認|指示|指摘|提案|要望|決定|協働|レビュー|の洞察|の直観|の読み)|エージェント|チャット|AskUserQuestion|SendMessage|Claude/;
    // 規約自体を説明する行は対象外
    const legend = /役割語|正規化|対話痕跡/;
    const designDocs = readdirSync(new URL('design/', root), { recursive: true })
      .map(f => `design/${f}`).filter(p => p.endsWith('.md'));
    const stale: string[] = [];
    for (const p of [...CURRENT_DOCS, ...designDocs]) {
      for (const [i, line] of read(p).split('\n').entries()) {
        if (banned.test(line) && !legend.test(line)) stale.push(`${p}:${i + 1}: ${line.trim().slice(0, 60)}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('「残る仮称」の語数主張が横断で一致する（shiftBoundary 一語・2026-07-13 レビュー指摘 A の再発防止）', () => {
    // 歴史記録（ADR・作業ジャーナル・CHANGELOG・綻びログ）は対象外。draft は「作業層だが現状主張を含む」ため対象
    const docs = [...CURRENT_DOCS.filter(p => p !== 'spec/CHANGELOG.md'),
      'design/00-overview.md', 'design/10-domain-model.md',
      'design/30-syntax/00-syntax-draft.md', 'design/90-open-questions.md', 'design/INDEX.md', 'llms.txt'];
    const stale: string[] = [];
    for (const p of docs) {
      for (const [i, line] of read(p).split('\n').entries()) {
        if (!/残る仮称|one placeholder|remaining placeholder/.test(line)) continue;
        if (!line.includes('shiftBoundary') || /二語|三語|two placeholder/.test(line)) {
          stale.push(`${p}:${i + 1}: ${line.trim().slice(0, 70)}`);
        }
      }
    }
    expect(stale).toEqual([]);
  });

  it('テスト数の記載が入口間で一致する（README 英日・llms.txt・en/spec——2026-07-13 レビュー指摘 B の再発防止）', () => {
    const entries: [string, RegExp][] = [
      ['README.md', /\((\d+) tests\)/],
      ['README.ja.md', /(\d+) テスト/],
      ['llms.txt', /(\d+) tests/],
      ['en/spec/README.md', /(\d+) tests/],
    ];
    const found = entries.map(([p, re]) => {
      const m = read(p).match(re);
      return { p, n: m ? m[1] : '記載なし' };
    });
    const nums = new Set(found.map(f => f.n));
    expect(nums.size, `テスト数が入口間で不一致: ${found.map(f => `${f.p}=${f.n}`).join('・')}`).toBe(1);
  });

  it('不可視文字（SOFT HYPHEN・ゼロ幅）が本文に混入していない（2026-07-13 レビュー指摘 I の再発防止）', () => {
    const banned = /[\u00AD\u200B\u200C\u200D\u2060\uFEFF]/;
    const designDocs = readdirSync(new URL('design/', root), { recursive: true })
      .map(f => `design/${f}`).filter(p => p.endsWith('.md'));
    const stale: string[] = [];
    for (const p of [...CURRENT_DOCS, ...designDocs, 'llms.txt']) {
      for (const [i, line] of read(p).split('\n').entries()) {
        if (banned.test(line)) stale.push(`${p}:${i + 1}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('Markdown の相対リンクが実在のファイル/ディレクトリに解決される（2026-07-13 再レビュー提案の常設化）', () => {
    const designDocs = readdirSync(new URL('design/', root), { recursive: true })
      .map(f => `design/${f}`).filter(p => p.endsWith('.md'));
    const all = [...new Set([...CURRENT_DOCS, ...designDocs])];
    const broken: string[] = [];
    for (const p of all) {
      const base = new URL(p, root);
      let inFence = false;
      for (const [i, line] of read(p).split('\n').entries()) {
        if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
        if (inFence) continue;   // コード例内の ](…) は対象外
        for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) {
          const raw = m[1];
          if (/^(https?:|mailto:|#)/.test(raw)) continue;
          const target = raw.split('#')[0];
          if (!target) continue;
          if (!existsSync(new URL(target, base))) broken.push(`${p}:${i + 1}: ${raw}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('綻び番号のレンジ主張（F1〜FNN）が綻びログの実態と一致する（2026-07-13 再レビュー提案の常設化）', () => {
    const findings = read('design/40-examples/90-findings.md');
    const maxF = Math.max(...[...findings.matchAll(/\bF(\d+)\b/g)].map(m => Number(m[1])));
    const targets = [...CURRENT_DOCS, 'design/40-examples/README.md',
      'design/40-examples/90-findings.md', 'design/INDEX.md', 'design/00-overview.md'];
    const stale: string[] = [];
    for (const p of targets) {
      for (const m of read(p).matchAll(/F1〜F(\d+)/g)) {
        if (Number(m[1]) !== maxF) stale.push(`${p}: F1〜F${m[1]}（実態は F${maxF} まで）`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('英語版ミラーの対訳元ハッシュが日本語正本と一致する（翻訳ドリフトの検出）', () => {
    // en/spec/X.md の front matter `source_sha:` ＝対訳元 spec/X.md の sha256 先頭 12 桁。
    // 日本語側が更新されたらここが割れる——英訳の追従漏れを黙らせない。
    const stale: string[] = [];
    for (const p of [...mdFiles('en/spec/'), ...mdFiles('en/reference/'), ...mdFiles('en/stdlib/')]) {
      const m = /^---\n[\s\S]*?source_sha: ([0-9a-f]{12})[\s\S]*?\n---\n/.exec(read(p));
      if (!m) continue;   // ハッシュ宣言のないページ（README 等）は対象外
      const ja = p.replace('en/', '');
      const actual = createHash('sha256').update(read(ja)).digest('hex').slice(0, 12);
      if (actual !== m[1]) stale.push(`${p}: source_sha ${m[1]} だが ${ja} は ${actual}（日本語側が更新済み——英訳を追従させ source_sha を更新する）`);
    }
    expect(stale).toEqual([]);
  });

  it('英語版ミラーの kairos フェンスが日本語正本とコード同一（コメント行以外・2026-07-24 第 3 回レビュー指摘 J の再発防止）', () => {
    // doctest が実行するのは日本語側だけ（doctest.test.ts の走査対象）。英語側の「実行検証済み」主張は
    // 「en のブロック ≡ ja のブロック」の同一性で担保する——en 側だけの編集・再同期ミスを黙らせない。
    // コメントは翻訳可（全行コメントは除外・行末コメントは切除）。`# eval:`・`# resolve:`（external の
    // 解決子固定材＝doctest がパースする）・`#=>`・`#~>` は規範なので一致必須。
    const normalize = (block: string) => block.split('\n').map(line => {
      if (/^\s*#\s*(?:eval|resolve):|^\s*#=>|^\s*#~>/.test(line)) return line;
      if (/^\s*#/.test(line)) return null;
      return line.replace(/\s+#(?!=>|~>).*$/, '').trimEnd();
    }).filter(l => l !== null).join('\n');
    const fences = (src: string) => [...src.matchAll(/```kairos\n([\s\S]*?)```/g)].map(m => m[1]);
    const stale: string[] = [];
    for (const p of [...mdFiles('en/spec/'), ...mdFiles('en/reference/'), ...mdFiles('en/stdlib/')]) {
      const en = fences(read(p));
      const ja = fences(read(p.replace('en/', '')));
      if (en.length !== ja.length) { stale.push(`${p}: kairos フェンス数 ${en.length} ≠ 日本語側 ${ja.length}`); continue; }
      en.forEach((b, i) => {
        if (normalize(b) !== normalize(ja[i])) stale.push(`${p}: フェンス ${i + 1} が日本語側とコード不一致`);
      });
    }
    expect(stale).toEqual([]);
  });

  it('英語ミラーの固定訳語が統一されている（別訳の混入を割る・2026-07-24 第 3 回レビュー指摘 K の再発防止）', () => {
    // 日本語側の用語規律と同型。正: consumer-relative（利用側相対）・placeholder（仮称）・
    // Exhaustiveness verification（I5 網羅性検証——coverage は覆域の固定訳）・descriptor（記述語）・
    // first point（先頭点）・binding-name（束縛名）・interval-sequence（区間列）・## Related（関連）
    const banned: [RegExp, string][] = [
      [/user-side[- ]relative/i, 'consumer-relative が正'],
      [/provisional/i, 'placeholder が正'],
      [/coverage verification/i, 'Exhaustiveness verification が正'],
      [/description[- ]word/i, 'descriptor が正'],
      [/head point/i, 'first point が正'],
      [/bound-name/i, 'binding-name が正'],
      [/interval-list/i, 'interval-sequence が正'],
      [/^## See also/, '## Related が正'],
    ];
    const stale: string[] = [];
    for (const p of [...mdFiles('en/spec/'), ...mdFiles('en/reference/'), ...mdFiles('en/stdlib/'), 'README.md', 'llms.txt']) {
      for (const [i, line] of read(p).split('\n').entries()) {
        for (const [re, hint] of banned) {
          if (re.test(line)) stale.push(`${p}:${i + 1}: ${hint}: ${line.trim().slice(0, 60)}`);
        }
      }
    }
    expect(stale).toEqual([]);
  });

  it('公開ツリーの全 Markdown がルート README からリンクで到達できる——孤立ページなし（2026-07-13・INDEX→ADR/40-examples の同型欠陥の再発防止）', () => {
    // 対象＝公開ツリーの md 全部。非公開の作業層は同期スクリプトの除外リスト（PRIVATE_PATHS）を
    // 実行時に読んで差し引く——公開スナップショットではスクリプトも除外対象も存在しないため空で同じ結果。
    // 辺＝相対リンク（コードフェンス外）・ディレクトリリンク→その index・Pages の言語トグル（ja→en 対応ページ）
    const privatePaths: string[] = [];
    if (existsSync(new URL('tools/publish.sh', root))) {
      const m = /PRIVATE_PATHS=\(([^)]*)\)/.exec(read('tools/publish.sh'));
      if (m) privatePaths.push(...m[1].split(/\s+/).filter(Boolean));
    }
    const isPrivate = (p: string) => privatePaths.some(x => p === x || p.startsWith(`${x}/`));
    const all = new Set<string>();
    const walk = (dir: string) => {
      for (const e of readdirSync(new URL(dir, root), { withFileTypes: true })) {
        const p = `${dir}${e.name}`;
        if (e.isDirectory()) {
          if (['.git', 'node_modules'].includes(e.name) || isPrivate(p)) continue;
          walk(`${p}/`);
        } else if (p.endsWith('.md') && !isPrivate(p)) all.add(p);
      }
    };
    walk('');
    const normalize = (base: string, target: string): string => {
      const out: string[] = [];
      for (const seg of `${base.split('/').slice(0, -1).join('/')}/${target}`.split('/')) {
        if (seg === '' || seg === '.') continue;
        if (seg === '..') out.pop(); else out.push(seg);
      }
      return out.join('/');
    };
    const linksOf = (p: string): string[] => {
      const out: string[] = [];
      let inFence = false;
      for (const line of read(p).split('\n')) {
        if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
        if (inFence) continue;
        for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) {
          if (/^(https?:|mailto:|#)/.test(m[1])) continue;
          const t = m[1].split('#')[0];
          if (!t) continue;
          const r = normalize(p, t);
          if (all.has(r)) out.push(r);
          else for (const idx of ['README.md', 'INDEX.md']) if (all.has(`${r}/${idx}`)) out.push(`${r}/${idx}`);
        }
      }
      return out;
    };
    const seen = new Set<string>();
    const queue = ['README.md'];
    while (queue.length) {
      const p = queue.pop()!;
      if (seen.has(p) || !all.has(p)) continue;
      seen.add(p);
      queue.push(...linksOf(p));
      if (all.has(`en/${p}`)) queue.push(`en/${p}`);   // Pages の言語トグル
    }
    const orphan = [...all].filter(p => !seen.has(p)).sort();
    expect(orphan).toEqual([]);
  });

  it('stdlib の .kairos と解説 .md の §1 完全定義が乖離していない（label: の有無）', () => {
    // 完全一致比較は書式差で壊れるため、乖離しやすい要点（year/month の label: 付与）だけ照合
    const greg = read('impl/stdlib/gregorian.kairos');
    const gregDoc = read('stdlib/gregorian.md');
    for (const w of ['year', 'month']) {
      const inKairos = new RegExp(`${w}\\s*=[^\\n]*label:`).test(greg);
      const inDoc = new RegExp(`${w}\\s*=[^\\n]*label:`).test(gregDoc);
      expect(inKairos, `${w} の label: が gregorian.kairos に無い`).toBe(true);
      expect(inDoc, `${w} の label: が stdlib/gregorian.md §1 に無い`).toBe(true);
    }
    const fiscal = read('impl/stdlib/fiscal.kairos');
    const fiscalDoc = read('stdlib/fiscal.md');
    expect(/year\s*=[^\n]*label:/.test(fiscal), 'Fiscal.year の label: が fiscal.kairos に無い').toBe(true);
    expect(/year\s*=[^\n]*label:/.test(fiscalDoc), 'Fiscal.year の label: が stdlib/fiscal.md に無い').toBe(true);
  });
});
