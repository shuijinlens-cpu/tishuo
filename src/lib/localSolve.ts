import type { Scene, Stage, Storyboard } from './types';
import { compileExpr } from './math';
import { tryExactSolve } from './algebra';

/**
 * 本地解题器：不联网、不要 Key，覆盖拍照题里最常见的一类——
 * 一元一次方程、一元二次方程、四则运算/分数计算。
 * 命中就当场生成真正的分镜（含图像动画），不命中再引导用户接免费大模型。
 */

const SUP2 = '²';

function norm(s: string) {
  return s
    .replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10))
    .replace(/[×＊]/g, '*')
    .replace(/[÷／]/g, '/')
    .replace(/[－—–]/g, '-')
    .replace(/[＋]/g, '+')
    .replace(/[＝]/g, '=')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[²]/g, '^2')
    .replace(/[³]/g, '^3')
    .replace(/\s+/g, '');
}

/** 把 "3x-5" 这类线性表达式拆成 a·x + b */
function parseLinear(expr: string): { a: number; b: number } | null {
  if (!expr) return null;
  const cleaned = norm(expr);
  if (!/^[-+0-9.x*/().]*$/.test(cleaned)) return null;
  if (/x.*x/.test(cleaned)) return null;
  // 按项拆分（保留符号）
  const terms = cleaned.replace(/-/g, '+-').split('+').filter(Boolean);
  let a = 0;
  let b = 0;
  for (const raw of terms) {
    const t = raw.trim();
    if (!t) continue;
    if (t.includes('x')) {
      const coef = t.replace(/\*?x/g, '');
      if (coef === '' || coef === '+') a += 1;
      else if (coef === '-') a -= 1;
      else {
        const v = Number(coef);
        if (!Number.isFinite(v)) return null;
        a += v;
      }
    } else {
      const v = Number(t.replace(/^\+/, ''));
      if (!Number.isFinite(v)) return null;
      b += v;
    }
  }
  return { a, b };
}

function frac(n: number, d: number): string {
  const g = (a: number, b: number): number => (b ? g(b, a % b) : Math.abs(a));
  if (d === 0) return '无意义';
  let num = n;
  let den = d;
  if (den < 0) { num = -num; den = -den; }
  const k = g(num, den) || 1;
  num /= k;
  den /= k;
  if (den === 1) return String(num);
  return `${num}/${den}`;
}

function niceNum(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  const r = Math.round(v * 1e6) / 1e6;
  return String(r);
}

/** 口播读法：把式子读成中文，避免念符号 */
function speakEquation(s: string): string {
  return s
    .replace(/x\^2|²/g, 'x 的平方')
    .replace(/x/g, 'x ')
    .replace(/=/g, ' 等于 ')
    .replace(/\+/g, ' 加 ')
    .replace(/-/g, ' 减 ')
    .replace(/\*/g, ' 乘 ')
    .replace(/\//g, ' 除以 ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 从一段题面里把「方程本体」抠出来。
 * 中文按分隔符切块，再只保留数学字符——这样 "7. 解方程：2x+3=11" 也能拿到 "2x+3=11"。
 */
function extractEquation(text: string): { left: string; right: string } | null {
  const chunks = text.split(/[\u4e00-\u9fa5]+/);
  // 优先用「按中文切开后的小块」：块越短越干净，避免把后面的"求 x"也吃进来
  const cands = [...chunks.filter((c) => c.includes('=')), text];
  for (const raw of cands) {
    const cleaned = raw
      .replace(/^\s*\d+\s*[.、）)]\s*/, '')
      .replace(/[^0-9xX+\-*/()^².=\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned.includes('=')) continue;
    // 只保留第一段「左边=右边」
    const m = cleaned.match(/[-+0-9xX*/()^².\s]+\s*=\s*[-+0-9xX*/()^².\s]+/);
    if (!m) continue;
    const [left, right] = m[0].split('=');
    const l = (left || '').trim();
    const r = (right || '').trim();
    if (!l || !r) continue;
    if (!/[0-9xX]/.test(l) || !/[0-9xX]/.test(r)) continue;
    // 剔除「11 x」这种被后面句子粘上来的悬挂项
    if (/\d\s+x$/i.test(l) || /\d\s+x$/i.test(r)) continue;
    return { left: l, right: r };
  }
  return null;
}

/** 结果能写成好看的分数就写分数 */
function prettyFraction(v: number): string | null {
  if (!Number.isFinite(v) || v > 1e4 || v < -1e4) return null;
  for (let d = 2; d <= 64; d++) {
    const n = Math.round(v * d);
    if (Math.abs(n / d - v) < 1e-9) {
      const s = frac(n, d);
      return s.includes('/') ? s : null;
    }
  }
  return null;
}

/* ---------------- 一元二次 ---------------- */

function parseQuadratic(expr: string): { a: number; b: number; c: number } | null {
  const cleaned = norm(expr);
  if (!/\^2|²/.test(cleaned)) return null;
  const terms = cleaned.replace(/-/g, '+-').split('+').filter(Boolean);
  let a = 0;
  let b = 0;
  let c = 0;
  for (const raw of terms) {
    const t = raw.trim();
    if (t.includes('x^2')) {
      const coef = t.replace(/\*?x\^2/, '');
      a += coef === '' || coef === '+' ? 1 : coef === '-' ? -1 : Number(coef);
    } else if (t.includes('x')) {
      const coef = t.replace(/\*?x/, '');
      b += coef === '' || coef === '+' ? 1 : coef === '-' ? -1 : Number(coef);
    } else {
      const v = Number(t.replace(/^\+/, ''));
      c += Number.isFinite(v) ? v : 0;
    }
  }
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || a === 0) return null;
  return { a, b, c };
}

function solveQuadratic(a: number, b: number, c: number, stage: Stage): Storyboard | null {
  const d = b * b - 4 * a * c;
  const vx = -b / (2 * a);
  const expr = (() => {
    const t = (k: number, s: string) => (k === 0 ? '' : `${k === 1 ? '' : k === -1 ? '-' : k}${s}`);
    return [t(a, 'x^2'), t(b, 'x'), c ? String(c) : ''].filter(Boolean).join('+').replace(/\+-/g, '-');
  })();
  const scenes: Scene[] = [
    {
      type: 'title',
      title: '一元二次方程',
      subtitle: `${expr} = 0`,
      narration: `这是一道一元二次方程：${speakEquation(expr)} 等于零。我们用判别式一步到位。`,
    },
    {
      type: 'formula',
      title: '先看判别式',
      math: `a = ${a}，b = ${b}，c = ${c}\nΔ = b² - 4ac = ${niceNum(d)}`,
      note: d > 0 ? 'Δ > 0，有两个不相等实根' : d === 0 ? 'Δ = 0，有两个相等实根' : 'Δ < 0，没有实数根',
      narration:
        d > 0
          ? `判别式算出来是 ${niceNum(d)}，大于零，说明抛物线和 x 轴有两个交点，也就是两个不同的实根。`
          : d === 0
            ? `判别式等于零，抛物线和 x 轴只有一个交点，两个根是重合的。`
            : `判别式小于零，抛物线和 x 轴没有交点，所以没有实数根。`,
    },
  ];

  if (d >= 0) {
    const r1 = (-b + Math.sqrt(d)) / (2 * a);
    const r2 = (-b - Math.sqrt(d)) / (2 * a);
    scenes.push({
      type: 'formula',
      title: '套求根公式',
      math: `x = (-b ± √Δ) / 2a\nx₁ = ${niceNum(r1)}${d === 0 ? '' : `，x₂ = ${niceNum(r2)}`}`,
      tip: '口诀：先算判别式，再看交点，最后套公式',
      narration:
        d === 0
          ? `套进求根公式，x 等于 ${niceNum(r1)}，这就是方程的解。`
          : `套进求根公式，x 一等于 ${niceNum(r1)}，x 二等于 ${niceNum(r2)}。`,
    });
  }

  if (stage !== 'primary') {
    const pad = Math.max(3, Math.abs(vx) * 0.9);
    scenes.push({
      type: 'graph',
      title: '图像上看：交点就是解',
      view: [vx - pad - 1, vx + pad + 1, Math.min(-1, -Math.abs(d) / (4 * Math.abs(a)) - 2), Math.max(3, Math.abs(d) / (4 * Math.abs(a)) + 3)],
      curves: [{ expr, label: `y = ${expr}`, color: '#5EE7C4' }],
      vlines: [{ x: vx, label: `对称轴 x = ${niceNum(vx)}` }],
      hlines: [{ y: 0 }],
      points:
        d >= 0
          ? [
              { x: (-b + Math.sqrt(d)) / (2 * a), y: 0, label: '交点' },
              ...(d > 0 ? [{ x: (-b - Math.sqrt(d)) / (2 * a), y: 0, label: '交点' }] : []),
            ]
          : [],
      narration:
        d >= 0
          ? '把函数图像画出来，抛物线和 x 轴的交点横坐标，正好就是刚才算出来的两个根。数和形，说的是同一件事。'
          : '画出图像就能看明白：整条抛物线都在 x 轴同一侧，一个交点都没有，所以方程无实根。',
    });
  }

  scenes.push({
    type: 'conclusion',
    title: '这类题的通法',
    math: `Δ = b² - 4ac → x = (-b ± √Δ) / 2a`,
    subtitle: '先判 Δ，再套公式，最后画图验证',
    narration: '记住这个顺序：先算判别式判断有没有根，再套求根公式，最后用图像检查一遍，基本不会错。',
  });

  return {
    question: '',
    stage,
    topic: '一元二次方程',
    answer: d < 0 ? '无实数根' : d === 0 ? `x = ${niceNum(-b / (2 * a))}` : `x₁ = ${niceNum((-b + Math.sqrt(d)) / (2 * a))}，x₂ = ${niceNum((-b - Math.sqrt(d)) / (2 * a))}`,
    scenes,
    source: 'local',
    createdAt: Date.now(),
  } as Storyboard;
}

/* ---------------- 一元一次 ---------------- */

function solveLinear(left: string, right: string, stage: Stage): Storyboard | null {
  const L = parseLinear(left);
  const R = parseLinear(right);
  if (!L || !R) return null;
  const a = L.a - R.a;
  const b = R.b - L.b;
  if (a === 0) return null;
  const x = b / a;
  const xText = frac(Math.round(x * 1e6), 1e6);
  const scenes: Scene[] = [
    {
      type: 'title',
      title: '解一元一次方程',
      subtitle: `${left} = ${right}`,
      narration: `这是一道一元一次方程：${speakEquation(left)}，等于 ${speakEquation(right)}。`,
    },
    {
      type: 'steps',
      title: '移项：把 x 挪到一边',
      steps: [
        { text: `含 x 的移到左边：(${L.a}) - (${R.a}) = ${a}`, note: '移项要变号' },
        { text: `常数移到右边：${R.b} - (${L.b}) = ${b}` },
        { text: `得到 ${a}x = ${b}` },
      ],
      note: '移项的本质是两边同时加减同一个数，等式不变',
      narration: `第一步移项。把右边的 x 项搬到左边要变号，得到 ${a} 个 x；常数搬到右边，得到 ${b}。`,
    },
    {
      type: 'formula',
      title: '系数化 1',
      math: `${a}x = ${b}\nx = ${b} / ${a} = ${xText}`,
      tip: '两边同时除以 x 的系数',
      narration: `最后两边同时除以 ${a}，x 就等于 ${xText}。`,
    },
  ];

  if (stage !== 'primary') {
    const fl = compileExpr(left);
    const fr = compileExpr(right);
    const probe = [x - 4, x - 2, x, x + 2, x + 4];
    const ys = probe.flatMap((v) => [Number(fl(v)), Number(fr(v))]).filter((v) => Number.isFinite(v));
    const ymin = Math.min(...ys, Number(fl(x)) - 1);
    const ymax = Math.max(...ys, Number(fl(x)) + 1);
    const padY = Math.max(1, (ymax - ymin) * 0.22);
    scenes.push({
      type: 'graph',
      title: '图像上看：两条直线的交点',
      view: [x - 4, x + 4, ymin - padY, ymax + padY],
      curves: [
        { expr: left, label: `y = ${left}`, color: '#5EE7C4' },
        { expr: right, label: `y = ${right}`, color: '#FFB86B' },
      ],
      points: [{ x, y: Number(fl(x)), label: `交点 (${xText}, ${niceNum(Number(fl(x)))})` }],
      narration: '把方程两边分别看成两个函数，画成两条直线。它们交点的横坐标就是方程的解，一目了然。',
    });
  }

  scenes.push({
    type: 'conclusion',
    title: '代回去验证',
    math: `x = ${xText}`,
    subtitle: '把解代回原方程，两边相等就对了',
    narration: `把 x 等于 ${xText} 代回原方程，左右两边算出来一样，说明解是对的。`,
  });

  return {
    question: '',
    stage,
    topic: '一元一次方程',
    answer: `x = ${xText}`,
    scenes,
    source: 'local',
    createdAt: Date.now(),
  } as Storyboard;
}

/* ---------------- 四则运算 ---------------- */

function tryArithmetic(q: string, stage: Stage): Storyboard | null {
  const cleaned = norm(q.replace(/[计算求值：:是]/g, ' ').replace(/[？?]/g, ''));
  const m = cleaned.match(/^[-+]?[\d.]+(?:[-+*/()][\d.]+)*$/);
  if (!m || !/[-+*/]/.test(m[0])) return null;
  const expr = m[0];
  let value: number;
  try {
    const f = compileExpr(expr);
    value = Number(f(0));
  } catch {
    return null;
  }
  if (!Number.isFinite(value)) return null;
  const pf = prettyFraction(value);
  const shown = pf || niceNum(value);
  const scenes: Scene[] = [
    {
      type: 'title',
      title: '四则混合运算',
      subtitle: expr,
      narration: `我们算 ${speakEquation(expr)}。`,
    },
    {
      type: 'steps',
      title: '按运算顺序来',
      steps: [
        { text: '先括号，再乘除，最后加减', note: '同级运算从左到右' },
        { text: `原式 = ${expr}` },
        { text: `结果 = ${shown}` },
      ],
      narration: '混合运算的顺序是：先算括号里的，再算乘除，最后算加减。同级运算从左往右。',
    },
    {
      type: 'conclusion',
      title: '答案',
      math: `${expr} = ${shown}`,
      subtitle: '先定顺序，再动笔',
      narration: `所以结果是 ${pf ? `${pf}，也就是 ${niceNum(value)}` : niceNum(value)}。记住：先看顺序，再动笔，比算得快更重要。`,
    },
  ];
  return {
    question: '',
    stage,
    topic: '四则运算',
    answer: shown,
    scenes,
    source: 'local',
    createdAt: Date.now(),
  } as Storyboard;
}

/* ---------------- 入口 ---------------- */

export function tryLocalSolve(question: string, stage: Stage): Storyboard | null {
  const raw = (question || '').trim();
  if (!raw) return null;
  const q = raw.replace(/[？?。！!]/g, '');

  // 0. 线性方程组 / 矩阵化简：走精确代数内核（有理数消元，逐步行变换）
  const exact = tryExactSolve(raw, stage);
  if (exact) return exact;

  // 1. 方程（含等号且出现 x）
  if (/=/.test(q) && /x/i.test(q)) {
    const eq = extractEquation(q);
    if (eq) {
      const quad = parseQuadratic(eq.left);
      if (quad && /^0*$/.test(norm(eq.right))) return solveQuadratic(quad.a, quad.b, quad.c, stage);
      const quadR = parseQuadratic(eq.right);
      if (quadR && /^0*$/.test(norm(eq.left))) return solveQuadratic(quadR.a, quadR.b, quadR.c, stage);
      const lin = solveLinear(eq.left, eq.right, stage);
      if (lin) return lin;
    }
  }

  // 2. 四则运算
  return tryArithmetic(q, stage);
}
