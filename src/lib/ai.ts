import type { ChatMessage, Scene, Settings, Stage, Storyboard, TtsProtocol } from './types';
import { compileExpr } from './math';
import { localOcr, type OcrProgress, type OcrResult } from './ocr';
import { cloudTts } from './voice';
import { looksEnglish, stripChoiceOptions, isComputationHeavy } from './question';
import { verifyStoryboard } from './verify';
import { tryExactSolve } from './algebra';

/* ---------------- 服务商预设 ---------------- */

export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  textModel: string;
  visionModel: string;
  ttsModel: string;
  ttsVoice: string;
  ttsProtocol: TtsProtocol;
  note: string;
  vision: boolean;
  tts: boolean;
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'demo',
    name: '本地模式（无需 Key）',
    baseUrl: '',
    textModel: '',
    visionModel: '',
    ttsModel: '',
    ttsVoice: '',
    ttsProtocol: 'openai',
    note: '识题用手机自带的端侧 OCR（离线可用），配音用系统神经网络音色，内置样题可完整体验全流程。',
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
    ttsProtocol: 'dashscope',
    note: 'qwen-vl-max 识题最准；qwen-tts / cosyvoice 的人声接近真人，还能复刻音色。有免费额度。',
    vision: true,
    tts: true,
  },
  {
    id: 'zhipu',
    name: '智谱 GLM（有免费模型）',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    textModel: 'glm-4-flash',
    visionModel: 'glm-4v-flash',
    ttsModel: '',
    ttsVoice: '',
    ttsProtocol: 'openai',
    note: 'glm-4v-flash 识图免费、国内直连，是零成本开通 AI 识题的首选。',
    vision: true,
    tts: false,
  },
  {
    id: 'ark',
    name: '火山方舟 · 豆包',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    textModel: 'doubao-1-5-pro-32k-250115',
    visionModel: 'doubao-1-5-vision-pro-32k-250115',
    ttsModel: '',
    ttsVoice: '',
    ttsProtocol: 'openai',
    note: '识题速度快；语音需另配（可先用系统神经音色）。',
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
    ttsVoice: 'nova',
    ttsProtocol: 'openai',
    note: 'gpt-4o-mini-tts 支持用自然语言描述音色，最像真人；国内访问需自备网络。',
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
    ttsProtocol: 'openai',
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
  ttsProtocol: 'openai',
  voicePreset: 'teacher-female',
  voiceStyle: '',
  voiceProfile: null,
  useMyVoice: false,
  pitchShift: 1,
  ocrEngine: 'auto',
  theme: 'night',
  ratio: '16:9',
  speed: 1,
  prosody: 0.6,
  captions: true,
  autoDuration: true,
};

/* ---------------- 按 Key 自动识别服务商 ----------------
 * 用户最常见用法：粘了 Key 就走人，懒得选服务商。
 * 这里按 Key / 地址的格式猜一个，猜中就自动把 BaseURL 和模型名全部填好。
 * 猜不中就返回 null，让用户手动选（只选一次，之后永久记住）。 */

export function detectProvider(apiKey: string, baseUrl = ''): ProviderPreset | null {
  const k = (apiKey || '').trim();
  const b = (baseUrl || '').toLowerCase();
  if (b.includes('dashscope') || b.includes('aliyuncs')) return byId('dashscope');
  if (b.includes('bigmodel')) return byId('zhipu');
  if (b.includes('volces')) return byId('ark');
  if (b.includes('openai.com')) return byId('openai');
  if (!k) return null;
  // 智谱的 Key 是 "id.secret" 两段 JWT 风格（含两个点）
  if ((k.match(/\./g) || []).length >= 2) return byId('zhipu');
  if (/^sk-proj-/.test(k)) return byId('openai');
  if (/^sk-/.test(k)) {
    // 百炼的 sk- key 一般 30~40 位；OpenAI 的更长
    return k.length <= 40 ? byId('dashscope') : byId('openai');
  }
  return null;
}

function byId(id: string): ProviderPreset {
  return PROVIDERS.find((p) => p.id === id) as ProviderPreset;
}

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

const OCR_PROMPT = `你是题目录入助手。请把图片中的题目完整准确地转写成纯文本，供后续"按解答题逐步讲解"使用。

【语言】
- 题目若是英文或其他外语，**译成规范的学术中文**：数学术语按国内教材标准译法（let→设，evaluate→求，prove→证明，hence→因此，integer→整数，matrix→矩阵，row echelon form→行阶梯形，eigenvalue→特征值）。
- 数字、变量名、公式结构原样保留，不翻译符号，不改变题意。

【选择题】
- **只保留题干**：删掉所有选项（A. / B. / C. / D. / (A) / ①②③④ 形式的选项内容）以及"下列选项中正确的是"后面的选项部分。
- 题干里的条件、数据、图形说明必须一字不漏地保留。

【其它】
1. 保留题号与小问（(1)(2)），保留"如图，△ABC 中…"这类条件，并把图中标注补成一句（如"AB=AC，∠A=40°"）。
2. 数学式子用 Unicode 纯文本：x²、√3、≤、∠ABC、△、∥、⊥、π、∫、Σ、A⁻¹；不要用 LaTeX、不要 $。
3. 矩阵按行转写，一行一个矩阵行，数字用空格分隔，例如：
   1 2 3
   4 5 6
4. 不要解题、不要写答案、不要解释。若图中有多道题，只输出最完整的一道。`;

/** 纯翻译（端侧 OCR 只认字形、不认语言，英文题需要这一步） */
const TRANSLATE_PROMPT = `你是数学题的学术翻译。把用户给的题目译成规范中文：
- 数学术语按国内教材标准（row echelon form → 行阶梯形，eigenvalue → 特征值，derivative → 导数）；
- 公式、变量、数字原样保留；
- 只输出译文，不要解释，不要解题。`;

export async function translateQuestion(s: Settings, text: string): Promise<string> {
  const out = await chat(s, [
    { role: 'system', content: TRANSLATE_PROMPT },
    { role: 'user', content: text },
  ]);
  return out.replace(/^```[\s\S]*?\n|```$/g, '').trim();
}

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

/**
 * 统一识题入口：有 Key 且选了视觉模型 → 走大模型（对公式更准）；
 * 否则走端侧 OCR（不花钱、离线可用），结果都交给用户确认后再生成。
 */
export async function recognizeQuestion(
  s: Settings,
  dataUrl: string,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrResult> {
  const wantVision = s.ocrEngine !== 'local';
  const canVision = isConfigured(s) && !!s.visionModel;
  if (wantVision && canVision) {
    onProgress?.({ pct: 0.35, label: '视觉模型识题' });
    try {
      const text = await ocrQuestion(s, dataUrl);
      onProgress?.({ pct: 0.96, label: '整理题目' });
      return {
        text: stripChoiceOptions(text),
        confidence: 95,
        engine: 'vision',
        warn: text.replace(/\s/g, '').length < 8 ? '识别内容偏少，请确认是否拍到完整题目' : undefined,
      };
    } catch (e: any) {
      // 大模型失败（没额度、网络、模型名不对）自动退到端侧 OCR，别让用户卡住
      const local = await localOcr(dataUrl, onProgress);
      return { ...local, warn: `${local.warn || ''}（AI 识题失败：${e?.message || e}，已改用本机识别）`.trim() };
    }
  }

  const local = await localOcr(dataUrl, onProgress);
  let text = stripChoiceOptions(local.text);
  let warn = local.warn;
  // 英文题：端侧 OCR 只认字形，配了文本模型就补一步学术翻译
  if (looksEnglish(text) && isConfigured(s)) {
    onProgress?.({ pct: 0.97, label: '学术翻译中' });
    try {
      text = stripChoiceOptions(await translateQuestion(s, text));
    } catch (e: any) {
      warn = `${warn || ''}（英文题翻译失败：${e?.message || e}）`.trim();
    }
  }
  return { ...local, text, warn };
}

/* ---------------- 分镜生成 ---------------- */

const SCHEMA_DOC = `输出必须是一个 JSON 对象（不要 Markdown 代码块、不要多余解释）：
{
  "topic": "知识点，如 二次函数最值",
  "answer": "最终答案（简洁，含关键结论）",
  "scenes": [
    { "type": "title", "title": "标题", "subtitle": "一句话副标题", "narration": "口播稿" },
    { "type": "steps", "title": "可选小标题", "steps": [{"text":"这一步在做什么（书面语）","math":"这一步的具体算式","note":"可选补充"}], "note": "可选底部提示", "narration": "口播稿" },
    { "type": "formula", "title": "可选", "math": "公式（可含 \\n 换行，一行一个变形）", "note": "解释", "tip": "口诀/提醒", "narration": "口播稿" },
    { "type": "matrix", "title": "可选", "mats": [{"op":"第 2 行 − 3 × 第 1 行","rows":[["1","2","3","6"],["0","-7","-5","-9"],["0","5","-4","-7"]],"aug":1,"hi":2}], "note": "可选提示", "narration": "口播稿" },
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
- math 一律 Unicode 纯文本：x²、√(b²-4ac)、≤、≥、≠、≈、∫、Σ、π、θ、∴、⇒、△、∠。禁止 LaTeX、禁止 $。
- \`steps\` 里**每一步都必须给 math**（具体算式），不许只给文字描述。
- \`matrix\` 的 rows 是字符串二维数组，aug 表示从右边数第几列是常数列（用于画竖线），hi 是高亮行号（1 起）。
- graph 的 expr 只能用 x、数字、+ - * / ^ ( )、sin cos tan sqrt abs ln log exp，view 为四个数字。
- geometry 坐标范围 0~100（y 轴向下），点不要贴边；辅助线用 dashed:true，并按顺序加 delay。
- 强调重点用 **两个星号** 包裹。

【铁律：正确性优先，错一个数整段作废】
1. 下笔前先把题完整解一遍并逐步验算；没有把握的数字宁可再算一遍，也不许猜。
2. **不许跳步**。禁止"化简得""由此可得""易知""整理得"之后直接跳到结果——每一个变形都要单独一行，并在 math 里写出这一步的完整算式。
3. 纯计算、化简、解方程（组）、求导、积分、极限、矩阵变换类题目：steps 或 matrix 屏不少于 2 屏，把中间结果全部列出来；同一屏里的每个中间量都必须能由上一行直接算出。
4. 线性方程组、矩阵化行阶梯形：必须用 matrix 屏，把每一次初等行变换的操作（第几行怎么变）写在 op 里，把变换后的**完整矩阵**写进 rows。禁止凭记忆写"最终矩阵"。
5. 结论屏之前必须有一屏"代回验算"，把结果代回原式核对，写明左边等于右边。
6. 选择题（如果题面里还有选项）按解答题讲：给出完整推导，再用一句话说明哪个选项对、其它为什么错。
7. 最终答案屏的 answer 字段必须与推导结果完全一致，不能出现"约为""大概是"。
- 屏数 5~9 屏，节奏紧凑；不要出现"大家好""下面我们来看"这类废话。`;

const STAGE_STYLE: Record<Stage, string> = {
  primary: `受众是小学生（6~12 岁）。要求：
- **趣味优先**：多用拟人、比喻、生活场景（分披萨、分糖果、小动物排队），语气亲切活泼，可以有"哇""注意啦"这样的语气词；
- **必须可视化**：优先用 objects（🍎🍬🐰 实物）和 pie/strip（饼图、分割条）表达数量关系，让孩子"看见"算式；
- 每屏只讲一个小点，语言短句为主，不出现"设""恒成立""判别式"等术语；
- 结论屏给一句朗朗上口的小口诀。
- 即使小学题，也要把每一步算式写清楚（steps 的 math），不能只给答案。`,
  junior: `受众是初中生。要求：
- **代数必须数形结合**：讲方程/函数/不等式时，用 graph 或 numberline 把式子变成图像，让"代数结论"在图上看得见（交点、顶点、区间）；
- **几何必须有动画**：用 geometry 画图，辅助线 dashed + delay 逐条生长；涉及旋转/翻折/平移时用 ghost.rotate / ghost.flip 演示变换过程；
- 讲解逻辑：先给直觉（图形）→ 再给严格步骤 → 最后给易错点；
- 可以有"秒杀"技巧，但必须说明为什么成立。
- **计算步骤一步都不能省**：移项、合并、系数化为 1 都要单独一行写出算式。`,
  senior: `受众是高中生。要求：
- **代数部分强可视化**：函数对称性、单调性、最值、切线、区域面积等，用 graph 把抽象关系画出来（对称轴 vlines、关键点 points、区域 area）；
- **几何部分强动画**：建系、辅助线、旋转、投影用 geometry 动态呈现；
- 允许"秒杀口诀/套路"，但要用一屏讲清它的原理来源；
- 步骤严谨，符号规范，结论要能直接抄进答题卡。
- **每一步推导都要有式子**：变形、代入、化简各占一行，禁止跳步。`,
  college: `受众是大学生。要求：
- **不要花哨动画**，不要 emoji 堆砌，风格克制、板书感；
- 主要用 steps（原理 → 推导 → 步骤）和 formula（关键式子），必要时最多一屏 graph 辅助直觉；
- **线性代数/矩阵题必须用 matrix 屏**，逐次行变换、每次变换后的完整矩阵都要画出来；
- **推导一步一行**：换元、求导、积分、代入上下限都单独成行，math 字段写完整式子；
- 讲清"为什么这一步成立"（定理条件、等价变形），再给"标准做法"；
- 结尾给适用条件与常见坑。`,
};

export function buildStoryboardPrompt(
  stage: Stage,
  question: string,
  plan?: string,
  draft?: string,
): ChatMessage[] {
  const sys = `你是一位顶尖的数学/理科讲解视频编导兼老师，负责把一个题目拆成"分镜脚本"，供程序渲染成讲解动画。

${STAGE_STYLE[stage]}

${SCHEMA_DOC}

只输出 JSON。`;

  const common = `【学段】${stageName(stage)}
【题目】
${question}
${looksEnglish(question) ? '\n（题目是英文：先在脑中译成中文理解；分镜里的标题、步骤、旁白一律用中文，变量名保持原样。）\n' : ''}
【标准解答草稿 —— 必须与之完全一致，不得改动任何数字、符号或中间结果】
${draft || '（没有草稿，请自己完整解一遍再写分镜）'}

【讲解详细度】${plan ? '按用户思路' : '细讲模式'}
- 没有用户指定思路时采用**细讲**：每个变形都解释依据，计算类题目至少 2 屏专门列步骤，宁可多一屏也不跳步。
- 有用户思路时，严格按用户顺序与重点编排，但完整的计算步骤必须保留，不许因为"用户没提"而省略中间算式。`;

  const user = plan
    ? `${common}

【我的讲解思路（必须严格遵循顺序与重点）】
${plan}

要求：完全按上面的思路顺序编排分镜，不改变讲解顺序、不加用户没提到的重点；
但"计算步骤"不算额外重点——每一步算式必须保留并写进 math 字段。
草稿里的每个中间结果都要在分镜里出现一次，最后一屏必须与草稿答案一致。
请输出 JSON。`
    : `${common}

请输出 JSON。`;

  return [
    { role: 'system', content: sys },
    { role: 'user', content: user },
  ];
}

/** 第一遍：只要一份严格、可核对的解答草稿（不含讲解话术） */
export function buildDraftPrompt(stage: Stage, question: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是极其严谨的${stageName(stage)}数学老师。请给出这道题的完整解答草稿。

要求：
1. 一步一行，写成"这一步做什么：具体算式"；
2. **绝不跳步**：移项、合并同类项、代入、约分、求导、积分、每一次初等行变换都要单独一行；
3. 线性方程组 / 矩阵题：每一步写出完整的增广矩阵（用 [ ] 包起来，数字用空格分隔）；
4. 用 Unicode 纯文本数学（x²、√3、∫、Σ），不要 LaTeX；
5. 最后单独一行写：答案：……
6. 写完后代回原式验算一遍，有矛盾就重算。
只输出草稿，不要讲解话术，不要客套。`,
    },
    { role: 'user', content: question },
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
  'title', 'steps', 'formula', 'matrix', 'graph', 'numberline',
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
    else if (raw.mats) type = 'matrix';
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
    scene.steps = raw.steps.slice(0, 7).map((s: any) => ({
      text: String(typeof s === 'string' ? s : s?.text ?? '').trim(),
      note: s?.note ? String(s.note) : undefined,
      math: s?.math ? String(s.math).trim() : undefined,
    })).filter((s: any) => s.text || s.math);
  }

  // 矩阵屏：把模型可能写成一维/数字/字符串的各种形态都收敛成 rows: string[][]
  if (Array.isArray(raw.mats) && raw.mats.length) {
    const parseRows = (v: any): string[][] => {
      if (typeof v === 'string') {
        return v.split(/\n|;/).map((l) => l.replace(/^\[|\]$/g, '').replace(/[|,，]/g, ' ')
          .trim().split(/\s+/).filter(Boolean));
      }
      if (Array.isArray(v)) {
        if (v.length && Array.isArray(v[0])) return v.map((r: any) => r.map((c: any) => String(c)));
        return [v.map((c: any) => String(c))];
      }
      return [];
    };
    scene.mats = raw.mats.slice(0, 5).map((f: any) => {
      const rows = parseRows(f?.rows ?? f?.matrix ?? f?.mat);
      return {
        op: f?.op ? String(f.op) : undefined,
        rows,
        aug: f?.aug != null ? Math.max(0, Math.round(num(f.aug, 0))) : undefined,
        hi: f?.hi != null ? Math.round(num(f.hi, 0)) : undefined,
      };
    }).filter((f: any) => f.rows.length && f.rows.every((r: string[]) => r.length));
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
  onStep?: (msg: string) => void,
): Promise<Storyboard> {
  // ① 能完全判定的题（线性方程组 / 矩阵化简）：直接用精确内核，绝不让模型手算
  const exact = tryExactSolve(question, stage);
  if (exact) {
    onStep?.('已用精确代数内核逐步求解（有理数运算，不会算错）');
    return { ...exact, question, issues: [] };
  }

  // ② 第一遍：先要一份可核对的完整解答草稿（这一步专治"跳步"和"算错"）
  let draft = '';
  if (isConfigured(s)) {
    try {
      onStep?.('先独立解一遍，生成标准解答草稿…');
      draft = (await chat(s, buildDraftPrompt(stage, question))).trim();
      if (draft.length > 4000) draft = draft.slice(0, 4000);
    } catch {
      /* 草稿失败不影响主流程 */
    }
  }

  // ③ 第二遍：按草稿写分镜
  onStep?.('编排分镜…');
  const raw = await chat(s, buildStoryboardPrompt(stage, question, plan, draft));
  const sb = normalizeStoryboard(parseJsonLoose(raw), stage, question, plan ? 'custom' : 'ai');

  // ④ 复核：逐条重算分镜里的数字等式，并用精确内核比对答案
  onStep?.('复核计算…');
  const v = verifyStoryboard(sb, question);
  sb.verified = v.issues.length === 0;
  sb.issues = v.issues;

  // 答案对不上 → 用精确结果替换（正确性优先，宁可换掉整段分镜）
  if (v.issues.some((x) => x.includes('答案与精确计算不一致')) && v.exactStoryboard) {
    const fixed: Storyboard = {
      ...v.exactStoryboard,
      question,
      issues: [`模型算错了，已用精确计算替换（${v.exactAnswer}）`],
      verified: true,
    };
    return fixed;
  }

  return sb;
}

/* ---------------- 语音合成 ---------------- */

export async function synthesize(s: Settings, text: string): Promise<ArrayBuffer> {
  if (!isConfigured(s)) throw new Error('未配置接口，无法合成配音');
  return cloudTts(s, text);
}
