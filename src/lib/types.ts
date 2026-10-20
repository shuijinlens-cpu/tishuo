export type Stage = 'primary' | 'junior' | 'senior' | 'college';

export type SceneType =
  | 'title'
  | 'steps'
  | 'formula'
  | 'matrix'
  | 'graph'
  | 'numberline'
  | 'geometry'
  | 'pie'
  | 'objects'
  | 'compare'
  | 'conclusion';

export interface Step {
  text: string;
  note?: string;
  /** 这一步的具体算式（会和文字一起画出来，AI 必须给出，不许跳步） */
  math?: string;
}

/** 矩阵屏里的一帧：一次初等行变换后的矩阵 */
export interface MatFrame {
  /** 这一步做了什么，如"第 2 行 − 3 × 第 1 行" */
  op?: string;
  /** 单元格文本 */
  rows: string[][];
  /** 增广列数（画竖线的位置：从右边数第 aug 列之前） */
  aug?: number;
  /** 高亮第几行（1 基） */
  hi?: number;
}

export interface Curve {
  expr: string;
  color?: string;
  label?: string;
  dashed?: boolean;
}

export interface Pt {
  x: number;
  y: number;
  label?: string;
  color?: string;
}

export interface VLine {
  x: number;
  label?: string;
  color?: string;
}

export interface HLine {
  y: number;
  label?: string;
  color?: string;
}

export interface Mark {
  value: number;
  label?: string;
  color?: string;
  above?: boolean;
}

export interface GeoPoint {
  id: string;
  x: number;
  y: number;
  label?: string;
}

export interface GeoSeg {
  a: string;
  b: string;
  label?: string;
  dashed?: boolean;
  delay?: number;
  color?: string;
}

export interface GeoAngle {
  at: string;
  from: string;
  to: string;
  label?: string;
}

export interface Part {
  label: string;
  value: number;
  color?: string;
}

export interface Scene {
  type: SceneType;
  narration: string;
  duration?: number;
  title?: string;
  subtitle?: string;
  badge?: string;
  math?: string;
  note?: string;
  tip?: string;

  steps?: Step[];

  // matrix
  mats?: MatFrame[];

  // graph
  view?: [number, number, number, number]; // xmin,xmax,ymin,ymax
  curves?: Curve[];
  points?: Pt[];
  vlines?: VLine[];
  hlines?: HLine[];
  area?: { expr: string; from: number; to: number; color?: string };

  // numberline
  min?: number;
  max?: number;
  marks?: Mark[];
  range?: { from: number; to: number; label?: string; color?: string };

  // geometry（坐标系使用 0~100 的方形画布，y 向下）
  pts?: GeoPoint[];
  segs?: GeoSeg[];
  angles?: GeoAngle[];
  ghost?: { rotate?: { center: string; deg: number }; flip?: { axis: 'x' | 'y'; at: number } };

  // pie / strip
  parts?: Part[];
  mode?: 'pie' | 'strip';

  // objects
  emoji?: string;
  groups?: { count: number; label?: string; emoji?: string }[];

  // compare
  left?: { title: string; lines: string[] };
  right?: { title: string; lines: string[] };
}

export interface Storyboard {
  question: string;
  stage: Stage;
  topic: string;
  answer: string;
  scenes: Scene[];
  source?: 'demo' | 'ai' | 'custom' | 'local';
  createdAt?: number;
  /** 通过本机精确验算（不是模型自称对） */
  verified?: boolean;
  /** 完全由精确代数内核生成 */
  exact?: boolean;
  /** 复核发现的问题，会显示在界面上提醒用户 */
  issues?: string[];
}

export type TtsEngine = 'browser' | 'api' | 'none';

/** 识题引擎：auto = 有 Key 走视觉大模型，没有就用端侧 OCR */
export type OcrEngine = 'auto' | 'local' | 'vision';

/** 云端语音协议（决定请求体格式） */
export type TtsProtocol = 'openai' | 'dashscope';

/** 用自己的录音分析出的"音色画像"（本地计算，不上传） */
export interface VoiceProfile {
  /** 中位基频 Hz */
  f0: number;
  f0Low: number;
  f0High: number;
  /** 节奏（每秒字数的相对值，1 = 正常） */
  rate: number;
  /** 音色亮度 0~1（越高越清亮） */
  brightness: number;
  gender: 'male' | 'female';
  /** 录音时长（秒） */
  ms: number;
  /** 自动匹配到的音色预设 */
  presetId: string;
  /** 相对基线的音高缩放 */
  pitchScale: number;
  at: number;
}

export interface Settings {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  textModel: string;
  visionModel: string;
  ttsModel: string;
  ttsVoice: string;
  ttsEngine: TtsEngine;
  ttsProtocol: TtsProtocol;
  /** 音色预设 id，见 lib/voice.ts */
  voicePreset: string;
  /** 自然语言描述想要的音色/语气，会作为 instructions 传给云端 TTS */
  voiceStyle: string;
  /** 录一段自己的声音分析出的音色画像（可空） */
  voiceProfile?: VoiceProfile | null;
  /** 讲解时使用"我的声音"画像（自动匹配音色 + 校准音高语速） */
  useMyVoice: boolean;
  /** 音高微调，1 = 不动 */
  pitchShift: number;
  ocrEngine: OcrEngine;
  theme: 'night' | 'light';
  ratio: '16:9' | '9:16';
  speed: number; // 1 = 正常
  /** 韵律起伏强度 0~1：问句上扬、重点放慢加重、短句干脆长句放缓 */
  prosody: number;
  captions: boolean;
  autoDuration: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}
