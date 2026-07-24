// Kairos AST（spec §5.6 EBNF に対応）
import type { DateVal, WidthVal } from './lexer.ts';

export type Expr =
  | { t: 'name'; name: string }
  | { t: 'qualified'; ns: string; name: string }          // Gregorian.month
  | { t: 'num'; v: number }
  | { t: 'date'; v: DateVal }
  | { t: 'width'; v: WidthVal }
  | { t: 'str'; v: string }                               // 文字列リテラル（ADR-32）
  | { t: 'list'; elems: ListElem[]; covering?: CoveringRange[]; labels?: Expr } // table-literal を含む
  | { t: 'cycleLabels'; list: Expr; anchor: Expr } // segmentBy labels: の cycle 形（窓列への周期ラベル・ADR-47）
  | { t: 'lambda'; params: string[]; body: Expr }
  | { t: 'call'; callee: Expr; args: Arg[] }
  | { t: 'index'; target: Expr; index: Expr }
  | { t: 'pipe'; head: Expr; stages: Stage[] }
  | { t: 'combine'; op: '|' | '&' | '\\'; l: Expr; r: Expr }
  | { t: 'bin'; op: string; l: Expr; r: Expr }            // 算術・比較・論理・in
  | { t: 'not'; e: Expr }
  | { t: 'neg'; e: Expr }
  | { t: 'ternary'; c: Expr; a: Expr; b: Expr }
  | { t: 'gen'; operand: Expr; word: 'grid' | 'span' | 'split' | 'cycle'; arg: Expr; named: NamedArgs };

export type ListElem = Expr | { t: 'range'; a: Expr; b: Expr };

/** covering-range（ADR-37 判断 9）: 端の省略＝開端（完結主張）。".." 単独＝全域完結 */
export type CoveringRange = { a: Expr | null; b: Expr | null };

export interface Stage { name: string; ns?: string; args: Arg[] }
export type Arg = { name?: string; value: Expr };
export type NamedArgs = Record<string, Expr>;

export type Statement =
  | { t: 'premiseDef'; name: string; block?: PremiseBlock; expr?: PremiseExpr }
  | { t: 'preamble'; form: 'light' | 'inline'; name?: string; members: Member[]; block?: Statement[] }
  | { t: 'binding'; name: string; params: Param[]; rhs: Expr; covering?: CoveringRange[] }
  | { t: 'streamExpr'; expr: Expr };

export interface PremiseExpr { base: string; withBlock?: PremiseBlock; stages: Stage[] }
export interface PremiseBlock {
  members: Member[];
  bindings: { name: string; params: Param[]; rhs: Expr; covering?: CoveringRange[] }[];
}
export interface Member { key: string; value: string | Expr }
export type Param = { name: string; key?: string };            // key があれば named-param（on: p）

export interface Program { statements: Statement[] }
