// Kairos 字句解析器（spec §5.5・ADR-28）
// 日付リテラル（TZ 指定子なし）・幅リテラル（市民時 d / 経過時間 h m s、混合は静的エラー）・
// Unicode 識別子（漢字ラベル可）・行コメント #。

export type TokKind =
  | 'name'      // 識別子・列挙ラベル・語演算子（and or not mod div in premise with）
  | 'number'
  | 'date'      // { y, mo, d, h?, mi?, s? }
  | 'width'     // { civilDays } | { ms }
  | 'string'    // "…"（改行不可・エスケープなし。ADR-32）
  | 'punct'
  | 'newline'
  | 'eof';

export interface DateVal { y: number; mo: number; d: number; h: number; mi: number; s: number; hasTime: boolean }
export type WidthVal = { kind: 'civil'; days: number } | { kind: 'elapsed'; ms: number };

export interface Token {
  kind: TokKind;
  text: string;
  line: number;
  col: number;
  date?: DateVal;
  width?: WidthVal;
  num?: number;
}

export class LexError extends Error {
  line: number;
  col: number;
  constructor(msg: string, line: number, col: number) {
    super(`字句エラー(${line}:${col}): ${msg}`);
    this.line = line;
    this.col = col;
  }
}

// 複数文字パンクチュエータは長い順に照合
const PUNCTS = ['|>', '..', '==', '!=', '<=', '>=', '=>', '(', ')', '[', ']', '{', '}',
  ',', ':', '?', '@', '|', '&', '\\', '=', '<', '>', '+', '-', '*', '/', '.', '_', ';'];

const isLetter = (c: string) => /[\p{L}]/u.test(c);
const isDigit = (c: string) => c >= '0' && c <= '9';
const isNamePart = (c: string) => isLetter(c) || isDigit(c);

export function lex(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0, line = 1, col = 1;
  // 丸括弧・角括弧の深さ。内部では newline をトークン化しない（式の継続）。
  // 波括弧 {} 内は premise ブロック＝メンバー/束縛が行区切りなので newline を残す。
  let parenDepth = 0;

  const peek = (o = 0) => src[i + o] ?? '';
  const err = (msg: string): never => { throw new LexError(msg, line, col); };

  while (i < src.length) {
    const c = src[i];

    if (c === '#') { // 行コメント
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '\n') {
      if (parenDepth === 0) toks.push({ kind: 'newline', text: '\n', line, col });
      i++; line++; col = 1;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') { i++; col++; continue; }

    // 文字列リテラル（§5.5・ADR-32）: " から次の " まで。改行不可・エスケープなし
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"' && src[j] !== '\n') j++;
      if (src[j] !== '"') err('文字列リテラルが閉じていない（改行は含められない。ADR-32）');
      toks.push({ kind: 'string', text: src.slice(i + 1, j), line, col });
      col += j - i + 1; i = j + 1;
      continue;
    }

    // 日付リテラル: YYYY-MM-DD(Thh:mm(:ss(.f+)?)?)?
    if (isDigit(c) && /^\d{4}-\d{2}-\d{2}/.test(src.slice(i, i + 10))) {
      const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?/.exec(src.slice(i))!;
      const hasTime = m[4] !== undefined;
      // 時刻部の妥当性: hh 00..23・mm 00..59・ss 00..59。23:59:60 は字句エラー——
      // chronos はうるう秒を持たない一様な理想化軸（UTC の各日＝86,400 秒。ADR-33）
      if (hasTime && (+m[4] > 23 || +m[5] > 59 || (m[6] !== undefined && +m[6] > 59))) {
        err(`時刻が範囲外: ${m[0]}（hh は 00..23・mm/ss は 00..59。うるう秒は表現しない＝ADR-33）`);
      }
      // 日付部の妥当性（F66 (a)・ADR-43）: proleptic Gregorian 固定——月 01..12・日は月と閏年規則の
      // 実在日のみ。2026-02-30 は 2026-03-02 への黙ったロールオーバーではなく字句エラー（時刻部と同じ層）
      {
        const y = +m[1], mo = +m[2], d = +m[3];
        const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
        const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (mo < 1 || mo > 12 || d < 1 || d > dim[mo - 1]) {
          err(`実在しない日付: ${m[0].slice(0, 10)}`
            + '（月は 01..12・日は月と閏年規則の実在日のみ——proleptic Gregorian 固定。F66/ADR-43）');
        }
      }
      const date: DateVal = {
        y: +m[1], mo: +m[2], d: +m[3],
        h: m[4] ? +m[4] : 0, mi: m[5] ? +m[5] : 0,
        s: m[6] ? +m[6] + (m[7] ? +`0.${m[7]}` : 0) : 0,
        hasTime,
      };
      toks.push({ kind: 'date', text: m[0], line, col, date });
      i += m[0].length; col += m[0].length;
      continue;
    }

    // 幅リテラル: 数値+単位の並び（1d / 24h39m35.244s）。d と h/m/s の混合は静的エラー（ADR-28）。
    if (isDigit(c)) {
      const w = /^(?:\d+(?:\.\d+)?[dhms])+/.exec(src.slice(i));
      if (w && !/^\d+(?:\.\d+)?(?:[eE]|$|[^dhms\d.])/.test(src.slice(i))) {
        const text = w[0];
        let civil = 0, elapsed = 0, hasCivil = false, hasElapsed = false;
        for (const seg of text.matchAll(/(\d+(?:\.\d+)?)([dhms])/g)) {
          const n = +seg[1];
          if (seg[2] === 'd') { hasCivil = true; civil += n; }
          else {
            hasElapsed = true;
            elapsed += n * (seg[2] === 'h' ? 3600_000 : seg[2] === 'm' ? 60_000 : 1000);
          }
        }
        if (hasCivil && hasElapsed) err(`市民時と経過時間の幅は混合できない: ${text}（ADR-28）`);
        const width: WidthVal = hasCivil ? { kind: 'civil', days: civil } : { kind: 'elapsed', ms: elapsed };
        toks.push({ kind: 'width', text, line, col, width });
        i += text.length; col += text.length;
        continue;
      }
      // 数値
      const n = /^\d+(?:\.\d+)?/.exec(src.slice(i))!;
      toks.push({ kind: 'number', text: n[0], line, col, num: +n[0] });
      i += n[0].length; col += n[0].length;
      continue;
    }

    // 識別子（Unicode 文字可）。member-key の calendar-system はハイフンを特例で許す。
    if (isLetter(c)) {
      let j = i;
      while (j < src.length && isNamePart(src[j])) j++;
      let text = src.slice(i, j);
      if (text === 'calendar' && src.slice(j, j + 7) === '-system') { text = 'calendar-system'; j += 7; }
      toks.push({ kind: 'name', text, line, col });
      col += j - i; i = j;
      continue;
    }

    // パンクチュエータ
    const p = PUNCTS.find(p => src.startsWith(p, i));
    if (p) {
      if (p === '(' || p === '[') parenDepth++;
      if (p === ')' || p === ']') parenDepth = Math.max(0, parenDepth - 1);
      toks.push({ kind: 'punct', text: p, line, col });
      i += p.length; col += p.length;
      continue;
    }
    if (c === '¥' || c === '¥') err('円記号 ¥（U+00A5）は差演算子ではない。バックスラッシュ U+005C を使う（§4.5）');
    err(`不明な文字: ${JSON.stringify(c)}`);
  }
  toks.push({ kind: 'eof', text: '', line, col });
  return toks;
}
