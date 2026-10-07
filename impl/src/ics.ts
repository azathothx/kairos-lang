// Kairos .ics（iCalendar・RFC 5545）書き出し——評価結果を VEVENT 列へ展開する「出力形式」。言語は不変（1.0 追補 24・
// エコシステム構想 C・設計者裁定 2026-10-06「1 と 2 は 1.0.7 で」）。CLI の --ics と Playground の「カレンダーに入れる」が共有する。
// 決め（impl/README の CLI 節に同じ内容）:
//  - 1 点＝1 VEVENT。日粒度の点（ラベルが YYYY-MM-DD）は終日（DTSTART;VALUE=DATE）。時刻付きの点は UTC の瞬間（DTSTART:…Z）
//    ＝points（epoch ms）そのもの。壁時計の表示はカレンダー側が自分の tz で行う（JST の 06:30 は JST の端末で 06:30 と出る）。
//    秒未満は切り捨て（iCalendar に ms は無い。UID は ms を含むので点の同一性は保つ）。
//  - RRULE は書かない——展開点列のみ。RRULE に書けない部分が Kairos の存在理由で、規則の近似を出さない。
//  - 時刻付きの点には VALARM（TRIGGER:PT0M＝その時刻に表示通知）を添える＝目覚まし・リマインダーの器。終日の点には添えない。
//    時刻付きの点は DTEND＝DTSTART（0 分。RFC 5545 では DTEND 無し＝0 分だが Google カレンダーは 1 時間と見なす＝設計者の取り込み実測
//    2026-10-06）。予定は TRANSP:TRANSPARENT（空き時間を塞がない＝目覚まし・ごみの日・給料日はどれも「予定あり」ではない）。
//  - series（任意）: 1 式 1 VEVENT＋RDATE＝カレンダーでは 1 つの繰り返し予定に見える（設計者「繰り返すパターンの方が一般うけは良い」）。
//    展開点列のままで規則は書かない。再生成の取り込みで予定が丸ごと置き換わる（UID は式ごと）。RDATE を読まないアプリ（Outlook 系）では
//    初回の 1 回だけになる＝黙って落ちるので既定にしない（CLI --ics-series・Playground のチェック）。
//  - 区間註釈（範囲外）は終日の VEVENT（半開 [from, to) を DTSTART/DTEND に・TRANSP:TRANSPARENT＝予定を塞がない）として載せる
//    ＝表の外は黙らない（ADR-37 判断 5）。「表を更新して再生成する」の一文を DESCRIPTION に。
//  - 決定性: DTSTAMP は各 VEVENT の DTSTART と同じ瞬間（UTC）。UID は式の字面・ファイル内の順番・tz・点（ms）から決定的（FNV-1a 64）
//    ＝同じ定義の再取り込みで予定が重複しない・式を変えれば別の予定になる（前文〈表〉だけの更新では同じ予定として置き換わる）。
//    時計を読まない（評価は不変に決定的）。
//  - SUMMARY（予定の名前）: opts.title → 定義の先頭コメント行（# …）→ opts.fallbackTitle → 式の 1 行目。式が複数なら「名前 · 式」。
//  - 行は CRLF・75 オクテットで折り返す（RFC 5545 §3.1。UTF-8 の多バイト文字の途中では切らない）。TEXT 値は \ ; , 改行をエスケープ。
import type { ResultAnnotation } from './eval.ts';
import { formatAnnotation } from './eval.ts';

/** 入力＝CliReport の部分集合（Playground は run() の結果から同じ形を組む） */
export interface IcsInput {
  version: string;
  tz: string;
  from: string;
  to: string;
  results: { source: string; dates: string[]; points: number[]; annotations: ResultAnnotation[] }[];
}

export interface IcsOptions {
  series?: boolean;          // 1 式 1 予定＋RDATE（既定 false＝1 点 1 予定）
  title?: string;            // 予定の名前（最優先）
  source?: string;           // 定義の全文（先頭コメント行＝名前・X-KAIROS-SOURCE）
  fallbackTitle?: string;    // CLI＝ファイル名（拡張子なし）
  lang?: 'ja' | 'en';        // 枠組みの文言（註釈予定の説明）。評価器の文言（註釈文）は日本語が正
}

const CRLF = '\r\n';

/** TEXT 値のエスケープ（RFC 5545 §3.3.11） */
export function escapeText(s: string): string {
  // '\\;'＝バックスラッシュ＋セミコロン（JS の '\;' は ';' に潰れて未エスケープになる＝公開前レビュー 2026-10-07 で検出）
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** 75 オクテット折り返し（継続行は先頭に空白 1 つ＋74 オクテット）。UTF-8 の継続バイト（10xxxxxx）の前では切らない */
export function foldLine(line: string): string[] {
  const enc = new TextEncoder().encode(line);
  if (enc.length <= 75) return [line];
  const dec = new TextDecoder();
  const out: string[] = [];
  let i = 0;
  while (i < enc.length) {
    const limit = out.length === 0 ? 75 : 74;
    let j = Math.min(i + limit, enc.length);
    while (j < enc.length && j > i && (enc[j] & 0xC0) === 0x80) j--;
    out.push((out.length === 0 ? '' : ' ') + dec.decode(enc.subarray(i, j)));
    i = j;
  }
  return out;
}

/** epoch ms → iCalendar の UTC 形 YYYYMMDDTHHMMSSZ（秒未満は切り捨て） */
export function icsUtc(ms: number): string {
  const d = new Date(Math.floor(ms / 1000) * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`
    + `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

/** FNV-1a 64 bit（16 桁 hex）——依存ゼロ・ブラウザと Node で同じ値 */
export function fnv1a64(s: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const b of new TextEncoder().encode(s)) {
    h ^= BigInt(b);
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDateLabel = (label: string) => DATE_RE.test(label);
const dateValue = (label: string) => label.replace(/-/g, '');

/** 定義の先頭の非空行がコメント（# …）ならそれを名前として読む。無ければ undefined */
export function titleFromSource(source: string | undefined): string | undefined {
  if (!source) return undefined;
  const first = source.replace(/^\uFEFF/, '').split('\n').map(l => l.trim()).find(l => l !== '');
  if (!first || !first.startsWith('#')) return undefined;
  const t = first.replace(/^#+\s*/, '').trim();
  return t === '' ? undefined : t;
}

const STR = {
  ja: { annotationNote: 'この区間は表の外に依存する——表を更新して再生成する' },
  en: { annotationNote: 'This interval depends on data outside the table — update the table and regenerate' },
} as const;

/** 評価結果を .ics の文字列にする（CRLF 終端）。予定の件数は dates の総数（註釈の予定は数えない） */
export function toIcs(rep: IcsInput, opts: IcsOptions = {}): string {
  const lang = opts.lang ?? 'ja';
  const title = opts.title ?? titleFromSource(opts.source) ?? opts.fallbackTitle;
  const many = rep.results.length > 1;
  const lines: string[] = [];
  const push = (name: string, value: string) => lines.push(...foldLine(`${name}:${value}`));
  push('BEGIN', 'VCALENDAR');
  push('VERSION', '2.0');
  push('PRODID', `-//kairos-lang.org//Kairos ${rep.version}//EN`);
  push('CALSCALE', 'GREGORIAN');
  push('METHOD', 'PUBLISH');
  push('X-WR-CALNAME', escapeText(title ?? 'Kairos'));
  push('X-KAIROS-VERSION', rep.version);
  push('X-KAIROS-TZ', rep.tz);
  push('X-KAIROS-RANGE', `${rep.from}/${rep.to}`);
  if (opts.source !== undefined) push('X-KAIROS-SOURCE', escapeText(opts.source));
  rep.results.forEach((res, idx) => {
    const srcLine = res.source.split('\n')[0].trim();
    const name = title === undefined ? (srcLine || 'Kairos') : many ? `${title} · ${srcLine}` : title;
    // UID の鍵＝式の字面・ファイル内の順番（idx）・tz。順番を含めるのは、同じ字面の式が 2 つ（別の前文の下など）あっても
    // UID が衝突しない（RFC 5545 §3.8.4.7 の MUST）ため——字面だけだと series で別の点列の 2 予定が 1 つに潰れる（公開前レビュー 2026-10-07）
    const key = fnv1a64(`${idx}\u0000${res.source}\u0000${rep.tz}`).slice(0, 12);
    const alarm = () => {
      push('BEGIN', 'VALARM');
      push('ACTION', 'DISPLAY');
      push('DESCRIPTION', escapeText(name));
      push('TRIGGER', 'PT0M');
      push('END', 'VALARM');
    };
    if (opts.series) {
      // 1 式 1 予定: 先頭の点が DTSTART・残りは RDATE（25 個ずつ複数行）。粒度は式の点列で決める（全部が日付なら終日）
      if (res.dates.length > 0) {
        const allDay = res.dates.every(isDateLabel);
        const ms0 = res.points[0];
        push('BEGIN', 'VEVENT');
        push('UID', `kairos-${key}-series@kairos-lang.org`);
        push('DTSTAMP', icsUtc(ms0));
        if (allDay) lines.push(`DTSTART;VALUE=DATE:${dateValue(res.dates[0])}`);
        else { push('DTSTART', icsUtc(ms0)); push('DTEND', icsUtc(ms0)); }
        for (let i = 1; i < res.dates.length; i += 25) {
          const chunk = res.dates.slice(i, i + 25).map((l, j) => allDay ? dateValue(l) : icsUtc(res.points[i + j]));
          if (allDay) push('RDATE;VALUE=DATE', chunk.join(','));
          else push('RDATE', chunk.join(','));
        }
        push('SUMMARY', escapeText(name));
        push('DESCRIPTION', escapeText(`${res.dates.length} × ${res.dates[0]} … ${res.dates[res.dates.length - 1]}\n${res.source}`));
        push('X-KAIROS-COUNT', String(res.dates.length));
        push('X-KAIROS-LABEL', res.dates[0]);
        push('TRANSP', 'TRANSPARENT');
        if (!allDay) alarm();
        push('END', 'VEVENT');
      }
    } else {
      res.dates.forEach((label, i) => {
        const ms = res.points[i];
        const allDay = isDateLabel(label);
        push('BEGIN', 'VEVENT');
        push('UID', `kairos-${key}-${ms}@kairos-lang.org`);
        push('DTSTAMP', icsUtc(ms));
        if (allDay) lines.push(`DTSTART;VALUE=DATE:${dateValue(label)}`);
        else { push('DTSTART', icsUtc(ms)); push('DTEND', icsUtc(ms)); }
        push('SUMMARY', escapeText(name));
        push('DESCRIPTION', escapeText(`${label}\n${res.source}`));
        push('X-KAIROS-POINT', String(ms));
        push('X-KAIROS-LABEL', label);
        push('TRANSP', 'TRANSPARENT');
        if (!allDay) alarm();
        push('END', 'VEVENT');
      });
    }
    for (const a of res.annotations) {
      push('BEGIN', 'VEVENT');
      push('UID', `kairos-${key}-ann-${a.fromMs}-${a.toMs}@kairos-lang.org`);
      push('DTSTAMP', icsUtc(a.fromMs));
      // 表示形が同じ（ε＝1 ms の区間が同じ日付ラベルに畳まれた形）なら DTEND を書かない——DTEND は DTSTART より後でなければ
      // ならない（RFC 5545 §3.8.2.2）。DTEND 無しの終日は 1 日（§3.6.1）＝半開 [from, from+1 日) と同じ意味
      if (isDateLabel(a.from) && isDateLabel(a.to)) {
        lines.push(`DTSTART;VALUE=DATE:${dateValue(a.from)}`);
        if (dateValue(a.to) !== dateValue(a.from)) lines.push(`DTEND;VALUE=DATE:${dateValue(a.to)}`);
      } else {
        push('DTSTART', icsUtc(a.fromMs));
        if (icsUtc(a.toMs) !== icsUtc(a.fromMs)) push('DTEND', icsUtc(a.toMs));
      }
      push('SUMMARY', escapeText(`⚠ ${formatAnnotation(a)}`));
      push('DESCRIPTION', escapeText(`${STR[lang].annotationNote}\n${res.source}`));
      push('TRANSP', 'TRANSPARENT');
      push('END', 'VEVENT');
    }
  });
  push('END', 'VCALENDAR');
  return lines.join(CRLF) + CRLF;
}

/** 予定の件数（dates の総数）——Playground の保存メッセージと CLI の検査で共有 */
export function icsEventCount(rep: IcsInput): number {
  return rep.results.reduce((n, r) => n + r.dates.length, 0);
}
