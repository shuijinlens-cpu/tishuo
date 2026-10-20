/* ============================================================
 * MathType 风格数学排版引擎（Canvas，零依赖）
 * ============================================================
 * 目标：让讲解视频里的公式像 MathType / 教材一样排版——
 *   - 分数竖排（分子在上、分数线、分母在下），不是 "a/b"
 *   - 上标 x²、下标 x₁ 按比例缩小并上下错位
 *   - √ 带真正的根号线，n 次根号带小根指数
 *   - 括号 [ ( { | 随内容高度伸缩
 *   - ∑ ∫ lim 的上下限 stacked（展示样式）
 *   - 函数名（sin/log/lim）直立，变量斜体，数字直立——MathType 规范
 *   - 多行公式按等号对齐（教材排版习惯）
 *
 * 输入同时支持：
 *   1) LaTeX 子集：\frac{a}{b}  x^{2}  x_{1}  \sqrt{2}  \cdot  \pi
 *      \lim_{x \to 0}  \int_{a}^{b}  \sum  \begin{pmatrix} a & b \\ c & d \end{pmatrix}
 *      \left( ... \right)  \binom{n}{k}  \vec{v}  \overline{z}  \text{中文}
 *   2) 纯文本数学：1/2 → 分数、x² → 上标、x_1 → 下标、√3 → 根号、
 *      a·b → \cdot、x ≠ 3 → 关系符，全部自动转换
 *
 * 任何解析失败都返回 null，由调用方退回纯文本渲染，绝不让视频崩。
 */

import { FONT_MATH, FONT_UI } from './math';

/* ---------------- 基础类型 ---------------- */

export type GlyphKind =
  | 'var' | 'vars' | 'num' | 'func'
  | 'greekVar' | 'greekConst'
  | 'op' | 'rel' | 'punct' | 'sym' | 'text' | 'bigop';

interface Style {
  size: number;
  color: string;
  display: boolean;
  weight?: number;
}

interface Box {
  w: number;
  /** 基线上方高度 */
  h: number;
  /** 基线下方深度 */
  d: number;
  draw(c: CanvasRenderingContext2D, x: number, y: number): void;
}

interface Node {
  layout(c: CanvasRenderingContext2D, s: Style): Box;
}

const EMPTY_BOX: Box = { w: 0, h: 0, d: 0, draw() {} };

/* ---------------- 字符分类 ---------------- */

const FUNCS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'arcsin', 'arccos', 'arctan', 'arccot',
  'sinh', 'cosh', 'tanh', 'coth',
  'ln', 'log', 'lg', 'lim', 'exp', 'max', 'min', 'sup', 'inf',
  'det', 'dim', 'deg', 'mod', 'gcd', 'lcm', 'arg', 'tr', 'diag', 'rank',
]);

const GREEK = 'αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ';
const GREEK_CONST = 'πΔΣΩΦΓΛΘΞΨ';

const CJK_RE = /[\u3000-\u9fff\uff00-\uffef]/;
const BINARY_CHARS = new Set(['+', '-', '±', '∓', '×', '⋅', '÷', '∘', '∗', '∧', '∨', '∩', '∪', '∖', '·']);
const REL_CHARS = new Set(['=', '<', '>', '≤', '≥', '≠', '≈', '≡', '∼', '≃', '≅', '∝', '→', '⇒', '←', '⇐', '↔', '∈', '∉', '⊂', '⊆', '⊃', '⊇', '∥', '⊥', '∴', '∵', '∣']);

function charKind(ch: string): GlyphKind {
  if (/[0-9.]/.test(ch)) return 'num';
  if (/[a-zA-Z]/.test(ch)) return 'var';
  if (GREEK.includes(ch)) return GREEK_CONST.includes(ch) ? 'greekConst' : 'greekVar';
  if (CJK_RE.test(ch)) return 'text';
  if (BINARY_CHARS.has(ch)) return 'op';
  if (REL_CHARS.has(ch)) return 'rel';
  if ('()[]{},;:!?|'.includes(ch)) return 'punct';
  return 'sym';
}

function isValueKind(k: GlyphKind): boolean {
  return k === 'num' || k === 'var' || k === 'vars' || k === 'greekVar' || k === 'greekConst';
}

/* ---------------- 字体与度量 ---------------- */

function fontOf(kind: GlyphKind, s: Style): string {
  const w = s.weight ?? 500;
  switch (kind) {
    case 'var':
    case 'vars':
    case 'greekVar':
      return `italic ${w} ${s.size}px ${FONT_MATH}`;
    case 'text':
      return `500 ${s.size}px ${FONT_UI}`;
    case 'bigop':
      return `${w} ${s.size * 1.45}px ${FONT_MATH}`;
    default:
      return `${w} ${s.size}px ${FONT_MATH}`;
  }
}

function metricsOf(kind: GlyphKind, text: string, s: Style): { h: number; d: number } {
  const em = s.size;
  switch (kind) {
    case 'text':
      return { h: em * 0.86, d: em * 0.14 };
    case 'num':
    case 'greekConst':
      return { h: em * 0.68, d: em * 0.03 };
    case 'var':
    case 'vars': {
      const desc = /[gjpqyρφγ]/.test(text);
      const upper = /^[A-Z]/.test(text);
      return { h: em * (upper ? 0.68 : 0.5), d: desc ? em * 0.2 : em * 0.03 };
    }
    case 'greekVar':
      return { h: em * 0.52, d: /[ρφγ]/.test(text) ? em * 0.2 : em * 0.03 };
    case 'func':
      return { h: em * 0.42, d: em * 0.03 };
    case 'op':
      return { h: em * 0.36, d: em * 0.05 };
    case 'rel':
      return { h: em * 0.38, d: em * 0.05 };
    case 'punct':
      return { h: em * 0.68, d: em * 0.22 };
    case 'bigop':
      return { h: em * 0.95, d: em * 0.35 };
    default:
      return { h: em * 0.6, d: em * 0.15 };
  }
}

/* ---------------- 纯文本 → LaTeX 风格预转换 ---------------- */

const SUP_DIGITS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  'ⁿ': 'n', 'ⁱ': 'i', '⁺': '+', '⁻': '-', '⁼': '=',
};
const SUB_DIGITS: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ₙ': 'n',
};

function mapRun(run: string, table: Record<string, string>): string {
  return Array.from(run).map((ch) => table[ch] ?? ch).join('');
}

/** 从 open 位置（'{' / '(' / '['）找配对闭合位置，找不到返回 -1 */
function matchBracket(s: string, open: number): number {
  const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
  const close = pairs[s[open]];
  if (!close) return -1;
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === s[open]) depth++;
    else if (s[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** out 末尾是否已经是 \frac{...}{...} / \binom{...}{...}（避免把分数再当分子） */
function endsWithFrac(out: string): boolean {
  if (!out.endsWith('}')) return false;
  let depth = 0;
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i] === '}') depth++;
    else if (out[i] === '{') {
      depth--;
      if (depth === 0) {
        return /\\[dt]?c?frac|\\binom$/.test(out.slice(0, i));
      }
    }
  }
  return false;
}

/** 从 out 末尾取"左操作数"：x^2 / abc / (x+1) / 2.5 */
function takeLeftOperand(out: string): string | null {
  if (!out) return null;
  const last = out[out.length - 1];
  if (last === ')' || last === ']') {
    let depth = 0;
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i] === last) depth++;
      else if (out[i] === '(' || out[i] === '[') {
        depth--;
        if (depth === 0) {
          if (i > 0 && out[i - 1] === '\\') return null; // \left( 之类
          return out.slice(i, out.length);
        }
      }
    }
    return null;
  }
  const m = out.match(/([0-9a-zA-Z.]+(?:\^\{?[0-9a-zA-Z]+\}?)?)$/);
  if (!m) return null;
  const start = out.length - m[1].length;
  if (start > 0 && out[start - 1] === '\\') return null; // \pi 的命令部分
  return m[1];
}

/** 从 i 开始取"右操作数"：(x+1) / 2x / a^2 */
function takeRightOperand(s: string, i: number): { text: string; end: number } | null {
  const ch = s[i];
  if (ch === '(' || ch === '[' || ch === '{') {
    const close = matchBracket(s, i);
    if (close < 0) return null;
    return { text: s.slice(i + 1, close), end: close + 1 };
  }
  const m = s.slice(i).match(/^([0-9a-zA-Z.]+(?:\^\{?[0-9a-zA-Z]+\}?)?)/);
  if (!m) return null;
  return { text: m[1], end: i + m[1].length };
}

/** 把裸斜杠 a/b 转成 \frac{a}{b}（\command 与其花括号参数原样拷贝，不转换） */
function autoFrac(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') {
      let j = i + 1;
      while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
      out += s.slice(i, j);
      i = j;
      if (s[i] === '{') {
        const end = matchBracket(s, i);
        if (end > 0) { out += s.slice(i, end + 1); i = end + 1; }
      }
      continue;
    }
    if (ch === '{') {
      const end = matchBracket(s, i);
      if (end < 0) { out += ch; i++; continue; }
      out += s.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (ch === '/') {
      if (!endsWithFrac(out)) {
        const left = takeLeftOperand(out);
        if (left) {
          const right = takeRightOperand(s, i + 1);
          if (right && right.text) {
            out = out.slice(0, out.length - left.length) + `\\frac{${left}}{${right.text}}`;
            i = right.end;
            continue;
          }
        }
      }
    }
    out += ch;
    i++;
  }
  return out;
}

/** √ 转 \sqrt{}：支持 √(x+1)、√{x}、√3、√x²、√Δ */
function convertRadicals(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '√') {
      let j = i + 1;
      let arg = '';
      if (s[j] === '(' || s[j] === '[' || s[j] === '{') {
        const close = matchBracket(s, j);
        if (close > 0) { arg = s.slice(j + 1, close); i = close + 1; }
      } else {
        const m = s.slice(j).match(/^([0-9a-zA-Z]+(?:\^\{?[0-9a-zA-Z]+\}?)?)/);
        if (m) { arg = m[1]; i = j + m[1].length; }
      }
      out += arg ? `\\sqrt{${arg}}` : '\\sqrt';
      continue;
    }
    out += s[i];
    i++;
  }
  return out;
}

/** 纯文本数学 → LaTeX 风格串 */
export function toLatexish(src: string): string {
  let s = String(src ?? '');
  if (!s) return s;
  s = s.replace(/([0-9a-zA-Z)\]}])([⁰¹²³⁴⁵⁶⁷⁸⁹ⁿⁱ⁺⁻⁼]+)/g, (_m, b, e) => `${b}^{${mapRun(e, SUP_DIGITS)}}`);
  s = s.replace(/([0-9a-zA-Z)\]}])([₀₁₂₃₄₅₆₇₈₉ₙ]+)/g, (_m, b, e) => `${b}_{${mapRun(e, SUB_DIGITS)}}`);
  s = convertRadicals(s);
  s = s
    .replace(/·/g, ' \\cdot ')
    .replace(/×/g, ' \\times ')
    .replace(/÷/g, ' \\div ')
    .replace(/∗/g, ' \\ast ')
    .replace(/−/g, '-')
    .replace(/\*/g, ' \\cdot ');
  // 除法两侧的空格会妨碍 "a / b" 识别为分数，先去掉
  s = s.replace(/\s*\/\s*/g, '/');
  s = autoFrac(s);
  // 整段被 | 包住 → 绝对值
  s = s.replace(/(^|[=<>+,;(：\s])\|([^|]*)\|(?=[=<>+,;)：\s]|$)/g, '$1\\left|$2\\right|');
  return s;
}

/* ---------------- 词法 ---------------- */

type Tok =
  | { t: 'char'; v: string }
  | { t: 'cmd'; v: string }
  | { t: 'lbrace' }
  | { t: 'rbrace' }
  | { t: 'sup' }
  | { t: 'sub' }
  | { t: 'rowbreak' }
  | { t: 'align' }
  | { t: 'begin'; env: string }
  | { t: 'end'; env: string };

function tokenize(s: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') {
      if (s[i + 1] === '\\') { toks.push({ t: 'rowbreak' }); i += 2; continue; }
      let j = i + 1;
      while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
      if (j > i + 1) {
        const name = s.slice(i + 1, j);
        if (name === 'begin' || name === 'end') {
          const close = s.indexOf('}', j);
          const env = close > 0 ? s.slice(j + 1, close).trim() : 'matrix';
          toks.push(name === 'begin' ? { t: 'begin', env } : { t: 'end', env });
          i = close > 0 ? close + 1 : j;
          continue;
        }
        toks.push({ t: 'cmd', v: name });
        i = j;
        continue;
      }
      toks.push({ t: 'cmd', v: s[i + 1] ?? '' });
      i += 2;
      continue;
    }
    if (ch === '{') { toks.push({ t: 'lbrace' }); i++; continue; }
    if (ch === '}') { toks.push({ t: 'rbrace' }); i++; continue; }
    if (ch === '^') { toks.push({ t: 'sup' }); i++; continue; }
    if (ch === '_') { toks.push({ t: 'sub' }); i++; continue; }
    if (ch === '&') { toks.push({ t: 'align' }); i++; continue; }
    toks.push({ t: 'char', v: ch });
    i++;
  }
  return toks;
}

/* ---------------- 符号表 ---------------- */

const SYMBOLS: Record<string, [string, GlyphKind]> = {
  pi: ['π', 'greekConst'], alpha: ['α', 'greekVar'], beta: ['β', 'greekVar'],
  gamma: ['γ', 'greekVar'], delta: ['δ', 'greekVar'], epsilon: ['ε', 'greekVar'],
  varepsilon: ['ε', 'greekVar'], zeta: ['ζ', 'greekVar'], eta: ['η', 'greekVar'],
  theta: ['θ', 'greekVar'], vartheta: ['θ', 'greekVar'], iota: ['ι', 'greekVar'],
  kappa: ['κ', 'greekVar'], lambda: ['λ', 'greekVar'], mu: ['μ', 'greekVar'],
  nu: ['ν', 'greekVar'], xi: ['ξ', 'greekVar'], rho: ['ρ', 'greekVar'],
  sigma: ['σ', 'greekVar'], tau: ['τ', 'greekVar'], upsilon: ['υ', 'greekVar'],
  phi: ['φ', 'greekVar'], varphi: ['φ', 'greekVar'], chi: ['χ', 'greekVar'],
  psi: ['ψ', 'greekVar'], omega: ['ω', 'greekVar'],
  Gamma: ['Γ', 'greekConst'], Delta: ['Δ', 'greekConst'], Theta: ['Θ', 'greekConst'],
  Lambda: ['Λ', 'greekConst'], Xi: ['Ξ', 'greekConst'], Pi: ['Π', 'greekConst'],
  Sigma: ['Σ', 'greekConst'], Phi: ['Φ', 'greekConst'], Psi: ['Ψ', 'greekConst'],
  Omega: ['Ω', 'greekConst'],
  infty: ['∞', 'sym'], partial: ['∂', 'greekVar'], nabla: ['∇', 'greekVar'],
  cdot: ['⋅', 'op'], times: ['×', 'op'], div: ['÷', 'op'],
  pm: ['±', 'op'], mp: ['∓', 'op'], ast: ['∗', 'op'], star: ['⋆', 'op'], circ: ['∘', 'op'],
  leq: ['≤', 'rel'], le: ['≤', 'rel'], geq: ['≥', 'rel'], ge: ['≥', 'rel'],
  neq: ['≠', 'rel'], ne: ['≠', 'rel'], approx: ['≈', 'rel'], equiv: ['≡', 'rel'],
  sim: ['∼', 'rel'], simeq: ['≃', 'rel'], cong: ['≅', 'rel'], propto: ['∝', 'rel'],
  to: ['→', 'rel'], rightarrow: ['→', 'rel'], Rightarrow: ['⇒', 'rel'],
  leftarrow: ['←', 'rel'], Leftarrow: ['⇐', 'rel'], leftrightarrow: ['↔', 'rel'],
  mapsto: ['↦', 'rel'],
  in: ['∈', 'rel'], notin: ['∉', 'rel'], subset: ['⊂', 'rel'], subseteq: ['⊆', 'rel'],
  supset: ['⊃', 'rel'], supseteq: ['⊇', 'rel'],
  cup: ['∪', 'op'], cap: ['∩', 'op'], setminus: ['∖', 'op'],
  emptyset: ['∅', 'sym'], varnothing: ['∅', 'sym'],
  forall: ['∀', 'rel'], exists: ['∃', 'rel'], neg: ['¬', 'op'],
  land: ['∧', 'op'], lor: ['∨', 'op'],
  ldots: ['…', 'punct'], cdots: ['⋯', 'punct'], dots: ['…', 'punct'],
  vdots: ['⋮', 'punct'], ddots: ['⋱', 'punct'],
  angle: ['∠', 'sym'], triangle: ['△', 'sym'], square: ['□', 'sym'],
  parallel: ['∥', 'rel'], perp: ['⊥', 'rel'],
  prime: ['′', 'sym'], deg: ['°', 'sym'],
  sum: ['∑', 'bigop'], prod: ['∏', 'bigop'],
  int: ['∫', 'bigop'], iint: ['∬', 'bigop'], iiint: ['∭', 'bigop'], oint: ['∮', 'bigop'],
  bigcup: ['⋃', 'bigop'], bigcap: ['⋂', 'bigop'],
};

const BLACKBOARD: Record<string, string> = {
  A: '𝔸', B: '𝔹', C: 'ℂ', D: '𝔻', E: '𝔼', F: '𝔽', G: '𝔾', H: 'ℍ',
  I: '𝕀', J: '𝕁', K: '𝕂', L: '𝕃', M: '𝕄', N: 'ℕ', O: '𝕆', P: 'ℙ',
  Q: 'ℚ', R: 'ℝ', S: '𝕊', T: '𝕋', U: '𝕌', V: '𝕍', W: '𝕎', X: '𝕏',
  Y: '𝕐', Z: 'ℤ', '0': '𝟘', '1': '𝟙',
};

/* ---------------- 节点 ---------------- */

interface OrdItem { text: string; kind: GlyphKind }

class OrdNode implements Node {
  constructor(private items: OrdItem[]) {}
  layout(c: CanvasRenderingContext2D, s: Style): Box {
    // 合并连续变量字母，识别函数名
    const parts: { text: string; kind: GlyphKind }[] = [];
    for (const it of this.items) {
      const last = parts[parts.length - 1];
      if (last && last.kind === 'var' && it.kind === 'var') { last.text += it.text; continue; }
      parts.push({ text: it.text, kind: it.kind });
    }
    for (const p of parts) {
      if (p.kind === 'var') {
        if (FUNCS.has(p.text.toLowerCase())) p.kind = 'func';
        else if (p.text.length > 1) p.kind = 'vars';
      }
    }
    if (!parts.length) return EMPTY_BOX;

    const measured = parts.map((p) => {
      c.font = fontOf(p.kind, s);
      return { ...p, w: c.measureText(p.text).width };
    });

    const em = s.size;
    const gaps: number[] = [];
    for (let i = 0; i < measured.length - 1; i++) {
      const a = measured[i];
      const b = measured[i + 1];
      let g = 0;
      const prev = i > 0 ? measured[i - 1] : null;
      const aUnaryMinus = a.text === '-' && (i === 0 || prev!.kind === 'op' || prev!.kind === 'rel' || '([{'.includes(prev!.text));
      const bUnaryMinus = b.text === '-' && (a.kind === 'op' || a.kind === 'rel' || '([{'.includes(a.text));
      if (a.kind === 'op' && !aUnaryMinus) g = Math.max(g, 0.15);
      if (b.kind === 'op' && !bUnaryMinus) g = Math.max(g, 0.15);
      if (a.kind === 'rel') g = Math.max(g, 0.17);
      if (b.kind === 'rel') g = Math.max(g, 0.17);
      if (isValueKind(a.kind) && isValueKind(b.kind) && (a.kind === 'num' || b.kind === 'num' || a.kind === 'vars' || b.kind === 'vars')) g = Math.max(g, 0.08);
      if (a.kind === 'punct' && (a.text === ')' || a.text === ']') && isValueKind(b.kind)) g = Math.max(g, 0.06);
      if (b.kind === 'punct' && (b.text === '(' || b.text === '[') && isValueKind(a.kind)) g = Math.max(g, 0.06);
      if (a.text === ',' || a.text === ';' || a.text === ':') g = Math.max(g, 0.09);
      gaps.push(g * em);
    }

    let total = measured[0].w;
    for (let i = 1; i < measured.length; i++) total += gaps[i - 1] + measured[i].w;

    let h = 0;
    let d = 0;
    for (const p of measured) {
      const m = metricsOf(p.kind, p.text, s);
      h = Math.max(h, m.h);
      d = Math.max(d, m.d);
    }

    return {
      w: total,
      h,
      d,
      draw(c2, x, y) {
        let cx = x;
        for (let i = 0; i < measured.length; i++) {
          const p = measured[i];
          c2.font = fontOf(p.kind, s);
          c2.fillStyle = s.color;
          c2.textBaseline = 'alphabetic';
          c2.textAlign = 'left';
          c2.fillText(p.text, cx, y);
          cx += p.w + (i < gaps.length ? gaps[i] : 0);
        }
      },
    };
  }
}

class RowNode implements Node {
  constructor(private children: Node[]) {}
  layout(c: CanvasRenderingContext2D, s: Style): Box {
    const boxes = this.children.map((ch) => ch.layout(c, s));
    if (!boxes.length) return EMPTY_BOX;
    const gap = s.size * 0.05;
    const w = boxes.reduce((a, b) => a + b.w, 0) + gap * (boxes.length - 1);
    const h = Math.max(...boxes.map((b) => b.h));
    const d = Math.max(...boxes.map((b) => b.d));
    return {
      w, h, d,
      draw(c2, x, y) {
        let cx = x;
        boxes.forEach((b, i) => {
          b.draw(c2, cx, y);
          cx += b.w + (i < boxes.length - 1 ? gap : 0);
        });
      },
    };
  }
}

class FracNode implements Node {
  constructor(private num: Node | null, private den: Node | null, private kind: 'frac' | 'binom' = 'frac') {}
  layout(c: CanvasRenderingContext2D, s: Style): Box {
    const n = this.num ? this.num.layout(c, s) : EMPTY_BOX;
    const d = this.den ? this.den.layout(c, s) : EMPTY_BOX;
    const em = s.size;
    const gap = em * 0.07;
    const axis = em * 0.26;
    const thick = Math.max(1, em * 0.045);
    const ruleW = Math.max(n.w, d.w) + em * 0.12;
    const h = axis + gap + n.h + n.d;
    // 分母底部相对主基线的深度：分母基线 = 规则线 + gap + d.h，规则线在主基线上方 axis 处
    const dep = Math.max(em * 0.12, gap + d.h + d.d - axis);
    const paren = this.kind === 'binom';

    return {
      w: ruleW,
      h: paren ? h + em * 0.1 : h,
      d: paren ? dep + em * 0.1 : dep,
      draw(c2, x, y) {
        const ry = y - axis;
        let ox = x;
        if (paren) {
          drawDelim(c2, '(', ox, ry - gap - n.h - em * 0.05, h + dep + em * 0.1, em, s.color);
          drawDelim(c2, ')', ox + em * 0.3, ry - gap - n.h - em * 0.05, h + dep + em * 0.1, em, s.color);
          ox += em * 0.36;
        }
        c2.fillStyle = s.color;
        c2.fillRect(ox, ry, ruleW, thick);
        n.draw(c2, ox + (ruleW - n.w) / 2, ry - gap - n.d);
        d.draw(c2, ox + (ruleW - d.w) / 2, ry + gap + d.h);
      },
    };
  }
}

class ScriptNode implements Node {
  constructor(private base: Node, private sup: Node | null, private sub: Node | null) {}
  layout(c: CanvasRenderingContext2D, s: Style): Box {
    const b = this.base.layout(c, s);
    const em = s.size;
    const ss: Style = { ...s, size: em * 0.68 };
    const su = this.sup ? this.sup.layout(c, ss) : null;
    const sb = this.sub ? this.sub.layout(c, ss) : null;
    const scriptW = Math.max(su?.w ?? 0, sb?.w ?? 0);
    const suShift = Math.max(b.h + em * 0.08, em * 0.45);
    const sbShift = Math.max(b.d + em * 0.08, em * 0.18);
    const h = Math.max(b.h, su ? suShift + su.h + su.d : 0);
    const d = Math.max(b.d, sb ? sbShift + sb.h + sb.d : 0);
    return {
      w: b.w + (su || sb ? scriptW + em * 0.04 : 0),
      h,
      d,
      draw(c2, x, y) {
        b.draw(c2, x, y);
        if (su) su.draw(c2, x + b.w + em * 0.04, y - suShift - su.d);
        if (sb) sb.draw(c2, x + b.w + em * 0.04, y + sbShift + sb.h);
      },
    };
  }
}

class RadicalNode implements Node {
  constructor(private body: Node, private index: Node | null) {}
  layout(c: CanvasRenderingContext2D, s: Style): Box {
    const b = this.body.layout(c, s);
    const em = s.size;
    const idx = this.index ? this.index.layout(c, { ...s, size: em * 0.55 }) : null;
    const idxW = idx ? idx.w + em * 0.06 : 0;
    const hookW = em * 0.56;
    const h = b.h + em * 0.16;
    const d = b.d + em * 0.08;
    return {
      w: idxW + hookW + b.w,
      h,
      d,
      draw(c2, x, y) {
        if (idx) idx.draw(c2, x, y + em * 0.3);
        const bx = x + idxW;
        const barY = y - b.h - em * 0.13;
        c2.strokeStyle = s.color;
        c2.lineWidth = Math.max(1.2, em * 0.05);
        c2.lineCap = 'round';
        c2.beginPath();
        c2.moveTo(bx + em * 0.06, y + b.d + em * 0.1);
        c2.quadraticCurveTo(bx + em * 0.3, y + b.d * 0.4, bx + em * 0.5, barY);
        c2.lineTo(bx + hookW + b.w, barY);
        c2.stroke();
        b.draw(c2, bx + hookW, y);
      },
    };
  }
}

/** 画单个定界符（随高度拉伸） */
function drawDelim(
  c: CanvasRenderingContext2D,
  kind: '(' | ')' | '[' | ']' | '|' | '{' | '}',
  x: number, yTop: number, hgt: number, em: number, color: string,
) {
  if (hgt <= 0) return;
  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = Math.max(1.2, em * 0.045);
  c.lineCap = 'round';
  const w = em * 0.22;
  const mid = yTop + hgt / 2;
  if (kind === '|') {
    c.fillRect(x + w * 0.4, yTop, Math.max(1.4, em * 0.05), hgt);
  } else if (kind === '[' || kind === ']') {
    c.beginPath();
    if (kind === '[') {
      c.moveTo(x + w * 0.9, yTop);
      c.lineTo(x + w * 0.1, yTop);
      c.lineTo(x + w * 0.1, yTop + hgt);
      c.lineTo(x + w * 0.9, yTop + hgt);
    } else {
      c.moveTo(x + w * 0.1, yTop);
      c.lineTo(x + w * 0.9, yTop);
      c.lineTo(x + w * 0.9, yTop + hgt);
      c.lineTo(x + w * 0.1, yTop + hgt);
    }
    c.stroke();
  } else if (kind === '(' || kind === ')') {
    const dir = kind === '(' ? 1 : -1;
    const cx = kind === '(' ? x : x + w;
    c.beginPath();
    c.moveTo(cx + dir * w * 0.9, yTop);
    c.bezierCurveTo(cx - dir * w * 0.1, yTop + hgt * 0.18, cx - dir * w * 0.6, yTop + hgt * 0.4, cx - dir * w * 0.62, mid);
    c.bezierCurveTo(cx - dir * w * 0.6, yTop + hgt * 0.6, cx - dir * w * 0.1, yTop + hgt * 0.82, cx + dir * w * 0.9, yTop + hgt);
    c.stroke();
  } else {
    const dir = kind === '{' ? 1 : -1;
    const cx = kind === '{' ? x + w : x;
    c.beginPath();
    c.moveTo(cx, yTop);
    c.quadraticCurveTo(cx - dir * w * 0.9, yTop + hgt * 0.05, cx - dir * w * 1.0, yTop + hgt * 0.26);
    c.quadraticCurveTo(cx - dir * w * 1.25, yTop + hgt * 0.4, cx - dir * w * 1.25, mid);
    c.quadraticCurveTo(cx - dir * w * 1.25, yTop + hgt * 0.6, cx - dir * w * 1.0, yTop + hgt * 0.74);
    c.quadraticCurveTo(cx - dir * w * 0.9, yTop + hgt * 0.95, cx, yTop + hgt);
    c.stroke();
  }
  c.restore();
}

class DelimNode implements Node {
  constructor(private kind: '(' | ')' | '[' | ']' | '|' | '{' | '}', private body: Node) {}
  layout(c: CanvasRenderingContext2D, s: Style): Box {
    const b = this.body.layout(c, s);
    const em = s.size;
    const h = b.h + em * 0.14;
    const d = b.d + em * 0.14;
    return {
      w: em * 0.3,
      h,
      d,
      draw: (c2, x, y) => {
        drawDelim(c2, this.kind, x, y - h, h + d, em, s.color);
      },
    };
  }
}

class DelimPairNode implements Node {
  constructor(private open: DelimNode, private body: Node, private close: DelimNode) {}
  layout(c: CanvasRenderingContext2D, s: Style): Box {
    const o = this.open.layout(c, s);
    const b = this.body.layout(c, s);
    const cl = this.close.layout(c, s);
    const h = Math.max(o.h, b.h, cl.h);
    const d = Math.max(o.d, b.d, cl.d);
    return {
      w: o.w + b.w + cl.w,
      h,
      d,
      draw(c2, x, y) {
        o.draw(c2, x, y);
        b.draw(c2, x + o.w, y);
        cl.draw(c2, x + o.w + b.w, y);
      },
    };
  }
}

class FuncNode implements Node {
  constructor(private name: string, private arg: Node | null, private sub: Node | null) {}
  layout(c: CanvasRenderingContext2D, s: Style): Box {
    const em = s.size;
    c.font = fontOf('func', s);
    const nameW = c.measureText(this.name).width;
    const arg = this.arg ? this.arg.layout(c, s) : null;
    const sub = this.sub ? this.sub.layout(c, { ...s, size: em * 0.68 }) : null;
    const gapW = arg ? em * 0.06 : 0;
    const w = nameW + gapW + (arg?.w ?? 0);
    let h = em * 0.42;
    let d = em * 0.03;
    if (arg) { h = Math.max(h, arg.h); d = Math.max(d, arg.d); }
    if (sub) { d = Math.max(d, em * 0.34 + sub.h + sub.d); }
    return {
      w,
      h,
      d,
      draw: (c2, x, y) => {
        c2.font = fontOf('func', s);
        c2.fillStyle = s.color;
        c2.textBaseline = 'alphabetic';
        c2.textAlign = 'left';
        c2.fillText(this.name, x, y);
        if (arg) arg.draw(c2, x + nameW + gapW, y);
        if (sub) sub.draw(c2, x, y + em * 0.34 + sub.h);
      },
    };
  }
}

class BigOpNode implements Node {
  constructor(private sym: string, private sup: Node | null, private sub: Node | null) {}
  layout(c: CanvasRenderingContext2D, s: Style): Box {
    const em = s.size;
    if (!this.sup && !this.sub) {
      return new ScriptNode(new OrdNode([{ text: this.sym, kind: 'bigop' }]), null, null).layout(c, s);
    }
    const ss: Style = { ...s, size: em * 0.62 };
    const su = this.sup ? this.sup.layout(c, ss) : null;
    const sb = this.sub ? this.sub.layout(c, ss) : null;
    const opW = (() => { c.font = fontOf('bigop', s); return c.measureText(this.sym).width; })();
    const limH = em * 1.28;
    const limD = em * 0.78;
    const w = Math.max(opW, su?.w ?? 0, sb?.w ?? 0);
    const h = Math.max(em * 0.95, limH + (su ? su.h + su.d : 0));
    const d = Math.max(em * 0.35, limD + (sb ? sb.h + sb.d : 0));
    return {
      w,
      h,
      d,
      draw: (c2, x, y) => {
        c2.font = fontOf('bigop', s);
        c2.fillStyle = s.color;
        c2.textBaseline = 'alphabetic';
        c2.textAlign = 'center';
        c2.fillText(this.sym, x + w / 2, y - em * 0.22);
        if (su) su.draw(c2, x + (w - su.w) / 2, y - limH - su.d);
        if (sb) sb.draw(c2, x + (w - sb.w) / 2, y + limD + sb.h);
      },
    };
  }
}

class AccentNode implements Node {
  constructor(private body: Node, private kind: 'hat' | 'bar' | 'vec' | 'tilde' | 'dot') {}
  layout(c: CanvasRenderingContext2D, s: Style): Box {
    const b = this.body.layout(c, s);
    const em = s.size;
    const extra = this.kind === 'dot' ? em * 0.22 : em * 0.34;
    return {
      w: b.w,
      h: b.h + extra,
      d: b.d,
      draw: (c2, x, y) => {
        b.draw(c2, x, y);
        const yA = y - b.h - em * 0.1;
        c2.strokeStyle = s.color;
        c2.fillStyle = s.color;
        c2.lineWidth = Math.max(1.1, em * 0.04);
        const xl = x + b.w * 0.5;
        if (this.kind === 'hat') {
          c2.beginPath();
          c2.moveTo(x + b.w * 0.1, yA + em * 0.12);
          c2.quadraticCurveTo(xl, yA - em * 0.16, x + b.w * 0.9, yA + em * 0.12);
          c2.stroke();
        } else if (this.kind === 'bar') {
          c2.beginPath();
          c2.moveTo(x + b.w * 0.12, yA);
          c2.lineTo(x + b.w * 0.88, yA);
          c2.stroke();
        } else if (this.kind === 'vec') {
          c2.beginPath();
          c2.moveTo(x + b.w * 0.12, yA + em * 0.1);
          c2.lineTo(x + b.w * 0.88, yA);
          c2.stroke();
          c2.beginPath();
          c2.moveTo(x + b.w * 0.88, yA - em * 0.07);
          c2.lineTo(x + b.w * 0.88, yA + em * 0.09);
          c2.lineTo(x + b.w * 0.98, yA + em * 0.01);
          c2.closePath();
          c2.fill();
        } else if (this.kind === 'tilde') {
          c2.beginPath();
          c2.moveTo(x + b.w * 0.12, yA);
          c2.quadraticCurveTo(xl, yA - em * 0.16, x + b.w * 0.88, yA);
          c2.stroke();
        } else {
          c2.beginPath();
          c2.arc(xl, yA, Math.max(1.2, em * 0.055), 0, Math.PI * 2);
          c2.fill();
        }
      },
    };
  }
}

class OverlineNode implements Node {
  constructor(private body: Node) {}
  layout(c: CanvasRenderingContext2D, s: Style): Box {
    const b = this.body.layout(c, s);
    const em = s.size;
    return {
      w: b.w,
      h: b.h + em * 0.22,
      d: b.d,
      draw(c2, x, y) {
        b.draw(c2, x, y);
        c2.strokeStyle = s.color;
        c2.lineWidth = Math.max(1.1, em * 0.04);
        c2.beginPath();
        c2.moveTo(x, y - b.h - em * 0.14);
        c2.lineTo(x + b.w, y - b.h - em * 0.14);
        c2.stroke();
      },
    };
  }
}

class SpaceNode implements Node {
  constructor(private emW: number) {}
  layout(_c: CanvasRenderingContext2D, s: Style): Box {
    return { w: s.size * this.emW, h: 0, d: 0, draw() {} };
  }
}

class TextNode implements Node {
  constructor(private text: string) {}
  layout(c: CanvasRenderingContext2D, s: Style): Box {
    const em = s.size;
    c.font = `500 ${em * 0.96}px ${FONT_UI}`;
    const w = c.measureText(this.text).width;
    return {
      w,
      h: em * 0.86,
      d: em * 0.14,
      draw: (c2, x, y) => {
        c2.font = `500 ${em * 0.96}px ${FONT_UI}`;
        c2.fillStyle = s.color;
        c2.textBaseline = 'alphabetic';
        c2.textAlign = 'left';
        c2.fillText(this.text, x, y);
      },
    };
  }
}

interface MatRow { cells: Node[][] }

class MatrixNode implements Node {
  constructor(private rows: MatRow[], private env: string) {}
  layout(c: CanvasRenderingContext2D, s: Style): Box {
    const em = s.size;
    const nCols = Math.max(...this.rows.map((r) => r.cells.length), 1);
    const colBoxes: Box[][] = Array.from({ length: nCols }, () => []);
    this.rows.forEach((r) => {
      for (let j = 0; j < nCols; j++) {
        const cell = r.cells[j] ?? [];
        colBoxes[j].push(new RowNode(cell).layout(c, s));
      }
    });
    const colW = colBoxes.map((col) => Math.max(...col.map((b) => b.w), 0));
    const rowH = this.rows.map((r, i) => {
      let m = 0;
      for (let j = 0; j < nCols; j++) {
        const b = colBoxes[j][i];
        if (b) m = Math.max(m, b.h + b.d);
      }
      return m + em * 0.3;
    });

    const isAligned = /aligned|align|cases|split/.test(this.env);
    const pad = isAligned ? em * 0.08 : em * 0.18;
    const innerW = colW.reduce((a, b) => a + b, 0) + pad * (nCols - 1);
    const innerH = rowH.reduce((a, b) => a + b, 0);
    const delimW = em * 0.34;
    const hasDelim = !isAligned;
    const totalW = hasDelim ? innerW + delimW * 2 : innerW;
    const totalH = innerH;

    const openKind: '(' | '[' | '|' | '{' =
      this.env.includes('bmatrix') ? '[' :
      this.env.includes('vmatrix') ? '|' :
      this.env.includes('Bmatrix') ? '{' :
      this.env.includes('cases') ? '{' : '(';

    const colX: number[] = [];
    let cx = 0;
    for (let j = 0; j < nCols; j++) { colX.push(cx); cx += colW[j] + pad; }
    const rowY: number[] = [];
    let ry = 0;
    for (let i = 0; i < this.rows.length; i++) { rowY.push(ry); ry += rowH[i]; }

    const h = totalH / 2 + em * 0.14;
    const d = totalH / 2 + em * 0.14;

    return {
      w: totalW,
      h,
      d,
      draw: (c2, x, y) => {
        const top = y - totalH / 2 - em * 0.07;
        const ox = x + (hasDelim ? delimW : 0);
        if (hasDelim) {
          drawDelim(c2, openKind, x, top, totalH, em, s.color);
          const close = openKind === '(' ? ')' : openKind === '[' ? ']' : openKind === '|' ? '|' : '}';
          drawDelim(c2, close, x + delimW + innerW, top, totalH, em, s.color);
        }
        this.rows.forEach((r, i) => {
          for (let j = 0; j < nCols; j++) {
            const b = colBoxes[j][i];
            if (!b) continue;
            const cellX = ox + colX[j];
            const cellY = top + rowY[i] + rowH[i] / 2;
            const bx = isAligned ? cellX : cellX + (colW[j] - b.w) / 2;
            b.draw(c2, bx, cellY + (b.h - b.d) / 2);
          }
        });
      },
    };
  }
}

/* ---------------- 解析器 ---------------- */

const DELIM_MAP: Record<string, '(' | ')' | '[' | ']' | '|' | '{' | '}'> = {
  '(': '(', ')': ')', '[': '[', ']': ']', '|': '|',
  '\\{': '{', '\\}': '}', '\\|': '|', '\\lbrace': '{', '\\rbrace': '}', '\\lvert': '|', '\\rvert': '|',
};

class Parser {
  private toks: Tok[];
  private p = 0;
  constructor(src: string | Tok[]) {
    this.toks = typeof src === 'string' ? tokenize(src) : src;
  }
  private peek(): Tok | undefined { return this.toks[this.p]; }
  private next(): Tok | undefined { return this.toks[this.p++]; }

  parseSeq(): Node[] {
    const nodes: Node[] = [];
    let ord: OrdItem[] = [];
    const flushOrd = () => {
      if (ord.length) { nodes.push(new OrdNode(ord)); ord = []; }
    };
    const attachScripts = (base: Node): Node => {
      let sup: Node | null = null;
      let sub: Node | null = null;
      for (;;) {
        const tk = this.peek();
        if (tk?.t === 'sup' && !sup) { this.p++; sup = this.parseArg(); continue; }
        if (tk?.t === 'sub' && !sub) { this.p++; sub = this.parseArg(); continue; }
        break;
      }
      return sup || sub ? new ScriptNode(base, sup, sub) : base;
    };

    for (;;) {
      const tk = this.peek();
      if (!tk) break;
      if (tk.t === 'rbrace' || tk.t === 'rowbreak' || tk.t === 'align' || tk.t === 'end') break;
      if (tk.t === 'cmd' && tk.v === 'right') break;

      if (tk.t === 'sup' || tk.t === 'sub') {
        let base: Node | null = null;
        if (ord.length) {
          const lastCh = ord.pop()!;
          flushOrd();
          base = new OrdNode([lastCh]);
        } else if (nodes.length) {
          base = nodes.pop()!;
        }
        if (base) nodes.push(attachScripts(base));
        else { this.p++; this.parseArg(); }
        continue;
      }

      if (tk.t === 'begin') { flushOrd(); this.p++; nodes.push(this.parseMatrix(tk.env)); continue; }

      if (tk.t === 'char') {
        this.p++;
        ord.push({ text: tk.v, kind: charKind(tk.v) });
        continue;
      }

      if (tk.t === 'cmd') {
        this.p++;
        const sym = SYMBOLS[tk.v];
        if (sym && sym[1] === 'bigop') {
          flushOrd();
          nodes.push(this.parseBigOp(sym[0]));
          continue;
        }
        if (sym) {
          ord.push({ text: sym[0], kind: sym[1] });
          continue;
        }
        flushOrd();
        const n = this.parseCmd(tk.v);
        if (n) nodes.push(n);
        continue;
      }

      this.p++;
      if (tk.t === 'lbrace') {
        const inner = this.parseSeq();
        if (this.peek()?.t === 'rbrace') this.p++;
        nodes.push(new RowNode(inner));
      }
    }
    flushOrd();
    return nodes;
  }

  /** 大运算符 + 上下限（∑ ∫） */
  private parseBigOp(sym: string): Node {
    let sup: Node | null = null;
    let sub: Node | null = null;
    for (;;) {
      const tk = this.peek();
      if (tk?.t === 'sup' && !sup) { this.p++; sup = this.parseArg(); continue; }
      if (tk?.t === 'sub' && !sub) { this.p++; sub = this.parseArg(); continue; }
      break;
    }
    return new BigOpNode(sym, sup, sub);
  }

  private parseArg(): Node | null {
    const tk = this.peek();
    if (!tk) return null;
    if (tk.t === 'lbrace') {
      this.p++;
      const inner = this.parseSeq();
      if (this.peek()?.t === 'rbrace') this.p++;
      return new RowNode(inner);
    }
    if (tk.t === 'char') { this.p++; return new OrdNode([{ text: tk.v, kind: charKind(tk.v) }]); }
    if (tk.t === 'cmd') { this.p++; return this.parseCmd(tk.v); }
    return null;
  }

  /** 读取原始文本直到配对 }（用于 \text{}） */
  private parseRawArg(): string {
    if (this.peek()?.t !== 'lbrace') return '';
    this.p++;
    let depth = 1;
    const parts: string[] = [];
    while (this.p < this.toks.length) {
      const t = this.toks[this.p];
      if (t.t === 'lbrace') depth++;
      if (t.t === 'rbrace') {
        depth--;
        if (depth === 0) { this.p++; break; }
      }
      this.p++;
      parts.push(t.t === 'char' ? t.v : t.t === 'cmd' ? `\\${t.v}` : ' ');
    }
    return parts.join('');
  }

  /** 函数参数：\sin(x)（括号伸缩）或 \sin x */
  private parseFuncArg(): Node | null {
    const tk = this.peek();
    if (!tk) return null;
    if (tk.t === 'char' && tk.v === '(') {
      // 在 token 流里找配对 )
      let depth = 0;
      let j = this.p;
      for (; j < this.toks.length; j++) {
        const t = this.toks[j];
        if (t.t === 'char' && t.v === '(') depth++;
        else if (t.t === 'char' && t.v === ')') { depth--; if (depth === 0) break; }
      }
      if (j < this.toks.length) {
        const inner = this.toks.slice(this.p + 1, j);
        this.p = j + 1;
        const body = new RowNode(new Parser(inner).parseSeq());
        return new DelimPairNode(new DelimNode('(', body), body, new DelimNode(')', body));
      }
    }
    if (tk.t === 'char' || tk.t === 'lbrace' || tk.t === 'cmd') return this.parseArg();
    return null;
  }

  private parseCmd(name: string): Node | null {
    if (name === ',' || name === ' ' || name === ';' || name === '!' || name === 'quad' || name === 'qquad') {
      const w = name === ',' ? 0.1 : name === ';' ? 0.14 : name === '!' ? -0.06 : name === 'quad' ? 0.6 : 1.2;
      return new SpaceNode(w);
    }
    if (name === 'displaystyle' || name === 'textstyle' || name === 'limits' || name === 'nolimits') return null;
    if (DELIM_MAP[`\\${name}`]) return new OrdNode([{ text: DELIM_MAP[`\\${name}`], kind: 'punct' }]);

    if (name === 'left') {
      const d = this.next();
      const open = d ? DELIM_MAP[d.t === 'char' ? d.v : `\\${(d as { v: string }).v}`] : undefined;
      const body = new RowNode(this.parseSeq());
      const e = this.next();
      let close: '(' | ')' | '[' | ']' | '|' | '{' | '}' = ')';
      if (e?.t === 'cmd' && e.v === 'right') {
        const d2 = this.next();
        close = d2 ? DELIM_MAP[d2.t === 'char' ? d2.v : `\\${(d2 as { v: string }).v}`] ?? ')' : ')';
      }
      if (!open) return new DelimPairNode(new DelimNode('(', body), body, new DelimNode(')', body));
      return new DelimPairNode(new DelimNode(open, body), body, new DelimNode(close, body));
    }
    if (name === 'right') return null;

    if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
      return new FracNode(this.parseArg(), this.parseArg(), 'frac');
    }
    if (name === 'binom' || name === 'tbinom' || name === 'dbinom') {
      return new FracNode(this.parseArg(), this.parseArg(), 'binom');
    }
    if (name === 'sqrt') {
      let index: Node | null = null;
      const save = this.p;
      const nb = this.peek();
      if (nb?.t === 'char' && (nb as { v: string }).v === '[') {
        this.p++;
        const items: OrdItem[] = [];
        while (this.p < this.toks.length) {
          const t = this.toks[this.p];
          if (t.t === 'char' && t.v === ']') { this.p++; break; }
          if (t.t === 'char') items.push({ text: t.v, kind: charKind(t.v) });
          this.p++;
        }
        if (items.length) index = new OrdNode(items);
        else this.p = save;
      }
      return new RadicalNode(this.parseArg() ?? new OrdNode([]), index);
    }
    if (name === 'overline' || name === 'bar' || name === 'vec' || name === 'hat' || name === 'tilde' || name === 'dot' || name === 'ddot') {
      const body = this.parseArg() ?? new OrdNode([]);
      if (name === 'overline') return new OverlineNode(body);
      if (name === 'bar') return new AccentNode(body, 'bar');
      if (name === 'ddot') return new AccentNode(body, 'dot');
      return new AccentNode(body, name as 'vec' | 'hat' | 'tilde' | 'dot');
    }
    if (name === 'text' || name === 'textrm' || name === 'mbox' || name === 'mathrm') {
      return new TextNode(this.parseRawArg());
    }
    if (name === 'mathbb') {
      const raw = this.parseRawArg();
      const mapped = Array.from(raw).map((ch) => BLACKBOARD[ch] ?? ch).join('');
      return new OrdNode([{ text: mapped, kind: 'sym' }]);
    }
    if (name === 'mathit' || name === 'boldsymbol' || name === 'mathbf') {
      return this.parseArg();
    }
    if (FUNCS.has(name)) {
      let sub: Node | null = null;
      if (name === 'lim' && this.peek()?.t === 'sub') { this.p++; sub = this.parseArg(); }
      return new FuncNode(name, this.parseFuncArg(), sub);
    }
    const sym = SYMBOLS[name];
    if (sym) return new OrdNode([{ text: sym[0], kind: sym[1] }]);
    return null;
  }

  private parseMatrix(env: string): Node {
    const rows: MatRow[] = [];
    let cells: Node[][] = [[]];
    for (;;) {
      const tk = this.peek();
      if (!tk || tk.t === 'end') { if (tk?.t === 'end') this.p++; break; }
      if (tk.t === 'rowbreak') { this.p++; rows.push({ cells }); cells = [[]]; continue; }
      if (tk.t === 'align') { this.p++; cells.push([]); continue; }
      if (tk.t === 'rbrace') { this.p++; continue; }
      const before = this.p;
      const seq = this.parseSeq();
      if (this.p === before) this.p++;
      cells[cells.length - 1].push(new RowNode(seq));
    }
    rows.push({ cells });
    return new MatrixNode(rows.filter((r) => r.cells.some((c) => c.length)), env);
  }
}

/* ---------------- 块级排版 ---------------- */

export interface MathLine {
  w: number;
  h: number;
  d: number;
  draw(c: CanvasRenderingContext2D, x: number, y: number): void;
}

export interface MathBlock {
  lines: MathLine[];
  width: number;
  height: number;
  size: number;
}

/** 在字符串里找第一个"顶层"字符（跳过 \命令 与 {} ()） */
function topLevelIndex(s: string, chars: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') { i++; continue; }
    if (ch === '{' || ch === '(') depth++;
    else if (ch === '}' || ch === ')') depth--;
    else if (depth === 0 && chars.includes(ch)) return i;
  }
  return -1;
}

const REL_CHARS_STR = '=≤≥<>≠≈≡';

/** 把一段公式文本排版成行（支持多行、等号对齐） */
export function layoutMathLines(
  c: CanvasRenderingContext2D,
  text: string,
  size: number,
  color: string,
): MathBlock | null {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const style: Style = { size, color, display: true };
  const lineStrs = raw.split(/\r?\n|\\\\/).map((x) => x.trim()).filter(Boolean);
  if (!lineStrs.length) return null;

  const lines: MathLine[] = [];
  try {
    // 等号对齐：至少两行、每行都有顶层关系符
    const canAlign = lineStrs.length >= 2 && lineStrs.every((l) => topLevelIndex(l, REL_CHARS_STR) >= 0);
    if (canAlign) {
      const pieces = lineStrs.map((l) => {
        const i = topLevelIndex(l, REL_CHARS_STR);
        return { left: l.slice(0, i), right: l.slice(i) };
      });
      const leftNodes = pieces.map((pc) => new RowNode(new Parser(toLatexish(pc.left)).parseSeq()));
      const leftBoxes = leftNodes.map((n) => n.layout(c, style));
      const alignCol = Math.max(...leftBoxes.map((b) => b.w));
      pieces.forEach((pc, i) => {
        const rNode = new RowNode(new Parser(toLatexish(pc.right)).parseSeq());
        const rb = rNode.layout(c, style);
        const lb = leftBoxes[i];
        const h = Math.max(lb.h, rb.h);
        const d = Math.max(lb.d, rb.d);
        const w = alignCol + size * 0.22 + rb.w;
        lines.push({
          w, h, d,
          draw(c2, x, y) {
            leftNodes[i].layout(c2, style).draw(c2, x, y);
            rNode.layout(c2, style).draw(c2, x + alignCol + size * 0.22, y);
          },
        });
      });
    } else {
      for (const ls of lineStrs) {
        const node = new RowNode(new Parser(toLatexish(ls)).parseSeq());
        const b = node.layout(c, style);
        if (b.w <= 0 && b.h <= 0) continue;
        lines.push({
          w: b.w, h: b.h, d: b.d,
          draw(c2, x, y) { node.layout(c2, style).draw(c2, x, y); },
        });
      }
    }
  } catch {
    return null;
  }
  if (!lines.length) return null;

  const gap = size * 0.34;
  const width = Math.max(...lines.map((l) => l.w));
  const height = lines.reduce((a, l) => a + l.h + l.d, 0) + gap * (lines.length - 1);
  return { lines, width, height, size };
}

/* ---------------- 排版缓存（同一公式每帧重排太贵） ---------------- */

const blockCache = new Map<string, MathBlock>();
const exprCache = new Map<string, MathLine>();

function cachedBlock(c: CanvasRenderingContext2D, text: string, size: number, color: string): MathBlock | null {
  const key = `${size}|${color}|${text}`;
  const hit = blockCache.get(key);
  if (hit) return hit;
  const b = layoutMathLines(c, text, size, color);
  if (!b) return null;
  if (blockCache.size > 500) blockCache.clear();
  blockCache.set(key, b);
  return b;
}

/**
 * 把公式块画进 box（自动缩放到放得下）。
 * 放不下 / 解析失败返回 null，调用方应退回纯文本渲染。
 */
export function drawMathBlock(
  c: CanvasRenderingContext2D,
  text: string,
  box: { x: number; y: number; w: number; h: number },
  opts: { size: number; color: string; align?: 'left' | 'center' | 'right'; maxLines?: number; minSize?: number },
): { usedH: number; size: number } | null {
  const min = opts.minSize ?? 11;
  let size = opts.size;
  for (;;) {
    const block = cachedBlock(c, text, size, opts.color);
    if (block) {
      const lines = opts.maxLines ? block.lines.slice(0, opts.maxLines) : block.lines;
      const usedH = lines.reduce((a, l) => a + l.h + l.d, 0) + size * 0.34 * (lines.length - 1);
      if (block.width <= box.w && usedH <= box.h) {
        let y = box.y + (lines[0]?.h ?? 0);
        for (const ln of lines) {
          const x = opts.align === 'center'
            ? box.x + (box.w - ln.w) / 2
            : opts.align === 'right'
              ? box.x + box.w - ln.w
              : box.x;
          ln.draw(c, x, y);
          y += ln.h + ln.d + size * 0.34;
        }
        return { usedH, size };
      }
    }
    if (size <= min) return null;
    size = Math.max(min, size * 0.93);
  }
}

/** 单个表达式的排版（矩阵单元格、坐标标签用），带缓存 */
export function layoutMathExpr(
  c: CanvasRenderingContext2D,
  expr: string,
  size: number,
  color: string,
): MathLine | null {
  const key = `${size}|${color}|${expr}`;
  const hit = exprCache.get(key);
  if (hit) return hit;
  try {
    const node = new RowNode(new Parser(toLatexish(String(expr ?? ''))).parseSeq());
    const style: Style = { size, color, display: true };
    const b = node.layout(c, style);
    if (b.w <= 0 && b.h <= 0) return null;
    const line: MathLine = {
      w: b.w, h: b.h, d: b.d,
      draw(c2, x, y) { node.layout(c2, style).draw(c2, x, y); },
    };
    if (exprCache.size > 800) exprCache.clear();
    exprCache.set(key, line);
    return line;
  } catch {
    return null;
  }
}

/** 判断一段文本是否应该按数学公式排版 */
export function looksLikeMath(s: string): boolean {
  const t = String(s ?? '');
  if (!t) return false;
  if (/\\[a-zA-Z]+/.test(t)) return true;
  if (/[\^_]/.test(t)) return true;
  if (/[√∫Σπ≤≥≠≈⇒∞]/.test(t)) return true;
  if (t.includes('=')) {
    const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
    if (cjk / t.length < 0.35) return true;
  }
  // 数学字符占比高且含数字的短串（"(-1, 0)"、"1/2"、"x²"）也按公式排
  const mathish = (t.match(/[0-9a-zA-Z+\-*/^_=<>()[\]{},.\\|√∫×⋅]/g) || []).length;
  if (t.length <= 28 && mathish / t.length >= 0.8 && /[0-9]/.test(t)) return true;
  return false;
}
