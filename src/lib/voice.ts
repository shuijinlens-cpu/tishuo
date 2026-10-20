import type { Settings, Stage } from './types';

/* =========================================================
 * 音色与朗读
 *
 * 三个层次的"自然人声"：
 * 1) 系统神经语音（Edge / Chrome / 手机上都有"自然"音色）—— 选对音色，机械感就少一大半
 * 2) 断句与韵律 —— 按标点切句、句间留白、疑问句升调、重点句放慢，避免"一口气念完"
 * 3) 云端人声（CosyVoice / OpenAI gpt-4o-mini-tts）—— 真正的播音级，可写"声音风格"
 * ========================================================= */

export interface VoicePreset {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  /** 系统音色偏好关键词，按顺序打分 */
  prefer: string[];
  pitch: number;
  rate: number;
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
    prefer: ['Xiaoxiao', '晓晓', 'Xiaoyi', '晓伊', 'Huihui', '慧慧', 'Yaoyao', '瑶瑶', 'Ting-Ting', 'Google 普通话', 'Female', '女'],
    pitch: 1.06,
    rate: 0.97,
    cloudVoice: 'Cherry',
    style: '温柔耐心的女老师，语速稍慢，咬字清楚，讲到关键步骤时语气加重，像面对面给学生讲题',
    stages: ['primary', 'junior'],
  },
  {
    id: 'teacher-male',
    name: '磁性男老师',
    emoji: '👨‍🏫',
    desc: '沉稳有底气，讲高中大学数理最合适',
    prefer: ['Yunxi', '云希', 'Yunyang', '云扬', 'Yunye', '云野', 'Kangkang', '康康', 'Google 普通话', 'Male', '男'],
    pitch: 0.9,
    rate: 1,
    cloudVoice: 'Ethan',
    style: '沉稳的男老师，声音偏低沉有磁性，语调平稳，推导时节奏干净利落',
    stages: ['senior', 'college'],
  },
  {
    id: 'lively-girl',
    name: '活泼少女',
    emoji: '🙋‍♀️',
    desc: '轻快跳脱，短视频口播感强',
    prefer: ['Xiaoyi', '晓伊', 'Xiaoshuang', '晓双', 'Xiaoxiao', '晓晓', 'Yaoyao', '瑶瑶', 'Female'],
    pitch: 1.18,
    rate: 1.06,
    cloudVoice: 'Cherry',
    style: '年轻活泼的女生，语速偏快，情绪饱满，像在拍知识类短视频，重点地方会不自觉提高音调',
    stages: ['primary'],
  },
  {
    id: 'story-uncle',
    name: '故事叔叔',
    emoji: '🧔',
    desc: '低沉松弛，讲趣味题像讲故事',
    prefer: ['Yunye', '云野', 'Yunfeng', '云枫', 'Yunjian', '云健', 'Kangkang', 'Male'],
    pitch: 0.94,
    rate: 0.94,
    cloudVoice: 'Ethan',
    style: '低沉稳重的男声，像在讲故事，句尾略带笑意，节奏松弛有停顿',
    stages: ['primary'],
  },
  {
    id: 'anchor',
    name: '播音讲解',
    emoji: '🎙️',
    desc: '字正腔圆，适合严肃的考点串讲',
    prefer: ['Yunxi', '云希', 'Yunyang', '云扬', 'Xiaoxiao', '晓晓', 'Ting-Ting'],
    pitch: 1,
    rate: 1.02,
    cloudVoice: 'Serena',
    style: '播音级普通话，吐字清晰、节奏均匀，专业但不生硬',
    stages: ['senior', 'college'],
  },
  {
    id: 'custom',
    name: '自定义',
    emoji: '🎛️',
    desc: '完全按你在设置里写的音色描述',
    prefer: [],
    pitch: 1,
    rate: 1,
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
}

const ENDERS = /([。！？!?…]+|\.(?=\s|$))/;

/**
 * 把一段口播稿切成"呼吸单位"：
 * - 长句按逗号/顿号二次切分，避免一口气念 50 字
 * - 句号/问号后留长一点的空白
 * - 问句自动升调、感叹句略降调加力、冒号后的列举稍慢
 */
export function splitForSpeech(narration: string): Chunk[] {
  const text = (narration || '').trim();
  if (!text) return [];
  const chunks: Chunk[] = [];
  // 先把长句按中文逗号拆开
  const sentences = text.split(ENDERS).reduce<string[]>((acc, part, i) => {
    if (i % 2 === 1) {
      // 标点本身，接到上一句
      if (acc.length) acc[acc.length - 1] += part;
      return acc;
    }
    if (!part) return acc;
    // 一逗到底的长句再拆
    if (part.length > 34) {
      const parts = part.split(/(?<=[，,；;、])/);
      acc.push(...parts.filter(Boolean));
    } else {
      acc.push(part);
    }
    return acc;
  }, []);

  for (const raw of sentences) {
    const piece = raw.trim();
    if (!piece) continue;
    const isQuestion = /[？?]\s*$/.test(piece);
    const isExclaim = /[！!]\s*$/.test(piece);
    const isStop = /[。…]\s*$/.test(piece);
    const isComma = /[，,；;、]\s*$/.test(piece);
    const isColon = /[：:]\s*$/.test(piece);
    chunks.push({
      text: piece,
      gap: isStop ? 0.34 : isQuestion ? 0.32 : isExclaim ? 0.26 : isColon ? 0.22 : isComma ? 0.16 : 0.1,
      pitchDelta: isQuestion ? 0.08 : isExclaim ? -0.03 : 0,
      rateDelta: isColon ? -0.04 : 0,
    });
  }
  return chunks;
}

/* ---------------- 朗读器（系统语音） ---------------- */

export interface NarratorOptions {
  preset: VoicePreset;
  speed: number;
  onEnd?: () => void;
}

/**
 * 逐句朗读。相比一次念完整段，优点：
 * - 句间有真实停顿，听起来像人在换气，不是机器连读
 * - 问句升调、列举放慢，语气有起伏
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

  setVoice(preset: VoicePreset) {
    this.opts.preset = preset;
    this.voice = pickVoice(preset);
  }

  speak(text: string) {
    this.cancel();
    const { preset, speed } = this.opts;
    this.queue = splitForSpeech(text);
    if (!this.queue.length) return;
    this.idx = 0;
    this.cancelled = false;
    this.speaking = true;
    const my = ++this.token;
    this.next(my, preset, speed);
  }

  private next(token: number, preset: VoicePreset, speed: number) {
    if (this.cancelled || token !== this.token) return;
    const chunk = this.queue[this.idx];
    if (!chunk) {
      this.finish();
      return;
    }
    const u = new SpeechSynthesisUtterance(chunk.text);
    u.lang = 'zh-CN';
    u.voice = this.voice ?? null;
    u.rate = Math.max(0.6, Math.min(1.6, preset.rate * speed + chunk.rateDelta));
    u.pitch = Math.max(0.6, Math.min(1.6, preset.pitch + chunk.pitchDelta));
    u.volume = 1;
    u.onend = () => {
      if (token !== this.token) return;
      this.timer = setTimeout(() => {
        if (token !== this.token) return;
        this.idx += 1;
        this.next(token, preset, speed);
      }, Math.round(chunk.gap * 1000));
    };
    u.onerror = () => {
      if (token !== this.token) return;
      this.timer = setTimeout(() => {
        this.idx += 1;
        this.next(token, preset, speed);
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
export async function previewVoice(preset: VoicePreset, speed = 1) {
  await waitForVoices();
  const n = new Narrator({ preset, speed });
  n.speak(
    '这就是讲解时的人声效果。注意听：句号这里会停一下，疑问句呢，语调会往上走？重点的地方，我会说得慢一点。',
  );
  return n;
}

/* ---------------- 云端人声 ---------------- */

function joinUrl(base: string, path: string) {
  return `${(base || '').replace(/\/+$/, '')}${path}`;
}

/**
 * 云端 TTS。两种协议：
 * - openai：POST /audio/speech（OpenAI、以及各家兼容网关）
 * - dashscope：阿里百炼 qwen-tts / cosyvoice（返回音频 URL，再下载）
 */
export async function cloudTts(
  s: Settings,
  text: string,
  voiceName?: string,
): Promise<ArrayBuffer> {
  const preset = getPreset(s.voicePreset);
  const voice = voiceName || s.ttsVoice || preset.cloudVoice;
  const style = (s.voiceStyle || '').trim() || preset.style;
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
