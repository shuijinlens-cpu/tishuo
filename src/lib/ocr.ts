/**
 * 端侧识题（不联网、不需要 Key）
 *
 * 用 tesseract.js（LSTM 引擎，中文简体 + 英文）在浏览器 / WebView 里直接跑 OCR。
 * 模型与 wasm 全部随应用一起发布（public/tessdata、public/tesseract），
 * 不走公网 CDN，所以国内网络、离线、APK 内都能用。
 */

export interface OcrProgress {
  /** 0~1，拿不到进度时给个大概值 */
  pct: number;
  label: string;
}

export interface OcrResult {
  text: string;
  /** 0~100，tesseract 给出的整体置信度 */
  confidence: number;
  engine: 'local' | 'vision';
  /** 识别质量提示（低置信度、内容过短等） */
  warn?: string;
}

/* ---------------- 资源路径（跟随站点子目录） ---------------- */

function assetBase(): string {
  // 站点可能部署在 /tishuo/ 这样的子路径下，用当前文档地址推绝对路径，
  // 这样 worker 里也能正确解析（相对路径在 worker 上下文会失效）。
  const href = typeof location !== 'undefined' ? location.href : 'http://localhost/';
  const dir = href.replace(/[^/]*$/, '');
  return dir;
}

function asset(path: string) {
  return new URL(path, assetBase()).href;
}

/* ---------------- 图像预处理 ---------------- */

/**
 * 拍照题的常见问题：光线不均、字小、背景灰。
 * 这里做「放大 + 灰度 + 对比度拉伸 + Otsu 二值化」，中文识别率能明显提升。
 */
async function preprocess(dataUrl: string, targetLongSide = 1900): Promise<HTMLCanvasElement> {
  const img = await loadImage(dataUrl);
  const scale = Math.min(3, Math.max(1, targetLongSide / Math.max(img.width, img.height)));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('画布不可用');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, w, h);
  } catch {
    return cv; // 跨域/权限受限时直接用原图
  }
  const px = data.data;
  const gray = new Uint8ClampedArray(w * h);
  const hist = new Array(256).fill(0);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    // 亮度权重偏向绿色通道，更接近人眼对印刷体的感知
    const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    gray[p] = g;
    hist[g]++;
  }

  // Otsu 阈值
  const total = w * h;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      thr = t;
    }
  }

  // 混合：保留一点原灰度（避免细笔画被切碎），再按阈值向黑白两端拉伸
  for (let p = 0; p < total; p++) {
    const g = gray[p];
    const boosted = g > thr ? Math.min(255, g + (255 - g) * 0.55) : Math.max(0, g - g * 0.55);
    const v = boosted * 0.55 + (g > thr ? 255 : 0) * 0.45;
    const i = p * 4;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return cv;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('图片解码失败，换一张试试'));
    im.src = src;
  });
}

/* ---------------- 文本清洗 ---------------- */

const FULL2HALF: Record<string, string> = {
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  'Ａ': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'Ｄ': 'D', 'Ｅ': 'E', 'Ｆ': 'F', 'Ｇ': 'G', 'Ｈ': 'H', 'Ｉ': 'I',
  'Ｊ': 'J', 'Ｋ': 'K', 'Ｌ': 'L', 'Ｍ': 'M', 'Ｎ': 'N', 'Ｏ': 'O', 'Ｐ': 'P', 'Ｑ': 'Q', 'Ｒ': 'R',
  'Ｓ': 'S', 'Ｔ': 'T', 'Ｕ': 'U', 'Ｖ': 'V', 'Ｗ': 'W', 'Ｘ': 'X', 'Ｙ': 'Y', 'Ｚ': 'Z',
  'ａ': 'a', 'ｂ': 'b', 'ｃ': 'c', 'ｄ': 'd', 'ｅ': 'e', 'ｆ': 'f', 'ｇ': 'g', 'ｈ': 'h', 'ｉ': 'i',
  'ｊ': 'j', 'ｋ': 'k', 'ｌ': 'l', 'ｍ': 'm', 'ｎ': 'n', 'ｏ': 'o', 'ｐ': 'p', 'ｑ': 'q', 'ｒ': 'r',
  'ｓ': 's', 'ｔ': 't', 'ｕ': 'u', 'ｖ': 'v', 'ｗ': 'w', 'ｘ': 'x', 'ｙ': 'y', 'ｚ': 'z',
  '＋': '+', '－': '-', '＝': '=', '＊': '×', '／': '/', '％': '%', '（': '(', '）': ')',
  '［': '[', '］': ']', '，': '，', '。': '。', '：': '：', '；': '；',
};

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  'n': 'ⁿ', 'i': 'ⁱ',
};

/** 把 OCR 的脏结果整理成「人能读、模型也能读」的题目文本 */
export function tidyOcrText(raw: string): string {
  let s = raw || '';

  // 全角转半角（数字/字母/常见符号）
  s = s.replace(/[０-９Ａ-Ｚａ-ｚ＋－＝＊／％（）［］]/g, (c) => FULL2HALF[c] ?? c);

  // 常见的 OCR 误认：中文语境里的数学符号
  s = s
    .replace(/[，,]{2,}/g, '，')
    .replace(/[。．]{2,}/g, '。')
    .replace(/[·・•]/g, '·')
    .replace(/(\d)\s*[xX]\s*(?=\d)/g, '$1×')
    .replace(/(\d)\s*[÷]\s*/g, '$1÷')
    .replace(/[＜]/g, '<')
    .replace(/[＞]/g, '>')
    .replace(/[＝]/g, '=')
    .replace(/\^\{?(\d|n|i)\}?/gi, (_, p: string) => SUP[p] ?? `^${p}`)
    .replace(/√\s*\(/g, '√(')
    .replace(/[ \t\u00a0]+/g, ' ');

  // 中文之间的空格是 OCR 噪声，去掉；保留中英文/数字之间的
  s = s.replace(/([\u4e00-\u9fa5]) +(?=[\u4e00-\u9fa5])/g, '$1');

  // 数学式里的 X 几乎都是未知数 x（OCR 常认成大写）
  if (/[xX]/.test(s)) {
    s = s.replace(/(^|[\d+\-*/=(（\s])X(?=[\d+\-*/=)）\s]|$)/g, (_, p1: string) => `${p1}x`);
  }

  // 运算符两侧统一留一个空格，读起来和抄到纸上一样
  s = s.replace(/\s*([+\-*/=×÷])\s*/g, ' $1 ').replace(/ {2,}/g, ' ');

  // 中文后面的半角冒号/逗号换成全角
  s = s.replace(/([\u4e00-\u9fa5])\s*:\s*/g, '$1：').replace(/([\u4e00-\u9fa5])\s*,\s*/g, '$1，');

  // 逐行整理：去掉空行与页码类噪声
  const lines = s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      if (/^[-—_=·\s]{3,}$/.test(l)) return false; // 分隔线
      if (/^第?\s*\d+\s*页$/.test(l)) return false; // 页码
      if (/^\d{1,2}$/.test(l) && l.length <= 2) return false; // 孤立的页脚数字
      return true;
    });

  // 短行合并：只有「明显被截断的句子」才接上，
  // 题干行尾常是数字/等号（2x+3=11），不能乱并
  const SENT_START = /^(答|解|求|证|证明|若|则|已|如|例|设|第|（|\(|[0-9]+[.、）)])/;
  const merged: string[] = [];
  for (const line of lines) {
    const prev = merged[merged.length - 1];
    const prevOpen = prev && !/[。！？：；，、）)$]$/.test(prev) && !/[\d=]$/.test(prev);
    if (
      prev &&
      prevOpen &&
      prev.length < 22 &&
      line.length < 22 &&
      !SENT_START.test(line)
    ) {
      merged[merged.length - 1] = prev + line;
    } else {
      merged.push(line);
    }
  }

  return merged.join('\n').trim();
}

/** 粗判识别结果是否像一道题 */
export function judgeOcr(text: string, confidence: number): string | undefined {
  const t = text.replace(/\s/g, '');
  if (!t) return '没识别出文字：把题目放正、光线调亮一点再拍一次。';
  if (t.length < 10) return '识别到的内容太少，可能只拍到了局部：调整取景，让整道题都在画面里。';
  if (confidence > 0 && confidence < 55) return '识别置信度偏低，请重点核对数字和符号（识别文本框可直接改）。';
  if (!/[\u4e00-\u9fa5]/.test(t) && !/\d/.test(t)) return '识别结果看起来不像题目，建议重拍或换用「AI 识题」。';
  return undefined;
}

/* ---------------- 引擎 ---------------- */

let workerPromise: Promise<any> | null = null;
let workerLang = '';

async function getWorker(onProgress?: (p: OcrProgress) => void) {
  const lang = 'chi_sim+eng';
  if (workerPromise && workerLang === lang) return workerPromise;
  workerLang = lang;
  workerPromise = (async () => {
    const { createWorker } = await import('tesseract.js');
    // 明确指定 core 文件：只带 simd / 非 simd 两个 LSTM 版本，避免多下载几 MB
    let useSimd = false;
    try {
      const { simd } = await import('wasm-feature-detect');
      useSimd = await simd();
    } catch {
      useSimd = false;
    }
    const coreFile = `tesseract/core/tesseract-core-${useSimd ? 'simd-' : ''}lstm.wasm.js`;
    const w = await createWorker(['chi_sim', 'eng'], 1, {
      workerPath: asset('tesseract/worker.min.js'),
      corePath: asset(coreFile),
      langPath: asset('tessdata'),
      gzip: true,
      logger: (m: any) => {
        if (!onProgress) return;
        const status = String(m?.status || '');
        const pct = typeof m?.progress === 'number' ? m.progress : 0;
        const map: Record<string, string> = {
          'loading tesseract core': '加载识别引擎',
          'initializing tesseract': '初始化引擎',
          'loading language traineddata': '加载中文模型（首次约 2MB）',
          'initializing api': '准备就绪',
          'recognizing text': '正在识别文字',
        };
        const label = map[status] || status || '识别中';
        // 前 4 个阶段合并成前 35%，识别阶段占剩余
        const overall = status === 'recognizing text' ? 0.35 + pct * 0.65 : 0.35 * pct;
        onProgress({ pct: Math.min(0.99, overall), label });
      },
    });
    return w;
  })();
  try {
    return await workerPromise;
  } catch (e) {
    workerPromise = null;
    workerLang = '';
    throw e;
  }
}

export async function localOcr(
  dataUrl: string,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrResult> {
  onProgress?.({ pct: 0.02, label: '处理图片' });
  const canvas = await preprocess(dataUrl);
  onProgress?.({ pct: 0.12, label: '启动识别引擎' });
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(canvas);
  const text = tidyOcrText(String(data?.text || ''));
  const confidence = Number(data?.confidence || 0);
  return { text, confidence, engine: 'local', warn: judgeOcr(text, confidence) };
}

/** 提前把模型下载到本地缓存，进页面时后台预热，用户拍照后不用等 */
export async function warmupOcr() {
  try {
    await getWorker();
    return true;
  } catch {
    return false;
  }
}

export async function disposeOcr() {
  if (!workerPromise) return;
  try {
    const w = await workerPromise;
    await w.terminate();
  } catch {
    /* ignore */
  }
  workerPromise = null;
  workerLang = '';
}
