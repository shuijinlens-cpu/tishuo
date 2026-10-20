/**
 * 给 Capacitor 的 Android 模板补上麦克风权限（录音 / 我的声音要用）。
 *
 * 为什么需要：
 * 「我的声音 / 录自己的音色」走的是浏览器标准 navigator.mediaDevices.getUserMedia，
 * 在 Capacitor 打包出来的 App 里，WebView 的麦克风请求由 BridgeWebChromeClient
 * 转发成原生权限申请（这段 Capacitor 已经写好了）。但 Android 规定：
 * **只有 Manifest 里声明过的权限才能申请**。模板默认只声明 INTERNET，
 * 于是 getUserMedia 直接被拒、点录音毫无反应。
 *
 * 为什么改成打模板补丁，而不是在 CI 里改 android/ 工程：
 * `npx cap add android` 干的事就是把
 *   node_modules/@capacitor/cli/assets/android-template.tar.gz
 * 解压到 android/。所以只要在这里把压缩包里的
 * app/src/main/AndroidManifest.xml 改好，CI 不需要任何额外步骤，
 * 生成的工程天然就带 RECORD_AUDIO。幂等：已含权限则直接跳过。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BLOCK = 512;
const MANIFEST_ENTRY = 'app/src/main/AndroidManifest.xml';

const PERMISSIONS = [
  '    <uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
];

/** 定长八进制字段：n 位内容 + 结尾 NUL */
const octalField = (value, width) => value.toString(8).padStart(width - 1, '0') + '\0';

/** 重算 USTAR 校验和：先把校验位填成 8 个空格再求和 */
function fixChecksum(header) {
  header.fill(0x20, 148, 156);
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf8');
}

function parseTar(buf) {
  const entries = [];
  let off = 0;
  while (off + BLOCK <= buf.length) {
    const header = buf.subarray(off, off + BLOCK);
    let blank = true;
    for (const byte of header) {
      if (byte !== 0) {
        blank = false;
        break;
      }
    }
    if (blank) break; // 结尾空块

    let name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    if (prefix) name = `${prefix}/${name}`;

    const sizeStr = header.subarray(124, 136).toString('ascii').replace(/[^0-7]/g, '');
    const size = parseInt(sizeStr, 8) || 0;
    const typeflag = String.fromCharCode(header[156]);
    const blocks = Math.ceil(size / BLOCK) * BLOCK;

    entries.push({
      name: name.replace(/^\.\//, ''),
      typeflag,
      header: Buffer.from(header),
      data: Buffer.from(buf.subarray(off + BLOCK, off + BLOCK + size)),
      pad: blocks - size,
    });
    off += BLOCK + blocks;
  }
  return entries;
}

function buildTar(entries) {
  const chunks = [];
  for (const entry of entries) {
    const header = Buffer.from(entry.header);
    // '0'（新版）或 '\0'（老版）都表示普通文件
    if (entry.typeflag === '0' || entry.typeflag === '\0') {
      header.write(octalField(entry.data.length, 12), 124, 12, 'utf8');
    }
    fixChecksum(header);
    chunks.push(header, entry.data);
    // 注意：内容长度变了，填充必须按新长度算，否则后面的块全部错位
    const pad = (BLOCK - (entry.data.length % BLOCK)) % BLOCK;
    if (pad > 0) chunks.push(Buffer.alloc(pad));
  }
  chunks.push(Buffer.alloc(BLOCK * 2)); // 两个空块收尾
  return Buffer.concat(chunks);
}

export function patchAndroidTemplate(root = process.cwd()) {
  const archive = join(root, 'node_modules/@capacitor/cli/assets/android-template.tar.gz');
  if (!existsSync(archive)) {
    console.log('[patch-android] 未找到 Capacitor 模板，跳过（不影响网页构建）');
    return false;
  }

  let entries;
  try {
    entries = parseTar(gunzipSync(readFileSync(archive)));
  } catch (e) {
    console.warn('[patch-android] 模板解析失败，跳过：', e?.message || e);
    return false;
  }

  const target = entries.find((e) => e.name === MANIFEST_ENTRY);
  if (!target) {
    console.warn(`[patch-android] 模板里没有 ${MANIFEST_ENTRY}，跳过`);
    return false;
  }
  if (target.data.includes('RECORD_AUDIO')) {
    console.log('[patch-android] 模板已含麦克风权限，跳过');
    return false;
  }

  const source = target.data.toString('utf8');
  const patched = source.replace(
    /([ \t]*)<\/manifest>/,
    (_, indent) => `\n${PERMISSIONS.join('\n')}\n${indent}</manifest>`,
  );
  if (patched === source) {
    console.warn('[patch-android] 没找到 </manifest>，跳过');
    return false;
  }

  target.data = Buffer.from(patched, 'utf8');
  writeFileSync(archive, gzipSync(buildTar(entries), { level: 9 }));
  console.log('[patch-android] 已给 Android 模板加上 RECORD_AUDIO / MODIFY_AUDIO_SETTINGS');
  return true;
}

/** 直接 node 运行时也生效 */
const invokedDirectly =
  process.argv[1] && /patch-android-template\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) patchAndroidTemplate();
