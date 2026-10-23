/**
 * 点阵母题一致性检查
 *
 * RN 侧（src/components/DotMatrixMark.tsx）不能 import tools/ 下的脚本，
 * 所以首页品牌位的几何是把 icon-mark.js 里的常数抄了一份。抄就会漂，
 * 漂了没人发现 —— 这个脚本就是那件「没人发现」的事的守卫。
 *
 * 用法：node tools/verify/mark-sync.mjs   （退出码非 0 表示漂移）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MARK = path.join(ROOT, 'tools/icons/icon-mark.js');
const RN = path.join(ROOT, 'src/components/DotMatrixMark.tsx');

/** 从 `KEY: value` / `const KEY = value` 两种写法里取值，不执行文件。
 *  允许行尾注释（`lean: 7,  // 说明`），否则改了注释就把检查弄瞎了。 */
const NUM = String.raw`(-?[\d.]+)\s*,?\s*(?:\/\/[^\n]*)?`;
function pick(src, name, kind) {
  const re =
    kind === 'obj'
      ? new RegExp(`^\\s{2}${name}:\\s*${NUM}$`, 'm')
      : new RegExp(`const ${name} = ${NUM};`, 'm');
  const m = src.match(re);
  return m ? Number(m[1]) : null;
}

const markSrc = fs.readFileSync(MARK, 'utf8');
const rnSrc = fs.readFileSync(RN, 'utf8');

// icon-mark.js 里彩色层的 spec 块，和 RN 侧的顶层常数一一对应
const specBlock = markSrc.match(/const ICON_DOTS = \{([\s\S]*?)\};/);
if (!specBlock) {
  console.error('✗ 在 icon-mark.js 里找不到 ICON_DOTS 定义');
  process.exit(1);
}
const spec = (name) => {
  const m = specBlock[1].match(new RegExp(`^\\s*${name}:\\s*${NUM}$`, 'm'));
  return m ? Number(m[1]) : null;
};

const PAIRS = [
  ['rows', spec('rows'), pick(rnSrc, 'ROWS', 'const')],
  ['top', spec('top'), pick(rnSrc, 'TOP', 'const')],
  ['bottom', spec('bottom'), pick(rnSrc, 'BOTTOM', 'const')],
  ['r', spec('r'), pick(rnSrc, 'RADIUS', 'const')],
  ['lean', spec('lean'), pick(rnSrc, 'LEAN', 'const')],
  ['edgeX', spec('edgeX'), pick(rnSrc, 'EDGE_X', 'const')],
];

const drift = [];
for (const [name, want, got] of PAIRS) {
  if (want === null || got === null) {
    drift.push(`${name}: 取值失败（原生侧 ${want}，RN 侧 ${got}）—— 是不是改了写法？`);
  } else if (want !== got) {
    drift.push(`${name}: icon-mark.js=${want} 但 DotMatrixMark.tsx=${got}`);
  }
}

if (drift.length) {
  console.error('✗ 点阵母题漂移（首页品牌位会和桌面图标变成两个形状）：');
  for (const d of drift) console.error('  · ' + d);
  process.exit(1);
}

const trail = pick(rnSrc, 'TRAIL_OPACITY', 'const');
// 只比彩色层那一支：icon-mark.js 里是 `mono ? A : B`，RN 首页用的是 B（4 颗那一版）。
// 之前用宽松正则取到了 A（单色层 0.6），把守卫本身判错了。
const markTrail = markSrc.match(/:\s*\+\(([\d.]+)\s*\+\s*[\d.]+\s*\*\s*t\)/);
if (trail === null) {
  console.error('✗ DotMatrixMark.tsx 里找不到 TRAIL_OPACITY');
  process.exit(1);
}
if (!markTrail) {
  console.error('✗ 在 icon-mark.js 里找不到彩色层的后缘亮度（写法变了？）');
  process.exit(1);
}
if (Math.abs(Number(markTrail[1]) - trail) > 0.001) {
  console.error(`✗ 后缘亮度漂移：icon-mark.js=${markTrail[1]} 但 DotMatrixMark.tsx=${trail}`);
  process.exit(1);
}

console.log(`✓ 点阵母题一致：${PAIRS.length} 项几何 + 后缘亮度 ${trail}`);
