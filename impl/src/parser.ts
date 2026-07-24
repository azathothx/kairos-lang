// Kairos 構文解析器（spec §5.6 EBNF）
// 再帰下降。優先順位は EBNF の入れ子どおり:
//   stream-expr = pipe { (|,&,\) pipe }（同一優先度・左結合）
//   pipe = atom { |> stage }
//   value-expr = ternary > or > and > not > comparison > additive > multiplicative > unary > postfix
import { lex, LexError } from './lexer.ts';
import type { Token } from './lexer.ts';
import type {
  Expr, Stage, Arg, Statement, Program, PremiseBlock, Member, Param, ListElem, NamedArgs,
  CoveringRange,
} from './ast.ts';

export class ParseError extends Error {
  constructor(msg: string, tok: Token) {
    super(`構文エラー(${tok.line}:${tok.col}): ${msg}（'${tok.text || tok.kind}' の位置）`);
  }
}

const GEN_WORDS = new Set(['grid', 'span', 'split', 'cycle']);
const MEMBER_KEYS = new Set(['calendar-system', 'calendar', 'axis', 'roll', 'granularity',
  'tz', 'wkst', 'asof', 'source', 'epoch']);
const WORD_OPS = new Set(['and', 'or', 'not', 'mod', 'div', 'in', 'premise', 'with']);

export function parse(src: string): Program {
  return new Parser(lex(src)).program();
}

/** covering-list 字面の単体パース（external の解決値 wire 用。ADR-46）——
 *  端の含意・年略記・開端・区間リストの意味論をテーブルリテラルと完全共有するための入口 */
export function parseCoveringText(text: string): CoveringRange[] {
  const p = new Parser(lex(text));
  return p.coveringOnly();
}

class Parser {
  private i = 0;
  private toks: Token[];
  constructor(toks: Token[]) { this.toks = toks; }

  private peek(o = 0): Token { return this.toks[Math.min(this.i + o, this.toks.length - 1)]; }
  private next(): Token { return this.toks[this.i++]; }
  private at(kind: string, text?: string): boolean {
    const t = this.peek();
    return t.kind === kind && (text === undefined || t.text === text);
  }
  private atPunct(text: string): boolean { return this.at('punct', text); }
  private atName(text?: string): boolean { return this.at('name', text); }
  private eat(kind: string, text?: string): Token {
    if (!this.at(kind, text)) throw new ParseError(`${text ?? kind} を期待`, this.peek());
    return this.next();
  }
  private skipNewlines() { while (this.at('newline')) this.next(); }
  /** newline の先が式の継続——段接続 |> または結合子 | & \——なら newline を飛ばす（F91・ADR-44。
   *  文・前文メンバーは結合子で始まれないので一義: 行頭の結合子＝前行の継続） */
  private skipContinuation() {
    let j = this.i;
    while (this.toks[j]?.kind === 'newline') j++;
    const t = this.toks[j];
    if (t?.kind === 'punct' && (t.text === '|>' || t.text === '|' || t.text === '&' || t.text === '\\')) {
      this.i = j;
    }
  }

  program(): Program {
    const statements: Statement[] = [];
    this.skipNewlines();
    while (!this.at('eof')) {
      statements.push(this.statement());
      this.skipNewlines();
      while (this.atPunct(';')) { this.next(); this.skipNewlines(); }
    }
    return { statements };
  }

  statement(): Statement {
    if (this.atName('premise')) {
      // premise-def か完全形前文か: `premise 名前 …` は定義、`premise {` は前文
      if (this.peek(1).kind === 'name') return this.premiseDef();
      this.next();
      const block = this.premiseBlock();
      return { t: 'preamble', form: 'inline', members: block.members };
    }
    if (this.atPunct('@')) return this.preamble();
    // binding か stream-expr か: NAME [(params)] = … を先読み
    if (this.at('name')) {
      const save = this.i;
      const name = this.next().text;
      let params: Param[] | null = [];
      if (this.atPunct('(')) params = this.tryParams();
      if (params !== null && this.atPunct('=') ) {
        this.next();
        const rhs = this.expression();
        const covering = this.tryBindingCovering();   // 束縛後置＝明示の被覆主張（ADR-37 判断 5）
        return { t: 'binding', name, params, rhs, covering };
      }
      this.i = save;
    }
    return { t: 'streamExpr', expr: this.expression() };
  }

  /** 束縛の仮引数 (a, b, on: p)。パターン外なら null（呼び出し式だった） */
  private tryParams(): Param[] | null {
    const save = this.i;
    this.eat('punct', '(');
    const params: Param[] = [];
    if (!this.atPunct(')')) {
      for (;;) {
        if (!this.at('name')) { this.i = save; return null; }
        const first = this.next().text;
        if (this.atPunct(':')) {          // named-param: on: p
          this.next();
          if (!this.at('name')) { this.i = save; return null; }
          params.push({ key: first, name: this.next().text });
        } else {
          params.push({ name: first });
        }
        if (this.atPunct(',')) { this.next(); continue; }
        break;
      }
    }
    if (!this.atPunct(')')) { this.i = save; return null; }
    this.next();
    return params;
  }

  private premiseDef(): Statement {
    this.eat('name', 'premise');
    const name = this.eat('name').text;
    if (this.atPunct('{')) return { t: 'premiseDef', name, block: this.premiseBlock() };
    this.eat('punct', '=');
    const base = this.eat('name').text;
    let withBlock: PremiseBlock | undefined;
    const stages: Stage[] = [];
    if (this.atName('with')) { this.next(); withBlock = this.premiseBlock(); }
    this.skipContinuation();
    while (this.atPunct('|>')) {
      this.next();
      stages.push(this.stage());
      this.skipContinuation();
    }
    return { t: 'premiseDef', name, expr: { base, withBlock, stages } };
  }

  private premiseBlock(): PremiseBlock {
    this.eat('punct', '{');
    const members: Member[] = [];
    const bindings: PremiseBlock['bindings'] = [];
    this.skipNewlines();
    while (!this.atPunct('}')) {
      if (this.at('name') && MEMBER_KEYS.has(this.peek().text) && this.peek(1).text === ':') {
        members.push(this.member());
      } else {
        const name = this.eat('name').text;
        let params: Param[] = [];
        if (this.atPunct('(')) {
          const p = this.tryParams();
          if (p === null) throw new ParseError('束縛の仮引数を期待', this.peek());
          params = p;
        }
        this.eat('punct', '=');
        const rhs = this.expression();
        const covering = this.tryBindingCovering();   // 束縛後置＝明示の被覆主張（ADR-37 判断 5）
        bindings.push({ name, params, rhs, covering });
      }
      this.skipNewlines();
      while (this.atPunct(';')) { this.next(); this.skipNewlines(); }
    }
    this.eat('punct', '}');
    return { members, bindings };
  }

  private member(): Member {
    const key = this.eat('name').text;
    this.eat('punct', ':');
    return { key, value: this.valueAtomForMember() };
  }

  /** メンバー値は単純式（名前・数値・日付・文字列）に限る */
  private valueAtomForMember(): Expr {
    const t = this.peek();
    if (t.kind === 'date') { this.next(); return { t: 'date', v: t.date! }; }
    if (t.kind === 'number') { this.next(); return { t: 'num', v: t.num! }; }
    if (t.kind === 'string') { this.next(); return { t: 'str', v: t.text }; }
    if (t.kind === 'name') { this.next(); return { t: 'name', name: t.text }; }
    throw new ParseError('前文メンバーの値を期待', t);
  }

  private preamble(): Statement {
    this.eat('punct', '@');
    const name = this.eat('name').text;
    const members: Member[] = [];
    // 後置畳み込み: @JP axis: bizDay …（行末まで）
    while (this.at('name') && MEMBER_KEYS.has(this.peek().text) && this.peek(1).text === ':') {
      members.push(this.member());
    }
    if (this.atPunct('{')) {
      // ブロック形: @名前 { 文の並び }
      this.next();
      const block: Statement[] = [];
      this.skipNewlines();
      while (!this.atPunct('}')) {
        block.push(this.statement());
        this.skipNewlines();
      }
      this.eat('punct', '}');
      return { t: 'preamble', form: 'light', name, members, block };
    }
    return { t: 'preamble', form: 'light', name, members };
  }

  // ---- 式 ----

  expression(): Expr {
    return this.combineExpr();
  }

  /** 結合子 | & \（同一優先度・左結合） */
  private combineExpr(): Expr {
    let l = this.pipeExpr();
    for (;;) {
      this.skipContinuation();
      if (this.atPunct('|') || this.atPunct('&') || this.atPunct('\\')) {
        const op = this.next().text as '|' | '&' | '\\';
        this.skipNewlines();   // 行末結合子＝次行へ継続（F91・ADR-44。|> の行末継続と同じ扱い）
        const r = this.pipeExpr();
        l = { t: 'combine', op, l, r };
      } else break;
    }
    return l;
  }

  private pipeExpr(): Expr {
    let head = this.genOrValue();
    const stages: Stage[] = [];
    this.skipContinuation();
    while (this.atPunct('|>')) {
      this.next();
      this.skipNewlines();
      stages.push(this.stage());
      this.skipContinuation();
    }
    return stages.length ? { t: 'pipe', head, stages } : head;
  }

  private stage(): Stage {
    let name = this.eat('name').text;
    let ns: string | undefined;
    if (this.atPunct('.')) { this.next(); ns = name; name = this.eat('name').text; }
    let args: Arg[] = [];
    if (this.atPunct('(')) args = this.args();
    return { name, ns, args };
  }

  private args(): Arg[] {
    this.eat('punct', '(');
    const args: Arg[] = [];
    if (!this.atPunct(')')) {
      for (;;) {
        if (this.at('name') && this.peek(1).text === ':') {
          const name = this.next().text;
          this.next(); // ':'
          args.push({ name, value: this.expression() });
        } else {
          args.push({ value: this.expression() });
        }
        if (this.atPunct(',')) { this.next(); continue; }
        break;
      }
    }
    this.eat('punct', ')');
    return args;
  }

  /** gen-expr（`day span f phase: 0`）と値式を判別。並置は窓生成語 4 語のみ（EBNF・F46） */
  private genOrValue(): Expr {
    const e = this.ternary();
    if (e.t === 'name' && this.at('name') && !WORD_OPS.has(this.peek().text)) {
      const word = this.peek().text;
      if (GEN_WORDS.has(word)) {
        this.next();
        const arg = this.genArg();
        const named = this.namedArgsTrail();
        return { t: 'gen', operand: e, word: word as any, arg, named };
      }
    }
    return e;
  }

  private genArg(): Expr {
    const t = this.peek();
    if (t.kind === 'width') { this.next(); return { t: 'width', v: t.width! }; }
    if (this.atPunct('(')) {
      // (ラムダ) または括弧式
      const save = this.i;
      this.next();
      const inner = this.expression();
      this.eat('punct', ')');
      return inner;
    }
    if (this.atPunct('[')) return this.listLiteral();
    if (t.kind === 'name') {
      // ラムダ `n => …` か裸名
      if (this.peek(1).text === '=>') return this.ternary();
      this.next();
      return { t: 'name', name: t.text };
    }
    if (this.atPunct('_')) return this.ternary();
    throw new ParseError('窓生成語の引数を期待', t);
  }

  private namedArgsTrail(): NamedArgs {
    const named: NamedArgs = {};
    while (this.at('name') && this.peek(1).text === ':' && !MEMBER_KEYS.has(this.peek().text)) {
      const key = this.next().text;
      this.next();
      named[key] = this.ternary();
    }
    return named;
  }

  // ---- 値式（EBNF の入れ子どおり） ----

  private ternary(): Expr {
    const c = this.orExpr();
    if (this.atPunct('?')) {
      this.next();
      const a = this.ternary();
      this.eat('punct', ':');
      const b = this.ternary();
      return { t: 'ternary', c, a, b };
    }
    return c;
  }

  private orExpr(): Expr {
    let l = this.andExpr();
    while (this.atName('or')) { this.next(); l = { t: 'bin', op: 'or', l, r: this.andExpr() }; }
    return l;
  }

  private andExpr(): Expr {
    let l = this.notExpr();
    while (this.atName('and')) { this.next(); l = { t: 'bin', op: 'and', l, r: this.notExpr() }; }
    return l;
  }

  private notExpr(): Expr {
    if (this.atName('not')) { this.next(); return { t: 'not', e: this.notExpr() }; }
    return this.comparison();
  }

  private comparison(): Expr {
    const l = this.additive();
    const t = this.peek();
    if ((t.kind === 'punct' && ['==', '!=', '<', '<=', '>', '>='].includes(t.text)) ||
        (t.kind === 'name' && t.text === 'in')) {
      this.next();
      return { t: 'bin', op: t.text, l, r: this.additive() };
    }
    return l;
  }

  private additive(): Expr {
    let l = this.multiplicative();
    while (this.atPunct('+') || this.atPunct('-')) {
      const op = this.next().text;
      l = { t: 'bin', op, l, r: this.multiplicative() };
    }
    return l;
  }

  private multiplicative(): Expr {
    let l = this.unary();
    while (this.atPunct('*') || this.atPunct('/') || this.atName('mod') || this.atName('div')) {
      const op = this.next().text;
      l = { t: 'bin', op, l, r: this.unary() };
    }
    return l;
  }

  private unary(): Expr {
    if (this.atPunct('-')) { this.next(); return { t: 'neg', e: this.unary() }; }
    if (this.atPunct('+')) { this.next(); return this.unary(); }
    return this.postfix();
  }

  private postfix(): Expr {
    let e = this.atom();
    for (;;) {
      if (this.atPunct('[')) {
        this.next();
        const index = this.expression();
        this.eat('punct', ']');
        e = { t: 'index', target: e, index };
      } else if (this.atPunct('(')) {
        e = { t: 'call', callee: e, args: this.args() };
      } else break;
    }
    return e;
  }

  private atom(): Expr {
    const t = this.peek();
    // ラムダ: name => / _ => / (params) =>
    if ((t.kind === 'name' || t.text === '_') && this.peek(1).text === '=>') {
      const p = this.next().text;
      this.next();
      const body = this.expression();
      return { t: 'lambda', params: [p], body };
    }
    if (t.text === '(' ) {
      // (a, b) => … の多引数ラムダを先読み
      const save = this.i;
      const params = this.tryParams();
      if (params !== null && this.atPunct('=>')) {
        this.next();
        return { t: 'lambda', params: params.map(p => p.name), body: this.expression() };
      }
      this.i = save;
      this.next();
      const inner = this.expression();
      this.eat('punct', ')');
      return inner;
    }
    if (t.kind === 'number') { this.next(); return { t: 'num', v: t.num! }; }
    if (t.kind === 'date') { this.next(); return { t: 'date', v: t.date! }; }
    if (t.kind === 'width') { this.next(); return { t: 'width', v: t.width! }; }
    if (t.kind === 'string') { this.next(); return { t: 'str', v: t.text }; }
    if (t.text === '[') return this.listLiteral();
    if (t.text === '_') { this.next(); return { t: 'name', name: '_' }; }
    if (t.kind === 'name') {
      this.next();
      let e: Expr = { t: 'name', name: t.text };
      if (this.atPunct('.') && this.peek(1).kind === 'name' && this.peek(2).text !== '.') {
        this.next();
        e = { t: 'qualified', ns: t.text, name: this.eat('name').text };
      }
      return e;
    }
    throw new ParseError('式を期待', t);
  }

  /** リスト／テーブルリテラル（covering: / labels: 後置つき。§3.8・ADR-26/30） */
  private listLiteral(allowPostfix = true): Expr {
    this.eat('punct', '[');
    const elems: ListElem[] = [];
    if (!this.atPunct(']')) {
      for (;;) {
        const e = this.ternary();
        if (this.atPunct('..')) {
          this.next();
          elems.push({ t: 'range', a: e, b: this.ternary() });
        } else {
          elems.push(e);
        }
        if (this.atPunct(',')) { this.next(); continue; }
        break;
      }
    }
    this.eat('punct', ']');
    if (!allowPostfix) return { t: 'list', elems };
    // 後置は順序自由（F104——labels: の値リストが後続の covering: を吸って黙殺する穴の封じ。
    // labels: の値は後置なしでパースし、covering:/labels: は外側でどの順でも受ける。二重指定はエラー）
    let covering: CoveringRange[] | undefined;
    let labels: Expr | undefined;
    for (;;) {
      this.skipToPostfixKeyword();
      if (this.atName('covering') && this.peek(1).text === ':') {
        if (covering) throw new ParseError('covering: の二重指定', this.peek());
        this.next(); this.next();
        covering = this.coveringList();
      } else if (this.atName('labels') && this.peek(1).text === ':') {
        if (labels) throw new ParseError('labels: の二重指定', this.peek());
        this.next(); this.next();
        labels = this.listLiteral(false);
      } else break;
    }
    return { t: 'list', elems, covering, labels };
  }

  /** covering:/labels: は改行を挟んだ継続を許す（|> の継続と同じ扱い） */
  private skipToPostfixKeyword() {
    let j = this.i;
    while (this.toks[j]?.kind === 'newline') j++;
    const t = this.toks[j];
    if (t?.kind === 'name' && (t.text === 'covering' || t.text === 'labels')
      && this.toks[j + 1]?.text === ':') this.i = j;
  }

  /** 束縛後置の covering:（明示の被覆主張。rhs が裸のテーブルリテラルなら listLiteral が先に食う） */
  private tryBindingCovering(): CoveringRange[] | undefined {
    this.skipToPostfixKeyword();
    if (this.atName('covering') && this.peek(1).text === ':') {
      this.next(); this.next();
      return this.coveringList();
    }
    return undefined;
  }

  /** covering-list 単体のパース（parseCoveringText の実体。末尾は EOF を要求） */
  coveringOnly(): CoveringRange[] {
    this.skipNewlines();
    const list = this.coveringList();
    this.skipNewlines();
    if (!this.at('eof')) throw new ParseError('covering-list の末尾に余分な字句', this.peek());
    return list;
  }

  /** covering-list = covering-range { "," covering-range }（§5.6・ADR-37 判断 9） */
  private coveringList(): CoveringRange[] {
    const list: CoveringRange[] = [];
    for (;;) {
      list.push(this.coveringRange());
      // 区間リストの継続: "," の先が covering-range の開始（数値・日付・..）のときだけ食う
      // （引数位置のテーブルリテラルでは "," は外側の引数区切り）
      if (this.atPunct(',')) {
        const t = this.peek(1);
        if (t.kind === 'number' || t.kind === 'date' || (t.kind === 'punct' && t.text === '..')) {
          this.next();
          continue;
        }
      }
      break;
    }
    return list;
  }

  /** covering-range = [端] ".." [端]。端の省略＝開端（完結主張・ADR-37）。
   *  後端は字句で判定（covering-edge = 年 | 日付）——`covering: 2021..` の直後の labels: 等を食わない */
  private coveringRange(): CoveringRange {
    let a: Expr | null = null;
    if (!this.atPunct('..')) a = this.ternary();
    this.eat('punct', '..');
    let b: Expr | null = null;
    const t = this.peek();
    if (t.kind === 'number' || t.kind === 'date') b = this.ternary();
    return { a, b };
  }
}

export { LexError };
