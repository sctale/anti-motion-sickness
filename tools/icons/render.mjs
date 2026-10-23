/**
 * App 图标生成脚本（设计稿即代码，可复现）
 *
 * 风格：**点阵母题** —— 和界面、通知栏、磁贴共用同一个形状，不再各画一套。
 *
 * 概念叙事（一个概念、一个焦点）：
 *   这个产品的全部价值就是屏幕左右两侧那两列随车辆一起偏的提示点。
 *   所以图标不画车：画「两列点、整片朝同一方向倾斜、前缘亮后缘暗」。
 *   车是场景，点才是产品；画车等于把品牌让给了一张 clipart。
 *
 * 为什么换掉上一版的素描小车（实测，不是审美偏好）：
 *   1. 铅笔线在 48px 以下就糊成一团，而图标 90% 的曝光面积是 48px 以下的
 *      桌面缩略图、通知栏 24dp、最近任务列表；
 *   2. 抖动线在高分屏上放大看会显出「机器仿手绘」的廉价感；
 *   3. 小车无法缩成通知栏的单色层 —— 上一版是被迫画了另一套「三个点+两个饼」。
 *
 * 三条链共用一份几何（tools/icons/icon-mark.js）：
 *   彩色层（桌面 / 启动屏）→ 4×2 点阵 + 倾斜 + 品牌色前缘
 *   单色层（通知栏 / 磁贴）→ 3×2 大点，去掉倾斜与场底
 *
 * 生成产物（与 Expo app.json 引用一一对应）：
 *   assets/icon.png                      1024  全幅图标（场底 + 点阵）
 *   assets/android-icon-background.png   1024  自适应图标背景层（场底，满幅）
 *   assets/android-icon-foreground.png   1024  自适应图标前景层（点阵，透明底）
 *   assets/android-icon-monochrome.png   1024  单色层（白色大点，供系统着色）
 *   assets/favicon.png                   48    Web favicon
 *   assets/splash-icon.png               1024  启动屏图标（留更多边距）
 *   native/res/drawable/ic_stat_motion.xml      通知栏 / 磁贴矢量小图
 *
 * 用法：node tools/icons/render.mjs
 *       （另出 tools/icons/preview.png 遮罩预览、sizes.png 尺寸预览、
 *         notification-preview.png 通知栏真实大小预览）
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const ASSETS = path.join(ROOT, 'assets');

/* ===== 母题：从 icon-mark.js 读进来执行，不抄第二份几何 =====
   那边是纯 const/function 脚本（要能原样注入浏览器原型），没有 export，
   所以用 Function 求值后把需要的名字取出来。 */
const MARK_SRC = fs.readFileSync(path.join(HERE, 'icon-mark.js'), 'utf8');
const MARK = new Function(
  `${MARK_SRC}\n;return { iconDotList, iconExtent, ICON_FIELD, ICON_ACCENT, ICON_DOTS, ICON_MONO };`
)();

const SIZE = 1024;
const CENTER = SIZE / 2;
const VB = 128;
const VB_CENTER = VB / 2;
// 自适应图标 108dp 里只有中间 66dp 保证可见 → 半径 1024×(66/108)/2 ≈ 313。
// 留到 282：桌面启动器还会做视差缩放，点的外缘必须离可见圈留一圈余量，
// 不然在部分 ROM 上最外两颗点会被切掉一半。
const SAFE_RADIUS = 282;
// 全幅图标与启动屏的视觉半径：留出场底呼吸，又不至于小
const FULL_RADIUS = 384;
const SPLASH_RADIUS = 316;
// 通知栏 24dp：点要够大才数得清，但也不能顶到边框
const NOTIFY_RADIUS = 360;

/** 把 128 视口的母题按「目标外接圆半径」摆到 1024 画布正中 */
function markGroup(variant, targetRadius) {
  const scale = targetRadius / MARK.iconExtent(variant);
  const dots = MARK.iconDotList(variant)
    .map(
      (d) =>
        `  <circle cx="${d.x.toFixed(3)}" cy="${d.y.toFixed(3)}" r="${d.r}" fill="${d.fill}" opacity="${d.opacity}"/>`
    )
    .join('\n');
  return `<g transform="translate(${CENTER} ${CENTER}) scale(${scale.toFixed(4)}) translate(${-VB_CENTER} ${-VB_CENTER})">
${dots}
</g>`;
}

/** 场底：满幅或圆角矩形，左上微青 → 右下微蓝 */
function fieldRect(rx) {
  const stops = MARK.ICON_FIELD.a;
  return `<defs><linearGradient id="field" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${stops[0]}"/>
    <stop offset=".55" stop-color="${stops[1]}"/>
    <stop offset="1" stop-color="${stops[2]}"/>
  </linearGradient></defs>
  <rect width="${SIZE}" height="${SIZE}"${rx ? ` rx="${rx}"` : ''} fill="url(#field)"/>`;
}

function svg(body) {
  if (/NaN|Infinity/.test(body)) {
    const at = body.search(/NaN|Infinity/);
    throw new Error(`图标里出现非法坐标（NaN/Infinity）：...${body.slice(Math.max(0, at - 90), at + 40)}...`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
${body}
</svg>`;
}

/** 单色层必须全白：系统按蒙版着色，带品牌色反而会被二次染色变成灰绿 */
function monoMark(targetRadius) {
  const scale = targetRadius / MARK.iconExtent('mono');
  const dots = MARK.iconDotList('mono')
    .map(
      (d) =>
        `  <circle cx="${d.x.toFixed(3)}" cy="${d.y.toFixed(3)}" r="${d.r}" fill="#FFFFFF"/>`
    )
    .join('\n');
  return `<g transform="translate(${CENTER} ${CENTER}) scale(${scale.toFixed(4)}) translate(${-VB_CENTER} ${-VB_CENTER})">
${dots}
</g>`;
}

function buildSvg(kind) {
  if (kind === 'background') return svg(fieldRect(0));
  if (kind === 'foreground') return svg(markGroup('a', SAFE_RADIUS));
  if (kind === 'monochrome') return svg(monoMark(SAFE_RADIUS));
  if (kind === 'splash') return svg(`${fieldRect(224)}\n${markGroup('a', SPLASH_RADIUS)}`);
  return svg(`${fieldRect(224)}\n${markGroup('a', FULL_RADIUS)}`);
}

/* ===== 通知栏 / 磁贴小图标（Android VectorDrawable）=====
   VectorDrawable 没有 <circle>，实心点要用两段圆弧拼成闭合 path。
   视口仍是 1024，与桌面图标同一套换算，改母题不用改这里。 */

function filledCirclePath(cx, cy, r) {
  return `M ${(cx - r).toFixed(1)} ${cy.toFixed(1)} a ${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(r * 2).toFixed(1)} 0 a ${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-r * 2).toFixed(1)} 0 Z`;
}

function notificationPaths() {
  const scale = NOTIFY_RADIUS / MARK.iconExtent('mono');
  return MARK.iconDotList('mono').map((d) => ({
    cx: CENTER + (d.x - VB_CENTER) * scale,
    cy: CENTER + (d.y - VB_CENTER) * scale,
    r: d.r * scale,
    alpha: d.opacity,
  }));
}

function notificationIconXml() {
  const body = notificationPaths()
    .map(
      (p) => `    <path
        android:pathData="${filledCirclePath(p.cx, p.cy, p.r)}"
        android:fillColor="#FFFFFFFF"
        android:fillAlpha="${p.alpha}" />`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<!-- 由 tools/icons/render.mjs 生成，勿手改；几何来自 tools/icons/icon-mark.js -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="${SIZE}"
    android:viewportHeight="${SIZE}"
    android:tint="#FFFFFFFF">
${body}
</vector>
`;
}

/* ===== 布局自检 ===== */
function assertGeometry() {
  const problems = [];
  // 1) 各链路的视觉半径不许顶到画布边
  for (const [label, radius] of [
    ['自适应前景层', SAFE_RADIUS],
    ['全幅图标', FULL_RADIUS],
    ['启动屏', SPLASH_RADIUS],
    ['通知栏', NOTIFY_RADIUS],
  ]) {
    if (radius > SIZE / 2 - 96) problems.push(`${label}：半径 ${radius}px 离画布边太近`);
  }
  // 2) 点与点不许重叠：相邻圆心距必须大于两倍半径，否则缩小后会糊成一坨
  for (const variant of ['a', 'mono']) {
    const dots = MARK.iconDotList(variant);
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const gap = Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y) - dots[i].r - dots[j].r;
        if (gap < 0) problems.push(`${variant} 第 ${i}/${j} 颗点重叠 ${(-gap).toFixed(1)} 单位`);
      }
    }
  }
  if (problems.length) throw new Error(`图标几何自检失败：\n  ${problems.join('\n  ')}`);
}


/* ===== 验收用预览图 ===== */

function previewSvg() {
  const LAYER = 540;
  const MASK = 420;
  const panels = [
    { cx: 240, label: '圆形遮罩' },
    { cx: 720, label: '圆角方形遮罩' },
    { cx: 1200, label: '圆角矩形遮罩' },
  ];
  const clips = panels
    .map((p, i) => {
      const shape =
        i === 0
          ? `<circle cx="${p.cx}" cy="240" r="${MASK / 2}"/>`
          : `<rect x="${p.cx - MASK / 2}" y="${240 - MASK / 2}" width="${MASK}" height="${MASK}" rx="${i === 1 ? 96 : 72}"/>`;
      return `<clipPath id="mask${i}">${shape}</clipPath>`;
    })
    .join('\n    ');

  const groups = panels
    .map((p, i) => {
      // 场底必须和点阵一起放进被缩放的那个 <g> 里：
      // 放在外层就是 1024 画布坐标，第三个面板（cx=1200）会落在场底之外，
      // 实测出来那块遮罩里没有底色、点还溢出去了。
      const inner = `<g transform="translate(${p.cx - LAYER / 2},${240 - LAYER / 2}) scale(${LAYER / SIZE})">
${fieldRect(0)}
${markGroup('a', SAFE_RADIUS)}
</g>`;
      return `  <g clip-path="url(#mask${i})">${inner}</g>
  <text x="${p.cx}" y="470" fill="#C7CCD4" font-size="18" text-anchor="middle" font-family="sans-serif">${p.label}</text>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="500" viewBox="0 0 1440 500">
  <defs>${clips}</defs>
  <rect width="1440" height="500" fill="#1F2023"/>
${groups}
</svg>`;
}

function sizeSheetSvg() {
  // 全幅图标的内层（场底 + 点阵），去掉 <svg> 外壳后按尺寸缩放平铺
  const inner = buildSvg('icon').replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const sizes = [180, 120, 96, 72, 48, 32];
  let x = 40;
  const items = sizes
    .map((s) => {
      const item = `<g transform="translate(${x},${210 - s / 2}) scale(${s / SIZE})">${inner}</g>
  <text x="${x + s / 2}" y="${210 + s / 2 + 26}" fill="#C7CCD4" font-size="14" text-anchor="middle" font-family="sans-serif">${s}px</text>`;
      x += s + 44;
      return item;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="360" viewBox="0 0 ${x} 360">
  <rect width="${x}" height="360" fill="#1F2023"/>
${items}
  <text x="${x / 2}" y="340" fill="#9AA0A6" font-size="15" text-anchor="middle" font-family="sans-serif">点阵母题在各尺寸下的实际观感（桌面缩略图只有 48px）</text>
</svg>`;
}

function notificationPreviewSvg() {
  const parts = notificationPaths()
    .map((p) => `<circle cx="${p.cx.toFixed(1)}" cy="${p.cy.toFixed(1)}" r="${p.r.toFixed(1)}" fill="#FFFFFF" opacity="${p.alpha}"/>`)
    .join('');
  const panels = [
    { px: 96, label: '96px' },
    { px: 72, label: '72px（xxhdpi 的 24dp）' },
    { px: 48, label: '48px' },
    { px: 24, label: '24px（mdpi 真实大小）' },
  ];
  let x = 40;
  const groups = panels
    .map((p) => {
      const s = p.px / SIZE;
      const cx = x + p.px / 2;
      const g = `<g transform="translate(${cx} 120) scale(${s}) translate(${-CENTER} ${-CENTER})">${parts}</g>
  <rect x="${x}" y="${120 - p.px / 2}" width="${p.px}" height="${p.px}" fill="none" stroke="#4B5563" stroke-width="1"/>
  <text x="${cx}" y="212" fill="#9AA0A6" font-size="13" text-anchor="middle" font-family="sans-serif">${p.label}</text>`;
      x += p.px + 96;
      return g;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x + 20}" height="260" viewBox="0 0 ${x + 20} 260">
  <rect width="${x + 20}" height="260" fill="#1F2023"/>
${groups}
</svg>`;
}

/* ===== 主流程 ===== */
async function render() {
  assertGeometry();

  if (process.env.ICON_DEBUG) {
    const debugPath = path.join(os.tmpdir(), 'icon-debug.svg');
    fs.writeFileSync(debugPath, buildSvg('icon'));
    console.log(`· 已导出线稿: ${debugPath}`);
  }

  const tasks = [
    ['icon.png', buildSvg('icon'), 1024],
    ['android-icon-background.png', buildSvg('background'), 1024],
    ['android-icon-foreground.png', buildSvg('foreground'), 1024],
    ['android-icon-monochrome.png', buildSvg('monochrome'), 1024],
    ['splash-icon.png', buildSvg('splash'), 1024],
    ['favicon.png', buildSvg('icon'), 48],
  ];

  for (const [name, body, size] of tasks) {
    const out = path.join(ASSETS, name);
    await sharp(Buffer.from(body), { density: 96 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(out);
    const stat = fs.statSync(out);
    console.log(`✓ ${name.padEnd(32)} ${size}x${size}  ${(stat.size / 1024).toFixed(1)} KB`);
  }

  for (const [file, body] of [
    ['preview.png', previewSvg()],
    ['sizes.png', sizeSheetSvg()],
    ['notification-preview.png', notificationPreviewSvg()],
  ]) {
    await sharp(Buffer.from(body), { density: 96 })
      .png({ compressionLevel: 9 })
      .toFile(path.join(HERE, file));
  }

  const nativeResDir = path.join(ROOT, 'native', 'res', 'drawable');
  fs.mkdirSync(nativeResDir, { recursive: true });
  const iconXml = notificationIconXml();
  fs.writeFileSync(path.join(nativeResDir, 'ic_stat_motion.xml'), iconXml);
  console.log(
    `✓ native/res/drawable/ic_stat_motion.xml  (${(Buffer.byteLength(iconXml) / 1024).toFixed(1)} KB, ${notificationPaths().length} 条 path)`
  );
  console.log('✓ tools/icons/preview.png（遮罩预览）、tools/icons/sizes.png（尺寸预览）');
  console.log(`· 几何自检通过：彩色层外接圆 ${(SAFE_RADIUS).toFixed(0)}px，单色层 ${NOTIFY_RADIUS}px`);
}

render().catch((error) => {
  console.error('图标生成失败：', error.message || error);
  process.exit(1);
});
