/**
 * App 图标生成脚本（设计稿即代码，可复现）
 *
 * 风格：**素描简图**（铅笔线描 + 排线阴影），不是渐变填充插画。
 *
 * 概念叙事（一个概念、一个焦点）：
 *   乘车时，屏幕左右两侧各有一列随车辆运动流动的提示圆点 —— 这就是产品本身。
 *   所以图标画「一辆侧视小车 + 两侧各一列圆点」，不识字也能认出「开车 + 屏幕边缘的点」。
 *
 * 素描手法：
 *   1. 纸面：暖白纸色 + 极淡颗粒，不铺彩色渐变
 *   2. 线条：石墨色两遍描画，每遍带轻微抖动（手绘感），端点圆头、粗细略变
 *   3. 明暗：只用排线（45° 短线 + 一层交叉排线），不用渐变色块
 *   4. 圆点：铅笔画的小线圈，每列首尾两个轻涂实，暗示纵向流动
 *
 * 小尺寸优先（第一版踩过的坑，这里按实测尺寸预览收敛）：
 *   细线素描在 48px 会糊成一团，所以主体要占满安全区、主线条加到 19px（1024 画布），
 *   并让**实心块**（车轮、车窗）承担小尺寸识别度 —— 缩小后先看到的是块，不是线。
 *
 * 可复现性：所有「随机」都来自固定种子的 mulberry32，重跑结果逐像素一致。
 *
 * 生成产物（与 Expo app.json 引用一一对应）：
 *   assets/icon.png                      1024  全幅图标
 *   assets/android-icon-background.png   1024  自适应图标背景层（纸面）
 *   assets/android-icon-foreground.png   1024  自适应图标前景层（素描主体）
 *   assets/android-icon-monochrome.png   1024  单色层（白色线稿，供系统主题着色）
 *   assets/favicon.png                   48    Web favicon
 *   assets/splash-icon.png               1024  启动图备用
 *
 * 用法：npm i --no-save sharp && node tools/icons/render.mjs
 *       （同时输出 tools/icons/preview.png 遮罩预览与 tools/icons/sizes.png 尺寸预览）
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ASSETS = path.join(ROOT, 'assets');

// ===== 画布与安全区 =====
const SIZE = 1024;
const CENTER = SIZE / 2;
// 自适应图标 108dp 中，中间 66dp 保证可见 → 半径 1024×(66/108)/2 ≈ 313，这里收到 300
const SAFE_RADIUS = 300;

// ===== 素描配色（石墨 + 纸，无彩色） =====
const PAPER = '#F2EFE6';
const GRAPHITE = '#2F2D2A'; // 主线条
const GRAPHITE_SOFT = '#5A564E'; // 次级线条 / 排线
const GRAPHITE_FAINT = '#8E887B'; // 最淡的起稿线
const WHITE = '#FFFFFF';

// ===== 线宽（1024 画布）=====
const W_MAIN = 19; // 车身主轮廓
const W_SECOND = 13; // 车窗
const W_WHEEL = 15; // 车轮圈
const W_DOT = 9; // 圆点圈
const W_HATCH = 5; // 排线

// ===== 固定种子随机：手绘抖动可复现 =====
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEEDS = [20261018, 555, 90210, 1337, 4242];
const streams = SEEDS.map(mulberry32);

function jitter(stream, amp) {
  return (streams[stream % streams.length]() * 2 - 1) * amp;
}

function toPath(points, closed) {
  const head = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(' ');
  return closed ? `${head} Z` : head;
}

/** 直线 → 手绘线：中段抖得比两端多，像手腕落笔收笔 */
function roughLine(x1, y1, x2, y2, options = {}) {
  const { stream = 0, amp = 3, step = 30 } = options;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const count = Math.max(2, Math.round(len / step));

  const pts = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const off = jitter(stream + i, Math.sin(t * Math.PI) * amp + amp * 0.3);
    pts.push([x1 + dx * t + nx * off, y1 + dy * t + ny * off]);
  }
  return toPath(pts, false);
}

/** 折线 → 一条连续的手绘线（每段各自抖动，再拼起来） */
function roughPolyline(points, options = {}) {
  const { stream = 0, amp = 3, closed = false } = options;
  const src = closed ? [...points, points[0]] : points;
  let d = '';
  for (let i = 0; i < src.length - 1; i += 1) {
    const seg = roughLine(src[i][0], src[i][1], src[i + 1][0], src[i + 1][1], {
      stream: stream + i * 3,
      amp,
    });
    // 段首的「M x y」整段丢掉（它就是上一段的终点），只留后面的 L 命令。
    // 之前替换成 'L ' 会留下 "L L ..." 这种非法命令序列，librsvg 直接丢弃整条 path，
    // 表现就是车身/车窗「不画了」而圆点/车轮正常。
    d += i === 0 ? seg : seg.replace(/^M\s*[-\d.]+\s+[-\d.]+/, '');
  }
  return closed ? `${d} Z` : d;
}

/** 圆 → 手绘圈：画两遍，第二遍起笔偏移（素描里圆圈从不一次画圆） */
function roughCircle(cx, cy, r, options = {}) {
  const { stream = 0, ampRatio = 0.07 } = options;
  const segments = Math.max(12, Math.round(r / 4));
  const build = (offset, streamShift) => {
    const pts = [];
    const total = segments + 2; // 多画一点点，留出「出头」的接缝
    for (let i = 0; i <= total; i += 1) {
      const a = (i / segments) * Math.PI * 2 + offset;
      const rr = r + jitter(stream + streamShift + i, r * ampRatio);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    return toPath(pts, false);
  };
  return `${build(0, 0)} ${build(0.55, 5)}`;
}

/** 排线：一组等距短线，长短略有出入，避免机器感 */
function hatchStrokes(x, y, w, h, options = {}) {
  const { stream = 0, spacing = 26, angleDeg = 45, stroke = GRAPHITE_SOFT, width = W_HATCH, opacity = 0.6 } = options;
  const rad = (angleDeg * Math.PI) / 180;
  const dirX = Math.cos(rad);
  const dirY = Math.sin(rad);
  const normalX = -dirY;
  const normalY = dirX;
  const reach = Math.abs(w * dirX) + Math.abs(h * dirY);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const n = Math.max(2, Math.floor(reach / spacing));
  const out = [];

  for (let i = 0; i < n; i += 1) {
    const t = (i / (n - 1) - 0.5) * reach;
    const px = cx + normalX * t;
    const py = cy + normalY * t;
    const half = reach / 2 - Math.abs(t) * 0.22 - Math.abs(jitter(stream + i, 14));
    out.push(
      `<path d="${roughLine(px - dirX * half, py - dirY * half, px + dirX * half, py + dirY * half, {
        stream: stream + i * 2,
        amp: 2.5,
        step: 40,
      })}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" fill="none" opacity="${opacity}"/>`
    );
  }
  return out.join('\n    ');
}

// ===== 主体几何（局部坐标，车头朝右；原点在车的视觉中心） =====
// 一笔能画完的两厢车轮廓：车尾 → 车顶 → 风挡 → 车头 → 车底
const CAR_BODY = [
  [-222, 40], // 车尾下
  [-230, 0], // 尾部
  [-212, -34], // 行李厢边缘
  [-128, -46], // 后窗底
  [-92, -122], // 车顶后
  [44, -126], // 车顶前
  [100, -50], // 风挡底
  [196, -38], // 引擎盖前
  [226, -2], // 车头
  [218, 42], // 前保下
  [128, 48], // 车底前段
  [-120, 48], // 车底后段
];

/** 车窗（一整块，B 柱另画） */
const CAR_WINDOW = [
  [-104, -54],
  [-76, -108],
  [34, -111],
  [80, -56],
];

const WHEELS = [
  { x: -126, y: 46, r: 52 },
  { x: 132, y: 46, r: 52 },
];

// 车整体缩到 0.74，给两侧圆点列留出空间
const CAR_SCALE = 0.74;
const CAR_TRANSFORM = `translate(${CENTER} ${CENTER + 6}) scale(${CAR_SCALE})`;

/** 圆点列：左右各 5 个，落在安全区内 */
const DOT_X_OFFSET = 250;
const DOT_COUNT = 5;
const DOT_SPAN = 208;
const DOT_R = 15;

function dotPositions() {
  const dots = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < DOT_COUNT; i += 1) {
      const cy = CENTER - DOT_SPAN / 2 + (i * DOT_SPAN) / (DOT_COUNT - 1);
      dots.push({ cx: CENTER + side * DOT_X_OFFSET, cy, side, index: i, r: DOT_R });
    }
  }
  return dots;
}

/** 每列首尾两个涂实：读起来像圆点在纵向流动 */
function dotIsFilled(dot) {
  return dot.index === 0 || dot.index === DOT_COUNT - 1;
}

/**
 * 地面接触阴影：素描里就靠这一小片排线交代「车落在纸上」。
 * 必须画在车身组之外 —— 车组带 translate/scale，在里面按画布坐标画排线会整体跑位。
 */
function groundLayer({ soft }) {
  const band = { x: CENTER - 176, y: CENTER + 76, w: 352, h: 30 };
  // 必须裁剪：排线按 48° 斜着画，单根长度接近整条带的对角线，
  // 不裁剪就会斜穿车身（实测踩过），看起来像车身上划了几道
  return `<defs><clipPath id="groundClip"><rect x="${band.x}" y="${band.y}" width="${band.w}" height="${band.h}" rx="15"/></clipPath></defs>
  <g clip-path="url(#groundClip)">
    ${hatchStrokes(band.x, band.y, band.w, band.h, {
      stream: 40,
      spacing: 24,
      angleDeg: 48,
      stroke: soft,
      width: W_HATCH * 1.5,
      opacity: 0.5,
    })}
  </g>`;
}

function dotsLayer({ ink, soft }) {
  return dotPositions()
    .map((d) => {
      const circle = `<path d="${roughCircle(d.cx, d.cy, d.r, { stream: d.index * 4 + (d.side > 0 ? 20 : 0) })}" stroke="${ink}" stroke-width="${W_DOT}" fill="none" stroke-linecap="round"/>`;
      if (!dotIsFilled(d)) return circle;
      return `${circle}\n    <circle cx="${d.cx}" cy="${d.cy}" r="${(d.r * 0.55).toFixed(1)}" fill="${soft}" opacity="0.9"/>`;
    })
    .join('\n    ');
}

function carLayer({ ink, soft, faint, solid }) {
  const strokes = [];

  // 主轮廓两遍：一遍重、一遍轻且偏移，形成铅笔的「压痕」
  strokes.push(
    `<path d="${roughPolyline(CAR_BODY, { stream: 0, amp: 3.4, closed: true })}" stroke="${ink}" stroke-width="${W_MAIN}" fill="none" stroke-linejoin="round" stroke-linecap="round" opacity="0.96"/>`
  );
  strokes.push(
    `<path d="${roughPolyline(CAR_BODY, { stream: 11, amp: 5 })}" stroke="${soft}" stroke-width="${(W_MAIN * 0.42).toFixed(1)}" fill="none" stroke-linejoin="round" stroke-linecap="round" opacity="0.5"/>`
  );

  // 车窗：小尺寸下靠这块实心承担识别度
  strokes.push(
    `<path d="${roughPolyline(CAR_WINDOW, { stream: 21, amp: 2.6, closed: true })}" fill="${solid}" opacity="0.92" stroke="none"/>`
  );
  strokes.push(
    `<path d="${roughPolyline(CAR_WINDOW, { stream: 24, amp: 2.6, closed: true })}" stroke="${ink}" stroke-width="${W_SECOND}" fill="none" stroke-linejoin="round" opacity="0.9"/>`
  );
  // B 柱
  strokes.push(
    `<path d="${roughLine(-22, -110, -18, -56, { stream: 30, amp: 2 })}" stroke="${ink}" stroke-width="${(W_SECOND * 0.8).toFixed(1)}" fill="none" stroke-linecap="round" opacity="0.85"/>`
  );

  // 车轮：实心轮 + 手绘圈，缩小后仍然是「两个黑轮子」
  WHEELS.forEach((w, idx) => {
    strokes.push(
      `<circle cx="${w.x}" cy="${w.y}" r="${(w.r * 0.8).toFixed(1)}" fill="${solid}" opacity="0.95"/>`
    );
    strokes.push(
      `<path d="${roughCircle(w.x, w.y, w.r, { stream: idx * 9 + 3 })}" stroke="${ink}" stroke-width="${W_WHEEL}" fill="none" stroke-linecap="round" opacity="0.95"/>`
    );
    strokes.push(
      `<circle cx="${w.x}" cy="${w.y}" r="${(w.r * 0.24).toFixed(1)}" fill="${soft}" opacity="0.85"/>`
    );
  });

  return `<g transform="${CAR_TRANSFORM}">
    ${strokes.join('\n    ')}
  </g>`;
}

/** 一版完整线稿 */
function sketch({ ink = GRAPHITE, soft = GRAPHITE_SOFT, faint = GRAPHITE_FAINT, solid = GRAPHITE, withPaper = true, scale = 1 } = {}) {
  const group = `<g${scale === 1 ? '' : ` transform="translate(${(CENTER * (1 - scale)).toFixed(1)} ${(CENTER * (1 - scale)).toFixed(1)}) scale(${scale})"`}>
    ${groundLayer({ soft })}
    ${carLayer({ ink, soft, faint, solid })}
    ${dotsLayer({ ink, soft })}
  </g>`;
  return `${withPaper ? paperBase() : ''}
  ${group}`;
}

/** 纸面：暖白底 + 极淡颗粒 + 四角轻微压暗（素描纸不会纯平） */
function paperBase() {
  const rng = mulberry32(777);
  const specks = [];
  for (let i = 0; i < 420; i += 1) {
    specks.push(
      `<circle cx="${(rng() * SIZE).toFixed(1)}" cy="${(rng() * SIZE).toFixed(1)}" r="${(rng() * 1.6 + 0.4).toFixed(2)}" opacity="${(0.2 + rng() * 0.8).toFixed(2)}"/>`
    );
  }
  return `  <rect width="${SIZE}" height="${SIZE}" fill="${PAPER}"/>
  <g fill="${GRAPHITE_FAINT}" opacity="0.13">${specks.join('')}</g>
  <radialGradient id="paperVignette" cx="0.5" cy="0.5" r="0.72">
    <stop offset="0.62" stop-color="#8E887B" stop-opacity="0"/>
    <stop offset="1" stop-color="#8E887B" stop-opacity="0.16"/>
  </radialGradient>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#paperVignette)"/>`;
}

function svg(body) {
  if (/L\s+L|M\s+M|L\s+M/.test(body)) {
    throw new Error('线稿 path 里出现非法命令序列（L L / M M / L M），检查 roughPolyline 拼接');
  }
  if (/NaN|Infinity/.test(body)) {
    const at = body.search(/NaN|Infinity/);
    throw new Error(`线稿里出现非法坐标（NaN/Infinity）：...${body.slice(Math.max(0, at - 90), at + 40)}...`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
${body}
</svg>`;
}

function buildSvg(kind) {
  if (kind === 'background') return svg(paperBase());
  if (kind === 'foreground') return svg(sketch({ withPaper: false }));
  if (kind === 'monochrome')
    return svg(sketch({ ink: WHITE, soft: WHITE, faint: WHITE, solid: WHITE, withPaper: false }));
  // 全幅图标 / 启动图：纸面 + 线稿，构图略放大
  return svg(sketch({ scale: kind === 'splash' ? 1.05 : 1.1 }));
}

// ===== 布局自检：主体不许越出自适应图标安全区 =====
function assertSafeZone() {
  const offenders = [];
  const check = (label, x, y) => {
    const d = Math.hypot(x - CENTER, y - CENTER);
    if (d > SAFE_RADIUS) offenders.push(`${label} 距中心 ${d.toFixed(0)}px > ${SAFE_RADIUS}px`);
  };
  CAR_BODY.forEach(([x, y], i) => {
    const sx = CENTER + x * CAR_SCALE;
    const sy = CENTER + 6 + y * CAR_SCALE;
    check(`车身点#${i}`, sx, sy);
  });
  WHEELS.forEach((w, i) => {
    const sx = CENTER + (w.x + w.r) * CAR_SCALE;
    const sy = CENTER + 6 + (w.y + w.r) * CAR_SCALE;
    check(`车轮#${i}`, sx, sy);
  });
  dotPositions().forEach((d, i) => check(`圆点#${i}`, d.cx + DOT_R, d.cy + DOT_R));
  check('地面排线', CENTER + 172, CENTER + 104);
  if (offenders.length) {
    throw new Error(`图标主体越出安全区：\n  ${offenders.join('\n  ')}`);
  }
  return offenders;
}

// ===== 验收用预览图 =====

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
      const inner = `${paperBase()}<g transform="translate(${p.cx - LAYER / 2},${240 - LAYER / 2}) scale(${LAYER / SIZE})">
${sketch({ withPaper: false })}
</g>`;
      return `  <g clip-path="url(#mask${i})">${inner}</g>
  <text x="${p.cx}" y="470" fill="#6B6862" font-size="18" text-anchor="middle" font-family="sans-serif">${p.label}</text>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="500" viewBox="0 0 1440 500">
  <defs>${clips}</defs>
  <rect width="1440" height="500" fill="#DCD7C9"/>
${groups}
</svg>`;
}

function sizeSheetSvg() {
  const sizes = [180, 120, 96, 72, 48];
  let x = 40;
  const items = sizes
    .map((s) => {
      const item = `<g transform="translate(${x},${200 - s / 2}) scale(${s / SIZE})">${paperBase()}
${sketch({ withPaper: false })}
</g>`;
      const label = `<text x="${x + s / 2}" y="${200 + s / 2 + 26}" fill="#6B6862" font-size="14" text-anchor="middle" font-family="sans-serif">${s}px</text>`;
      x += s + 44;
      return item + label;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="360" viewBox="0 0 ${x} 360">
  <rect width="${x}" height="360" fill="#DCD7C9"/>
${items}
  <text x="${x / 2}" y="330" fill="#57534E" font-size="15" text-anchor="middle" font-family="sans-serif">素描简图在各尺寸下的实际观感（线条会不会糊）</text>
</svg>`;
}

async function render() {
  assertSafeZone();

  // 排错用：ICON_DEBUG=1 时把线稿 SVG 落到临时目录，方便直接看路径数据
  if (process.env.ICON_DEBUG) {
    const debugPath = path.join(os.tmpdir(), 'icon-debug.svg');
    fs.writeFileSync(debugPath, svg(sketch({ withPaper: false })));
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
  ]) {
    await sharp(Buffer.from(body), { density: 96 })
      .png({ compressionLevel: 9 })
      .toFile(path.join(ROOT, 'tools/icons', file));
  }
  console.log('✓ tools/icons/preview.png（遮罩预览）、tools/icons/sizes.png（尺寸预览）');
  console.log(`· 安全区自检通过：主体均在半径 ${SAFE_RADIUS}px 内`);
}

render().catch((error) => {
  console.error('图标生成失败：', error.message || error);
  process.exit(1);
});
