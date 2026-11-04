// AI 補助ベンチ v4（前提の揺れ）の共通部: 前文・評価・採点。check.mjs（LLM なし）と run.mjs（LLM あり）が使う。
// 先に impl/ で `npm ci && npm run build`（参照実装 impl/dist を作る）。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..', '..');
export const TOPICS = ['tz', 'week', 'roll', 'holidays', 'fiscal', 'anchor', 'counting', 'asof', 'boundary'];

const impl = await import(join(ROOT, 'impl/dist/index.js'));
export const { run, KairosError } = impl;

// 標準の前文（参照実装のテストと同じ: 日本の営業日・Asia/Tokyo・2026 年の祝日表）
export function readPrelude() {
  const src = readFileSync(join(ROOT, 'impl/test/helpers.ts'), 'utf8');
  const hol = /HOLIDAYS_2026\s*=\s*\[([^\]]*)\]/.exec(src);
  const pre = /export const PRELUDE = `([\s\S]*?)`;/.exec(src);
  if (!hol || !pre) throw new Error('impl/test/helpers.ts から PRELUDE を読めない');
  return pre[1].replace('${HOLIDAYS_2026.join(\', \')}', hol[1].match(/\d{4}-\d{2}-\d{2}/g).join(', '));
}
export const PRELUDE = readPrelude();

export const readJsonl = p => readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));

export const sanitize = body => {
  const t = (body || '').trim();
  if (!t) throw new KairosError('本体が空です。本体式を返してください');
  if (/^\s*premise\b/m.test(t) || /@JP\b/.test(t)) throw new KairosError('premise や @JP を含めないでください。前文は用意されています——本体だけを返すこと');
  return t;
};
// 本体を前文に接いで評価し、範囲 from..to（半開）に出る点列を返す
export const evaluate = (body, p) => {
  const r = run(PRELUDE + sanitize(body) + '\n', { from: p.from, to: p.to });
  if (r.results.length === 0) throw new KairosError('本体式がない');
  return r.results[r.results.length - 1].dates;
};
export const interpretationsOf = p => (p.interpretations && p.interpretations.length) ? p.interpretations : [{ key: 'expected', expected: p.expected }];

// 採点（README「採点規則」）。got が null＝検証を通らなかった
export const judgePremise = (p, got, assumptions) => {
  const topics = [...new Set((assumptions || []).map(a => a.topic))];
  const alts = (p.ambiguity || []).map(e => e.split('|'));
  const declared = alts.every(c => c.some(t => topics.includes(t)));
  const joined = got === null ? null : got.join();
  const matched = joined === null ? null : (interpretationsOf(p).find(x => x.expected.join() === joined)?.key ?? null);
  const overDeclared = topics.filter(t => !alts.some(c => c.includes(t))).length;
  const control = alts.length === 0;
  const pass = declared && matched !== null;
  const letter = got === null ? 'i' : pass ? '.' : matched !== null ? 'S' : declared ? 'W' : 'X';
  return { topics, declared, matched, overDeclared, control, pass, letter };
};

// system prompt に入れる「前提の宣言」の節（逐語。README にも同じ文を載せている）
export const ASSUME_SECTION = `# 前提の宣言（assumptions）
依頼文に書かれていない前提を補って解いたときは、補った前提を assumptions に 1 件ずつ書く
（topic は次の 9 種から選び、statement は「何をどう読んだか」の日本語 1 文）。
依頼文だけで決まる要件は空配列にする。補っていない前提を書かない。
- tz: 時刻がどの時間帯か（相手先・UTC・夏時間）
- week: 週の数え方（第 n 週か第 n 曜日か・週の始まり）
- roll: 休日や存在しない日に当たった点をどう送るか（前・後・そのまま・飛ばす）
- holidays: 休みの定義（土日だけか祝日も・会社の休業・連休の長さ）
- fiscal: 年度・半期・四半期の起点（暦年か 4 月か）
- anchor: 周期の位相の起点（隔週・N 日ごとの最初の日）
- counting: 含む／含まない・数え方（N 日前は暦日か営業日か・端を 1 日目と数えるか・「N 日おき」の間隔）
- asof: 基準日（「今月」「来月から」が規則か一回きりか・いつから）
- boundary: 日の境（0 時・24 時はどちらの日か）
前文の時間帯（Asia/Tokyo）と違う時間帯の時刻が書かれていたら、tz を宣言する。
日本時間に換算して書くなら、相手先に夏時間があるときは切り替え日の前後で時刻を分けて書く（at(Thh:mm) 1 本では 1 年の約半分で 1 時間ずれる）。
前文の時間帯の時刻と読んで解く場合も、そう読んだことを tz に書く。
`;

export const systemPrompt = material => `あなたは Kairos（スケジュール定義言語）の書き手です。利用者の要件（自然文）を Kairos の本体に写してください。

# 前文はすでに用意されている（あなたは書かない）
次の前文の後ろに、あなたの本体が接がれて評価されます。premise ブロックや @JP は書かず、本体だけを返すこと。

${PRELUDE.trim()}

本体から使える束縛: holidays2026（2026 年の祝日の表）・satSun（土日）・bizDay（営業日＝土日と祝日を除く日。標準の導出）。標準の語彙（everyDay・month・quarter・year・monthStart・monthEnd・weekday・dayNo・monthNo・yearNo など）も使えます。

# 返すもの（JSON）
- body: 本体。束縛 0 個以上（各 1 行・名前 = 式）と、最後の 1 行の本体式。本体式は 1 本だけ。
- explanation: その本体が何をするかの日本語 1〜2 文と、最初に出る 3 点の見込み（YYYY-MM-DD）。
- assumptions: 補った前提（次の節）。
${ASSUME_SECTION}
# 規則
- 時刻の指定が無い要件は終日の点（at を付けない）。時刻の指定があれば at(Thh:mm)。
- 要件が曖昧でも最も普通の業務解釈で 1 案を返す（質問はしない）。補った前提は assumptions に書く（explanation に重ねて書いてもよい）。
- 検証エラーが返されたら、エラーメッセージを読んで本体だけを直し、同じ JSON 形式で返す。
${material ? `\n# 参考資料（記述スキル）\n\n${material}` : ''}`;
