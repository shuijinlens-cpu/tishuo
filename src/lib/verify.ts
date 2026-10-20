import type { Storyboard } from './types';
import { compileExpr } from './math';
import { exactAnswerOf, tryExactSolve } from './algebra';
import { tryLocalSolve } from './localSolve';

/**
 * 答案复核
 * =========================================================
 * 大模型会"自信地算错"。这里的职责不是重新讲一遍，而是当"验算老师"：
 * 1) 把分镜里所有纯数字等式（12 - 3 = 9）抽出来，逐条重算；
 * 2) 能用精确内核解的题（线性方程组、一元方程、四则），重算后对比答案；
 * 3) 发现不一致就标记出来；线性方程组这类可完全判定的题，直接用精确结果替换，绝不把错答案播出去。
 */

function toNum(s: string): number | null {
  const t = s
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[×·]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/[－—–−]/g, '-')
    .replace(/[＋]/g, '+')
    .replace(/\s+/g, '');
  if (!/^[-+*/^().\d]+$/.test(t)) return null;
  if (!/\d/.test(t)) return null;
  try {
    const v = Number(compileExpr(t)(0));
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** 抽取 "a = b" 形式的纯数值等式并验算 */
export function checkNumericEqualities(text: string): string[] {
  const issues: string[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const parts = line.split('=');
    if (parts.length < 2 || parts.length > 4) continue;
    const nums = parts.map(toNum);
    if (nums.some((v) => v === null)) continue;
    const first = nums[0] as number;
    for (let i = 1; i < nums.length; i++) {
      const v = nums[i] as number;
      if (Math.abs(v - first) > 1e-6 * Math.max(1, Math.abs(first))) {
        issues.push(`等式不成立：${line.trim()}（左边 = ${first}，右边 = ${v}）`);
        break;
      }
    }
  }
  return issues;
}

function numbersIn(s: string): number[] {
  return (s.match(/-?\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => Number.isFinite(n));
}

function containsAll(hay: string, needles: number[]): boolean {
  const pool = numbersIn(hay);
  const fracs = (hay.match(/(-?\d+)\/(\d+)/g) || []).map((x) => x.split('/').map(Number));
  const decimals = pool.map((m) => Number(m.toFixed(4)));
  return needles.every((n) =>
    pool.some((m) => Math.abs(m - n) < 1e-6) ||
    fracs.some(([a, b]) => b !== 0 && Math.abs(a / b - n) < 1e-6) ||
    decimals.some((m) => Math.abs(m - n) < 1e-3),
  );
}

export interface VerifyResult {
  issues: string[];
  /** 本机精确算出的答案（有则可完全信任） */
  exactAnswer?: string;
  /** 完全由精确内核生成的正确分镜（当模型算错时用来替换） */
  exactStoryboard?: Storyboard;
  ok: boolean;
}

export function verifyStoryboard(sb: Storyboard, question: string): VerifyResult {
  const issues: string[] = [];

  // 1) 纯数值等式逐条复算
  for (const scene of sb.scenes) {
    const chunks: string[] = [];
    if (scene.math) chunks.push(scene.math);
    if (scene.note) chunks.push(scene.note);
    if (scene.subtitle) chunks.push(scene.subtitle);
    for (const st of scene.steps || []) {
      if (st.math) chunks.push(st.math);
      if (st.text) chunks.push(st.text);
    }
    for (const f of scene.mats || []) {
      for (const row of f.rows) chunks.push(row.join(' '));
    }
    for (const c of chunks) issues.push(...checkNumericEqualities(c));
  }

  // 2) 能精确求解的题：重算答案
  const exactAnswer = exactAnswerOf(question);
  const preExact = tryExactSolve(question, sb.stage);
  let exactStoryboard: Storyboard | undefined = preExact ?? undefined;

  if (!exactStoryboard) {
    const local = tryLocalSolve(question, sb.stage);
    if (local && local.answer) {
      exactStoryboard = local;
    }
  }

  const canonical = exactAnswer || exactStoryboard?.answer || '';
  if (canonical) {
    const need = numbersIn(canonical);
    if (need.length && !containsAll(sb.answer || '', need)) {
      issues.push(`答案与精确计算不一致：模型给「${sb.answer || '空'}」，精确计算为「${canonical}」`);
    }
  }

  return {
    issues: Array.from(new Set(issues)),
    exactAnswer: canonical || undefined,
    exactStoryboard,
    ok: issues.length === 0,
  };
}
