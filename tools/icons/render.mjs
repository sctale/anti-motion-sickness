/**
 * App 图标生成脚本（设计稿即代码，可复现）
 *
 * 设计说明：
 * - 品牌渐变底：#4F46E5 → #8B5CF6（与应用主色 #6366F1 同源）
 * - 主图形：左右两列白色圆点 —— 直接对应产品核心交互（屏幕两侧的运动提示圆点）
 * - 左上角柔光提升质感；Android 自适应图标前景/单色层均留出安全区（中心 66%）
 *
 * 生成产物（与 Expo app.json 引用一一对应）：
 *   assets/icon.png                      1024x1024  全幅图标
 *   assets/android-icon-background.png   1024x1024  自适应图标背景层（全幅渐变）
 *   assets/android-icon-foreground.png   1024x1024  自适应图标前景层（安全区内图形）
 *   assets/android-icon-monochrome.png   1024x1024  单色层（白色剪影，系统着色）
 *   assets/favicon.png                   48x48      Web favicon
 *   assets/splash-icon.png               1024x1024  启动图备用
 *
 * 用法：npm i --no-save sharp && node tools/icons/render.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ASSETS = path.join(ROOT, 'assets');

// ===== 设计参数（1024 画布）=====
const SIZE = 1024;
const DOT_COUNT = 5; // 每侧圆点数
const DOT_RADIUS = 52;
const COLUMN_OFFSET = 194; // 两列圆点距中线的水平距离
const ROW_SPACING = 128;
const CENTER = SIZE / 2;

const COLOR_TOP = '#4F46E5'; // indigo-600
const COLOR_BOTTOM = '#8B5CF6'; // violet-500

/** 圆点坐标（相对 1024 画布居中） */
function dotPositions() {
  const totalSpan = (DOT_COUNT - 1) * ROW_SPACING;
  const points = [];
  for (let i = 0; i < DOT_COUNT; i++) {
    const y = CENTER - totalSpan / 2 + i * ROW_SPACING;
    points.push({ x: CENTER - COLUMN_OFFSET, y });
    points.push({ x: CENTER + COLUMN_OFFSET, y });
  }
  return points;
}

const DOT_POSITIONS = dotPositions();

/** 圆点 group（可指定颜色） */
function dotsGroup(color = '#FFFFFF', opacity = 1) {
  const circles = DOT_POSITIONS.map(
    ({ x, y }) =>
      `    <circle cx="${x}" cy="${y}" r="${DOT_RADIUS}" fill="${color}" opacity="${opacity}"/>`
  ).join('\n');
  return `  <g>\n${circles}\n  </g>`;
}

/** 渐变背景层（全幅） */
function backgroundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${COLOR_TOP}"/>
      <stop offset="1" stop-color="${COLOR_BOTTOM}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.28" cy="0.18" r="0.85">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/>
      <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#glow)"/>
</svg>`;
}

/** 全幅图标：渐变底 + 圆点 */
function fullIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${COLOR_TOP}"/>
      <stop offset="1" stop-color="${COLOR_BOTTOM}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.28" cy="0.18" r="0.85">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/>
      <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#glow)"/>
${dotsGroup('#FFFFFF')}
</svg>`;
}

/** 仅圆点（前景层 / 单色层，透明底） */
function dotsOnlySvg(color = '#FFFFFF') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
${dotsGroup(color)}
</svg>`;
}

/**
 * 预览图：模拟 Android 自适应图标的三种遮罩裁切效果。
 * 108dp 图层 → 540px（5px/dp），遮罩按 84dp（420px）绘制，与主流启动器一致。
 */
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
      <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
      <rect width="${SIZE}" height="${SIZE}" fill="url(#glow)"/>
${dotsGroup('#FFFFFF')}
    </g>
  </g>
  <text x="${p.cx}" y="466" fill="#64748B" font-size="18" text-anchor="middle" font-family="sans-serif">${p.label}</text>`
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="480" viewBox="0 0 1440 480">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${COLOR_TOP}"/>
      <stop offset="1" stop-color="${COLOR_BOTTOM}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.28" cy="0.18" r="0.85">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>${defs}
  </defs>
  <rect width="1440" height="480" fill="#0B1020"/>
${groups}
</svg>`;
}

async function render() {
  const tasks = [
    ['icon.png', fullIconSvg(), 1024],
    ['android-icon-background.png', backgroundSvg(), 1024],
    ['android-icon-foreground.png', dotsOnlySvg('#FFFFFF'), 1024],
    ['android-icon-monochrome.png', dotsOnlySvg('#FFFFFF'), 1024],
    ['splash-icon.png', fullIconSvg(), 1024],
    ['favicon.png', fullIconSvg(), 48],
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

  const previewPath = path.join(ROOT, 'tools/icons/preview.png');
  await sharp(Buffer.from(previewSvg()), { density: 96 })
    .png({ compressionLevel: 9 })
    .toFile(previewPath);
  console.log(`✓ tools/icons/preview.png（遮罩预览，供人工检查）`);
}

render().catch((error) => {
  console.error('图标生成失败：', error);
  process.exit(1);
});