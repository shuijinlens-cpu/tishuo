import type { Stage } from '../lib/types';

export interface StageMeta {
  key: Stage;
  label: string;
  short: string;
  emoji: string;
  desc: string;
  accent: string;
  accent2: string;
  hint: string;
}

export const STAGES: StageMeta[] = [
  {
    key: 'primary',
    label: '小学',
    short: '小学',
    emoji: '🧸',
    desc: '趣味动画 · 实物模型 · 看得懂',
    accent: '#FFB020',
    accent2: '#FF7A59',
    hint: '拟人化、生活场景、苹果/小棒/饼图等实物模型，语气亲切，多用比喻，每步都有画面。',
  },
  {
    key: 'junior',
    label: '初中',
    short: '初中',
    emoji: '📐',
    desc: '数形结合 · 几何动效',
    accent: '#2ED3A8',
    accent2: '#39B7FF',
    hint: '代数用函数图像/数轴把"式"变成"形"；几何必须有辅助线生长、旋转翻折等动画演示。',
  },
  {
    key: 'senior',
    label: '高中',
    short: '高中',
    emoji: '🧭',
    desc: '秒杀技巧 · 图形推演',
    accent: '#7C9CFF',
    accent2: '#B48CFF',
    hint: '代数重可视化（对称轴、切线、区域），几何重动态演示（建系、辅助线、变换），允许"秒杀口诀"。',
  },
  {
    key: 'college',
    label: '大学',
    short: '大学',
    emoji: '🎓',
    desc: '原理清晰 · 步骤简洁',
    accent: '#B79BFF',
    accent2: '#6FD3FF',
    hint: '不要花哨动画。讲清"为什么"（原理/直觉）+"怎么做"（标准步骤），公式推导干净利落。',
  },
];

export function stageMeta(s: Stage): StageMeta {
  return STAGES.find((x) => x.key === s) || STAGES[1];
}

export interface Theme {
  bg: string;
  bg2: string;
  panel: string;
  text: string;
  muted: string;
  grid: string;
  axis: string;
  soft: string;
  subtitleBg: string;
}

export const THEMES: Record<'night' | 'light', Theme> = {
  night: {
    bg: '#0A0E1A',
    bg2: '#141C30',
    panel: 'rgba(255,255,255,0.055)',
    text: '#F3F7FF',
    muted: '#93A2C6',
    grid: 'rgba(255,255,255,0.075)',
    axis: 'rgba(255,255,255,0.45)',
    soft: 'rgba(255,255,255,0.12)',
    subtitleBg: 'rgba(4,7,14,0.62)',
  },
  light: {
    bg: '#FAFBFF',
    bg2: '#EFF3FC',
    panel: 'rgba(15,25,50,0.045)',
    text: '#121A2E',
    muted: '#5C6B8A',
    grid: 'rgba(15,25,50,0.08)',
    axis: 'rgba(15,25,50,0.45)',
    soft: 'rgba(15,25,50,0.1)',
    subtitleBg: 'rgba(255,255,255,0.82)',
  },
};

export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
};
export const backOut = (t: number) => {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
export function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
export function seg(t: number, a: number, b: number) {
  return clamp01((t - a) / Math.max(0.0001, b - a));
}
export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
export function withAlpha(hex: string, a: number) {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
