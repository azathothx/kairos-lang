#!/usr/bin/env node
// Windows 実行ファイルの Authenticode 署名を剥がす（依存ゼロ・2026-10-15 新設）。
// 用途: tools/build-sea.mjs --win が node.exe に SEA blob を注入すると、元の署名は無効（「signature seems corrupted」）になる。
// 壊れた署名を残したまま配るより、素直な未署名に揃える（Windows 配布の第 1 段＝署名なし）。osslsigncode remove-signature と同じ結果を狙う。
// 順序＝**注入の前に node.exe から剥がす**（nodejs.org の node.exe は証明書表がファイル末尾にあるので切り詰めるだけ）。注入後の exe は
// postject が証明書表の後ろに節を足すため末尾にならず、本スクリプトは扱わない（検査して止まる）。
// やること: PE ヘッダの Security ディレクトリ（証明書表の位置と長さ）を読み、表がファイル末尾にあることを確かめてから
//           ディレクトリを 0 にし、表の手前で切り詰める。CheckSum は 0 にする（ユーザーモードの exe では検証されない）。
// 使い方: node tools/strip-authenticode.mjs <in.exe> <out.exe>
import { readFileSync, writeFileSync } from 'node:fs';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) { console.error('使い方: node tools/strip-authenticode.mjs <in.exe> <out.exe>'); process.exit(1); }
const buf = Buffer.from(readFileSync(inPath));
const fail = m => { console.error('strip-authenticode: ' + m); process.exit(1); };
if (buf.readUInt16LE(0) !== 0x5a4d) fail('MZ ヘッダがない');
const pe = buf.readUInt32LE(0x3c);
if (buf.readUInt32LE(pe) !== 0x00004550) fail('PE 署名がない');
const opt = pe + 24;                                  // COFF ヘッダ 20 バイトの後が Optional Header
const magic = buf.readUInt16LE(opt);
const isPlus = magic === 0x20b;                        // PE32+（x64）
if (!isPlus && magic !== 0x10b) fail(`Optional Header の magic が不明: 0x${magic.toString(16)}`);
const dataDir = opt + (isPlus ? 112 : 96);             // DataDirectory の先頭
const sec = dataDir + 4 * 8;                           // IMAGE_DIRECTORY_ENTRY_SECURITY＝4 番目
const certOff = buf.readUInt32LE(sec), certLen = buf.readUInt32LE(sec + 4);
if (certOff === 0 && certLen === 0) { console.log('署名なし（変更なし）'); writeFileSync(outPath, buf); process.exit(0); }
if (certOff + certLen !== buf.length) fail(`証明書表がファイル末尾にない（offset ${certOff} + len ${certLen} ≠ size ${buf.length}）＝注入後の exe。注入の前に node.exe から剥がす`);
buf.writeUInt32LE(0, sec); buf.writeUInt32LE(0, sec + 4);
buf.writeUInt32LE(0, opt + 64);                        // CheckSum
writeFileSync(outPath, buf.subarray(0, certOff));
console.log(`剥がした: 証明書表 ${certLen} バイト（offset ${certOff}）→ ${outPath}（${(certOff / 1048576).toFixed(1)} MB）`);
