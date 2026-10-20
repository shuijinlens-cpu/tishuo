/* 轻量表达式编译器 + Canvas 富文本排版（不依赖任何第三方库） */

export const FONT_UI =
  '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",system-ui,-apple-system,sans-serif';
export const FONT_MATH =
  '"Cambria Math","Latin Modern Math","Times New Roman","Microsoft YaHei","PingFang SC","Songti SC",Georgia,serif';

/* ---------------- 表达式编译 ---------------- */

type Node = (x: number) => number;

const SUP: Record<string, string> = {
  '⁰': '^0', '¹': '^1', '²': '^2', '³': '^3', '⁴': '^4',
  '⁵': '^5', '⁶': '^6', '⁷': '^7', '⁸': '^8', '⁹': '^9',
};

export function normalizeExpr(src: string): string {
  let s = src
    .replace(/\s+/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'pi')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (m) => SUP[m] || m)
    .replace(/√/g, 'sqrt')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')');
  // abs(x) 之类保留；统一小写函数名
  s = s.replace(/\b(SIN|COS|TAN|SQRT|ABS|LN|LOG|EXP)\b/g, (m) => m.toLowerCase());
  return s;
}

interface Token {
  t: 'num' | 'id' | 'op' | 'lp' | 'rp' | 'comma';
  v: string;
}

function tokenize(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      out.push({ t: 'num', v: s.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < s.length && /[a-zA-Z_0-9]/.test(s[j])) j++;
      out.push({ t: 'id', v: s.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if ('+-*/^'.includes(ch)) {
      out.push({ t: 'op', v: ch });
      i++;
      continue;
    }
    if (ch === '(') { out.push({ t: 'lp', v: ch }); i++; continue; }
    if (ch === ')') { out.push({ t: 'rp', v: ch }); i++; continue; }
    if (ch === ',') { out.push({ t: 'comma', v: ch }); i++; continue; }
    i++; // 忽略未知字符
  }
  return out;
}

export function compileExpr(src: string): (x: number) => number | null {
  const s = normalizeExpr(src);
  const toks = tokenize(s);
  let p = 0;

  const peek = () => toks[p];
  const eat = (t: string, v?: string) => {
    const tk = toks[p];
    if (!tk) return false;
    if (tk.t !== t) return false;
    if (v && tk.v !== v) return false;
    p++;
    return true;
  };

  const FUNCS: Record<string, (v: number) => number> = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sqrt: Math.sqrt, abs: Math.abs, ln: Math.log,
    log: (v) => Math.log(v) / Math.LN10, log10: (v) => Math.log(v) / Math.LN10,
    exp: Math.exp, floor: Math.floor, ceil: Math.ceil,
    round: Math.round, sign: Math.sign,
  };

  function parseExpr(): Node {
    let left = parseTerm();
    for (;;) {
      if (eat('op', '+')) { const r = parseTerm(); const l = left; left = (x) => l(x) + r(x); }
      else if (eat('op', '-')) { const r = parseTerm(); const l = left; left = (x) => l(x) - r(x); }
      else break;
    }
    return left;
  }

  function startsAtom(): boolean {
    const tk = peek();
    if (!tk) return false;
    return tk.t === 'num' || tk.t === 'id' || tk.t === 'lp';
  }

  function parseTerm(): Node {
    let left = parseUnary();
    for (;;) {
      if (eat('op', '*')) { const r = parseUnary(); const l = left; left = (x) => l(x) * r(x); }
      else if (eat('op', '/')) { const r = parseUnary(); const l = left; left = (x) => l(x) / r(x); }
      else if (startsAtom()) { // 隐式乘法 2x / 3(x+1)
        const r = parseUnary();
        const l = left;
        left = (x) => l(x) * r(x);
      } else break;
    }
    return left;
  }

  function parseUnary(): Node {
    if (eat('op', '-')) { const v = parseUnary(); return (x) => -v(x); }
    if (eat('op', '+')) return parseUnary();
    return parsePower();
  }

  function parsePower(): Node {
    const base = parseAtom();
    if (eat('op', '^')) {
      const exp = parseUnary();
      return (x) => Math.pow(base(x), exp(x));
    }
    return base;
  }

  function parseAtom(): Node {
    const tk = peek();
    if (!tk) return () => NaN;
    if (tk.t === 'num') { p++; const v = parseFloat(tk.v); return () => v; }
    if (tk.t === 'lp') {
      p++;
      const inner = parseExpr();
      eat('rp');
      return inner;
    }
    if (tk.t === 'id') {
      p++;
      const name = tk.v;
      if (name === 'x') return (x) => x;
      if (name === 'pi') return () => Math.PI;
      if (name === 'e') return () => Math.E;
      const fn = FUNCS[name];
      if (fn && eat('lp')) {
        const arg = parseExpr();
        eat('rp');
        return (x) => fn(arg(x));
      }
      return () => NaN;
    }
    p++;
    return () => NaN;
  }

  const root = parseExpr();
  if (!toks.length) return () => NaN;
  return (x: number) => {
    const v = root(x);
    return Number.isFinite(v) ? v : null;
  };
}

export function sampleCurve(expr: string, xmin: number, xmax: number, n = 420) {
  const f = compileExpr(expr);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const x = xmin + ((xmax - xmin) * i) / n;
    const y = f(x);
    if (y === null || Math.abs(y) > 1e6) pts.push({ x, y: NaN });
    else pts.push({ x, y: y as number });
  }
  return pts;
}

/* ---------------- 富文本（支持 **强调**） ---------------- */

export interface Run {
  text: string;
  bold?: boolean;
}

export function parseRuns(s: string): Run[] {
  const out: Run[] = [];
  const parts = String(s ?? '').split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      out.push({ text: part.slice(2, -2), bold: true });
    } else {
      out.push({ text: part });
    }
  }
  return out.length ? out : [{ text: '' }];
}

function isCjk(ch: string) {
  return /[\u3000-\u9fff\uff00-\uffef]/.test(ch);
}

function splitTokens(runs: Run[]): { text: string; bold?: boolean }[] {
  const out: { text: string; bold?: boolean }[] = [];
  for (const r of runs) {
    let buf = '';
    for (const ch of r.text) {
      if (isCjk(ch) || ch === ' ' || /[，。、；：？！（）《》—…]/.test(ch)) {
        if (buf) { out.push({ text: buf, bold: r.bold }); buf = ''; }
        out.push({ text: ch, bold: r.bold });
      } else {
        buf += ch;
      }
    }
    if (buf) out.push({ text: buf, bold: r.bold });
  }
  return out;
}

export interface TextLine {
  runs: { text: string; bold?: boolean }[];
  width: number;
}

export function layoutText(
  c: CanvasRenderingContext2D,
  runs: Run[],
  maxW: number,
  size: number,
  weight = 500,
): TextLine[] {
  const toks = splitTokens(runs);
  const lines: TextLine[] = [];
  let cur: TextLine = { runs: [], width: 0 };
  const measure = (t: string, bold?: boolean) => {
    c.font = `${bold ? 800 : weight} ${size}px ${FONT_UI}`;
    return c.measureText(t).width;
  };
  for (const tk of toks) {
    const w = measure(tk.text, tk.bold);
    if (cur.width + w > maxW && cur.width > 0) {
      lines.push(cur);
      cur = { runs: [], width: 0 };
      if (tk.text === ' ') continue;
    }
    const last = cur.runs[cur.runs.length - 1];
    if (last && !!last.bold === !!tk.bold) last.text += tk.text;
    else cur.runs.push({ ...tk });
    cur.width += w;
  }
  if (cur.runs.length) lines.push(cur);
  return lines;
}

export interface DrawTextOpts {
  x: number;
  y: number;
  maxW: number;
  size: number;
  color: string;
  accent?: string;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  weight?: number;
  maxLines?: number;
  alpha?: number;
  font?: string;
}

export function drawRich(
  c: CanvasRenderingContext2D,
  text: string,
  o: DrawTextOpts,
): number {
  const runs = parseRuns(text);
  const lh = o.lineHeight ?? o.size * 1.45;
  const lines = layoutText(c, runs, o.maxW, o.size, o.weight ?? 500);
  const limited = o.maxLines ? lines.slice(0, o.maxLines) : lines;
  c.save();
  c.textAlign = 'left';
  c.textBaseline = 'top';
  c.globalAlpha = o.alpha ?? 1;
  let y = o.y;
  for (const ln of limited) {
    let x = o.x;
    if (o.align === 'center') x = o.x + (o.maxW - ln.width) / 2;
    if (o.align === 'right') x = o.x + o.maxW - ln.width;
    for (const r of ln.runs) {
      c.font = `${r.bold ? 800 : o.weight ?? 500} ${o.size}px ${o.font ?? FONT_UI}`;
      c.fillStyle = r.bold ? o.accent ?? o.color : o.color;
      c.fillText(r.text, x, y);
      x += c.measureText(r.text).width;
    }
    y += lh;
  }
  c.restore();
  return limited.length * lh;
}

/** 自动缩放字号直到单行放得下 */
export function fitMathSize(
  c: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  start: number,
  min = 22,
): number {
  let size = start;
  while (size > min) {
    c.font = `600 ${size}px ${FONT_MATH}`;
    if (c.measureText(text).width <= maxW) return size;
    size -= 2;
  }
  return min;
}

export function drawMath(
  c: CanvasRenderingContext2D,
  text: string,
  box: { x: number; y: number; w: number },
  startSize: number,
  color: string,
) {
  const oneLine = String(text ?? '').replace(/\n+/g, '   ');
  const size = fitMathSize(c, oneLine, box.w, startSize);
  c.save();
  c.fillStyle = color;
  c.textBaseline = 'top';
  c.textAlign = 'center';
  c.font = `600 ${size}px ${FONT_MATH}`;
  const lines = String(text ?? '').split('\n');
  let y = box.y;
  for (const ln of lines) {
    c.fillText(ln, box.x + box.w / 2, y);
    y += size * 1.35;
  }
  c.restore();
  return y - box.y;
}
