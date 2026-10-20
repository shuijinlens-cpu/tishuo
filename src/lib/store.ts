import { DEFAULT_SETTINGS, PROVIDERS } from './ai';
import type { Settings } from './types';

const KEY = 'tishuo.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 隐私模式下可能失败，忽略 */
  }
}

export function applyPreset(s: Settings, providerId: string): Settings {
  const p = PROVIDERS.find((x) => x.id === providerId);
  if (!p) return s;
  const sameBase = s.baseUrl && p.baseUrl && s.baseUrl === p.baseUrl;
  return {
    ...s,
    providerId,
    baseUrl: p.baseUrl || (sameBase ? s.baseUrl : ''),
    textModel: p.textModel || s.textModel,
    visionModel: p.visionModel || s.visionModel,
    ttsModel: p.ttsModel || s.ttsModel,
    ttsVoice: p.ttsVoice || s.ttsVoice,
    ttsEngine: p.id === 'demo' ? 'browser' : s.ttsEngine,
  };
}

/** 压缩图片，减少上传体积（识别效果不受影响） */
export async function compressImage(file: File, maxSide = 1400): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('读取图片失败'));
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('图片解码失败'));
    im.src = dataUrl;
  });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (scale >= 0.999 && file.size < 900 * 1024) return dataUrl;
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * scale);
  cv.height = Math.round(img.height * scale);
  const ctx = cv.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.86);
}
