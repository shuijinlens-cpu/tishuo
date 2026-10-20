/**
 * 把 OCR 引擎的运行文件复制到 public/，让应用不依赖任何公网 CDN。
 * （公司网络 / 校园网 / 国内手机网络访问 jsdelivr 经常失败，所以必须自带）
 */
import { copyFileSync, mkdirSync, existsSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname, basename } from 'node:path';

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

/**
 * 模型：仓库里存的是 .gz（省体积），但安卓 aapt 打包会把 .gz 后缀吞掉，
 * 导致 APK 里只剩 *.traineddata 而运行时请求 *.traineddata.gz 404。
 * 所以这里统一解压成未压缩的 *.traineddata，运行时 gzip:false，网页端和 APK 一致。
 */
const modelDir = join(root, 'public/tessdata');
const modelSrc = join(root, 'models');
mkdirSync(modelDir, { recursive: true });
const models = ['chi_sim.traineddata', 'eng.traineddata'];
let unzipped = 0;
for (const m of models) {
  const plain = join(modelDir, m);
  const gz = join(modelSrc, `${m}.gz`);
  if (existsSync(plain) && statSync(plain).size > 0) continue;
  if (!existsSync(gz)) {
    console.warn(`[prepare-assets] 缺少识别模型 ${m} / ${m}.gz`);
    continue;
  }
  writeFileSync(plain, gunzipSync(readFileSync(gz)));
  unzipped += 1;
}
console.log(`[prepare-assets] 解压 ${unzipped} 个识别模型`);

console.log(`[prepare-assets] 完成，复制 ${copied} 个 OCR 引擎文件`);
