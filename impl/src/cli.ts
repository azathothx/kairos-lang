// Kairos CLI（プロトタイプ）
// 使い方: node src/cli.ts <file.kairos> --from YYYY-MM-DD --to YYYY-MM-DD [--tz Asia/Tokyo]
import { readFileSync } from 'node:fs';
import { run, formatAnnotation } from './index.ts';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const opt = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

if (!file) {
  console.error('使い方: node src/cli.ts <file.kairos> --from YYYY-MM-DD --to YYYY-MM-DD [--tz Asia/Tokyo]');
  process.exit(1);
}

try {
  const r = run(readFileSync(file, 'utf8'), {
    from: opt('from', '2026-01-01')!,
    to: opt('to', '2027-01-01')!,
    tz: opt('tz'),
  });
  r.results.forEach((res, i) => {
    if (r.results.length > 1) console.log(`# 式 ${i + 1}（${res.dates.length} 件）`);
    for (const d of res.dates) console.log(d);
    // 区間註釈（ADR-37 判断 5/7 (a)）: 結果の後に表示——対処は呼び手の責務（判定は外部）
    for (const a of res.annotations) console.log(`# ⚠ ${formatAnnotation(a)}`);
  });
  // 被覆サマリ（ADR-37 判断 7 (b)）: クリップしない・完結主張も常時表示
  if (r.coverage.length > 0) {
    console.log('# 被覆サマリ');
    for (const c of r.coverage) {
      console.log(`#   ${c.source} covering ${c.covering}${c.asof ? ` asof ${c.asof}` : ''}`
        + `${c.concluded ? '（完結主張）' : ''}`
        + ` 残走路 ${c.runwayDays === null ? '∞' : `${c.runwayDays} 日`}`);
    }
  }
  for (const w of r.warnings) console.error(`警告: ${w}`);
} catch (e) {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}
