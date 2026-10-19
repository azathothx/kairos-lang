#!/usr/bin/env node
// SEA（Node Single Executable Application）ビルド試作: CLI を単一実行ファイルへ。
// 手順（設計素描どおり）: esbuild で impl/src/cli.ts を単一 CJS へ束ね → Node 依存の
// readFileSync 2 箇所（stdlib・package.json）をビルド時リテラルへ差し替え →
// sea-config → postject 注入。差し替えは build-playground.mjs と同じ規律——
// パターンが合わなくなったら本スクリプトが失敗する（impl 側の変更に黙って追従しない）。
// 検証まで一体: 生成した実行ファイルを実走し、参照実装（node src/cli.ts）と出力バイト一致を照合。
// 使い方: node impl/scripts/build-sea.mjs [--win <node.exeのパス>]
//   （どこから呼んでもよい。出力はリポジトリルートの dist/kairos。--win は dist/kairos.exe——Windows 用 node.exe を
//    渡すとそれを台に注入する。exe の署名は注入で無効になる＝配布時は注入の前に strip-authenticode.mjs で剥がす）
//   実走検証は台を実行できる環境（Linux 台は Linux・Windows 台は Windows＝公開 workflow の windows-latest）で行い、
//   それ以外（Linux から --win）は注入までで止まる。2026-10-17 に tools/ から impl/scripts/ へ移動（公開リポジトリの
//   workflow から呼ぶため。tools/ は公開ツリーに同期されない）。
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, statSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const IMPL = dirname(dirname(fileURLToPath(import.meta.url)));   // impl/scripts/ の親
const ROOT = dirname(IMPL);
const DIST = join(ROOT, 'dist');
mkdirSync(DIST, { recursive: true });

const require = createRequire(join(IMPL, 'package.json'));
const esbuild = require('esbuild');
const { inject } = require('postject');

// SEA の blob 注入に使う番兵（Node 公式ドキュメントの定数）
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

// ---- 1. esbuild で単一 CJS へ束ねる（エントリは main() を呼ぶスタブ） ----
const bundle = await esbuild.build({
  stdin: {
    contents: "import { main } from './src/cli.ts';\nprocess.exitCode = main(process.argv.slice(2));\n", // exit() は stdout の未送出分を捨てる（F113）
    resolveDir: IMPL,
    sourcefile: 'sea-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  write: false,
  // cjs 化で残る import.meta.url を潰す（cli.ts の isMain ガードは偽に落ち、二重実行しない）
  define: { 'import.meta.url': 'undefined' },
});
let js = bundle.outputFiles[0].text;

// ---- 2. Node 依存のビルド時差し替え（失敗＝パターン不一致は即エラー） ----
const patch = (name, re, replacement) => {
  const before = js;
  js = js.replace(re, replacement);
  if (js === before) {
    throw new Error(`${name} の差し替えパターンが一致しない——impl 側の変更に追従が必要`);
  }
};
// (a) index.ts の stdlib 読み込み → ソース文字列のインライン（build-playground と同じ内容）
const STDLIB_FILES = ['gregorian.kairos', 'fiscal.kairos', 'isoweek.kairos'];
const stdlibSource = STDLIB_FILES
  .map(f => readFileSync(join(IMPL, 'stdlib', f), 'utf8'))
  .join('\n');
patch('stdlib', /(?:const|var) stdlibSource = STDLIB_FILES[\s\S]*?join\(["']\\n["']\);/,
  `var stdlibSource = ${JSON.stringify(stdlibSource)};`);
// (b) cli.ts の VERSION（package.json 読み） → リテラル
const version = JSON.parse(readFileSync(join(IMPL, 'package.json'), 'utf8')).version;
patch('VERSION', /(?:const|var) VERSION = JSON\.parse\([\s\S]*?\.version;/,
  `var VERSION = ${JSON.stringify(version)};`);
// (c) 残る readFileSync は利用者ファイル読みの 1 箇所だけ（cli.ts の readInput——.kairos と --supply が共用。1.0.5 の F142 で
//     2 箇所から 1 箇所へ。増えたら新しい Node 依存の混入）
const remaining = [...js.matchAll(/\breadFileSync\b/g)].length;   // esbuild は (0, ns.readFileSync)(…) 形
if (remaining !== 1) {
  throw new Error(`readFileSync が ${remaining} 箇所残っている（期待 1＝readInput の利用者ファイル読みのみ）`);
}
const bundlePath = join(DIST, 'kairos-sea.cjs');
writeFileSync(bundlePath, js);

// ---- 3. sea-config → blob 生成 ----
const blobPath = join(DIST, 'sea-prep.blob');
writeFileSync(join(DIST, 'sea-config.json'), JSON.stringify({
  main: bundlePath,
  output: blobPath,
  disableExperimentalSEAWarning: true,
  // コードキャッシュは実行系のプラットフォーム固定を招く（クロス注入と相性が悪い）ため使わない
  useCodeCache: false,
  useSnapshot: false,
}, null, 2) + '\n');
execFileSync(process.execPath, ['--experimental-sea-config', join(DIST, 'sea-config.json')],
  { cwd: ROOT, stdio: 'inherit' });
const blob = readFileSync(blobPath);

// ---- 4. postject 注入（台＝実行中の node、--win なら渡された node.exe） ----
const winBase = process.argv.includes('--win')
  ? process.argv[process.argv.indexOf('--win') + 1] : undefined;
const outPath = join(DIST, winBase ? 'kairos.exe' : 'kairos');
copyFileSync(winBase ?? process.execPath, outPath);
chmodSync(outPath, 0o755);
await inject(outPath, 'NODE_SEA_BLOB', blob, { sentinelFuse: SEA_FUSE });
const mb = (statSync(outPath).size / 1024 / 1024).toFixed(1);

// ---- 5. 実走検証: 参照実装と出力バイト一致（台を実行できる環境のみ。Linux から --win は注入まで） ----
const canRun = !winBase || process.platform === 'win32';
if (canRun) {
  const args = ['list', join(IMPL, 'examples', 'payday.kairos'),
    '--from', '2026-01-01', '--to', '2027-01-01'];
  const ref = execFileSync(process.execPath, [join(IMPL, 'src', 'cli.ts'), ...args],
    { encoding: 'utf8' });
  const sea = execFileSync(outPath, args, { encoding: 'utf8' });
  if (sea !== ref) {
    throw new Error('SEA 実行ファイルの出力が参照実装（node src/cli.ts）と一致しない');
  }
  const rep = JSON.parse(execFileSync(outPath,
    ['next', '--json', '--from', '2026-08-06', join(IMPL, 'examples', 'payday.kairos')],
    { encoding: 'utf8' }));
  if (rep.version !== version || rep.results[0].dates[0] !== '2026-08-25') {
    throw new Error('SEA 実行ファイルの next --json が期待と一致しない');
  }
  console.log(`検証 OK: list の出力バイト一致・next --json 一致（version ${version}）`);
} else {
  console.log('実走検証は省略（Windows 台を Linux からは実行できない）。配布前に Windows で実走すること');
}
console.log(`${outPath} を出力した（${mb} MB）`);
