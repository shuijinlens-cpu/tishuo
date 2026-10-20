export type Stage = 'primary' | 'junior' | 'senior' | 'college';

export type SceneType =
  | 'title'
  | 'steps'
  | 'formula'
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
  source?: 'demo' | 'ai' | 'custom';
  createdAt?: number;
}

export type TtsEngine = 'browser' | 'api' | 'none';

export interface Settings {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  textModel: string;
  visionModel: string;
  ttsModel: string;
  ttsVoice: string;
  ttsEngine: TtsEngine;
  theme: 'night' | 'light';
  ratio: '16:9' | '9:16';
  speed: number; // 1 = 正常
  captions: boolean;
  autoDuration: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}
