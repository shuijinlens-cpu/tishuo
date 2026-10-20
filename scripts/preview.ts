/* 离线渲染校验脚本：把示例分镜逐屏画成 PNG，用来检查排版/溢出问题 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { SAMPLES } from '../src/lib/samples';
import { renderScene, estimateDuration } from '../src/engine/render';

const fontCandidates = [
  'C:/Windows/Fonts/msyh.ttc',
  'C:/Windows/Fonts/msyhbd.ttc',
  'C:/Windows/Fonts/simsun.ttc',
  'C:/Windows/Fonts/arial.ttf',
  'C:/Windows/Fonts/cambria.ttc',
  'C:/Windows/Fonts/times.ttf',
];
for (const f of fontCandidates) {
  if (existsSync(f)) {
    try { GlobalFonts.registerFromPath(f); } catch { /* ignore */ }
  }
}
console.log('已注册字体：', GlobalFonts.families.slice(0, 8).map((f: any) => f.family).join(', '));

const outDir = '.preview/out';
mkdirSync(outDir, { recursive: true });

const only = process.argv[2];
const ratio = process.argv[3] === 'tall' ? 'tall' : 'wide';
const W = ratio === 'wide' ? 1280 : 720;
const H = ratio === 'wide' ? 720 : 1280;

for (const sample of SAMPLES) {
  if (only && sample.id !== only) continue;
  sample.storyboard.scenes.forEach((scene, i) => {
    const dur = estimateDuration(scene.narration);
    const t = dur * 0.72;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d') as any;
    renderScene(ctx, W, H, scene, t, dur, {
      stage: sample.stage,
      theme: 'night',
      index: i,
      total: sample.storyboard.scenes.length,
      topic: sample.storyboard.topic,
      captions: true,
    });
    const name = `${sample.id}-${String(i).padStart(2, '0')}-${scene.type}.png`;
    writeFileSync(`${outDir}/${name}`, canvas.toBuffer('image/png'));
  });
}
console.log('完成 →', outDir);
