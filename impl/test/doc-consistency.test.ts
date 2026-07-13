// 文書の整合性検査（機械化できる範囲の陳腐化を npm test で捕まえる）
// 発端: spec/00-intro の「ADR-01〜36」が 8 本分陳腐化していた（2026-07-11・ユーザー指摘）。
// doctest（例の実行検証）と同じ発想で、「現在形の文書」の機械検査可能な主張を実態と照合する。
// 対象は現在形の文書のみ——design/ の ADR・綻びログ・INDEX 現在地は歴史記録なので対象外。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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
  ...mdFiles('en/spec/'), // 英語版ミラー（日本語が正・順次拡充）
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
        if (/\bopens\b|\bcloses\b/.test(line) && !/旧仮称|改名/.test(line)) stale.push(`${p}:${i + 1}: ${line.trim().slice(0, 60)}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('仮称印は shiftBoundary（唯一の残存仮称）の行にしか付かない', () => {
    // 「（仮称）」を記法として説明する行（凡例・運用説明）は対象外
    const legend = /「（仮称）」|仮称印|と記す/;
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
