/**
 * 题面整理：选择题只要题干、英文题转学术中文、去掉答题卡式噪声。
 * 这一层的目的是让"讲解"永远面对一道完整的解答题，而不是四选一。
 */

/** 选项行：A. / A、 / (A) / A) / A．/ A、 */
const OPT_LINE = /^\s*(?:[（(]?[A-Fa-f][）)]?\s*[.、．)）:：]|[（(][A-Fa-f][）)])\s*\S/;

export function stripChoiceOptions(text: string): string {
  const lines = (text || '').split(/\r?\n/);
  // 找到第一段连续选项的起点
  let cut = -1;
  let run = 0;
  for (let i = 0; i < lines.length; i++) {
    if (OPT_LINE.test(lines[i])) {
      if (cut < 0) cut = i;
      run += 1;
    } else if (run > 0 && lines[i].trim()) {
      // 选项之间允许空行，但不允许整段内容插进来
      break;
    }
  }
  let out = lines;
  if (cut >= 0 && run >= 2) out = lines.slice(0, cut);

  let s = out.join('\n');

  // 行内四选项：A. … B. … C. … D. …
  const inline = s.match(/(?:^|\s)[（(]?A[）)]?\s*[.、．)）][\s\S]*?[（(]?D[）)]?\s*[.、．)）]/);
  if (inline && inline.index !== undefined) {
    s = s.slice(0, inline.index);
  }

  // 去掉"（  ）""( )"这类留白括号，但保留含内容的括号
  s = s.replace(/[（(]\s{2,}[）)]/g, '');
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function looksEnglish(text: string): boolean {
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return latin > 12 && cjk < latin * 0.35;
}

/** 题面里是否像"纯计算/化简/解方程"类（这类必须逐行列算式） */
export function isComputationHeavy(text: string): boolean {
  const t = text.replace(/\s/g, '');
  if (/(解方程|解不等式|方程组|化简|计算|求值|求导|求积分|积分|极限|矩阵|行列式|秩|通解|展开|因式分解)/.test(t)) {
    return true;
  }
  if (/\d\s*[a-zA-Z]\s*[+\-]/.test(text) && /=/.test(text)) return true;
  return false;
}
