import type { ChatMessage, Scene, Settings, Stage, Storyboard } from './types';
import { compileExpr } from './math';

/* ---------------- 服务商预设 ---------------- */

export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  textModel: string;
  visionModel: string;
  ttsModel: string;
  ttsVoice: string;
  note: string;
  vision: boolean;
  tts: boolean;
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'demo',
    name: '演示模式（无需 Key）',
    baseUrl: '',
    textModel: '',
    visionModel: '',
    ttsModel: '',
    ttsVoice: '',
    note: '使用内置样题与手写分镜，完整体验"拍照 → 成片"全流程。填入任意 OpenAI 兼容 Key 即可解锁真实识题与生成。',
    vision: false,
    tts: false,
  },
  {
    id: 'dashscope',
    name: '阿里云百炼 · 通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    textModel: 'qwen-plus',
    visionModel: 'qwen-vl-max',
    ttsModel: 'qwen-tts',
    ttsVoice: 'Cherry',
    note: 'qwen-vl-max 识题很准；语音用 qwen-tts（部分账号需开通）。有免费额度。',
    vision: true,
    tts: true,
  },
  {
    id: 'ark',
    name: '火山方舟 · 豆包',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    textModel: 'doubao-1-5-pro-32k-250115',
    visionModel: 'doubao-1-5-vision-pro-32k-250115',
    ttsModel: '',
    ttsVoice: '',
    note: '识题速度快；语音需另配（可先用浏览器配音）。',
    vision: true,
    tts: false,
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    textModel: 'glm-4-plus',
    visionModel: 'glm-4v-plus',
    ttsModel: '',
    ttsVoice: '',
    note: 'GLM-4V 识图能力好，国内直连稳定。',
    vision: true,
    tts: false,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    textModel: 'gpt-4o-mini',
    visionModel: 'gpt-4o',
    ttsModel: 'gpt-4o-mini-tts',
    ttsVoice: 'alloy',
    note: '识题 + 配音都能一站解决，但国内访问需自备网络。',
    vision: true,
    tts: true,
  },
  {
    id: 'custom',
    name: '自定义 / 代理地址',
    baseUrl: '',
    textModel: '',
    visionModel: '',
    ttsModel: '',
    ttsVoice: '',
    note: '任何 OpenAI 兼容网关都可。推荐用仓库里的 proxy/worker.js 部署到 Cloudflare，把 Key 藏在服务端。',
    vision: true,
    tts: true,
  },
];

export const DEFAULT_SETTINGS: Settings = {
  providerId: 'demo',
  baseUrl: '',
  apiKey: '',
  textModel: '',
  visionModel: '',
  ttsModel: '',
  ttsVoice: '',
  ttsEngine: 'browser',
  theme: 'night',
  ratio: '16:9',
  speed: 1,
  captions: true,
  autoDuration: true,
};

/* ---------------- 基础请求 ---------------- */

function joinUrl(base: string, path: string) {
  const b = (base || '').replace(/\/+$/, '');
  return `${b}${path}`;
}

function errText(e: any): string {
  if (!e) return '未知错误';
  if (typeof e === 'string') return e;
  return e.message || String(e);
}

async function requestJson(url: string, init: RequestInit, timeout = 90000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      let detail = '';
      try {
        const txt = await res.text();
        try {
          const j = JSON.parse(txt);
          detail = j?.error?.message || j?.message || txt.slice(0, 300);
        } catch {
          detail = txt.slice(0, 300);
        }
      } catch { /* ignore */ }
      throw new Error(`接口返回 ${res.status}${detail ? `：${detail}` : ''}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function extractText(data: any): string {
  const msg = data?.choices?.[0]?.message?.content ?? data?.output?.text ?? '';
  if (typeof msg === 'string') return msg;
  if (Array.isArray(msg)) {
    return msg.map((p: any) => (typeof p === 'string' ? p : p?.text || '')).join('');
  }
  return String(msg || '');
}

export function isConfigured(s: Settings) {
  return !!s.baseUrl && (!!s.apiKey || /localhost|127\.0\.0\.1|workers\.dev|vercel\.app/i.test(s.baseUrl));
}

export async function chat(
  s: Settings,
  messages: ChatMessage[],
  opts: { vision?: boolean } = {},
): Promise<string> {
  if (!isConfigured(s)) throw new Error('还没有配置模型：点右上角"设置"，填入接口地址与 Key（或用演示模式）。');
  const body = {
    model: opts.vision ? s.visionModel || s.textModel : s.textModel || s.visionModel,
    messages,
    temperature: 0.4,
  };
  const data = await requestJson(joinUrl(s.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${s.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const text = extractText(data).trim();
  if (!text) throw new Error('模型返回了空内容，换个模型或稍后重试。');
  return text;
}

/* ---------------- 识题 ---------------- */

const OCR_PROMPT = `你是题目录入助手。请把图片中的题目**完整准确地**转写成纯文本：
1. 保留题号、条件、图形描述（如"如图，△ABC 中…"）、选项、小问；
2. 数学式子用 Unicode 纯文本表示（x²、√3、≤、∠ABC、△、∥、⊥、π）；不要用 LaTeX；
3. 如果是图形题，用一句话补充图形里的已知标注（如"AB=AC，∠A=40°"）；
4. 不要解题，不要写答案，只输出题目本身。若图中有多道题，只输出最完整的一道。`;

export async function ocrQuestion(s: Settings, dataUrl: string): Promise<string> {
  const text = await chat(
    s,
    [
      { role: 'system', content: OCR_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: '请转写这道题。' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    { vision: true },
  );
  return text.replace(/^```[\s\S]*?\n|```$/g, '').trim();
}

/* ---------------- 分镜生成 ---------------- */

const SCHEMA_DOC = `输出必须是一个 JSON 对象（不要 Markdown 代码块、不要多余解释）：
{
  "topic": "知识点，如 二次函数最值",
  "answer": "最终答案（简洁，含关键结论）",
  "scenes": [
    { "type": "title", "title": "标题", "subtitle": "一句话副标题", "narration": "口播稿" },
    { "type": "steps", "title": "可选小标题", "steps": [{"text":"步骤（可用 **强调**）","note":"可选补充"}], "note": "可选底部提示", "narration": "口播稿" },
    { "type": "formula", "title": "可选", "math": "公式（可含 \\n 换行）", "note": "解释", "tip": "口诀/提醒", "narration": "口播稿" },
    { "type": "graph", "title": "可选", "view": [-5,5,-8,6], "curves": [{"expr":"x^2-2x-3","label":"y=x²-2x-3","color":"#5EE7C4"}], "vlines": [{"x":1,"label":"对称轴 x=1"}], "hlines": [{"y":-4,"label":"最小值 -4"}], "points": [{"x":1,"y":-4,"label":"顶点(1,-4)"}], "area": {"expr":"x^2-2x-3","from":0,"to":2}, "narration": "口播稿" },
    { "type": "numberline", "title": "可选", "min": 0, "max": 1, "marks": [{"value":0.5,"label":"1/2"}], "range": {"from":0.2,"to":0.6,"label":"解集"}, "narration": "口播稿" },
    { "type": "geometry", "title": "可选", "pts": [{"id":"A","x":50,"y":12},{"id":"B","x":14,"y":82},{"id":"C","x":86,"y":82}], "segs": [{"a":"A","b":"B"},{"a":"B","b":"C"},{"a":"C","b":"A","label":"1"}], "angles": [{"at":"A","from":"B","to":"C","label":"60°"}], "ghost": {"rotate":{"center":"A","deg":60}}, "note": "可选提示", "narration": "口播稿" },
    { "type": "pie", "mode": "pie", "title": "可选", "parts": [{"label":"1/2","value":3},{"label":"1/3","value":2}], "narration": "口播稿" },
    { "type": "objects", "emoji": "🍎", "groups": [{"count":6,"label":"6 个苹果"}], "narration": "口播稿" },
    { "type": "compare", "left": {"title":"错解","lines":["…"]}, "right": {"title":"正解","lines":["…"]}, "narration": "口播稿" },
    { "type": "conclusion", "title": "记住这个结论", "math": "结论公式", "subtitle": "一句话总结", "narration": "口播稿" }
  ]
}

字段规则：
- 每屏都要 narration（口播稿，口语，20~70 字），不要念符号，要读成中文（写"x 的平方"，而不是"x^2"）。
- 数学表达式一律 Unicode 纯文本：x²、√(b²-4ac)、≤、≥、≠、≈、∫、Σ、π、θ、∴、⇒、△、∠。禁止 LaTeX、禁止 $。
- graph 的 expr 只能用 x、数字、+ - * / ^ ( )、sin cos tan sqrt abs ln log exp，view 为四个数字。
- geometry 坐标范围 0~100（y 轴向下），点不要贴边；辅助线用 dashed:true，并按顺序加 delay。
- 强调重点用 **两个星号** 包裹。
- 屏数 4~7 屏，节奏紧凑；不要出现"大家好""下面我们来看"这类废话。`;

const STAGE_STYLE: Record<Stage, string> = {
  primary: `受众是小学生（6~12 岁）。要求：
- **趣味优先**：多用拟人、比喻、生活场景（分披萨、分糖果、小动物排队），语气亲切活泼，可以有"哇""注意啦"这样的语气词；
- **必须可视化**：优先用 objects（🍎🍬🐰 实物）和 pie/strip（饼图、分割条）表达数量关系，让孩子"看见"算式；
- 每屏只讲一个小点，语言短句为主，不出现"设""恒成立""判别式"等术语；
- 结论屏给一句朗朗上口的小口诀。`,
  junior: `受众是初中生。要求：
- **代数必须数形结合**：讲方程/函数/不等式时，用 graph 或 numberline 把式子变成图像，让"代数结论"在图上看得见（交点、顶点、区间）；
- **几何必须有动画**：用 geometry 画图，辅助线 dashed + delay 逐条生长；涉及旋转/翻折/平移时用 ghost.rotate / ghost.flip 演示变换过程；
- 讲解逻辑：先给直觉（图形）→ 再给严格步骤 → 最后给易错点；
- 可以有"秒杀"技巧，但必须说明为什么成立。`,
  senior: `受众是高中生。要求：
- **代数部分强可视化**：函数对称性、单调性、最值、切线、区域面积等，用 graph 把抽象关系画出来（对称轴 vlines、关键点 points、区域 area）；
- **几何部分强动画**：建系、辅助线、旋转、投影用 geometry 动态呈现；
- 允许"秒杀口诀/套路"，但要用一屏讲清它的原理来源；
- 步骤严谨，符号规范，结论要能直接抄进答题卡。`,
  college: `受众是大学生。要求：
- **不要花哨动画**，不要 emoji 堆砌，风格克制、板书感；
- 主要用 steps（原理 → 推导 → 步骤）和 formula（关键式子），必要时最多一屏 graph 辅助直觉；
- 讲清"为什么这一步成立"（定理条件、等价变形），再给"标准做法"；
- 结尾给适用条件与常见坑。`,
};

export function buildStoryboardPrompt(
  stage: Stage,
  question: string,
  plan?: string,
): ChatMessage[] {
  const sys = `你是一位顶尖的数学/理科讲解视频编导兼老师，负责把一个题目拆成"分镜脚本"，供程序渲染成讲解动画。

${STAGE_STYLE[stage]}

${SCHEMA_DOC}

只输出 JSON。`;

  const user = plan
    ? `【学段】${stageName(stage)}
【题目】
${question}

【我的讲解思路（必须严格遵循）】
${plan}

要求：完全按照上面的思路顺序和重点来编排分镜，不得增加用户没提到的步骤，不得改变讲解顺序；如果思路里有"先讲 A 再讲 B"，分镜就必须先 A 后 B。可以补充必要的过渡语。
请输出 JSON。`
    : `【学段】${stageName(stage)}
【题目】
${question}

请先在心里完整解出这道题，确认答案无误，再设计分镜。请输出 JSON。`;

  return [
    { role: 'system', content: sys },
    { role: 'user', content: user },
  ];
}

export function stageName(s: Stage) {
  return { primary: '小学', junior: '初中', senior: '高中', college: '大学' }[s];
}

/* ---------------- JSON 解析与规整 ---------------- */

export function parseJsonLoose(text: string): any {
  let s = text.trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/g, '').trim();
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  s = s.replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(s);
  } catch {
    // 去掉裸换行后再试
    const fixed = s.replace(/\n/g, '\\n').replace(/\\n(?=[^"]*"[^"]*$)/g, '\n');
    try { return JSON.parse(fixed); } catch { throw new Error('模型返回的不是合法 JSON，请重试或换个模型。'); }
  }
}

const VALID_TYPES = new Set([
  'title', 'steps', 'formula', 'graph', 'numberline',
  'geometry', 'pie', 'objects', 'compare', 'conclusion',
]);

function num(v: any, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export function normalizeScene(raw: any): Scene | null {
  if (!raw || typeof raw !== 'object') return null;
  let type = String(raw.type || '').trim();
  if (!VALID_TYPES.has(type)) {
    if (raw.math) type = 'formula';
    else if (raw.steps) type = 'steps';
    else if (raw.curves) type = 'graph';
    else type = 'formula';
  }
  const scene: Scene = {
    type: type as Scene['type'],
    narration: String(raw.narration || raw.voiceover || raw.speech || '').trim(),
  };
  if (!scene.narration) scene.narration = String(raw.title || raw.math || '').slice(0, 60);

  for (const k of ['title', 'subtitle', 'badge', 'math', 'note', 'tip'] as const) {
    if (raw[k] != null && String(raw[k]).trim()) (scene as any)[k] = String(raw[k]);
  }

  if (Array.isArray(raw.steps)) {
    scene.steps = raw.steps.slice(0, 6).map((s: any) => ({
      text: String(typeof s === 'string' ? s : s?.text ?? '').trim(),
      note: s?.note ? String(s.note) : undefined,
    })).filter((s: any) => s.text);
  }

  if (Array.isArray(raw.curves)) {
    scene.curves = raw.curves.slice(0, 3).map((c: any) => ({
      expr: String(c?.expr ?? '').trim(),
      color: c?.color ? String(c.color) : undefined,
      label: c?.label ? String(c.label) : undefined,
      dashed: !!c?.dashed,
    })).filter((c: any) => {
      if (!c.expr) return false;
      const f = compileExpr(c.expr);
      return Number.isFinite(f(1) as number) || Number.isFinite(f(0.5) as number);
    });
  }
  if (Array.isArray(raw.view) && raw.view.length === 4) {
    const v = raw.view.map((x: any) => num(x, 0));
    if (v[1] > v[0] && v[3] > v[2]) scene.view = [v[0], v[1], v[2], v[3]];
  }
  if (Array.isArray(raw.points)) {
    scene.points = raw.points.slice(0, 5).map((p: any) => ({
      x: num(p?.x, 0), y: num(p?.y, 0),
      label: p?.label ? String(p.label) : undefined,
      color: p?.color ? String(p.color) : undefined,
    }));
  }
  if (Array.isArray(raw.vlines)) {
    scene.vlines = raw.vlines.slice(0, 3).map((v: any) => ({
      x: num(v?.x, 0), label: v?.label ? String(v.label) : undefined,
      color: v?.color ? String(v.color) : undefined,
    }));
  }
  if (Array.isArray(raw.hlines)) {
    scene.hlines = raw.hlines.slice(0, 3).map((v: any) => ({
      y: num(v?.y, 0), label: v?.label ? String(v.label) : undefined,
      color: v?.color ? String(v.color) : undefined,
    }));
  }
  if (raw.area && raw.area.expr) {
    scene.area = { expr: String(raw.area.expr), from: num(raw.area.from, 0), to: num(raw.area.to, 1), color: raw.area.color };
  }

  if (raw.min != null || raw.max != null) {
    scene.min = num(raw.min, 0);
    scene.max = num(raw.max, 1);
    if (scene.max <= scene.min) scene.max = scene.min + 1;
  }
  if (Array.isArray(raw.marks)) {
    scene.marks = raw.marks.slice(0, 6).map((m: any) => ({
      value: num(m?.value, 0), label: m?.label ? String(m.label) : undefined,
      color: m?.color ? String(m.color) : undefined, above: m?.above !== false,
    }));
  }
  if (raw.range) {
    scene.range = { from: num(raw.range.from, 0), to: num(raw.range.to, 1), label: raw.range.label ? String(raw.range.label) : undefined };
  }

  if (Array.isArray(raw.pts)) {
    const pts: { id: string; x: number; y: number; label?: string }[] = raw.pts.slice(0, 8).map((p: any) => ({
      id: String(p?.id ?? 'A'), x: num(p?.x, 50), y: num(p?.y, 50),
      label: p?.label ? String(p.label) : String(p?.id ?? ''),
    }));
    scene.pts = pts;
    const ids = new Set(pts.map((p) => p.id));
    const segs: { a: string; b: string; label?: string; dashed?: boolean; delay?: number; color?: string }[] =
      (Array.isArray(raw.segs) ? raw.segs : []).slice(0, 12).map((s: any) => ({
        a: String(s?.a ?? ''), b: String(s?.b ?? ''),
        label: s?.label ? String(s.label) : undefined,
        dashed: !!s?.dashed, delay: s?.delay != null ? num(s.delay, 0) : undefined,
        color: s?.color ? String(s.color) : undefined,
      }));
    scene.segs = segs.filter((s) => ids.has(s.a) && ids.has(s.b));
    type Ang = { at: string; from: string; to: string; label?: string };
    scene.angles = (Array.isArray(raw.angles) ? raw.angles : [])
      .filter((a: any) => ids.has(String(a?.at)) && ids.has(String(a?.from)) && ids.has(String(a?.to)))
      .map((a: any): Ang => ({ at: String(a.at), from: String(a.from), to: String(a.to), label: a.label ? String(a.label) : undefined }));
    if (raw.ghost?.rotate?.center && ids.has(String(raw.ghost.rotate.center))) {
      scene.ghost = { rotate: { center: String(raw.ghost.rotate.center), deg: num(raw.ghost.rotate.deg, 60) } };
    } else if (raw.ghost?.flip?.axis) {
      scene.ghost = { flip: { axis: raw.ghost.flip.axis === 'y' ? 'y' : 'x', at: num(raw.ghost.flip.at, 50) } };
    }
  }

  if (Array.isArray(raw.parts)) {
    const parts: { label: string; value: number; color?: string }[] = raw.parts.slice(0, 6).map((p: any) => ({
      label: String(p?.label ?? ''), value: Math.max(0, num(p?.value, 1)),
      color: p?.color ? String(p.color) : undefined,
    }));
    scene.parts = parts.filter((p) => !!p.label && p.value > 0);
    scene.mode = raw.mode === 'strip' ? 'strip' : 'pie';
  }

  if (Array.isArray(raw.groups)) {
    scene.groups = raw.groups.slice(0, 4).map((g: any) => ({
      count: Math.max(1, Math.min(12, Math.round(num(g?.count, 3)))),
      label: g?.label ? String(g.label) : undefined,
      emoji: g?.emoji ? String(g.emoji) : undefined,
    }));
  }
  if (raw.emoji) scene.emoji = String(raw.emoji);

  if (raw.left && raw.right) {
    scene.left = { title: String(raw.left.title || '解法 A'), lines: (raw.left.lines || []).map(String).slice(0, 5) };
    scene.right = { title: String(raw.right.title || '解法 B'), lines: (raw.right.lines || []).map(String).slice(0, 5) };
  }

  if (raw.duration != null) scene.duration = Math.max(2, Math.min(40, num(raw.duration, 0)));
  return scene;
}

export function normalizeStoryboard(
  data: any, stage: Stage, question: string, source: Storyboard['source'] = 'ai',
): Storyboard {
  const scenes: Scene[] = Array.isArray(data?.scenes)
    ? data.scenes.map(normalizeScene).filter((s: Scene | null): s is Scene => !!s)
    : [];
  if (!scenes.length) throw new Error('模型没有给出有效分镜，请重试。');
  // 至少补一个标题屏
  if (scenes[0].type !== 'title') {
    scenes.unshift({
      type: 'title',
      title: data?.topic || '这道题，我们这样想',
      subtitle: stageName(stage),
      narration: '',
    });
  }
  return {
    question,
    stage,
    topic: String(data?.topic || '').slice(0, 30) || '讲解',
    answer: String(data?.answer || '').slice(0, 160),
    scenes: scenes.slice(0, 9),
    source,
    createdAt: Date.now(),
  };
}

export async function generateStoryboard(
  s: Settings,
  stage: Stage,
  question: string,
  plan?: string,
): Promise<Storyboard> {
  const raw = await chat(s, buildStoryboardPrompt(stage, question, plan));
  const data = parseJsonLoose(raw);
  return normalizeStoryboard(data, stage, question, plan ? 'custom' : 'ai');
}

/* ---------------- 语音合成 ---------------- */

export async function synthesize(s: Settings, text: string): Promise<ArrayBuffer> {
  if (!isConfigured(s)) throw new Error('未配置接口，无法合成配音');
  const model = s.ttsModel;
  if (!model) throw new Error('当前服务商没有配置 TTS 模型，请改用浏览器配音。');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(joinUrl(s.baseUrl, '/audio/speech'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s.apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: text,
        voice: s.ttsVoice || 'alloy',
        response_format: 'mp3',
        speed: s.speed,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`配音接口 ${res.status}：${t.slice(0, 200)}`);
    }
    return await res.arrayBuffer();
  } catch (e) {
    throw new Error(`配音失败：${errText(e)}`);
  } finally {
    clearTimeout(timer);
  }
}
