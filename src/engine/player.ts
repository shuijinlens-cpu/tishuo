import type { Scene, Settings, Storyboard } from '../lib/types';
import { estimateDuration, renderScene, type RenderOpts } from './render';

export interface TimelineItem {
  scene: Scene;
  dur: number;
  start: number;
  audio?: AudioBuffer | null;
}

export interface PlayerConfig {
  storyboard: Storyboard;
  settings: Settings;
  buffers?: (AudioBuffer | null)[];
  onTime?: (t: number, playing: boolean, index: number) => void;
  onEnd?: () => void;
}

let sharedCtx: AudioContext | null = null;
export function getAudioContext(): AudioContext {
  if (!sharedCtx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    sharedCtx = new AC();
  }
  if (sharedCtx.state === 'suspended') sharedCtx.resume().catch(() => {});
  return sharedCtx;
}

export class Player {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  items: TimelineItem[] = [];
  total = 0;
  t = 0;
  playing = false;
  cfg: PlayerConfig | null = null;
  private raf = 0;
  private sources: AudioBufferSourceNode[] = [];
  private dest: MediaStreamAudioDestinationNode | null = null;
  private ctxStart = 0;
  private spokenIndex = -1;
  private waiters: (() => void)[] = [];
  width = 1280;
  height = 720;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const c = canvas.getContext('2d', { alpha: false });
    if (!c) throw new Error('canvas 2d 不可用');
    this.ctx = c;
  }

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.render(this.t);
  }

  load(cfg: PlayerConfig) {
    this.stopAudio();
    this.cfg = cfg;
    const { storyboard, settings, buffers } = cfg;
    let acc = 0;
    this.items = storyboard.scenes.map((scene, i) => {
      const auto = estimateDuration(scene.narration, settings.speed);
      const base = settings.autoDuration ? Math.max(scene.duration ?? 0, auto) : (scene.duration ?? auto);
      const buf = buffers?.[i] || null;
      const dur = buf ? Math.max(base, buf.duration + 0.7) : base;
      const item = { scene, dur, start: acc, audio: buf };
      acc += dur;
      return item;
    });
    this.total = acc || 1;
    this.t = Math.min(this.t, this.total);
    this.render(this.t);
  }

  private renderOpts(): RenderOpts {
    const sb = this.cfg!.storyboard;
    const idx = this.indexAt(this.t);
    return {
      stage: sb.stage,
      theme: this.cfg!.settings.theme,
      index: idx,
      total: this.items.length,
      topic: sb.topic || '',
      captions: this.cfg!.settings.captions,
    };
  }

  indexAt(t: number) {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (t < it.start + it.dur) return i;
    }
    return Math.max(0, this.items.length - 1);
  }

  render(t: number) {
    if (!this.cfg || !this.items.length) {
      this.ctx.fillStyle = '#0A0E1A';
      this.ctx.fillRect(0, 0, this.width, this.height);
      return;
    }
    const i = this.indexAt(t);
    const it = this.items[i];
    this.t = t;
    renderScene(this.ctx, this.width, this.height, it.scene, Math.max(0, t - it.start), it.dur, {
      ...this.renderOpts(),
      index: i,
    });
  }

  private ensureDest() {
    const ac = getAudioContext();
    if (!this.dest) {
      this.dest = ac.createMediaStreamDestination();
    }
    return { ac, dest: this.dest };
  }

  /** 录制用：把音频接到 MediaStream 上 */
  getAudioStream(): MediaStream | null {
    if (!this.cfg?.buffers?.some(Boolean)) return null;
    const { dest } = this.ensureDest();
    return dest.stream;
  }

  private scheduleAudio(from: number) {
    const { ac, dest } = this.ensureDest();
    const now = ac.currentTime;
    this.items.forEach((it) => {
      if (!it.audio) return;
      const sceneEnd = it.start + it.dur;
      if (sceneEnd <= from) return;
      const offset = Math.max(0, from - it.start);
      if (offset >= it.audio.duration) return;
      const src = ac.createBufferSource();
      src.buffer = it.audio;
      src.connect(ac.destination);
      src.connect(dest);
      const when = now + Math.max(0, it.start - from);
      try {
        src.start(when, offset);
        this.sources.push(src);
      } catch {
        /* ignore */
      }
    });
  }

  private stopAudio() {
    this.sources.forEach((s) => {
      try { s.stop(); } catch { /* ignore */ }
    });
    this.sources = [];
  }

  private speak(index: number) {
    if (this.cfg?.settings.ttsEngine !== 'browser') return;
    if (!('speechSynthesis' in window)) return;
    if (this.spokenIndex === index) return;
    this.spokenIndex = index;
    const it = this.items[index];
    if (!it) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(it.scene.narration);
    u.lang = 'zh-CN';
    u.rate = 1.02 * (this.cfg?.settings.speed || 1);
    u.pitch = this.cfg?.storyboard.stage === 'primary' ? 1.12 : 1;
    const voices = window.speechSynthesis.getVoices();
    const zh = voices.find((v) => /zh-CN|Chinese|Xiaoxiao|Yaoyao|Huihui/i.test(v.lang + v.name));
    if (zh) u.voice = zh;
    window.speechSynthesis.speak(u);
  }

  play() {
    if (!this.cfg) return;
    if (this.playing) return;
    if (this.t >= this.total - 0.05) this.t = 0;
    this.playing = true;
    const ac = getAudioContext();
    this.ctxStart = ac.currentTime - this.t;
    this.scheduleAudio(this.t);
    this.spokenIndex = -1;
    const loop = () => {
      if (!this.playing) return;
      const t = ac.currentTime - this.ctxStart;
      this.t = Math.min(t, this.total);
      this.render(this.t);
      this.cfg?.onTime?.(this.t, true, this.indexAt(this.t));
      this.speak(this.indexAt(this.t));
      if (t >= this.total) {
        this.playing = false;
        window.speechSynthesis?.cancel();
        this.cfg?.onEnd?.();
        this.waiters.splice(0).forEach((w) => w());
        return;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.stopAudio();
    window.speechSynthesis?.cancel();
    this.spokenIndex = -1;
    this.cfg?.onTime?.(this.t, false, this.indexAt(this.t));
  }

  seek(t: number) {
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.t = Math.max(0, Math.min(this.total, t));
    this.render(this.t);
    this.cfg?.onTime?.(this.t, false, this.indexAt(this.t));
    if (wasPlaying) this.play();
  }

  playToEnd(): Promise<void> {
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      this.play();
    });
  }

  destroy() {
    this.pause();
    this.stopAudio();
  }
}

/* ---------------- 录制导出 ---------------- */

function pickMime(): string {
  const cands = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  for (const c of cands) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

export interface RecordResult {
  blob: Blob;
  mime: string;
  hasAudio: boolean;
}

export async function recordVideo(
  player: Player,
  onProgress?: (p: number) => void,
): Promise<RecordResult> {
  if (!player.cfg) throw new Error('未加载讲解');
  const fps = 30;
  const stream = player.canvas.captureStream(fps);
  const audioStream = player.getAudioStream();
  let hasAudio = false;
  if (audioStream) {
    const track = audioStream.getAudioTracks()[0];
    if (track) {
      stream.addTrack(track);
      hasAudio = true;
    }
  }
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  player.seek(0);
  await new Promise((r) => setTimeout(r, 120));
  rec.start(200);
  player.play();
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      onProgress?.(Math.min(1, player.t / player.total));
      if (!player.playing) {
        clearInterval(timer);
        resolve();
      }
    }, 200);
  });
  await new Promise((r) => setTimeout(r, 320));
  await new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
    rec.stop();
  });
  stream.getVideoTracks().forEach((t) => t.stop());
  window.speechSynthesis?.cancel();
  return { blob: new Blob(chunks, { type: mime || 'video/webm' }), mime: mime || 'video/webm', hasAudio };
}
