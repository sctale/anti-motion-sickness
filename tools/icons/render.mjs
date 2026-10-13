/**
 * App 图标生成脚本（设计稿即代码，可复现）
 *
 * 设计依据（Apple HIG / WWDC25 / ASO 实践）：
 *  1. 单一焦点、一个概念  —— 唯一主体：一辆现代轿车侧视图（产品核心场景是乘车）
 *  2. 高对比剪影          —— 白色车身压在深靛蓝→紫渐变上，缩到 48px 仍立得住
 *  3. 分层深度            —— 背景层（渐变+晕光+暗角）/ 地面投影 / 轮拱内阴影 / 车身 / 车舱 / 轮毂
 *  4. 色彩克制            —— 靛蓝紫（品牌）+ 白（主体）+ 深靛（车舱/轮胎），淡青仅作车灯点缀
 *  5. 小尺寸优先          —— 车舱厚度 116px（48px 下约 5.4px，双窗与 B 柱仍可辨认）
 *
 * 生成产物（与 Expo app.json 引用一一对应）：
 *   assets/icon.png                      1024  全幅图标
 *   assets/android-icon-background.png   1024  自适应图标背景层
 *   assets/android-icon-foreground.png   1024  自适应图标前景层（安全区内主体）
 *   assets/android-icon-monochrome.png   1024  单色层（白色剪影，系统着色）
 *   assets/favicon.png                   48    Web favicon
 *   assets/splash-icon.png               1024  启动图备用
 *
 * 用法：npm i --no-save sharp && node tools/icons/render.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ASSETS = path.join(ROOT, 'assets');

// ===== 画布与配色 =====
const SIZE = 1024;
const COLOR_BG_FROM = '#4338CA'; // indigo-700
const COLOR_BG_TO = '#7C3AED'; // violet-600
const COLOR_GLASS = '#312E81'; // 前风挡
const COLOR_LAMP = '#CFFAFE'; // 灯组（淡青，唯一点缀色）

// ===== 车辆几何（1024 画布，侧视图）=====
// 扁平插画比例：长 620 : 高 316 ≈ 2.0（比真车敦实，保证 48px 下清晰）
// 车舱厚度 116（48px 下约 5.4px，可辨认双窗 + B 柱）
const CAR = {
  frontX: 820,
  rearX: 200,
  roofY: 400,
  beltY: 516,
  rockerY: 648, // 车身底边（轮拱底）
  wheelR: 68,
  archR: 80,
  wheelLeftX: 332,
  wheelRightX: 714,
  hubRatio: 0.42,
};

/** 车身外轮廓：缓车顶 + 斜前风挡 + 短尾，含两个轮拱凹槽 */
function bodyPath() {
  const c = CAR;
  return [
    'M 800 648',
    `C 813 633 ${c.frontX} 610 ${c.frontX} 578`, // 前保险杠
    `C ${c.frontX} 556 812 540 790 532`, // 车头
    'L 676 512', // 引擎盖
    'C 664 492 584 452 560 402', // 前风挡
    'C 548 396 532 394 516 394',
    'L 500 394', // 车顶
    'C 486 394 474 398 470 402',
    'C 444 430 420 470 404 500', // 后风挡（C 柱）
    'L 320 512',
    'L 250 522', // 后备箱盖
    `C 228 528 214 546 ${c.rearX} 572`,
    `C 200 610 212 634 252 ${c.rockerY}`, // 车尾
    'L 252 648',
    `A ${c.archR} ${c.archR} 0 0 1 412 ${c.rockerY}`, // 后轮拱
    'L 634 648',
    `A ${c.archR} ${c.archR} 0 0 1 794 ${c.rockerY}`, // 前轮拱
    'C 797 648 799 648 800 648',
    'Z',
  ].join(' ');
}

/** 车舱（双窗由 B 柱分隔） */
function windowPath() {
  return [
    'M 418 508',
    'C 436 466 452 436 470 424', // 后窗上沿
    'Q 478 418 490 418',
    'L 540 418',
    'Q 552 418 558 426',
    'L 626 508', // 前风挡下沿
    'Z',
  ].join(' ');
}

/** 车辆分层 */
function carGroup(options = {}) {
  const { silhouette = false } = options;
  const c = CAR;

  // 单色层：实心剪影（车舱挖空），小尺寸下仍是"车"而不是"方块"
  if (silhouette) {
    return `  <g transform="${carTransform()}">
    <path d="${bodyPath()} ${windowPath()}" fill="#FFFFFF" fill-rule="evenodd"/>
    <circle cx="${c.wheelLeftX}" cy="${c.rockerY}" r="${c.wheelR}"/>
    <circle cx="${c.wheelRightX}" cy="${c.rockerY}" r="${c.wheelR}"/>
  </g>`;
  }

  return `  <g transform="${carTransform()}">
    <!-- 地面投影 -->
    <ellipse cx="510" cy="${c.rockerY + 56}" rx="300" ry="28" fill="#1E1B4B" opacity="0.32" filter="url(#soft)"/>
    <!-- 轮拱内阴影（裁剪到车身底边以上，避免越界）-->
    <g clip-path="url(#rockerClip)">
      <circle cx="${c.wheelLeftX}" cy="${c.rockerY}" r="${c.archR + 12}" fill="#312E81" opacity="0.6"/>
      <circle cx="${c.wheelRightX}" cy="${c.rockerY}" r="${c.archR + 12}" fill="#312E81" opacity="0.6"/>
    </g>
    <!-- 车轮 -->
    <circle cx="${c.wheelLeftX}" cy="${c.rockerY}" r="${c.wheelR}" fill="#1E1B4B"/>
    <circle cx="${c.wheelRightX}" cy="${c.rockerY}" r="${c.wheelR}" fill="#1E1B4B"/>
    <circle cx="${c.wheelLeftX}" cy="${c.rockerY}" r="${c.wheelR * c.hubRatio}" fill="#818CF8"/>
    <circle cx="${c.wheelRightX}" cy="${c.rockerY}" r="${c.wheelR * c.hubRatio}" fill="#818CF8"/>
    <!-- 车身 -->
    <path d="${bodyPath()}" fill="url(#bodyGrad)"/>
    <path d="${bodyPath()}" fill="url(#bodySheen)"/>
    <!-- 车舱 -->
    <path d="${windowPath()}" fill="${COLOR_GLASS}"/>
    <path d="${windowPath()}" fill="url(#glassSheen)"/>
    <!-- B 柱 -->
    <rect x="498" y="418" width="16" height="90" fill="url(#bodyGrad)"/>
    <!-- 侧面特征线 -->
    <path d="M 268 588 L 776 588" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" opacity="0.5"/>
    <!-- 车前灯 -->
    <rect x="786" y="560" width="36" height="22" rx="11" fill="${COLOR_LAMP}"/>
  </g>`;
}

/** 背景层：渐变 + 中心晕光 + 暗角（分层深度） */
function backgroundDefs() {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${COLOR_BG_FROM}"/>
      <stop offset="1" stop-color="${COLOR_BG_TO}"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.42" r="0.62">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.3"/>
      <stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.5" r="0.75">
      <stop offset="0.6" stop-color="#1E1B4B" stop-opacity="0"/>
      <stop offset="1" stop-color="#1E1B4B" stop-opacity="0.38"/>
    </radialGradient>
  </defs>`;
}

function backgroundRect() {
  return `  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#halo)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#vignette)"/>`;
}

/** 车辆相关渐变与滤镜 */
function carDefs() {
  return `<defs>
    <linearGradient id="bodyGrad" x1="0" y1="0" x2="0.15" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="0.55" stop-color="#F7F9FF"/>
      <stop offset="1" stop-color="#DDE3FF"/>
    </linearGradient>
    <linearGradient id="bodySheen" x1="0.1" y1="0" x2="0.5" y2="0.7">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.9"/>
      <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="glassSheen" x1="0.2" y1="0" x2="0.7" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.72"/>
      <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <filter id="soft" x="-40%" y="-140%" width="180%" height="380%">
      <feGaussianBlur stdDeviation="26"/>
    </filter>
    <clipPath id="rockerClip">
      <rect x="0" y="0" width="${SIZE}" height="${CAR.rockerY}"/>
    </clipPath>
  </defs>`;
}

/** 整体构图：放大到安全区，视觉重心略高于几何中心 */
function carTransform() {
  return 'translate(512 512) scale(1.08) translate(-512 -546)';
}

function buildSvg({ background = true, car = true, silhouette = false } = {}) {
  const defs = [background ? backgroundDefs() : '', car && !silhouette ? carDefs() : '']
    .filter(Boolean)
    .join('\n');
  const layers = [background ? backgroundRect() : '', car ? carGroup({ silhouette }) : '']
    .filter(Boolean)
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
${defs}
${layers}
</svg>`;
}

/** 遮罩预览：模拟三种启动器遮罩裁切 */
function previewSvg() {
  const LAYER = 540; // 108dp
  const MASK = 420; // 84dp
  const panels = [
    { cx: 240, label: '圆形遮罩' },
    { cx: 720, label: '圆角方形遮罩' },
    { cx: 1200, label: '圆角矩形遮罩' },
  ];

  const defs = panels
    .map(
      (p, i) => `
    <clipPath id="mask${i}">
      ${
        i === 0
          ? `<circle cx="${p.cx}" cy="240" r="${MASK / 2}"/>`
          : `<rect x="${p.cx - MASK / 2}" y="${240 - MASK / 2}" width="${MASK}" height="${MASK}" rx="${i === 1 ? 96 : 72}"/>`
      }
    </clipPath>`
    )
    .join('');

  const groups = panels
    .map(
      (p, i) => `
  <g clip-path="url(#mask${i})">
    <g transform="translate(${p.cx - LAYER / 2},${240 - LAYER / 2}) scale(${LAYER / SIZE})">
${backgroundRect()}
${carGroup()}
    </g>
  </g>
  <text x="${p.cx}" y="466" fill="#64748B" font-size="18" text-anchor="middle" font-family="sans-serif">${p.label}</text>`
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="480" viewBox="0 0 1440 480">
  ${backgroundDefs()}
  ${carDefs()}
  <rect width="1440" height="480" fill="#0B1020"/>
${groups}
</svg>`;
}

/** 小尺寸预览：按真机启动器尺寸排布，检查 48px 可读性 */
function sizeSheetSvg() {
  const sizes = [180, 120, 96, 72, 48];
  let x = 40;
  const items = sizes
    .map((s) => {
      const item = `<g transform="translate(${x},${200 - s / 2}) scale(${s / SIZE})">
${backgroundRect()}
${carGroup()}
      </g>`;
      const label = `<text x="${x + s / 2}" y="${200 + s / 2 + 26}" fill="#64748B" font-size="14" text-anchor="middle" font-family="sans-serif">${s}px</text>`;
      x += s + 44;
      return item + label;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="360" viewBox="0 0 ${x} 360">
  ${backgroundDefs()}
  ${carDefs()}
  <rect width="${x}" height="360" fill="#0B1020"/>
  <g>
${items}
  </g>
  <text x="${x / 2}" y="330" fill="#475569" font-size="15" text-anchor="middle" font-family="sans-serif">从小到大的实际显示尺寸（启动器网格视角）</text>
</svg>`;
}

async function render() {
  const tasks = [
    ['icon.png', buildSvg(), 1024],
    ['android-icon-background.png', buildSvg({ car: false }), 1024],
    ['android-icon-foreground.png', buildSvg({ background: false }), 1024],
    ['android-icon-monochrome.png', buildSvg({ background: false, silhouette: true }), 1024],
    ['splash-icon.png', buildSvg(), 1024],
    ['favicon.png', buildSvg(), 48],
  ];

  for (const [name, svg, size] of tasks) {
    const out = path.join(ASSETS, name);
    await sharp(Buffer.from(svg), { density: 96 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(out);
    const stat = fs.statSync(out);
    console.log(`✓ ${name.padEnd(32)} ${size}x${size}  ${(stat.size / 1024).toFixed(1)} KB`);
  }

  for (const [file, svg] of [
    ['preview.png', previewSvg()],
    ['sizes.png', sizeSheetSvg()],
  ]) {
    await sharp(Buffer.from(svg), { density: 96 })
      .png({ compressionLevel: 9 })
      .toFile(path.join(ROOT, 'tools/icons', file));
  }
  console.log('✓ tools/icons/preview.png（遮罩预览）、tools/icons/sizes.png（小尺寸预览）');
}

render().catch((error) => {
  console.error('图标生成失败：', error);
  process.exit(1);
});