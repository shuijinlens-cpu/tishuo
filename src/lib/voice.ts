import type { Settings, Stage, VoiceProfile } from './types';

/* =========================================================
 * 音色与朗读
 *
 * 让配音"像人"的四个层次：
 * 1) 音色：内置教学音色 + 角色风格音色（动画主角感、电影旁白感、御姐、萌妹、老教授…）
 * 2) 韵律：按标点切"呼吸单位"，句间停顿、问句升调、列举放慢、句尾自然收，
 *    并对每句加一点确定性的音高/语速抖动 —— 真人不会每句都一模一样
 * 3) 音色画像：录一段自己的声音，本地分析基频与节奏，自动挑最接近的神经音色并校准音高语速
 * 4) 云端人声：CosyVoice / gpt-4o-mini-tts，可用自然语言描述音色，也能直接用复刻音色 ID
 * ========================================================= */

export interface VoicePreset {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  /** teaching：教学音色；character：角色风格音色 */
  group: 'teaching' | 'character';
  /** 系统音色偏好关键词，按顺序打分 */
  prefer: string[];
  pitch: number;
  rate: number;
  /** 该音色的典型基频（用于和自己的录音做匹配） */
  baseF0: number;
  /** 情绪起伏强度：1 = 平稳，1.5 = 起伏大 */
  expressive: number;
  /** 云端 TTS 的 voice 参数建议 */
  cloudVoice: string;
  /** 云端 TTS 的风格描述（会作为 instructions 发给支持该字段的模型） */
  style: string;
  /** 适合的学段（用于自动推荐） */
  stages: Stage[];
}

export const VOICE_PRESETS: VoicePreset[] = [
  {
    id: 'teacher-female',
    name: '温柔女老师',
    emoji: '👩‍🏫',
    desc: '耐心、清楚、像班主任讲题，小学初中首选',
    group: 'teaching',
    prefer: ['Xiaoxiao', '晓晓', 'Xiaoyi', '晓伊', 'Huihui', '慧慧', 'Yaoyao', '瑶瑶', 'Ting-Ting', 'Google 普通话', 'Female', '女'],
    pitch: 1.06,
    rate: 0.97,
    baseF0: 208,
    expressive: 1.1,
    cloudVoice: 'Cherry',
    style: '温柔耐心的女老师，语速稍慢，咬字清楚，讲到关键步骤时语气加重，像面对面给学生讲题',
    stages: ['primary', 'junior'],
  },
  {
    id: 'teacher-male',
    name: '磁性男老师',
    emoji: '👨‍🏫',
    desc: '沉稳有底气，讲高中大学数理最合适',
    group: 'teaching',
    prefer: ['Yunxi', '云希', 'Yunyang', '云扬', 'Yunye', '云野', 'Kangkang', '康康', 'Google 普通话', 'Male', '男'],
    pitch: 0.9,
    rate: 1,
    baseF0: 116,
    expressive: 1,
    cloudVoice: 'Ethan',
    style: '沉稳的男老师，声音偏低沉有磁性，语调平稳，推导时节奏干净利落',
    stages: ['senior', 'college'],
  },
  {
    id: 'lively-girl',
    name: '活泼少女',
    emoji: '🙋‍♀️',
    desc: '轻快跳脱，短视频口播感强',
    group: 'teaching',
    prefer: ['Xiaoyi', '晓伊', 'Xiaoshuang', '晓双', 'Xiaoxiao', '晓晓', 'Yaoyao', '瑶瑶', 'Female'],
    pitch: 1.18,
    rate: 1.06,
    baseF0: 240,
    expressive: 1.4,
    cloudVoice: 'Cherry',
    style: '年轻活泼的女生，语速偏快，情绪饱满，像在拍知识类短视频，重点地方会不自觉提高音调',
    stages: ['primary'],
  },
  {
    id: 'story-uncle',
    name: '故事叔叔',
    emoji: '🧔',
    desc: '低沉松弛，讲趣味题像讲故事',
    group: 'teaching',
    prefer: ['Yunye', '云野', 'Yunfeng', '云枫', 'Yunjian', '云健', 'Kangkang', 'Male'],
    pitch: 0.94,
    rate: 0.94,
    baseF0: 108,
    expressive: 1.2,
    cloudVoice: 'Ethan',
    style: '低沉稳重的男声，像在讲故事，句尾略带笑意，节奏松弛有停顿',
    stages: ['primary'],
  },
  {
    id: 'anchor',
    name: '播音讲解',
    emoji: '🎙️',
    desc: '字正腔圆，适合严肃的考点串讲',
    group: 'teaching',
    prefer: ['Yunxi', '云希', 'Yunyang', '云扬', 'Xiaoxiao', '晓晓', 'Ting-Ting'],
    pitch: 1,
    rate: 1.02,
    baseF0: 150,
    expressive: 1.05,
    cloudVoice: 'Serena',
    style: '播音级普通话，吐字清晰、节奏均匀，专业但不生硬',
    stages: ['senior', 'college'],
  },
  {
    id: 'hero-boy',
    name: '热血少年',
    emoji: '🔥',
    desc: '动画主角那种少年嗓：清亮、往前冲，讲难题特别带劲',
    group: 'character',
    prefer: ['Yunxi', '云希', 'Yunye', '云野', 'Yunjian', '云健', 'Male'],
    pitch: 1.12,
    rate: 1.1,
    baseF0: 155,
    expressive: 1.55,
    cloudVoice: 'Ethan',
    style: '热血少年动画主角的声线，明亮、有冲劲，情绪起伏大，遇到关键突破会扬起语调',
    stages: ['junior', 'senior'],
  },
  {
    id: 'narrator-warm',
    name: '电影旁白',
    emoji: '🎬',
    desc: '动画电影旁白那种，温暖、有故事感、留白多',
    group: 'character',
    prefer: ['Yunyang', '云扬', 'Yunxi', '云希', 'Yunfeng', '云枫', 'Male'],
    pitch: 0.96,
    rate: 0.92,
    baseF0: 122,
    expressive: 1.25,
    cloudVoice: 'Ethan',
    style: '动画电影旁白，音色温暖厚实，节奏从容，句子之间有明显留白，句尾自然下沉',
    stages: ['primary', 'junior'],
  },
  {
    id: 'big-sister',
    name: '御姐声线',
    emoji: '💃',
    desc: '偏低、略带气声，讲题又稳又飒',
    group: 'character',
    prefer: ['Xiaoxiao', '晓晓', 'Xiaoyi', '晓伊', 'Serena', 'Female'],
    pitch: 0.94,
    rate: 1.02,
    baseF0: 186,
    expressive: 1.2,
    cloudVoice: 'Cherry',
    style: '成熟御姐声线，音色偏低略带气声，语速从容，句尾微微上挑，自信不轻浮',
    stages: ['senior', 'college'],
  },
  {
    id: 'cute-girl',
    name: '萌系童声',
    emoji: '🍭',
    desc: '奶声奶气，陪小朋友做数学游戏',
    group: 'character',
    prefer: ['Xiaoyi', '晓伊', 'Yaoyao', '瑶瑶', 'Xiaoshuang', '晓双', 'Female'],
    pitch: 1.3,
    rate: 1.02,
    baseF0: 280,
    expressive: 1.5,
    cloudVoice: 'Cherry',
    style: '奶声奶气的小女孩，音调高、语气软，喜欢在句尾拖一点音，像在跟小朋友玩游戏',
    stages: ['primary'],
  },
  {
    id: 'professor',
    name: '老教授',
    emoji: '🎓',
    desc: '慢条斯理、字字有分量，讲原理最镇得住',
    group: 'character',
    prefer: ['Yunyang', '云扬', 'Yunfeng', '云枫', 'Yunjian', '云健', 'Male'],
    pitch: 0.88,
    rate: 0.88,
    baseF0: 100,
    expressive: 0.9,
    cloudVoice: 'Ethan',
    style: '年长教授的声音，低沉缓慢，每个字都有分量，停顿多，讲原理时不急不躁',
    stages: ['college'],
  },
  {
    id: 'anime-dub',
    name: '译制片配音',
    emoji: '🎭',
    desc: '字正腔圆带戏剧张力，讲几何像在演',
    group: 'character',
    prefer: ['Yunxi', '云希', 'Xiaoxiao', '晓晓', 'Yunyang', '云扬'],
    pitch: 1.04,
    rate: 1.05,
    baseF0: 170,
    expressive: 1.5,
    cloudVoice: 'Serena',
    style: '译制片配音腔，吐字极清楚，情绪张力大，重音突出，句子收尾干净利落',
    stages: ['junior', 'senior'],
  },
  {
    id: 'custom',
    name: '自定义',
    emoji: '🎛️',
    desc: '完全按你在设置里写的音色描述',
    group: 'teaching',
    prefer: [],
    pitch: 1,
    rate: 1,
    baseF0: 180,
    expressive: 1.1,
    cloudVoice: 'Cherry',
    style: '',
    stages: [],
  },
];

export function presetForStage(stage: Stage): VoicePreset {
  return VOICE_PRESETS.find((p) => p.stages.includes(stage)) || VOICE_PRESETS[0];
}

export function getPreset(id?: string): VoicePreset {
  return VOICE_PRESETS.find((p) => p.id === id) || VOICE_PRESETS[0];
}

/** 按设置解析出实际使用的音色与音高偏移 */
export function resolveVoice(settings: Settings): { preset: VoicePreset; pitchShift: number } {
  const pitch = settings.pitchShift || 1;
  if (settings.useMyVoice && settings.voiceProfile) {
    const p = profileVoice(settings.voiceProfile);
    return { preset: p.preset, pitchShift: p.pitchShift * pitch };
  }
  return { preset: getPreset(settings.voicePreset), pitchShift: pitch };
}

/* ---------------- 系统音色挑选 ---------------- */

let cachedVoices: SpeechSynthesisVoice[] = [];

export function listZhVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  const all = window.speechSynthesis.getVoices();
  if (all.length) cachedVoices = all;
  return cachedVoices.filter((v) => /zh|Chinese|中文|普通话/i.test(`${v.lang} ${v.name}`));
}

export function waitForVoices(timeout = 1800): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const zh = listZhVoices();
    if (zh.length) return resolve(zh);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(listZhVoices());
    };
    window.speechSynthesis?.addEventListener?.('voiceschanged', finish, { once: true });
    setTimeout(finish, timeout);
  });
}

/** 给音色打分：越"像真人"分越高 */
function scoreVoice(v: SpeechSynthesisVoice, prefer: string[]): number {
  let s = 0;
  const name = `${v.name} ${v.voiceURI}`;
  if (/Natural|Online|Neural|神经|自然/i.test(name)) s += 60;
  if (/Microsoft/i.test(name)) s += 12;
  if (/Google/i.test(name)) s += 18;
  if (/localService/i.test(v.voiceURI)) s -= 8;
  if (/eSpeak|Pico|espeak/i.test(name)) s -= 40;
  prefer.forEach((k, i) => {
    if (name.toLowerCase().includes(k.toLowerCase())) s += 40 - i * 3;
  });
  if (/zh[-_]CN/i.test(v.lang)) s += 8;
  return s;
}

export function pickVoice(preset: VoicePreset): SpeechSynthesisVoice | undefined {
  const zh = listZhVoices();
  if (!zh.length) return undefined;
  return [...zh].sort((a, b) => scoreVoice(b, preset.prefer) - scoreVoice(a, preset.prefer))[0];
}

/** 当前设备能用的最自然音色（用于设置页展示） */
export function describeBestVoice(preset: VoicePreset): string {
  const v = pickVoice(preset);
  if (!v) return '当前浏览器没有中文语音，将只显示字幕';
  const natural = /Natural|Online|Neural/i.test(v.name) ? '（神经语音）' : '';
  return `${v.name}${natural}`;
}

/* ---------------- 断句与韵律 ---------------- */

export interface Chunk {
  text: string;
  /** 句末停顿秒数 */
  gap: number;
  /** 相对音高偏移 */
  pitchDelta: number;
  /** 相对语速偏移 */
  rateDelta: number;
  /** 音量（强调句更大声） */
  volume: number;
  /** 是否是需要加重的关键词句 */
  emphasis?: boolean;
}

const ENDERS = /([。！？!?…]+|\.(?=\s|$))/;

/** 稳定的小伪随机：同一句话每次朗读的抖动一致，听起来像"这个人的习惯"，而不是乱飘 */
function jitter(seed: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000 - 0.5; // -0.5 ~ 0.5
}

/**
 * 把口播稿切成"呼吸单位"：
 * - 长句按逗号二次切分，避免一口气念 50 字
 * - 句号/问号后留长一点的空白，逗号短一些
 * - 问句升调、感叹句略降调加力、冒号后的列举稍慢
 * - 每句加极小的音高/语速抖动，避免"每句一个调"的机器感
 * - **两个星号** 包裹的片段会加重、放慢
 */
export function splitForSpeech(narration: string): Chunk[] {
  const raw = (narration || '').trim();
  if (!raw) return [];
  const chunks: Chunk[] = [];

  const sentences = raw.split(ENDERS).reduce<string[]>((acc, part, i) => {
    if (i % 2 === 1) {
      if (acc.length) acc[acc.length - 1] += part;
      return acc;
    }
    if (!part) return acc;
    if (part.length > 34) {
      const parts = part.split(/(?<=[，,；;、])/);
      acc.push(...parts.filter(Boolean));
    } else {
      acc.push(part);
    }
    return acc;
  }, []);

  sentences.forEach((seg, si) => {
    const pieceRaw = seg.trim();
    if (!pieceRaw) return;
    const emphasis = /\*\*[^*]+\*\*/.test(pieceRaw);
    const piece = pieceRaw.replace(/\*\*/g, '');
    const isQuestion = /[？?]\s*$/.test(piece);
    const isExclaim = /[！!]\s*$/.test(piece);
    const isStop = /[。…]\s*$/.test(piece);
    const isComma = /[，,；;、]\s*$/.test(piece);
    const isColon = /[：:]\s*$/.test(piece);

    // 句子越长，停顿越接近真人换气
    const lenPause = Math.min(0.12, piece.length * 0.004);
    const baseGap = isStop ? 0.34 : isQuestion ? 0.32 : isExclaim ? 0.26 : isColon ? 0.22 : isComma ? 0.15 : 0.1;

    const rateJ = jitter(piece, si) * 0.05;
    const pitchJ = jitter(piece, si + 97) * 0.045;

    chunks.push({
      text: piece,
      gap: baseGap + lenPause,
      pitchDelta: (isQuestion ? 0.09 : isExclaim ? -0.02 : 0) + pitchJ,
      rateDelta: (isColon ? -0.04 : 0) + (emphasis ? -0.08 : 0) + rateJ,
      volume: emphasis ? 1 : 0.96,
      emphasis,
    });
  });

  // 句尾收：每个句号前的最后一段稍微放慢、略降调，像人说话自然收尾
  for (let i = 0; i < chunks.length - 1; i++) {
    if (chunks[i].gap >= 0.3) {
      chunks[i].rateDelta -= 0.05;
      chunks[i].pitchDelta -= 0.02;
    }
  }
  return chunks;
}

/* ---------------- 朗读器（系统语音） ---------------- */

export interface NarratorOptions {
  preset: VoicePreset;
  speed: number;
  /** 音高微调（1 = 不动）；用于贴合"我的声音" */
  pitchShift?: number;
  onEnd?: () => void;
}

/**
 * 逐句朗读。相比一次念完整段，优点：
 * - 句间有真实停顿，听起来像人在换气，不是机器连读
 * - 问句升调、列举放慢、强调句加重，语气有起伏
 * - 规避 Chrome 长文本 15 秒后卡死的 bug
 */
export class Narrator {
  private queue: Chunk[] = [];
  private idx = 0;
  private timer: any = null;
  private cancelled = false;
  private voice?: SpeechSynthesisVoice;
  private opts: NarratorOptions;
  speaking = false;
  private token = 0;

  constructor(opts: NarratorOptions) {
    this.opts = opts;
    this.voice = pickVoice(opts.preset);
  }

  setVoice(preset: VoicePreset, pitchShift?: number) {
    this.opts.preset = preset;
    if (pitchShift != null) this.opts.pitchShift = pitchShift;
    this.voice = pickVoice(preset);
  }

  speak(text: string) {
    this.cancel();
    const { preset, speed, pitchShift = 1 } = this.opts;
    this.queue = splitForSpeech(text);
    if (!this.queue.length) return;
    this.idx = 0;
    this.cancelled = false;
    this.speaking = true;
    const my = ++this.token;
    this.next(my, preset, speed, pitchShift);
  }

  private next(token: number, preset: VoicePreset, speed: number, pitchShift: number) {
    if (this.cancelled || token !== this.token) return;
    const chunk = this.queue[this.idx];
    if (!chunk) {
      this.finish();
      return;
    }
    const u = new SpeechSynthesisUtterance(chunk.text);
    u.lang = 'zh-CN';
    u.voice = this.voice ?? null;
    u.rate = Math.max(0.6, Math.min(1.7, preset.rate * speed + chunk.rateDelta));
    u.pitch = Math.max(0.5, Math.min(1.8, preset.pitch * pitchShift + chunk.pitchDelta * (preset.expressive || 1)));
    u.volume = chunk.volume;
    u.onend = () => {
      if (token !== this.token) return;
      this.timer = setTimeout(() => {
        if (token !== this.token) return;
        this.idx += 1;
        this.next(token, preset, speed, pitchShift);
      }, Math.round(chunk.gap * 1000));
    };
    u.onerror = () => {
      if (token !== this.token) return;
      this.timer = setTimeout(() => {
        this.idx += 1;
        this.next(token, preset, speed, pitchShift);
      }, 60);
    };
    try {
      window.speechSynthesis.speak(u);
    } catch {
      this.finish();
    }
  }

  private finish() {
    this.speaking = false;
    this.opts.onEnd?.();
  }

  cancel() {
    this.token += 1;
    this.cancelled = true;
    this.speaking = false;
    clearTimeout(this.timer);
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  }
}

/** 试听：设置页里点一下就能听出差别 */
export async function previewVoice(preset: VoicePreset, speed = 1, pitchShift = 1) {
  await waitForVoices();
  const n = new Narrator({ preset, speed, pitchShift });
  n.speak(
    '这就是讲解时的人声效果。注意听：句号这里会停一下，**疑问句**呢，语调会往上走？重点的地方，我会说得慢一点，也重一点。',
  );
  return n;
}

/* ---------------- 录音分析：我的音色画像 ---------------- */

/**
 * 本地分析一段录音：中位基频、音域、节奏、亮度。
 * 全部在浏览器里算，录音不会上传。
 */
export async function analyzeRecording(blob: Blob): Promise<VoiceProfile> {
  const Ctx: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) throw new Error('当前浏览器不支持音频分析');
  const ctx = new Ctx();
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  const data = buf.getChannelData(0);
  const sr = buf.sampleRate;

  const frame = Math.round(sr * 0.04);
  const hop = Math.round(sr * 0.02);
  const f0s: number[] = [];
  let zcrSum = 0;
  let frames = 0;
  let voiced = 0;

  for (let start = 0; start + frame < data.length; start += hop) {
    // 能量门限：静音段跳过
    let energy = 0;
    let zc = 0;
    for (let i = 0; i < frame; i++) {
      const v = data[start + i];
      energy += v * v;
      if (i > 0 && (v >= 0) !== (data[start + i - 1] >= 0)) zc += 1;
    }
    const rms = Math.sqrt(energy / frame);
    frames += 1;
    zcrSum += zc / frame;
    if (rms < 0.012) continue;
    voiced += 1;

    // 自相关估基频（70~400Hz）
    const minLag = Math.floor(sr / 400);
    const maxLag = Math.floor(sr / 70);
    let bestLag = -1;
    let bestVal = 0;
    let prev = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < frame - lag; i += 2) sum += data[start + i] * data[start + i + lag];
      const norm = sum / (frame - lag);
      if (norm > bestVal) {
        bestVal = norm;
        bestLag = lag;
      }
      prev = norm;
    }
    if (bestLag > 0 && bestVal > 0.002) f0s.push(sr / bestLag);
  }

  if (!f0s.length) throw new Error('没检测到清晰的人声，靠近麦克风、连续说 10 秒左右再试');

  f0s.sort((a, b) => a - b);
  const med = f0s[Math.floor(f0s.length * 0.5)];
  const low = f0s[Math.floor(f0s.length * 0.1)];
  const high = f0s[Math.floor(f0s.length * 0.9)];
  const brightness = Math.max(0, Math.min(1, (zcrSum / Math.max(1, frames) - 0.02) / 0.16));
  // 有声段占比越高，通常语速越连贯（只是相对量，用于微调）
  const rate = Math.max(0.9, Math.min(1.12, 0.98 + (voiced / Math.max(1, frames) - 0.55) * 0.25));

  const gender: 'male' | 'female' = med < 165 ? 'male' : 'female';
  const pool = VOICE_PRESETS.filter((p) => p.group === 'teaching' && p.id !== 'custom')
    .filter((p) => (gender === 'male' ? p.baseF0 < 165 : p.baseF0 >= 165));
  const best = [...pool].sort(
    (a, b) => Math.abs(Math.log(med / a.baseF0)) - Math.abs(Math.log(med / b.baseF0)),
  )[0] || VOICE_PRESETS[0];

  const pitchScale = Math.max(0.78, Math.min(1.28, med / best.baseF0));

  return {
    f0: Math.round(med),
    f0Low: Math.round(low),
    f0High: Math.round(high),
    rate,
    brightness,
    gender,
    ms: Math.round(buf.duration * 1000),
    presetId: best.id,
    pitchScale,
    at: Date.now(),
  };
}

/** 把音色画像翻译成一句给云端 TTS 的风格描述 */
export function styleFromProfile(p: VoiceProfile): string {
  const tone = p.f0 < 120 ? '低沉厚实' : p.f0 < 165 ? '偏低的男声' : p.f0 < 210 ? '温和的中音' : p.f0 < 260 ? '清亮的女声' : '偏高偏甜的声线';
  const speed = p.rate > 1.05 ? '语速偏快' : p.rate < 0.98 ? '语速偏慢' : '语速适中';
  const bright = p.brightness > 0.6 ? '音色明亮、靠前' : p.brightness < 0.3 ? '音色偏暗、略带气声' : '音色自然';
  return `模仿这段录音的音色特征：${tone}，${bright}，${speed}，句尾自然下沉，像真人聊天一样有呼吸停顿`;
}

/** 音色画像 → 朗读参数 */
export function profileVoice(profile?: VoiceProfile | null): { preset: VoicePreset; pitchShift: number } {
  if (!profile) return { preset: getPreset('teacher-female'), pitchShift: 1 };
  return { preset: getPreset(profile.presetId), pitchShift: profile.pitchScale };
}

/* ---------------- 云端人声 ---------------- */

function joinUrl(base: string, path: string) {
  return `${(base || '').replace(/\/+$/, '')}${path}`;
}

/**
 * 云端 TTS。两种协议：
 * - openai：POST /audio/speech（OpenAI、以及各家兼容网关）
 * - dashscope：阿里百炼 qwen-tts / cosyvoice（返回音频 URL，再下载）
 * 若设置了 voiceProfile，会把分析出的音色特征写进 instructions，让云端尽量贴近你的声线。
 */
export async function cloudTts(
  s: Settings,
  text: string,
  voiceName?: string,
): Promise<ArrayBuffer> {
  const preset = getPreset(s.voicePreset);
  const voice = voiceName || s.ttsVoice || preset.cloudVoice;
  const profileStyle = s.voiceProfile ? styleFromProfile(s.voiceProfile) : '';
  const style = (s.voiceStyle || '').trim() || profileStyle || preset.style;
  if (!s.ttsModel) throw new Error('当前服务商没配 TTS 模型：去设置里填一个（如 qwen-tts / gpt-4o-mini-tts）');

  if (s.ttsProtocol === 'dashscope') {
    const url = joinUrl(s.baseUrl || 'https://dashscope.aliyuncs.com', '/api/v1/services/aigc/multimodal-generation/generation');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey}` },
      body: JSON.stringify({
        model: s.ttsModel,
        input: { text, voice, ...(style ? { instructions: style } : {}) },
        parameters: { rate: s.speed },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`配音接口 ${res.status}：${t.slice(0, 200)}`);
    }
    const j = await res.json();
    const audioUrl = j?.output?.audio?.url || j?.output?.audio_url;
    if (!audioUrl) throw new Error('配音接口没返回音频地址，检查模型名与音色是否匹配');
    const audio = await fetch(audioUrl);
    if (!audio.ok) throw new Error('音频下载失败');
    return await audio.arrayBuffer();
  }

  // openai 协议
  const res = await fetch(joinUrl(s.baseUrl, '/audio/speech'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey}` },
    body: JSON.stringify({
      model: s.ttsModel,
      input: text,
      voice,
      response_format: 'mp3',
      speed: s.speed,
      ...(style ? { instructions: style } : {}),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`配音接口 ${res.status}：${t.slice(0, 200)}`);
  }
  return await res.arrayBuffer();
}
