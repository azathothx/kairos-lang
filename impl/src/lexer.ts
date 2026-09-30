// Kairos 字句解析器（spec §5.5・ADR-28）
// 日付リテラル（TZ 指定子なし）・幅リテラル（市民時 d / 経過時間 h m s、混合は静的エラー）・
// Unicode 識別子（漢字ラベル可）・行コメント #。

export type TokKind =
  | 'name'      // 識別子・列挙ラベル・語演算子（and or not mod div in premise with）
  | 'number'
  | 'date'      // { y, mo, d, h?, mi?, s? }
  | 'time'      // 単独時刻リテラル Thh:mm(:ss(.f+)?)?（tod＝日内 ms。ADR-51）
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
  tod?: number;   // 単独時刻リテラルの日内ミリ秒（ADR-51）
}

/** エラー文言の長さ上限。利用者の値（tz 名・供給値・識別子・文字列）を文言に写す箇所が多く、1 MB の値がそのまま
 *  1 MB の診断になっていた（境界チェックリスト二巡目 l09・三巡目 s95/u32）。診断の本文はこの長さを越えない */
export const MAX_MESSAGE = 2000;
export const clipMessage = (msg: string): string =>
  msg.length > MAX_MESSAGE ? `${msg.slice(0, MAX_MESSAGE)}…（以下略・全 ${msg.length} 字）` : msg;

export class LexError extends Error {
  line: number;
  col: number;
  constructor(msg: string, line: number, col: number) {
    super(clipMessage(`字句エラー(${line}:${col}): ${msg}`));
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

/** 秒の小数部（字面の桁列）を整数 ms へ。参照実装の分解能は 1 ms——4 桁目以降に 0 以外があれば null
 *  （黙って丸めない。末尾の 0 は可。境界チェックリスト三巡目 2026-09-30・F139） */
const fracMs = (digits: string | undefined): number | null => {
  if (digits === undefined) return 0;
  if (/[1-9]/.test(digits.slice(3))) return null;
  return +digits.slice(0, 3).padEnd(3, '0');
};

export function lex(src: string): Token[] {
  // 先頭の BOM（U+FEFF）は読み飛ばす——Windows のメモ帳が付ける。旧: 字句エラー「不明な文字」（境界チェックリスト 2026-09-29・F119）
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
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

    // 年 5 桁以上は先頭 4 桁が日付と読まれて別のエラーへ誤誘導していた（境界チェックリスト 2026-09-29・F121）
    if (isDigit(c) && /^\d{5,}-\d{2}-\d{2}/.test(src.slice(i, i + 20))) {
      err(`年は 4 桁（0000..9999）: ${/^\d+-\d{2}-\d{2}/.exec(src.slice(i, i + 20))![0]}（5 桁以上の年は表現しない）`);
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
      const dms = fracMs(m[7]);
      if (dms === null) err(`秒の小数は 3 桁まで: ${m[0]}（参照実装の分解能は 1 ms——ms 未満の桁は黙って丸めない）`);
      const date: DateVal = {
        y: +m[1], mo: +m[2], d: +m[3],
        h: m[4] ? +m[4] : 0, mi: m[5] ? +m[5] : 0,
        s: m[6] ? +m[6] + dms! / 1000 : 0,
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
        let civil = 0, elapsed = 0, hasCivil = false, hasElapsed = false, subMs = false;
        for (const seg of text.matchAll(/(\d+)(?:\.(\d+))?([dhms])/g)) {
          if (seg[3] === 'd') { hasCivil = true; civil += +`${seg[1]}.${seg[2] ?? '0'}`; }
          else {
            hasElapsed = true;
            // 経過時間は十進の字面から整数 ms を厳密に出す（35.244 * 1000 級の浮動小数の塵・ms 未満の桁の黙った丸めを作らない。F139）
            const unit = BigInt(seg[3] === 'h' ? 3600_000 : seg[3] === 'm' ? 60_000 : 1000);
            const num = BigInt(seg[1] + (seg[2] ?? '')) * unit, den = 10n ** BigInt((seg[2] ?? '').length);
            if (num % den !== 0n) subMs = true;
            elapsed += Number(num / den);
          }
        }
        if (hasCivil && hasElapsed) err(`市民時と経過時間の幅は混合できない: ${text}（ADR-28）`);
        // 市民日の幅は整数——1.5d は黙って「3 日ごと」に、0.5d は「1 日ごと」になっていた（添字が非整数で点が欠落。
        // 境界チェックリスト三巡目 2026-09-30・F138）。市民日は 23〜25 時間の規約幅で、その分数は定義しない
        if (hasCivil && !Number.isInteger(civil)) {
          err(`市民日の幅は整数: ${text}（市民日は 23〜25 時間の規約幅で分数は定義しない——半日は 12h のように経過時間で書く。ADR-28）`);
        }
        if (subMs) err(`幅は 1 ms の整数倍: ${text}（参照実装の分解能は 1 ms——ms 未満の桁は黙って丸めない）`);
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

    // 単独時刻リテラル: Thh:mm(:ss(.f+)?)?（ADR-51——日付部を持たない壁時計時刻）。
    // T 接頭形限定: 裸 hh:mm は三値演算子の合法式（cond ? 10:30）と衝突するため採らない。
    // T\d\d: まで見えたらこの字句の領域（malformed は誘導つき字句エラー——黙って識別子に落とさない）
    if (c === 'T' && /^T\d{2}:/.test(src.slice(i, i + 4))) {
      const m = /^T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?/.exec(src.slice(i));
      if (!m) err('単独時刻リテラルの形は Thh:mm（例 T07:00・秒まで書くなら Thh:mm:ss。ADR-51）');
      if (+m![1] > 23 || +m![2] > 59 || (m![3] !== undefined && +m![3] > 59)) {
        err(`時刻が範囲外: ${m![0]}（hh は 00..23・mm/ss は 00..59。うるう秒は表現しない＝ADR-33）`);
      }
      const tms = fracMs(m![4]);
      if (tms === null) err(`秒の小数は 3 桁まで: ${m![0]}（参照実装の分解能は 1 ms——ms 未満の桁は黙って丸めない）`);
      const tod = (+m![1] * 3600 + +m![2] * 60 + (m![3] ? +m![3] : 0)) * 1000 + tms!;
      toks.push({ kind: 'time', text: m![0], line, col, tod });
      i += m![0].length; col += m![0].length;
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
    // 見えない文字・紛らわしい文字は符号位置と直し方を添える——Web や文書からの貼り付けで混ざるノーブレークスペースは
    // `不明な文字: " "` としか出ず、何が悪いのか読めなかった（境界チェックリスト二巡目 l03・三巡目 Playground 経路）
    const cp = src.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const u = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
    const quote = cp >= 0x2018 && cp <= 0x201F;
    const hint = cp === 0x3000 ? '全角スペース——半角の空白に直す'
      : cp === 0x00A0 || cp === 0x202F || cp === 0x2007 ? 'ノーブレークスペース——通常の空白に直す。Web や文書からの貼り付けで混ざる'
      : cp === 0x200B || cp === 0x200C || cp === 0x200D || cp === 0x2060 || cp === 0xFEFF ? 'ゼロ幅の文字——削除する'
      : quote ? '引用符は半角の " を使う。文書ソフトの自動変換で混ざる'
      : cp < 0x20 || (cp >= 0x7F && cp < 0xA0) ? '制御文字——削除する'
      : '';
    // 見えない文字は符号位置だけ・見える文字は字面に符号位置を添える（ASCII は字面のみ＝従来どおり）
    const shown = hint && !quote ? u : `${JSON.stringify(ch)}${cp > 0x7E ? `（${u}）` : ''}`;
    err(`不明な文字: ${shown}${hint ? `（${hint}）` : ''}`);
  }
  toks.push({ kind: 'eof', text: '', line, col });
  return toks;
}
