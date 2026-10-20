import type { Scene, Stage } from '../lib/types';
import {
  drawRich,
  drawMath,
  fitMathSize,
  sampleCurve,
  FONT_MATH,
  FONT_UI,
  compileExpr,
} from '../lib/math';
import {
  THEMES,
  clamp01,
  easeOut,
  easeInOut,
  backOut,
  seg,
  lerp,
  stageMeta,
  withAlpha,
  type Theme,
} from './theme';

export interface RenderOpts {
  stage: Stage;
  theme: 'night' | 'light';
  index: number;
  total: number;
  topic?: string;
  captions: boolean;
}

const PALETTE = ['#5EE7C4', '#FFC24B', '#7C9CFF', '#FF7A8A', '#8BE07A', '#FFA45C', '#B48CFF'];

/* ---------------- 基础绘图工具 ---------------- */

function roundRect(
  c: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

function pill(
  c: CanvasRenderingContext2D,
  text: string, x: number, y: number, size: number,
  bg: string, fg: string, align: 'left' | 'right' | 'center' = 'left',
) {
  c.font = `700 ${size}px ${FONT_UI}`;
  const w = c.measureText(text).width + size * 1.5;
  const h = size * 2.1;
  const px = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  c.fillStyle = bg;
  roundRect(c, px, y, w, h, h / 2);
  c.fill();
  c.fillStyle = fg;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, px + w / 2, y + h / 2 + 1);
  return w;
}

function dotGrid(c: CanvasRenderingContext2D, W: number, H: number, theme: Theme) {
  const gap = Math.round(Math.min(W, H) / 22);
  c.fillStyle = theme.grid;
  for (let x = gap; x < W; x += gap) {
    for (let y = gap; y < H; y += gap) {
      c.beginPath();
      c.arc(x, y, 1.1, 0, Math.PI * 2);
      c.fill();
    }
  }
}

/* ---------------- 时长估算 ---------------- */

export function estimateDuration(narration: string, speed = 1): number {
  const n = (narration || '').replace(/\s/g, '').length;
  return Math.max(3.2, Math.min(26, (n / 4.6 + 1.4) / Math.max(0.6, speed)));
}

/* ---------------- 主渲染 ---------------- */

export function renderScene(
  c: CanvasRenderingContext2D,
  W: number,
  H: number,
  scene: Scene,
  t: number,
  dur: number,
  o: RenderOpts,
) {
  const st = stageMeta(o.stage);
  const th = THEMES[o.theme];
  const U = Math.min(W, H);
  const p = clamp01(t / Math.max(0.1, dur));

  // 背景
  const g = c.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, th.bg);
  g.addColorStop(1, th.bg2);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);

  // 光晕
  const glow = c.createRadialGradient(W * 0.82, H * 0.1, 0, W * 0.82, H * 0.1, W * 0.75);
  glow.addColorStop(0, withAlpha(st.accent, o.theme === 'night' ? 0.16 : 0.13));
  glow.addColorStop(1, withAlpha(st.accent, 0));
  c.fillStyle = glow;
  c.fillRect(0, 0, W, H);

  const glow2 = c.createRadialGradient(W * 0.08, H * 0.95, 0, W * 0.08, H * 0.95, W * 0.6);
  glow2.addColorStop(0, withAlpha(st.accent2, o.theme === 'night' ? 0.12 : 0.1));
  glow2.addColorStop(1, withAlpha(st.accent2, 0));
  c.fillStyle = glow2;
  c.fillRect(0, 0, W, H);

  dotGrid(c, W, H, th);

  if (scene.type !== 'title') drawChrome(c, W, H, U, th, st, o, scene);

  const box = { x: W * 0.07, y: H * 0.175, w: W * 0.86, h: H * (o.captions ? 0.63 : 0.685) };

  switch (scene.type) {
    case 'title': drawTitle(c, W, H, U, th, st, scene, t, dur, o); break;
    case 'steps': drawSteps(c, box, U, th, st, scene, t, dur, p); break;
    case 'formula': drawFormula(c, box, U, th, st, scene, t, p); break;
    case 'matrix': drawMatrix(c, box, U, th, st, scene, t, dur); break;
    case 'graph': drawGraph(c, box, U, th, st, scene, t, p); break;
    case 'numberline': drawNumberLine(c, box, U, th, st, scene, t, p); break;
    case 'geometry': drawGeometry(c, box, U, th, st, scene, t, p); break;
    case 'pie': drawPie(c, box, U, th, st, scene, t, p); break;
    case 'objects': drawObjects(c, box, U, th, st, scene, t, p); break;
    case 'compare': drawCompare(c, box, U, th, st, scene, t, p); break;
    case 'conclusion': drawConclusion(c, box, U, th, st, scene, t, p); break;
    default: break;
  }

  if (o.captions && scene.narration) drawSubtitle(c, W, H, U, th, scene.narration, t);

  // 底部进度
  const barH = Math.max(3, U * 0.006);
  c.fillStyle = withAlpha(th.text, 0.1);
  c.fillRect(0, H - barH, W, barH);
  c.fillStyle = st.accent;
  c.fillRect(0, H - barH, W * p, barH);
}

/* ---------------- 顶部信息条 ---------------- */

function drawChrome(
  c: CanvasRenderingContext2D,
  W: number, H: number, U: number, th: Theme,
  st: ReturnType<typeof stageMeta>, o: RenderOpts, scene: Scene,
) {
  c.save();
  const size = Math.max(12, U * 0.021);
  const y = H * 0.045;
  pill(c, `${st.emoji} ${st.label}`, W * 0.07, y, size, withAlpha(st.accent, 0.18), st.accent);
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  c.fillStyle = th.muted;
  c.font = `600 ${size}px ${FONT_UI}`;
  const label = (o.topic || '').slice(0, 26);
  if (label) c.fillText(label, W * 0.93, y + size * 1.05);
  c.restore();
}

/* ---------------- 标题页 ---------------- */

function drawTitle(
  c: CanvasRenderingContext2D, W: number, H: number, U: number, th: Theme,
  st: ReturnType<typeof stageMeta>, scene: Scene, t: number, dur: number, o: RenderOpts,
) {
  // 漂浮符号
  const syms = o.stage === 'primary'
    ? ['🍎', '⭐', '🧩', '🍰', '➕']
    : ['∑', 'π', '√', '∫', '△', 'θ'];
  c.save();
  for (let i = 0; i < 6; i++) {
    const a = 0.05 + 0.03 * ((i % 3) + 1);
    const x = W * (0.1 + 0.16 * i) + Math.sin(t * 0.35 + i) * 14;
    const y = H * (0.68 + 0.1 * Math.cos(t * 0.3 + i * 1.7)) - i * 6;
    c.globalAlpha = a;
    c.fillStyle = th.text;
    c.font = `600 ${U * (0.07 + 0.03 * (i % 3))}px ${FONT_MATH}`;
    c.fillText(syms[i % syms.length], x, y);
  }
  c.restore();

  const inA = easeOut(seg(t, 0.05, 0.7));
  const badgeA = easeOut(seg(t, 0, 0.45));

  // 大 emoji
  c.save();
  c.globalAlpha = badgeA;
  const es = U * 0.15;
  c.font = `${es}px ${FONT_UI}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const bob = Math.sin(t * 1.6) * U * 0.008;
  c.fillText(st.emoji, W / 2, H * 0.29 + bob - (1 - badgeA) * U * 0.04);
  c.restore();

  const size = Math.min(U * 0.105, W * 0.115);
  const maxW = W * 0.82;
  c.save();
  c.globalAlpha = inA;
  c.translate(0, (1 - inA) * U * 0.05);
  drawRich(c, scene.title || scene.math || ' ', {
    x: W * 0.09, y: H * 0.4, maxW, size, color: th.text, accent: st.accent,
    align: 'center', lineHeight: size * 1.28, weight: 800,
  });
  c.restore();

  if (scene.subtitle) {
    const sa = easeOut(seg(t, 0.35, 0.95));
    c.save();
    c.globalAlpha = sa * 0.95;
    drawRich(c, scene.subtitle, {
      x: W * 0.12, y: H * 0.4 + size * 2.0, maxW: W * 0.76,
      size: U * 0.038, color: st.accent, align: 'center', weight: 600,
    });
    c.restore();
  }

  const lineW = W * 0.16 * easeOut(seg(t, 0.4, 1));
  c.fillStyle = withAlpha(st.accent, 0.8);
  roundRect(c, W / 2 - lineW / 2, H * 0.36, lineW, Math.max(3, U * 0.006), 99);
  c.fill();
}

/* ---------------- 步骤页 ---------------- */

function drawSteps(
  c: CanvasRenderingContext2D, box: any, U: number, th: Theme,
  st: ReturnType<typeof stageMeta>, scene: Scene, t: number, dur: number, p: number,
) {
  let top = box.y;
  if (scene.title) {
    drawRich(c, scene.title, {
      x: box.x, y: top, maxW: box.w, size: U * 0.05, color: th.text,
      accent: st.accent, weight: 800, maxLines: 1,
    });
    top += U * 0.085;
  }
  const steps = scene.steps ?? [];
  const n = Math.max(1, steps.length);
  const avail = box.y + box.h - top - (scene.note ? U * 0.1 : 0);
  const rowH = Math.min(U * 0.17, avail / n);
  const hasMath = steps.some((s) => !!s.math);
  const bodySize = Math.min(U * 0.042, rowH * (hasMath ? 0.23 : 0.27));
  const mathSize = Math.min(U * 0.048, rowH * (hasMath && steps.some((s) => s.note) ? 0.24 : 0.3));

  steps.forEach((s, i) => {
    const at = 0.3 + (i / n) * dur * 0.42;
    const a = easeOut(seg(t, at, at + 0.55));
    if (a <= 0.001) return;
    const y = top + i * rowH;
    const active = t >= at && t < at + 2.4;
    const badgeR = Math.min(U * 0.026, rowH * 0.18);

    c.save();
    c.globalAlpha = a;
    c.translate((1 - a) * U * 0.03, 0);

    // 左侧竖条
    if (active) {
      const bh = rowH * 0.62;
      c.fillStyle = withAlpha(st.accent, 0.75);
      roundRect(c, box.x - U * 0.022, y + rowH * 0.06, Math.max(3, U * 0.006), bh, 99);
      c.fill();
    }

    // 序号圆
    const cxp = box.x + badgeR;
    const cyp = y + rowH * 0.13 + badgeR;
    c.fillStyle = i === steps.length - 1 ? withAlpha(st.accent, 0.9) : withAlpha(st.accent, 0.16);
    c.beginPath();
    c.arc(cxp, cyp, badgeR, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = i === steps.length - 1 ? '#0B1020' : st.accent;
    c.font = `800 ${badgeR * 1.05}px ${FONT_UI}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(i + 1), cxp, cyp + 1);

    const tx = cxp + badgeR + U * 0.022;
    const tw = box.w - (tx - box.x) - U * 0.02;
    const textH = s.math ? rowH * 0.42 : rowH * 0.5;
    drawRich(c, s.text, {
      x: tx, y: y + rowH * 0.08, maxW: tw, size: bodySize, color: th.text,
      accent: st.accent, weight: 600, lineHeight: bodySize * 1.35, maxLines: s.math ? 1 : 2,
    });
    // 具体算式：这是"不许跳步"的落地——每一步都要能看到式子本身
    if (s.math) {
      const mSize = Math.min(mathSize, tw / Math.max(4, s.math.length) * 2.05);
      drawMath(
        c, s.math,
        { x: tx, y: y + rowH * 0.08 + textH * 0.92, w: tw },
        mSize, st.accent,
      );
      if (s.note) {
        drawRich(c, s.note, {
          x: tx, y: y + rowH * 0.08 + textH * 0.92 + mSize * 1.55, maxW: tw,
          size: bodySize * 0.66, color: th.muted, weight: 400, maxLines: 1,
        });
      }
    } else if (s.note) {
      drawRich(c, s.note, {
        x: tx, y: y + rowH * 0.1 + bodySize * 1.45, maxW: tw,
        size: bodySize * 0.72, color: th.muted, weight: 400, maxLines: 1,
      });
    }
    c.restore();
  });

  if (scene.note) {
    const a = easeOut(seg(t, 0.55 * dur, 0.55 * dur + 0.6));
    c.save();
    c.globalAlpha = a;
    const ny = box.y + box.h - U * 0.06;
    c.fillStyle = withAlpha(st.accent, 0.1);
    roundRect(c, box.x, ny - U * 0.012, box.w, U * 0.062, U * 0.014);
    c.fill();
    drawRich(c, scene.note, {
      x: box.x + U * 0.025, y: ny + U * 0.004, maxW: box.w - U * 0.05,
      size: U * 0.03, color: st.accent, weight: 600, maxLines: 1,
    });
    c.restore();
  }
}

/* ---------------- 矩阵 / 行变换页 ---------------- */

/**
 * 增广矩阵的初等行变换动画。
 * 每一帧 = 一次行变换后的矩阵，帧与帧之间标出"第2行 − 3×第1行"这样的操作说明。
 * 这是"计算过程必须列出来"最硬核的一屏：数字变化全程可见。
 */
function drawMatrix(
  c: CanvasRenderingContext2D, box: any, U: number, th: Theme,
  st: ReturnType<typeof stageMeta>, scene: Scene, t: number, dur: number,
) {
  let top = box.y;
  if (scene.title) {
    drawRich(c, scene.title, {
      x: box.x, y: top, maxW: box.w, size: U * 0.047, color: th.text,
      accent: st.accent, weight: 800, maxLines: 1,
    });
    top += U * 0.075;
  }
  const frames = (scene.mats || []).filter((f) => f && Array.isArray(f.rows) && f.rows.length);
  if (!frames.length) return;

  const noteH = scene.note ? U * 0.095 : 0;
  const availH = box.y + box.h - top - noteH;
  const rowsMax = Math.max(...frames.map((f) => f.rows.length));
  const colsMax = Math.max(...frames.map((f) => Math.max(...f.rows.map((r) => r.length))));
  const n = frames.length;
  const gap = n > 1 ? Math.min(U * 0.05, availH * 0.055) : 0;
  const labelH = frames.some((f) => f.op) ? U * 0.036 : 0;
  const cellH = Math.max(
    U * 0.018,
    Math.min(U * 0.072, (availH - gap * (n - 1) - labelH * n) / (rowsMax * n)),
  );
  const cellW = Math.min(U * 0.18, (box.w * 0.9) / Math.max(1, colsMax));
  const matW = colsMax * cellW;
  const matH = rowsMax * cellH;

  let y = top + Math.max(0, (availH - (labelH * n + matH * n + gap * (n - 1))) / 2);

  frames.forEach((f, i) => {
    const at = 0.18 + (n === 1 ? 0 : (i / Math.max(1, n - 1)) * dur * 0.46);
    const a = easeOut(seg(t, at, at + 0.5));
    const x0 = box.x + (box.w - matW) / 2;

    if (f.op) {
      c.save();
      c.globalAlpha = a;
      c.font = `700 ${U * 0.026}px ${FONT_UI}`;
      c.fillStyle = withAlpha(st.accent, 0.9);
      c.textAlign = 'center';
      c.textBaseline = 'top';
      c.fillText(f.op, box.x + box.w / 2, y);
      c.restore();
    }
    const my = y + labelH;

    c.save();
    c.globalAlpha = a * (i === n - 1 ? 1 : 0.72);
    c.translate((1 - a) * U * 0.02, 0);

    // 高亮行
    if (f.hi && f.hi >= 1 && f.hi <= rowsMax) {
      c.fillStyle = withAlpha(st.accent, 0.16);
      roundRect(c, x0 - U * 0.014, my + (f.hi - 1) * cellH, matW + U * 0.028, cellH, U * 0.008);
      c.fill();
    }

    // 括号
    const bx = x0 - U * 0.016;
    const rx = x0 + matW + U * 0.016;
    const tick = U * 0.011;
    c.strokeStyle = withAlpha(th.text, 0.55);
    c.lineWidth = Math.max(1.4, U * 0.0022);
    c.beginPath();
    c.moveTo(bx + tick, my - U * 0.006);
    c.lineTo(bx, my - U * 0.006);
    c.lineTo(bx, my + matH + U * 0.006);
    c.lineTo(bx + tick, my + matH + U * 0.006);
    c.stroke();
    c.beginPath();
    c.moveTo(rx - tick, my - U * 0.006);
    c.lineTo(rx, my - U * 0.006);
    c.lineTo(rx, my + matH + U * 0.006);
    c.lineTo(rx - tick, my + matH + U * 0.006);
    c.stroke();

    // 增广竖线
    if (f.aug && f.aug > 0 && f.aug < colsMax) {
      const ax = x0 + (colsMax - f.aug) * cellW;
      c.strokeStyle = withAlpha(st.accent2, 0.75);
      c.lineWidth = Math.max(1, U * 0.0018);
      c.setLineDash([U * 0.008, U * 0.008]);
      c.beginPath();
      c.moveTo(ax, my - U * 0.004);
      c.lineTo(ax, my + matH + U * 0.004);
      c.stroke();
      c.setLineDash([]);
    }

    // 单元格
    const maxLen = Math.max(...f.rows.flat().map((s) => String(s).length), 1);
    const fs = Math.min(U * 0.058, cellH * 0.6, ((cellW * 0.92) / Math.max(1, maxLen)) * 1.7);
    c.fillStyle = th.text;
    c.font = `600 ${fs}px ${FONT_MATH}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    f.rows.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        const zero = String(cell) === '0';
        c.fillStyle = zero ? withAlpha(th.text, 0.42) : th.text;
        c.fillText(String(cell), x0 + ci * cellW + cellW / 2, my + ri * cellH + cellH / 2);
      });
    });
    c.restore();

    y = my + matH + gap;
  });

  if (scene.note) {
    const a = easeOut(seg(t, dur * 0.55, dur * 0.55 + 0.6));
    c.save();
    c.globalAlpha = a;
    const ny = box.y + box.h - U * 0.06;
    c.fillStyle = withAlpha(st.accent, 0.1);
    roundRect(c, box.x, ny - U * 0.012, box.w, U * 0.062, U * 0.014);
    c.fill();
    drawRich(c, scene.note, {
      x: box.x + U * 0.025, y: ny + U * 0.004, maxW: box.w - U * 0.05,
      size: U * 0.029, color: st.accent, weight: 600, maxLines: 1,
    });
    c.restore();
  }
}

/* ---------------- 公式页 ---------------- */

function drawFormula(
  c: CanvasRenderingContext2D, box: any, U: number, th: Theme,
  st: ReturnType<typeof stageMeta>, scene: Scene, t: number, p: number,
) {
  let top = box.y + U * 0.02;
  if (scene.title) {
    drawRich(c, scene.title, {
      x: box.x, y: top, maxW: box.w, size: U * 0.042, color: th.muted, weight: 700,
    });
    top += U * 0.1;
  }
  const mathText = scene.math || '';
  const mathLines = mathText ? mathText.split('\n') : [' '];
  const cardsH = (scene.note ? U * 0.17 : 0) + (scene.tip ? U * 0.1 : 0);
  const availH = box.y + box.h - top - cardsH - U * 0.06;
  let size = fitMathSize(c, mathText.replace(/\n/g, ' '), box.w - U * 0.05, Math.min(U * 0.155, availH * 0.62), U * 0.04);
  const lineH = size * 1.35;
  // 保证多行公式连同卡片一起放得下
  size = Math.min(size, (availH * 0.94) / (mathLines.length * 1.35 + 0.9));
  const cardH = Math.min(availH, mathLines.length * size * 1.35 + size * 0.95);
  const cy = top + Math.max(0, (availH - cardH) / 2);
  const a = easeOut(seg(t, 0.05, 0.6));
  c.save();
  c.globalAlpha = a;
  c.fillStyle = th.panel;
  roundRect(c, box.x, cy, box.w, cardH, U * 0.028);
  c.fill();
  c.strokeStyle = withAlpha(st.accent, 0.35);
  c.lineWidth = 1.5;
  c.stroke();

  // 呼吸光
  const pulse = 0.5 + 0.5 * Math.sin(t * 2);
  c.fillStyle = withAlpha(st.accent, 0.07 + 0.05 * pulse);
  roundRect(c, box.x, cy, box.w, cardH, U * 0.028);
  c.fill();
  c.restore();

  c.save();
  c.globalAlpha = a;
  c.translate(0, (1 - a) * U * 0.03);
  const innerH = mathLines.length * size * 1.35;
  drawMath(
    c, mathText,
    { x: box.x + U * 0.03, y: cy + Math.max(size * 0.3, (cardH - innerH) / 2), w: box.w - U * 0.06 },
    size, th.text,
  );
  c.restore();

  // 下划线生长
  const lw = (box.w * 0.42) * easeOut(seg(t, 0.45, 1));
  c.fillStyle = withAlpha(st.accent, 0.85);
  roundRect(c, box.x + box.w / 2 - lw / 2, cy + cardH - U * 0.028, lw, Math.max(3, U * 0.006), 99);
  c.fill();

  let by = cy + cardH + U * 0.035;
  if (scene.note) {
    const na = easeOut(seg(t, 0.5, 1.05));
    c.save();
    c.globalAlpha = na;
    drawRich(c, scene.note, {
      x: box.x + U * 0.01, y: by, maxW: box.w - U * 0.02, size: U * 0.036,
      color: th.text, accent: st.accent, weight: 500, lineHeight: U * 0.056, maxLines: 3,
    });
    c.restore();
    by += U * 0.16;
  }
  if (scene.tip) {
    const ta = easeOut(seg(t, 0.65, 1.1));
    c.save();
    c.globalAlpha = ta;
    c.fillStyle = withAlpha(st.accent, 0.14);
    roundRect(c, box.x, by, box.w, U * 0.072, U * 0.016);
    c.fill();
    drawRich(c, `💡 ${scene.tip}`, {
      x: box.x + U * 0.024, y: by + U * 0.015, maxW: box.w - U * 0.05,
      size: U * 0.03, color: st.accent, weight: 600, maxLines: 1,
    });
    c.restore();
  }
}

/* ---------------- 函数图像 ---------------- */

function niceStep(range: number, target = 6) {
  const raw = range / target;
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) return m * pow;
  return 10 * pow;
}

function fmt(n: number) {
  if (Math.abs(n) < 1e-9) return '0';
  const r = Math.round(n * 100) / 100;
  return String(r);
}

function drawGraph(
  c: CanvasRenderingContext2D, box: any, U: number, th: Theme,
  st: ReturnType<typeof stageMeta>, scene: Scene, t: number, p: number,
) {
  let top = box.y;
  if (scene.title) {
    drawRich(c, scene.title, {
      x: box.x, y: top, maxW: box.w, size: U * 0.045, color: th.text,
      accent: st.accent, weight: 800, maxLines: 1,
    });
    top += U * 0.075;
  }
  const plotX0 = box.x + U * 0.055;
  const plotW0 = box.w - U * 0.1;
  const plotY0 = top + U * 0.01;
  const plotH0 = box.y + box.h - plotY0 - U * 0.045;

  const view = scene.view ?? [-5, 5, -4, 6];
  const [x0, x1, y0, y1] = view;
  // 等比例坐标：横纵范围相同时保持圆形是圆形
  let plotX = plotX0;
  let plotW = plotW0;
  let plotY = plotY0;
  let plotH = plotH0;
  if (Math.abs(x1 - x0 - (y1 - y0)) < 1e-9) {
    const s = Math.min(plotW0 / (x1 - x0), plotH0 / (y1 - y0));
    plotW = (x1 - x0) * s;
    plotH = (y1 - y0) * s;
    plotX = plotX0 + (plotW0 - plotW) / 2;
    plotY = plotY0 + (plotH0 - plotH) / 2;
  }
  const GX = (x: number) => plotX + ((x - x0) / (x1 - x0)) * plotW;
  const GY = (y: number) => plotY + plotH - ((y - y0) / (y1 - y0)) * plotH;

  // 网格
  const stepX = niceStep(x1 - x0);
  const stepY = niceStep(y1 - y0);
  c.save();
  c.strokeStyle = th.grid;
  c.lineWidth = 1;
  for (let x = Math.ceil(x0 / stepX) * stepX; x <= x1 + 1e-9; x += stepX) {
    c.beginPath(); c.moveTo(GX(x), plotY); c.lineTo(GX(x), plotY + plotH); c.stroke();
  }
  for (let y = Math.ceil(y0 / stepY) * stepY; y <= y1 + 1e-9; y += stepY) {
    c.beginPath(); c.moveTo(plotX, GY(y)); c.lineTo(plotX + plotW, GY(y)); c.stroke();
  }
  c.restore();

  // 坐标轴
  const axY = GY(0) >= plotY - 2 && GY(0) <= plotY + plotH + 2 ? GY(0) : plotY + plotH;
  const axX = GX(0) >= plotX - 2 && GX(0) <= plotX + plotW + 2 ? GX(0) : plotX;
  c.save();
  c.strokeStyle = th.axis;
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(plotX, axY); c.lineTo(plotX + plotW, axY); c.stroke();
  c.beginPath(); c.moveTo(axX, plotY); c.lineTo(axX, plotY + plotH); c.stroke();
  // 箭头
  c.fillStyle = th.axis;
  const ah = Math.max(6, U * 0.011);
  c.beginPath();
  c.moveTo(plotX + plotW, axY); c.lineTo(plotX + plotW - ah * 1.6, axY - ah * 0.7);
  c.lineTo(plotX + plotW - ah * 1.6, axY + ah * 0.7); c.closePath(); c.fill();
  c.beginPath();
  c.moveTo(axX, plotY); c.lineTo(axX - ah * 0.7, plotY + ah * 1.6);
  c.lineTo(axX + ah * 0.7, plotY + ah * 1.6); c.closePath(); c.fill();

  // 刻度
  const tickSize = Math.max(10, U * 0.019);
  c.fillStyle = th.muted;
  c.font = `500 ${tickSize}px ${FONT_UI}`;
  c.textAlign = 'center';
  c.textBaseline = 'top';
  for (let x = Math.ceil(x0 / stepX) * stepX; x <= x1 + 1e-9; x += stepX) {
    if (Math.abs(x) < 1e-9) continue;
    c.fillText(fmt(x), GX(x), axY + tickSize * 0.45);
  }
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  for (let y = Math.ceil(y0 / stepY) * stepY; y <= y1 + 1e-9; y += stepY) {
    if (Math.abs(y) < 1e-9) continue;
    c.fillText(fmt(y), axX - tickSize * 0.5, GY(y));
  }
  c.fillStyle = th.muted;
  c.font = `italic 600 ${tickSize * 1.1}px ${FONT_MATH}`;
  c.textAlign = 'left';
  c.fillText('x', plotX + plotW + tickSize * 0.4, axY);
  c.textAlign = 'center';
  c.fillText('y', axX, plotY - tickSize * 0.5);
  c.restore();

  const drawFrac = easeOut(seg(t, 0.12, 0.8));

  // 区域
  if (scene.area) {
    const f = compileExpr(scene.area.expr);
    const { from, to } = scene.area;
    const aFrom = from;
    const aTo = lerp(from, to, drawFrac);
    c.save();
    c.beginPath();
    c.moveTo(GX(aFrom), GY(0));
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const x = aFrom + ((aTo - aFrom) * i) / N;
      const y = f(x);
      c.lineTo(GX(x), GY(y === null ? 0 : (y as number)));
    }
    c.lineTo(GX(aTo), GY(0));
    c.closePath();
    c.fillStyle = withAlpha(scene.area.color || st.accent, 0.22);
    c.fill();
    c.restore();
  }

  // 曲线
  (scene.curves ?? []).forEach((cv, i) => {
    const color = cv.color || PALETTE[i % PALETTE.length];
    const pts = sampleCurve(cv.expr, x0, x1, 500);
    const cut = Math.floor(pts.length * Math.min(1, drawFrac * 1.05));
    c.save();
    c.strokeStyle = color;
    c.lineWidth = Math.max(2.5, U * 0.0055);
    c.lineJoin = 'round';
    c.shadowColor = withAlpha(color, 0.5);
    c.shadowBlur = 12;
    c.setLineDash(cv.dashed ? [Math.max(6, U * 0.012), Math.max(5, U * 0.01)] : []);
    c.beginPath();
    let started = false;
    for (let k = 0; k < cut; k++) {
      const pt = pts[k];
      if (!Number.isFinite(pt.y)) { started = false; continue; }
      const px = GX(pt.x);
      const py = GY(pt.y);
      if (py < plotY - plotH || py > plotY + plotH * 2) { started = false; continue; }
      if (!started) { c.moveTo(px, py); started = true; }
      else c.lineTo(px, py);
    }
    c.stroke();
    c.restore();

    if (cv.label) {
      const idx = Math.min(cut - 1, pts.length - 1);
      let lp: { x: number; y: number } | null = null;
      for (let k = idx; k >= 0; k--) if (Number.isFinite(pts[k].y)) { lp = pts[k]; break; }
      if (lp && drawFrac > 0.5) {
        const a = easeOut(seg(t, 0.5, 0.9));
        c.save();
        c.globalAlpha = a;
        c.font = `700 ${Math.max(12, U * 0.024)}px ${FONT_UI}`;
        const tw = c.measureText(cv.label).width;
        const lx = Math.min(GX(lp.x) + 10, plotX + plotW - tw - 6);
        const ly = Math.max(plotY + 4, GY(lp.y) - U * 0.03);
        c.fillStyle = withAlpha(th.bg, 0.75);
        roundRect(c, lx - 5, ly - 2, tw + 10, U * 0.032, 6);
        c.fill();
        c.fillStyle = color;
        c.textAlign = 'left';
        c.textBaseline = 'top';
        c.fillText(cv.label, lx, ly);
        c.restore();
      }
    }
  });

  // 辅助竖线
  (scene.vlines ?? []).forEach((v, i) => {
    const a = easeOut(seg(t, 0.45 + i * 0.15, 0.85 + i * 0.15));
    if (a <= 0) return;
    const color = v.color || st.accent2;
    const xpos = GX(v.x);
    c.save();
    c.strokeStyle = color;
    c.lineWidth = 2;
    c.setLineDash([7, 7]);
    c.globalAlpha = 0.85;
    c.beginPath();
    c.moveTo(xpos, plotY + plotH);
    c.lineTo(xpos, plotY + plotH - (plotY + plotH - plotY) * a);
    c.stroke();
    c.restore();
    if (v.label && a > 0.6) {
      c.save();
      c.globalAlpha = (a - 0.6) / 0.4;
      pill(c, v.label, Math.min(xpos + 8, plotX + plotW - 10), plotY + 6, Math.max(11, U * 0.021), withAlpha(color, 0.9), '#0B1020');
      c.restore();
    }
  });

  // 辅助横线
  (scene.hlines ?? []).forEach((h, i) => {
    const a = easeOut(seg(t, 0.5 + i * 0.12, 0.9 + i * 0.12));
    if (a <= 0) return;
    const color = h.color || st.accent2;
    const ypos = GY(h.y);
    c.save();
    c.strokeStyle = color;
    c.lineWidth = 2;
    c.setLineDash([7, 7]);
    c.globalAlpha = 0.8;
    c.beginPath();
    c.moveTo(plotX, ypos);
    c.lineTo(plotX + plotW * a, ypos);
    c.stroke();
    c.restore();
    if (h.label) {
      c.save();
      c.globalAlpha = a;
      pill(c, h.label, plotX + plotW - 6, ypos - Math.max(24, U * 0.045), Math.max(11, U * 0.021), withAlpha(color, 0.9), '#0B1020', 'right');
      c.restore();
    }
  });

  // 关键点
  (scene.points ?? []).forEach((pt, i) => {
    const a = easeOut(seg(t, 0.55 + i * 0.12, 0.95 + i * 0.12));
    if (a <= 0) return;
    const color = pt.color || st.accent;
    const px = GX(pt.x);
    const py = GY(pt.y);
    c.save();
    c.globalAlpha = a;
    const r = Math.max(4, U * 0.0085) * backOut(a);
    const halo = 0.5 + 0.5 * Math.sin(t * 3 + i);
    c.fillStyle = withAlpha(color, 0.22 * halo);
    c.beginPath(); c.arc(px, py, r * 2.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = color;
    c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = th.bg;
    c.lineWidth = 2;
    c.stroke();
    if (pt.label) {
      const fs = Math.max(12, U * 0.026);
      c.font = `700 ${fs}px ${FONT_MATH}`;
      const tw = c.measureText(pt.label).width;
      const lx = Math.min(px + r + 8, plotX + plotW - tw - 12);
      const ly = py - r - fs * 1.9;
      c.fillStyle = withAlpha(th.bg, 0.82);
      roundRect(c, lx - 7, ly - 4, tw + 14, fs * 1.5, 7);
      c.fill();
      c.fillStyle = color;
      c.textAlign = 'left';
      c.textBaseline = 'top';
      c.fillText(pt.label, lx, ly);
    }
    c.restore();
  });
}

/* ---------------- 数轴 ---------------- */

function drawNumberLine(
  c: CanvasRenderingContext2D, box: any, U: number, th: Theme,
  st: ReturnType<typeof stageMeta>, scene: Scene, t: number, p: number,
) {
  let top = box.y;
  if (scene.title) {
    drawRich(c, scene.title, {
      x: box.x, y: top, maxW: box.w, size: U * 0.045, color: th.text,
      accent: st.accent, weight: 800, maxLines: 1,
    });
    top += U * 0.08;
  }
  const min = scene.min ?? 0;
  const max = scene.max ?? 1;
  const yLine = top + (box.y + box.h - top) * 0.62;
  const xA = box.x + U * 0.04;
  const xB = box.x + box.w - U * 0.04;
  const PX = (v: number) => xA + ((v - min) / (max - min)) * (xB - xA);
  const step = niceStep(max - min, 10);

  // 区间
  if (scene.range) {
    const a = easeOut(seg(t, 0.15, 0.65));
    const r1 = PX(scene.range.from);
    const r2 = lerp(PX(scene.range.from), PX(scene.range.to), a);
    c.save();
    c.fillStyle = withAlpha(scene.range.color || st.accent, 0.22);
    roundRect(c, Math.min(r1, r2), yLine - U * 0.016, Math.abs(r2 - r1), U * 0.032, U * 0.016);
    c.fill();
    c.restore();
    if (scene.range.label) {
      c.save();
      c.globalAlpha = a;
      pill(c, scene.range.label, (r1 + r2) / 2, yLine - U * 0.085, Math.max(11, U * 0.022), withAlpha(st.accent, 0.16), st.accent, 'center');
      c.restore();
    }
  }

  // 轴线
  const la = easeOut(seg(t, 0.02, 0.35));
  c.save();
  c.strokeStyle = th.axis;
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(xA, yLine);
  c.lineTo(xA + (xB - xA) * la, yLine);
  c.stroke();
  c.fillStyle = th.axis;
  const ah = Math.max(6, U * 0.012);
  if (la > 0.98) {
    c.beginPath();
    c.moveTo(xB, yLine); c.lineTo(xB - ah * 1.6, yLine - ah * 0.7);
    c.lineTo(xB - ah * 1.6, yLine + ah * 0.7); c.closePath(); c.fill();
  }
  c.restore();

  // 刻度
  const tickSize = Math.max(11, U * 0.021);
  c.save();
  c.globalAlpha = la;
  c.strokeStyle = withAlpha(th.text, 0.35);
  c.lineWidth = 1.5;
  c.fillStyle = th.muted;
  c.font = `500 ${tickSize}px ${FONT_UI}`;
  c.textAlign = 'center';
  c.textBaseline = 'top';
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    const x = PX(v);
    c.beginPath(); c.moveTo(x, yLine - U * 0.009); c.lineTo(x, yLine + U * 0.009); c.stroke();
    c.fillText(fmt(v), x, yLine + U * 0.018);
  }
  c.restore();

  // 标记点
  (scene.marks ?? []).forEach((m, i) => {
    const at = 0.3 + i * 0.18;
    const a = easeOut(seg(t, at, at + 0.5));
    if (a <= 0) return;
    const color = m.color || PALETTE[i % PALETTE.length];
    const x = PX(m.value);
    const above = m.above !== false;
    c.save();
    c.globalAlpha = a;
    const r = Math.max(5, U * 0.011) * backOut(a);
    c.fillStyle = color;
    c.beginPath(); c.arc(x, yLine, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = th.bg;
    c.lineWidth = 2.5;
    c.stroke();
    if (m.label) {
      const ly = above ? yLine - U * 0.075 : yLine + U * 0.06;
      c.globalAlpha = a;
      pill(c, m.label, x, ly, Math.max(12, U * 0.024), withAlpha(color, 0.9), '#0B1020', 'center');
      c.strokeStyle = withAlpha(color, 0.6);
      c.lineWidth = 1.5;
      c.setLineDash([4, 4]);
      c.beginPath();
      c.moveTo(x, above ? yLine - U * 0.012 : yLine + U * 0.012);
      c.lineTo(x, above ? ly + U * 0.05 : ly);
      c.stroke();
    }
    c.restore();
  });
}

/* ---------------- 几何 ---------------- */

function drawGeometry(
  c: CanvasRenderingContext2D, box: any, U: number, th: Theme,
  st: ReturnType<typeof stageMeta>, scene: Scene, t: number, p: number,
) {
  let top = box.y;
  if (scene.title) {
    drawRich(c, scene.title, {
      x: box.x, y: top, maxW: box.w, size: U * 0.045, color: th.text,
      accent: st.accent, weight: 800, maxLines: 1,
    });
    top += U * 0.075;
  }
  const noteH = scene.note ? U * 0.1 : 0;
  const areaH = box.y + box.h - top - noteH;
  const side = Math.min(areaH, box.w * 0.62);
  const ox = box.x + (box.w - side) / 2;
  const oy = top + (areaH - side) / 2;
  const X = (v: number) => ox + (v / 100) * side;
  const Y = (v: number) => oy + (v / 100) * side;

  const pts = scene.pts ?? [];
  const segs = scene.segs ?? [];
  const map: Record<string, { x: number; y: number }> = {};
  pts.forEach((pt) => { map[pt.id] = { x: X(pt.x), y: Y(pt.y) }; });

  // 底图参考网格
  c.save();
  c.globalAlpha = 0.35;
  c.strokeStyle = th.grid;
  c.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    c.beginPath(); c.moveTo(ox + (side * i) / 10, oy); c.lineTo(ox + (side * i) / 10, oy + side); c.stroke();
    c.beginPath(); c.moveTo(ox, oy + (side * i) / 10); c.lineTo(ox + side, oy + (side * i) / 10); c.stroke();
  }
  c.restore();

  const strokeSeg = (
    a: string, b: string, color: string, dashed: boolean,
    progress: number, label?: string, alpha = 1,
  ) => {
    const p1 = map[a];
    const p2 = map[b];
    if (!p1 || !p2) return;
    const e = easeInOut(progress);
    c.save();
    c.globalAlpha = alpha;
    c.strokeStyle = color;
    c.lineWidth = Math.max(2, U * 0.0045);
    c.lineCap = 'round';
    if (dashed) c.setLineDash([Math.max(6, U * 0.012), Math.max(6, U * 0.01)]);
    c.beginPath();
    c.moveTo(p1.x, p1.y);
    c.lineTo(lerp(p1.x, p2.x, e), lerp(p1.y, p2.y, e));
    c.stroke();
    c.setLineDash([]);
    if (label && e > 0.55) {
      const fs = Math.max(13, U * 0.028);
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      c.font = `700 ${fs}px ${FONT_MATH}`;
      const tw = c.measureText(label).width;
      c.fillStyle = withAlpha(th.bg, 0.8);
      roundRect(c, mx - tw / 2 - 6, my - fs * 0.75, tw + 12, fs * 1.5, 6);
      c.fill();
      c.fillStyle = color;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(label, mx, my);
    }
    c.restore();
  };

  // 线段（按 delay 依次生长）
  segs.forEach((s, i) => {
    const base = s.delay ?? 0.15 + i * 0.12;
    const pr = seg(t, 0.15 + base, 0.15 + base + 0.75);
    strokeSeg(s.a, s.b, s.color || (s.dashed ? st.accent2 : withAlpha(th.text, 0.85)), !!s.dashed, pr, s.label);
  });

  // 角度
  (scene.angles ?? []).forEach((ang, i) => {
    const at = map[ang.at], pf = map[ang.from], pt2 = map[ang.to];
    if (!at || !pf || !pt2) return;
    const a = easeOut(seg(t, 0.7 + i * 0.15, 1.1 + i * 0.15));
    if (a <= 0) return;
    const a1 = Math.atan2(pf.y - at.y, pf.x - at.x);
    const a2 = Math.atan2(pt2.y - at.y, pt2.x - at.x);
    const r = Math.min(side * 0.14, U * 0.09);
    c.save();
    c.globalAlpha = a;
    c.strokeStyle = st.accent2;
    c.lineWidth = 2;
    let d = a2 - a1;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    c.beginPath();
    c.arc(at.x, at.y, r, a1, a1 + d * a, d < 0);
    c.stroke();
    if (ang.label) {
      const mid = a1 + (d * a) / 2;
      const fs = Math.max(13, U * 0.026);
      c.fillStyle = st.accent2;
      c.font = `700 ${fs}px ${FONT_MATH}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(ang.label, at.x + Math.cos(mid) * (r + fs), at.y + Math.sin(mid) * (r + fs));
    }
    c.restore();
  });

  // 变换幽灵图
  if (scene.ghost && (scene.ghost.rotate || scene.ghost.flip)) {
    const a = easeInOut(seg(t, 0.9, 2.4));
    const rot = scene.ghost.rotate;
    const flip = scene.ghost.flip;
    const pivot = rot ? map[rot.center] : null;
    c.save();
    c.globalAlpha = 0.55 + 0.25 * Math.sin(t * 2);
    c.strokeStyle = st.accent2;
    c.lineWidth = Math.max(2, U * 0.004);
    c.setLineDash([Math.max(7, U * 0.014), Math.max(6, U * 0.011)]);
    c.beginPath();
    segs.forEach((s) => {
      const p1 = map[s.a], p2 = map[s.b];
      if (!p1 || !p2) return;
      let q1 = { ...p1 }, q2 = { ...p2 };
      if (rot && pivot) {
        const ang = (rot.deg * Math.PI) / 180 * a;
        const R = (pt: { x: number; y: number }) => {
          const dx = pt.x - pivot.x, dy = pt.y - pivot.y;
          return {
            x: pivot.x + dx * Math.cos(ang) - dy * Math.sin(ang),
            y: pivot.y + dx * Math.sin(ang) + dy * Math.cos(ang),
          };
        };
        q1 = R(q1); q2 = R(q2);
      } else if (flip) {
        const m = flip.axis === 'x' ? Y(flip.at) : X(flip.at);
        const k = 1 - 2 * a;
        if (flip.axis === 'x') {
          q1 = { x: q1.x, y: m + (q1.y - m) * k };
          q2 = { x: q2.x, y: m + (q2.y - m) * k };
        } else {
          q1 = { x: m + (q1.x - m) * k, y: q1.y };
          q2 = { x: m + (q2.x - m) * k, y: q2.y };
        }
      }
      c.moveTo(q1.x, q1.y);
      c.lineTo(q2.x, q2.y);
    });
    c.stroke();
    c.restore();
  }

  // 顶点
  pts.forEach((pt, i) => {
    const a = easeOut(seg(t, 0.1 + i * 0.1, 0.4 + i * 0.1));
    if (a <= 0) return;
    const q = map[pt.id];
    c.save();
    c.globalAlpha = a;
    c.fillStyle = st.accent;
    c.beginPath(); c.arc(q.x, q.y, Math.max(3.5, U * 0.0065), 0, Math.PI * 2); c.fill();
    if (pt.label) {
      const fs = Math.max(14, U * 0.031);
      c.fillStyle = th.text;
      c.font = `800 ${fs}px ${FONT_MATH}`;
      const dx = q.x < ox + side / 2 ? -1 : 1;
      c.textAlign = dx > 0 ? 'left' : 'right';
      c.textBaseline = 'middle';
      c.fillText(pt.label, q.x + dx * Math.max(9, U * 0.018), q.y - Math.max(8, U * 0.016));
    }
    c.restore();
  });

  if (scene.note) {
    const a = easeOut(seg(t, 0.8, 1.4));
    c.save();
    c.globalAlpha = a;
    const ny = box.y + box.h - U * 0.055;
    c.fillStyle = withAlpha(st.accent2, 0.12);
    roundRect(c, box.x, ny - U * 0.008, box.w, U * 0.058, U * 0.014);
    c.fill();
    drawRich(c, scene.note, {
      x: box.x + U * 0.022, y: ny + U * 0.005, maxW: box.w - U * 0.045,
      size: U * 0.028, color: st.accent2, weight: 600, maxLines: 1,
    });
    c.restore();
  }
}

/* ---------------- 饼图 / 条形分割 ---------------- */

function drawPie(
  c: CanvasRenderingContext2D, box: any, U: number, th: Theme,
  st: ReturnType<typeof stageMeta>, scene: Scene, t: number, p: number,
) {
  let top = box.y;
  if (scene.title) {
    drawRich(c, scene.title, {
      x: box.x, y: top, maxW: box.w, size: U * 0.045, color: th.text,
      accent: st.accent, weight: 800, maxLines: 1,
    });
    top += U * 0.09;
  }
  const parts = (scene.parts ?? []).filter((x) => x.value > 0);
  const total = parts.reduce((a, b) => a + b.value, 0) || 1;

  if (scene.mode === 'strip') {
    const barY = top + U * 0.06;
    const barH = Math.min(U * 0.16, box.h * 0.28);
    const barW = box.w;
    let acc = 0;
    parts.forEach((pt, i) => {
      const w = (pt.value / total) * barW;
      const x = box.x + acc;
      const color = pt.color || PALETTE[i % PALETTE.length];
      const local = seg(t, 0.1 + i * 0.22, 0.65 + i * 0.22);
      c.save();
      c.fillStyle = withAlpha(color, 0.85);
      c.beginPath();
      roundRect(c, x + 2, barY, Math.max(0, w - 4) * local, barH, 10);
      c.fill();
      c.strokeStyle = withAlpha(th.bg, 0.9);
      c.lineWidth = 2;
      c.stroke();
      if (local > 0.7) {
        c.globalAlpha = (local - 0.7) / 0.3;
        c.fillStyle = '#08101F';
        c.font = `800 ${Math.min(U * 0.042, w * 0.42)}px ${FONT_UI}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(pt.label, x + w / 2, barY + barH / 2);
      }
      c.restore();
      acc += w;
    });
    // 说明
    let ly = barY + barH + U * 0.07;
    parts.forEach((pt, i) => {
      const a = easeOut(seg(t, 0.5 + i * 0.12, 0.9 + i * 0.12));
      if (a <= 0) return;
      const color = pt.color || PALETTE[i % PALETTE.length];
      c.save();
      c.globalAlpha = a;
      c.fillStyle = color;
      c.beginPath(); c.arc(box.x + U * 0.014, ly + U * 0.014, U * 0.011, 0, Math.PI * 2); c.fill();
      c.fillStyle = th.text;
      c.font = `600 ${U * 0.03}px ${FONT_UI}`;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(`${pt.label}`, box.x + U * 0.04, ly + U * 0.014);
      c.fillStyle = th.muted;
      c.font = `500 ${U * 0.026}px ${FONT_UI}`;
      c.fillText(`占 ${Math.round((pt.value / total) * 100)}%`, box.x + U * 0.04 + c.measureText(`${pt.label}`).width + U * 0.03, ly + U * 0.014);
      c.restore();
      ly += U * 0.05;
    });
    return;
  }

  // 饼图
  const cx = box.x + box.w * 0.32;
  const cy = top + (box.y + box.h - top) * 0.45;
  const r = Math.min(box.w * 0.26, (box.y + box.h - top) * 0.4);
  let start = -Math.PI / 2;
  const sweepAll = easeOut(seg(t, 0.1, 0.9));
  parts.forEach((pt, i) => {
    const ang = (pt.value / total) * Math.PI * 2 * sweepAll;
    const color = pt.color || PALETTE[i % PALETTE.length];
    c.save();
    c.beginPath();
    c.moveTo(cx, cy);
    c.arc(cx, cy, r, start, start + ang);
    c.closePath();
    c.fillStyle = withAlpha(color, 0.9);
    c.fill();
    c.strokeStyle = th.bg;
    c.lineWidth = 3;
    c.stroke();
    if (ang > 0.4) {
      const mid = start + ang / 2;
      c.fillStyle = '#08101F';
      c.font = `800 ${Math.max(12, r * 0.17)}px ${FONT_UI}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(pt.label, cx + Math.cos(mid) * r * 0.62, cy + Math.sin(mid) * r * 0.62);
    }
    c.restore();
    start += ang;
  });
  // 内圈
  c.save();
  c.fillStyle = th.bg;
  c.beginPath(); c.arc(cx, cy, r * 0.42, 0, Math.PI * 2); c.fill();
  c.fillStyle = th.muted;
  c.font = `600 ${Math.max(11, r * 0.13)}px ${FONT_UI}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('整体', cx, cy);
  c.restore();

  // 图例
  let ly = cy - parts.length * U * 0.032;
  parts.forEach((pt, i) => {
    const a = easeOut(seg(t, 0.45 + i * 0.12, 0.85 + i * 0.12));
    if (a <= 0) return;
    const color = pt.color || PALETTE[i % PALETTE.length];
    c.save();
    c.globalAlpha = a;
    c.fillStyle = color;
    roundRect(c, box.x + box.w * 0.62, ly - U * 0.011, U * 0.022, U * 0.022, 6);
    c.fill();
    c.fillStyle = th.text;
    c.font = `700 ${U * 0.032}px ${FONT_UI}`;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(pt.label, box.x + box.w * 0.62 + U * 0.036, ly);
    c.fillStyle = th.muted;
    c.font = `500 ${U * 0.024}px ${FONT_UI}`;
    c.fillText(`${Math.round((pt.value / total) * 100)}%`, box.x + box.w * 0.62 + U * 0.036, ly + U * 0.03);
    c.restore();
    ly += U * 0.085;
  });
}

/* ---------------- 小学实物模型 ---------------- */

function drawObjects(
  c: CanvasRenderingContext2D, box: any, U: number, th: Theme,
  st: ReturnType<typeof stageMeta>, scene: Scene, t: number, p: number,
) {
  let top = box.y;
  if (scene.title) {
    drawRich(c, scene.title, {
      x: box.x, y: top, maxW: box.w, size: U * 0.048, color: th.text,
      accent: st.accent, weight: 800, maxLines: 1,
    });
    top += U * 0.1;
  }
  const groups = scene.groups ?? [{ count: 6 }];
  const rowGap = Math.min(U * 0.2, (box.y + box.h - top) / groups.length);
  const baseEmoji = scene.emoji || '🍎';

  groups.forEach((g, gi) => {
    const y = top + gi * rowGap;
    const perRow = Math.min(g.count, 10);
    const size = Math.min(U * 0.062, rowGap * 0.5);
    const gapX = Math.min(size * 1.35, (box.w * 0.86) / Math.max(1, perRow));
    const emoji = g.emoji || baseEmoji;
    for (let k = 0; k < perRow; k++) {
      const at = 0.15 + gi * 0.2 + k * 0.07;
      const a = easeOut(seg(t, at, at + 0.35));
      if (a <= 0) continue;
      const bob = Math.sin(t * 3 + k * 0.6 + gi) * U * 0.004;
      c.save();
      c.globalAlpha = a;
      c.font = `${size * backOut(a)}px ${FONT_UI}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(emoji, box.x + gapX * (k + 0.5), y + rowGap * 0.3 + bob);
      c.restore();
    }
    if (g.label) {
      const a = easeOut(seg(t, 0.3 + gi * 0.2, 0.8 + gi * 0.2));
      c.save();
      c.globalAlpha = a;
      pill(c, g.label, box.x + box.w, y + rowGap * 0.12, Math.max(12, U * 0.024), withAlpha(st.accent, 0.16), st.accent, 'right');
      c.restore();
    }
  });

  if (scene.note) {
    const a = easeOut(seg(t, 0.7, 1.2));
    c.save();
    c.globalAlpha = a;
    const ny = box.y + box.h - U * 0.05;
    drawRich(c, scene.note, {
      x: box.x, y: ny, maxW: box.w, size: U * 0.032, color: st.accent,
      weight: 700, align: 'center', maxLines: 1,
    });
    c.restore();
  }
}

/* ---------------- 对比 ---------------- */

function drawCompare(
  c: CanvasRenderingContext2D, box: any, U: number, th: Theme,
  st: ReturnType<typeof stageMeta>, scene: Scene, t: number, p: number,
) {
  const gap = U * 0.03;
  const cw = (box.w - gap) / 2;
  const ch = Math.min(box.y + box.h - box.y, U * 0.42);
  const cy = box.y + U * 0.03;

  const cards = [
    { data: scene.left, accent: withAlpha('#FF7A8A', 1), dim: true, delay: 0.1 },
    { data: scene.right, accent: st.accent, dim: false, delay: 0.55 },
  ];

  cards.forEach((card, ci) => {
    if (!card.data) return;
    const a = easeOut(seg(t, card.delay, card.delay + 0.6));
    if (a <= 0) return;
    const x = box.x + ci * (cw + gap);
    c.save();
    c.globalAlpha = a * (card.dim ? 0.85 : 1);
    c.translate(0, (1 - a) * U * 0.03);
    c.fillStyle = th.panel;
    roundRect(c, x, cy, cw, ch, U * 0.024);
    c.fill();
    c.fillStyle = card.accent;
    roundRect(c, x, cy, cw, Math.max(4, U * 0.007), U * 0.024);
    c.fill();

    drawRich(c, card.data.title, {
      x: x + U * 0.025, y: cy + U * 0.03, maxW: cw - U * 0.05,
      size: U * 0.034, color: card.accent, weight: 800, maxLines: 1,
    });

    let ly = cy + U * 0.095;
    const fs = Math.min(U * 0.032, (ch - U * 0.12) / Math.max(3, card.data.lines.length) * 0.5);
    card.data.lines.forEach((ln, i) => {
      const la = easeOut(seg(t, card.delay + 0.2 + i * 0.16, card.delay + 0.5 + i * 0.16));
      c.save();
      c.globalAlpha = a * la;
      drawRich(c, ln, {
        x: x + U * 0.025, y: ly, maxW: cw - U * 0.05, size: fs,
        color: th.text, accent: card.accent, weight: 500, lineHeight: fs * 1.4, maxLines: 2,
      });
      c.restore();
      ly += fs * 2.1;
    });
    c.restore();
  });
}

/* ---------------- 结论 ---------------- */

function drawConclusion(
  c: CanvasRenderingContext2D, box: any, U: number, th: Theme,
  st: ReturnType<typeof stageMeta>, scene: Scene, t: number, p: number,
) {
  const cy = box.y + box.h * 0.32;
  const a = easeOut(seg(t, 0.05, 0.7));
  const sc = 0.94 + 0.06 * backOut(a);

  // 光斑
  c.save();
  const rg = c.createRadialGradient(box.x + box.w / 2, cy, 0, box.x + box.w / 2, cy, box.w * 0.5);
  rg.addColorStop(0, withAlpha(st.accent, 0.18));
  rg.addColorStop(1, withAlpha(st.accent, 0));
  c.fillStyle = rg;
  c.fillRect(box.x, box.y, box.w, box.h);
  c.restore();

  c.save();
  c.globalAlpha = a;
  c.translate(box.x + box.w / 2, cy);
  c.scale(sc, sc);
  c.translate(-(box.x + box.w / 2), -cy);

  if (scene.title) {
    pill(c, scene.title, box.x + box.w / 2, cy - U * 0.14, Math.max(12, U * 0.028), withAlpha(st.accent, 0.18), st.accent, 'center');
  }

  if (scene.math) {
    const size = Math.min(U * 0.14, box.w * 0.16);
    drawMath(c, scene.math, { x: box.x + U * 0.04, y: cy - U * 0.02, w: box.w - U * 0.08 }, size, st.accent);
  }
  if (scene.subtitle || scene.tip) {
    drawRich(c, scene.subtitle || scene.tip || '', {
      x: box.x + U * 0.05, y: cy + U * 0.14, maxW: box.w - U * 0.1,
      size: U * 0.042, color: th.text, accent: st.accent, align: 'center',
      weight: 700, lineHeight: U * 0.062, maxLines: 3,
    });
  }
  c.restore();

  // 装饰
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + t * 0.4;
    const rr = box.w * (0.22 + 0.06 * Math.sin(t + i));
    const x = box.x + box.w / 2 + Math.cos(ang) * rr;
    const y = cy + Math.sin(ang) * rr * 0.55;
    c.save();
    c.globalAlpha = 0.25 + 0.2 * Math.sin(t * 2 + i);
    c.fillStyle = i % 2 ? st.accent : st.accent2;
    c.beginPath(); c.arc(x, y, Math.max(2, U * 0.004), 0, Math.PI * 2); c.fill();
    c.restore();
  }
}

/* ---------------- 字幕 ---------------- */

function drawSubtitle(
  c: CanvasRenderingContext2D, W: number, H: number, U: number, th: Theme,
  narration: string, t: number,
) {
  const size = Math.max(15, U * 0.036);
  const maxW = W * 0.82;
  c.save();
  c.font = `600 ${size}px ${FONT_UI}`;
  const lines = wrapCount(c, narration, maxW, size, 2);
  const lh = size * 1.45;
  const boxH = lh * lines.length + size * 1.1;
  const top = H * 0.965 - boxH;
  c.fillStyle = th.subtitleBg;
  roundRect(c, W * 0.09, top, W * 0.82, boxH, U * 0.018);
  c.fill();
  drawRich(c, narration, {
    x: W * 0.11, y: top + size * 0.55, maxW: maxW - U * 0.04,
    size, color: th.text, align: 'center', lineHeight: lh, weight: 600,
    maxLines: 2, alpha: 0.96,
  });
  c.restore();
}

function wrapCount(c: CanvasRenderingContext2D, text: string, maxW: number, size: number, maxLines: number) {
  c.font = `600 ${size}px ${FONT_UI}`;
  const chars = Array.from(text);
  let line = '';
  let lines = 1;
  for (const ch of chars) {
    if (c.measureText(line + ch).width > maxW) {
      lines++;
      line = ch;
      if (lines >= maxLines) return new Array(maxLines).fill(0) as unknown as string[];
    } else line += ch;
  }
  return new Array(Math.min(lines, maxLines)).fill(0) as unknown as string[];
}
