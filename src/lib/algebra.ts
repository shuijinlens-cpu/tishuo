import type { Scene, Stage, Storyboard } from './types';

/**
 * 精确代数内核
 * =========================================================
 * 为什么需要它：让语言模型"手算"高斯消元几乎必错（跳步、抄错行、分数加减错），
 * 而讲解视频里一个数字错了，整段讲解就废了。
 *
 * 所以凡是能判定的题型（线性方程组、行阶梯化简、一元方程），
 * 一律由这里用 **BigInt 有理数** 精确计算，并把每一次初等行变换记录成步骤，
 * 直接交给渲染器画出来 —— 数学 100% 正确，步骤也天然齐全。
 */

/* ---------------- 有理数 ---------------- */

export interface Q {
  n: bigint;
  d: bigint;
}

const ZERO = 0n;
const ONE = 1n;

function iabs(x: bigint): bigint {
  return x < ZERO ? -x : x;
}

function gcd(a: bigint, b: bigint): bigint {
  a = iabs(a);
  b = iabs(b);
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a || ONE;
}

export function q(n: number | bigint, d: number | bigint = 1): Q {
  let nn = typeof n === 'bigint' ? n : BigInt(Math.round(n));
  let dd = typeof d === 'bigint' ? d : BigInt(Math.round(d));
  if (dd === ZERO) throw new Error('分母不能为 0');
  if (dd < ZERO) {
    nn = -nn;
    dd = -dd;
  }
  const g = gcd(nn, dd);
  return { n: nn / g, d: dd / g };
}

export const Q0 = q(0);
export const Q1 = q(1);

function qFromDecimal(s: string): Q | null {
  const m = s.match(/^(-?)(\d*)(?:\.(\d*))?$/);
  if (!m) return null;
  const sign = m[1] === '-' ? -ONE : ONE;
  const ip = m[2] || '0';
  const fp = m[3] || '';
  const den = 10n ** BigInt(fp.length);
  return q(sign * BigInt(ip + fp), den);
}

const qAdd = (a: Q, b: Q): Q => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const qSub = (a: Q, b: Q): Q => ({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
const qMul = (a: Q, b: Q): Q => ({ n: a.n * b.n, d: a.d * b.d });
const qDiv = (a: Q, b: Q): Q => ({ n: a.n * b.d, d: a.d * b.n });
const qNeg = (a: Q): Q => ({ n: -a.n, d: a.d });
const qIsZero = (a: Q): boolean => a.n === ZERO;
const qEq = (a: Q, b: Q): boolean => a.n * b.d === b.n * a.d;
const qNum = (a: Q): number => Number(a.n) / Number(a.d);

function normQ(v: Q): Q {
  return q(v.n, v.d);
}

/** 显示：整数直接写，分数写 a/b，真分数也保持 a/b（视频里比带分数好读） */
export function qStr(v: Q): string {
  const x = normQ(v);
  if (x.d === ONE) return String(x.n);
  return `${x.n}/${x.d}`;
}

/* ---------------- 矩阵与初等行变换 ---------------- */

export type Mat = Q[][];

export interface RowOp {
  /** 操作说明，如"第 2 行 − 3 × 第 1 行" */
  label: string;
  /** 结果矩阵 */
  mat: Mat;
  /** 高亮行（1 基），用于动画 */
  hi?: number;
  /** 主元位置 [r,c]（0 基） */
  pivot?: [number, number];
}

function cloneMat(m: Mat): Mat {
  return m.map((r) => r.map((v) => ({ ...v })));
}

function matToText(m: Mat): string {
  return m.map((r) => r.map(qStr).join('  ')).join('\n');
}

/** 把矩阵转成渲染用的字符串网格 */
export function matToRows(m: Mat): string[][] {
  return m.map((r) => r.map(qStr));
}

/**
 * 高斯-若尔当消元（精确有理数），返回每一步。
 * @param aug 增广列数（常数列/右端项所占的列数），0 表示纯系数矩阵
 */
export function rrefSteps(input: Mat, aug = 0): { ops: RowOp[]; rref: Mat; pivots: number[] } {
  const m = cloneMat(input);
  const rows = m.length;
  const cols = m[0]?.length ?? 0;
  const coeffCols = aug ? cols - aug : cols;
  const ops: RowOp[] = [];
  const pivots: number[] = [];
  let r = 0;

  for (let c = 0; c < coeffCols && r < rows; c++) {
    // 选主元：优先 1，其次绝对值最小的非零（避免分数爆炸）
    let p = -1;
    for (let i = r; i < rows; i++) {
      if (qIsZero(m[i][c])) continue;
      if (p < 0) p = i;
      else if (qEq(m[i][c], Q1)) {
        p = i;
        break;
      } else if (iabs(m[i][c].n) * m[p][c].d < iabs(m[p][c].n) * m[i][c].d) p = i;
    }
    if (p < 0) continue;

    if (p !== r) {
      const t = m[p];
      m[p] = m[r];
      m[r] = t;
      ops.push({ label: `交换第 ${r + 1} 行 ↔ 第 ${p + 1} 行`, mat: cloneMat(m), hi: r + 1 });
    }

    const piv = m[r][c];
    if (!qEq(piv, Q1)) {
      const k = qDiv(Q1, piv);
      m[r] = m[r].map((v) => normQ(qMul(v, k)));
      const kStr = kStrOf(k);
      ops.push({
        label: `第 ${r + 1} 行 ${kStr}（把主元化为 1）`,
        mat: cloneMat(m),
        hi: r + 1,
        pivot: [r, c],
      });
    }

    for (let i = 0; i < rows; i++) {
      if (i === r) continue;
      const f = m[i][c];
      if (qIsZero(f)) continue;
      m[i] = m[i].map((v, j) => normQ(qSub(v, qMul(f, m[r][j]))));
      ops.push({
        label: `第 ${i + 1} 行 ${fStrOf(f)} 第 ${r + 1} 行`,
        mat: cloneMat(m),
        hi: i + 1,
        pivot: [r, c],
      });
    }

    pivots.push(c);
    r += 1;
  }

  return { ops, rref: m, pivots };
}

/** 乘系数 k 的说法：k=1/2 → "÷ 2"；k=2 → "× 2"；k=-1 → "× (-1)"；k=2/3 → "× 2/3" */
function kStrOf(k: Q): string {
  if (k.n === ONE && k.d !== ONE) return `÷ ${k.d}`;
  if (k.d === ONE) return k.n < ZERO ? `× (${k.n})` : `× ${k.n}`;
  return `× ${qStr(k)}`;
}

/** 把行变换说明转成口播："第 2 行 − 3 × 第 1 行" → "第 2 行减去 3 乘 第 1 行" */
function speakOp(l: string): string {
  return l
    .replace(/交换第 (\d+) 行 ↔ 第 (\d+) 行/, '交换第 $1 行和第 $2 行')
    .replace(/×/g, '乘')
    .replace(/÷/g, '除以')
    .replace(/−/g, '减去')
    .replace(/\+/g, '加上')
    .replace(/\(\s*/g, '负 ')
    .replace(/\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 实际做的是「第 i 行 − f × 第 r 行」，所以：
 * f > 0 → 减，f < 0 → 加
 */
function fStrOf(f: Q): string {
  const sign = f.n > ZERO ? '−' : '+';
  const abs: Q = { n: iabs(f.n), d: f.d };
  if (qEq(abs, Q1)) return sign;
  return `${sign} ${qStr(abs)} ×`;
}

/* ---------------- 解析线性表达式 ---------------- */

function preClean(s: string): string {
  return s
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[－—–−]/g, '-')
    .replace(/[＋]/g, '+')
    .replace(/[＝]/g, '=')
    .replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xff10))
    .replace(/[×＊·]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (ch) => '^' + (ch.charCodeAt(0) - 0x2070))
    .replace(/\s+/g, '');
}

const VAR_RE = /[a-z]\d?/;

/** 把一侧表达式解析成 { 变量: 系数 } + 常数项；失败返回 null */
function parseLinearSide(side: string, vars: Set<string>): Map<string, Q> | null {
  const s = preClean(side).replace(/_/g, '');
  if (!s) return null;
  if (/[()]/.test(s)) return null; // 带括号的交给大模型，这里只做严格可控的部分
  if (/\^/.test(s)) return null; // 非线性

  // 按 + / - 切项（保留符号）
  const segs = s.replace(/-/g, '+-').split('+').filter((x) => x !== '');
  const out = new Map<string, Q>();

  for (const seg of segs) {
    if (!seg) continue;
    // 形如 [符号][数字/分数][*][变量]
    const m = seg.match(/^([+-]?)(\d*\.?\d*(?:\/\d*\.?\d+)?)(\*?)([a-z]\d?)?$/i);
    if (!m) return null;
    const [, sign, num, , varName] = m;
    let coef: Q;
    if (!num || num === '.') coef = Q1;
    else if (num.includes('/')) {
      const [a, b] = num.split('/');
      const qa = qFromDecimal(a || '1');
      const qb = qFromDecimal(b);
      if (!qa || !qb || qIsZero(qb)) return null;
      coef = qDiv(qa, qb);
    } else {
      const qq = qFromDecimal(num);
      if (!qq) return null;
      coef = qq;
    }
    if (sign === '-') coef = qNeg(coef);

    if (varName) {
      const v = varName.toLowerCase();
      if (vars.has(v)) {
        out.set(v, normQ(qAdd(out.get(v) ?? Q0, coef)));
      } else {
        return null;
      }
    } else {
      out.set('#', normQ(qAdd(out.get('#') ?? Q0, coef)));
    }
  }
  return out;
}

export interface LinearSystem {
  vars: string[];
  /** 增广矩阵：系数 + 常数列 */
  aug: Mat;
  equations: string[];
  /** 原方程（左 = 右）文本 */
  texts: string[];
}

function collectVars(side: string): string[] {
  const s = preClean(side);
  const found: string[] = [];
  const re = /([a-z]\d?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const v = m[1].toLowerCase();
    if (!found.includes(v)) found.push(v);
  }
  return found;
}

/**
 * 从题面里抽线性方程组。
 * 支持：多行、逗号/分号分隔、大括号、"解方程组："前缀、x1/x2 下标变量。
 */
export function parseLinearSystem(text: string): LinearSystem | null {
  // 注意：必须先切分再 preClean —— preClean 会把换行也吞掉，之后就没法按行切了
  const parts = text
    .replace(/[{}]/g, ' ')
    .split(/\r?\n|;|；|。|,|，/)
    .map((x) => preClean(x))
    .filter(Boolean);

  const eqs: { left: string; right: string }[] = [];
  for (const p of parts) {
    const m = p.match(/([0-9a-z][0-9a-z+\-*/.]*)=([0-9a-z+\-*/.]*[0-9a-z])/i);
    if (!m) continue;
    const left = m[1];
    const right = m[2];
    if (!left || !right) continue;
    if (!/[a-z]/i.test(left + right)) continue;
    eqs.push({ left, right });
  }
  if (eqs.length < 2) return null;

  const vars = Array.from(
    eqs.reduce((set, e) => {
      collectVars(`${e.left}=${e.right}`).forEach((v) => set.add(v));
      return set;
    }, new Set<string>()),
  ).filter((v) => v !== 'e'); // e 当自然常数排除

  if (vars.length < 2 || vars.length > 5) return null;

  const aug: Mat = [];
  for (const e of eqs) {
    const L = parseLinearSide(e.left, new Set(vars));
    const R = parseLinearSide(e.right, new Set(vars));
    if (!L || !R) return null;
    const row: Q[] = [];
    for (const v of vars) {
      row.push(normQ(qSub(L.get(v) ?? Q0, R.get(v) ?? Q0)));
    }
    row.push(normQ(qSub(R.get('#') ?? Q0, L.get('#') ?? Q0)));
    aug.push(row);
  }

  // 至少两个方程真的有变量，避免把 "x+1=2, y=3" 之外的噪声吃进来
  if (aug.filter((r) => r.some((v, i) => i < vars.length && !qIsZero(v))).length < 2) return null;

  return {
    vars,
    aug,
    equations: eqs.map((e) => `${e.left}=${e.right}`),
    texts: eqs.map((e) => `${e.left} = ${e.right}`),
  };
}

/* ---------------- 解线性方程组 ---------------- */

export interface LinearSolution {
  kind: 'unique' | 'infinite' | 'none';
  vars: string[];
  values: Q[] | null;
  freeVars: string[];
  ops: RowOp[];
  rref: Mat;
  /** 回代/参数化解的展示行 */
  solutionLines: string[];
  /** 验算：把解代回原方程，每行一句 */
  checkLines: string[];
}

export function solveLinearSystem(sys: LinearSystem): LinearSolution {
  const { ops, rref, pivots } = rrefSteps(sys.aug, 1);
  const n = sys.vars.length;
  const rows = rref.length;

  // 矛盾行：系数全 0 但常数列非 0
  for (const row of rref) {
    const allZero = row.slice(0, n).every(qIsZero);
    if (allZero && !qIsZero(row[n])) {
      return {
        kind: 'none',
        vars: sys.vars,
        values: null,
        freeVars: [],
        ops,
        rref,
        solutionLines: ['出现 0 = 非零 的矛盾方程', '方程组无解'],
        checkLines: [],
      };
    }
  }

  const pivotOf: Record<number, number> = {};
  pivots.forEach((c, i) => {
    pivotOf[c] = i;
  });
  const freeVars = sys.vars.filter((_, i) => pivotOf[i] === undefined);

  if (freeVars.length === 0) {
    const values: Q[] = new Array(n).fill(Q0);
    pivots.forEach((c, i) => {
      values[c] = rref[i][n];
    });
    const solutionLines = sys.vars.map((v, i) => `${v} = ${qStr(values[i])}`);
    const checkLines = sys.texts.map((t, i) => {
      const row = sys.aug[i];
      let lhs = Q0;
      for (let j = 0; j < n; j++) lhs = qAdd(lhs, qMul(row[j], values[j]));
      const ok = qEq(lhs, row[n]);
      return `${t}：左边 = ${qStr(lhs)}，右边 = ${qStr(row[n])} ${ok ? '✓' : '✗'}`;
    });
    return {
      kind: 'unique',
      vars: sys.vars,
      values,
      freeVars: [],
      ops,
      rref,
      solutionLines,
      checkLines,
    };
  }

  // 有无穷多解：用自由变量表示主元变量
  const tName = ['s', 't', 'u'].filter((x) => !sys.vars.includes(x))[0] || 't';
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = pivotOf[i];
    if (p === undefined) {
      lines.push(`${sys.vars[i]} = ${tName}${freeVars.indexOf(sys.vars[i]) + 1}（自由）`);
      continue;
    }
    const parts = [qStr(rref[p][n])];
    freeVars.forEach((fv, k) => {
      const coeff = rref[p][sys.vars.indexOf(fv)];
      if (qIsZero(coeff)) return;
      const c = qNeg(coeff);
      const s = qStr(c);
      parts.push(`${s.startsWith('-') ? '−' : '+'} ${s.replace('-', '')}${tName}${k + 1}`);
    });
    lines.push(`${sys.vars[i]} = ${parts.join(' ')}`);
  }

  return {
    kind: 'infinite',
    vars: sys.vars,
    values: null,
    freeVars,
    ops,
    rref,
    solutionLines: lines,
    checkLines: [],
  };
}

/* ---------------- 纯矩阵行阶梯化简 ---------------- */

/** 形如 "1 2 3 / 4 5 6"（多行、每行数字个数相同）→ 矩阵 */
export function parseMatrixRows(text: string): Mat | null {
  const lines = text
    .split(/\n|;|；/)
    .map((l) => l.replace(/[\[\]{}]/g, ' ').trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  const rows: Q[][] = [];
  for (const line of lines) {
    const toks = line.split(/[\s,，]+/).filter(Boolean);
    if (toks.length < 2) return null;
    const row: Q[] = [];
    for (const t of toks) {
      const v = qFromDecimal(t.replace(/\//g, '/'));
      if (!v) {
        const fm = t.match(/^(-?\d+)\/(\d+)$/);
        if (!fm) return null;
        row.push(q(Number(fm[1]), Number(fm[2])));
      } else row.push(v);
    }
    rows.push(row);
  }
  if (rows.length < 2) return null;
  if (new Set(rows.map((r) => r.length)).size !== 1) return null;
  return rows;
}

/* ---------------- 口播文本 ---------------- */

function speak(s: string): string {
  return s
    .replace(/\^2|²/g, ' 的平方 ')
    .replace(/\*/g, ' 乘 ')
    .replace(/\//g, ' 除以 ')
    .replace(/\+/g, ' 加 ')
    .replace(/-/g, ' 减 ')
    .replace(/=/g, ' 等于 ')
    .replace(/\s+/g, ' ')
    .trim();
}

function speakVarList(vars: string[]): string {
  return vars.join('、');
}

/* ---------------- 生成分镜 ---------------- */

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * 线性方程组 → 分镜（增广矩阵消元，每一步都画出来）
 */
export function buildLinearSystemStoryboard(sys: LinearSystem, stage: Stage): Storyboard {
  const sol = solveLinearSystem(sys);
  const n = sys.vars.length;
  const scenes: Scene[] = [];

  scenes.push({
    type: 'title',
    title: n === 2 ? '解二元一次方程组' : n === 3 ? '解三元一次方程组' : '解线性方程组',
    subtitle: `${sys.vars.length} 个未知量 ${speakVarList(sys.vars)}`,
    narration: `这道题有 ${n} 个未知量，${speakVarList(sys.vars)}，一共 ${sys.equations.length} 个方程。我们用增广矩阵做消元，一步一步把它化成最简形。`,
  });

  scenes.push({
    type: 'formula',
    title: '第一步：把方程组写成增广矩阵',
    math: [...sys.texts, '', `系数矩阵 + 常数列 = ${n} × ${n + 1} 的增广矩阵`].join('\n'),
    note: '每一行对应一个方程，前几列是系数，最后一列是等号右边的常数',
    narration:
      '先把它写成增广矩阵。每个方程占一行，前几列是各个未知数的系数，最后竖线右边是等号右边的常数。这样写的好处是：解方程只需要动数字，不用反复抄写字母。',
  });

  // 消元过程：每屏 3 步
  const groups = chunk(sol.ops, 3);
  const first = sol.ops[0]?.mat;
  scenes.push({
    type: 'matrix',
    title: '第二步：初等行变换，从上往下消元',
    mats: [
      {
        op: '原增广矩阵',
        rows: matToRows(sys.aug),
        aug: 1,
      },
      ...(first
        ? [
            {
              op: sol.ops[0].label,
              rows: matToRows(first),
              aug: 1,
              hi: sol.ops[0].hi,
            },
          ]
        : []),
    ],
    note: '只用三种操作：交换两行、某行乘一个非零数、某行加上另一行的倍数',
    narration:
      '接下来只允许三种操作：交换两行、把某一行乘一个非零的数、把某一行加上另一行的若干倍。这三种操作都不改变方程组的解，所以我们放心地做。',
  });

  groups.forEach((ops, gi) => {
    const mats = ops.map((o, i) => ({
      op: i === 0 && gi === 0 ? '' : o.label,
      rows: matToRows(o.mat),
      aug: 1,
      hi: o.hi,
    }));
    // 第一组的第一条已经在上一屏出现过，避免重复
    const shown = gi === 0 ? mats.slice(1) : mats;
    if (!shown.length) return;
    scenes.push({
      type: 'matrix',
      title: `消元（第 ${gi + 1} 组）`,
      mats: shown,
      note: '目标：主元位置是 1，主元所在列的其他位置都是 0',
      narration: `继续化简：${ops.map((o) => speakOp(o.label)).join('，')}。每一步都只改数字，方程组的解始终没变。`,
    });
  });

  // 结论
  if (sol.kind === 'unique') {
    scenes.push({
      type: 'formula',
      title: '第三步：从最简形直接读出解',
      math: sol.solutionLines.join('\n'),
      note: '最简形里每个主元列只有一个 1，其余全 0，所以常数项就是解',
      narration: `化成最简形以后，每个未知数所在的那一列只剩下一个 1，最后一列的数就是它的值。所以 ${sol.solutionLines
        .map((l) => `${l.split('=')[0].trim()} 等于 ${l.split('=')[1].trim()}`)
        .join('，')}。`,
    });
    scenes.push({
      type: 'conclusion',
      title: '代回原方程验算',
      math: sol.solutionLines.join('，'),
      subtitle: '每一条原方程都成立，解才可靠',
      narration: `最后一定要代回去验算。${sol.checkLines
        .map((l) => l.replace(/：/g, '，'))
        .join('。')}。全部成立，说明这组解是对的。`,
    });
  } else if (sol.kind === 'none') {
    scenes.push({
      type: 'conclusion',
      title: '方程组无解',
      subtitle: '消元后出现 0 = 非零，说明条件互相矛盾',
      narration:
        '消元到最后出现了零等于一个非零数，这是不可能的。说明原来的几个方程互相矛盾，方程组没有解。',
    });
  } else {
    scenes.push({
      type: 'formula',
      title: '方程组有无穷多解',
      math: sol.solutionLines.join('\n'),
      note: `自由未知量：${sol.freeVars.join('、')}`,
      narration: `消元后出现了全是零的行，说明有效方程比未知数少，方程组有无穷多组解。把 ${sol.freeVars.join(
        '、',
      )} 当自由未知量，其余未知数用它们表示出来，就是通解。`,
    });
    scenes.push({
      type: 'conclusion',
      title: '通解的写法',
      subtitle: '自由未知量取任意值，代进去都是一组解',
      narration: '写答案时要把自由未知量标出来，并说明它取任意实数，这样才是完整的通解。',
    });
  }

  return {
    question: '',
    stage,
    topic: `${n} 元线性方程组`,
    answer:
      sol.kind === 'unique'
        ? sol.solutionLines.join('，')
        : sol.kind === 'none'
          ? '无解'
          : `${sol.solutionLines.join('，')}（无穷多解）`,
    scenes,
    source: 'local',
    createdAt: Date.now(),
    verified: true,
    exact: true,
  };
}

/**
 * 纯矩阵 → 行阶梯形分镜（"把矩阵化为行阶梯形/最简形"这类题）
 */
export function buildMatrixStoryboard(m: Mat, stage: Stage, aug = 0): Storyboard {
  const { ops, rref, pivots } = rrefSteps(m, aug);
  const cols = m[0].length;
  const scenes: Scene[] = [
    {
      type: 'title',
      title: aug ? '增广矩阵的行阶梯化简' : '矩阵化为行最简形',
      subtitle: `${m.length} 行 × ${cols} 列`,
      narration: `这是一个 ${m.length} 行 ${cols} 列的矩阵。我们按列从左到右，把每一列的主元化成 1，并把主元上下的数都消成 0。`,
    },
    {
      type: 'matrix',
      title: '原矩阵 → 第一次行变换',
      mats: [{ op: '原矩阵', rows: matToRows(m), aug }],
      narration: '先看第一列，找一个非零的数当主元。为了少算分数，优先选 1，没有 1 就选绝对值最小的那个。',
    },
  ];

  chunk(ops, 3).forEach((group, gi) => {
    scenes.push({
      type: 'matrix',
      title: `第 ${gi + 1} 组行变换`,
      mats: group.map((o) => ({ op: o.label, rows: matToRows(o.mat), aug, hi: o.hi })),
      note: '主元列为 1，主元列其余为 0',
      narration: group.map((o) => speakOp(o.label)).join('，') + '。',
    });
  });

  const rank = pivots.length;
  scenes.push({
    type: 'conclusion',
    title: '化简结果',
    subtitle: `秩 r = ${rank}，主元列：第 ${pivots.map((c) => c + 1).join('、')} 列`,
    narration: `这样每一行的第一个非零元都是 1，并且它所在列的其它位置全是 0，这就是行最简形。非零行有 ${rank} 行，所以矩阵的秩是 ${rank}。`,
  });

  return {
    question: '',
    stage,
    topic: '矩阵的行初等变换',
    answer: `行最简形：\n${matToText(rref)}\n秩 r = ${rank}`,
    scenes,
    source: 'local',
    createdAt: Date.now(),
    verified: true,
    exact: true,
  };
}

/** 精确求解入口：命中就返回 100% 正确的分镜 */
export function tryExactSolve(question: string, stage: Stage): Storyboard | null {
  const sys = parseLinearSystem(question);
  if (sys) return buildLinearSystemStoryboard(sys, stage);

  const mat = parseMatrixRows(question);
  if (mat) return buildMatrixStoryboard(mat, stage, 0);
  return null;
}

/** 供复核使用：只求答案，不生成分镜 */
export function exactAnswerOf(question: string): string | null {
  const sys = parseLinearSystem(question);
  if (!sys) return null;
  const sol = solveLinearSystem(sys);
  if (sol.kind === 'unique') return sol.solutionLines.join('，');
  if (sol.kind === 'none') return '无解';
  return `${sol.solutionLines.join('，')}（无穷多解）`;
}

export { qNum, qAdd, qSub, qMul, qDiv, qEq, qIsZero, matToText };
