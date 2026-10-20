/**
 * 把 OCR 引擎的运行文件复制到 public/，让应用不依赖任何公网 CDN。
 * （公司网络 / 校园网 / 国内手机网络访问 jsdelivr 经常失败，所以必须自带）
 */
import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const root = process.cwd();
const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'public/tesseract/worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'public/tesseract/core/tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm', 'public/tesseract/core/tesseract-core-lstm.wasm'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'public/tesseract/core/tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm', 'public/tesseract/core/tesseract-core-simd-lstm.wasm'],
];

let copied = 0;
for (const [from, to] of files) {
  const src = join(root, from);
  if (!existsSync(src)) {
    console.warn(`[prepare-assets] 缺少 ${from}，跳过（OCR 可能不可用）`);
    continue;
  }
  const dst = join(root, to);
  mkdirSync(dirname(dst), { recursive: true });
  if (existsSync(dst) && statSync(dst).size === statSync(src).size) continue;
  copyFileSync(src, dst);
  copied += 1;
}

const modelDir = join(root, 'public/tessdata');
const models = ['chi_sim.traineddata.gz', 'eng.traineddata.gz'];
for (const m of models) {
  if (!existsSync(join(modelDir, m))) {
    console.warn(`[prepare-assets] 缺少中文/英文识别模型 ${m}`);
  }
}

console.log(`[prepare-assets] 完成，复制 ${copied} 个 OCR 引擎文件`);
