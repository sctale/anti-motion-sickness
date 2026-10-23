/* ============================================================
   图标母题 —— 单一事实源。
   聊天原型（motion-cues-redesign.html）与 tools/icons/render.mjs
   都注入这一份，避免「原型好看、真机另一套」。
   约定：viewBox 0 0 128 128；只出数据与字符串，不依赖 DOM。
   ============================================================ */

/* 场底色：深色渐变（桌面启动图标的背景层）。
   不能一路黑到底 —— 桌面图标 90% 的时间贴在深色壁纸上，
   场底要是没有可辨的色相，图标就只剩几个点飘着。这里让它明确偏青。 */
const ICON_FIELD = {
  a: ['#0E403A', '#0A272E', '#0C1A24'],   // 夜舱：左上青绿 → 右下夜蓝
  b: ['#12333B', '#0A1219'],
};

const ICON_ACCENT = '#5EEAD4';

/* 彩色层：两列各 4 颗，整片朝同一方向倾斜 —— 车转向时所有点一起偏，
   这才是产品真正在做的事，所以母题也照它画。
   纵向跨度给到 26..102：上一版只占画布 62%，图标在桌面显得没撑开。 */
const ICON_DOTS = {
  rows: 4,
  top: 26,
  bottom: 102,
  r: 7.6,
  lean: 7,        // 顶端左偏、底端右偏的幅度（viewBox 单位）
  edgeX: 33,
};

/* 单色层：通知栏 / 磁贴只有 24dp —— 三颗大点、去掉倾斜和场底，
   否则缩小后先糊的不是细节，是整个形状。 */
const ICON_MONO = {
  rows: 3,
  top: 26,
  bottom: 102,
  r: 10.5,
  edgeX: 35,
};

/**
 * 数据先出，SVG 后拼：render.mjs 要拿真实圆心算安全区，
 * 只给字符串就得在那边再抄一遍几何 —— 抄一遍就会漂一遍。
 */
function iconDotList(variant) {
  const mono = variant === 'mono';
  const spec = mono ? ICON_MONO : ICON_DOTS;
  const lean = mono ? 0 : variant === 'c' ? 0 : ICON_DOTS.lean;
  const out = [];
  for (let side = 0; side < 2; side++) {
    const baseX = side === 0 ? spec.edgeX : 128 - spec.edgeX;
    for (let i = 0; i < spec.rows; i++) {
      const t = spec.rows === 1 ? 0.5 : i / (spec.rows - 1);
      const dot = {
        side,
        index: i,
        x: baseX + lean * (t - 0.5) * 2,
        y: spec.top + t * (spec.bottom - spec.top),
        r: spec.r,
        // 前缘（运动方向那一侧）亮，后缘暗：不靠颜色也能读出方向。
        // 起点不能低于 0.5 —— 白点在近黑场底上 0.4 已经几乎看不见，
        // 实测 48px 时四颗只剩两颗，母题就读不出「列」了。
        opacity: mono ? +(0.6 + 0.4 * t).toFixed(3) : +(0.52 + 0.48 * t).toFixed(3),
        fill: '#FFFFFF',
      };
      if (!mono && i === spec.rows - 1) dot.fill = ICON_ACCENT;
      out.push(dot);
    }
  }
  return out;
}

/** 母题的外接圆半径（圆心到最远点边缘），用来算自适应图标安全区 */
function iconExtent(variant) {
  let max = 0;
  for (const d of iconDotList(variant)) {
    max = Math.max(max, Math.hypot(d.x - 64, d.y - 64) + d.r);
  }
  return max;
}

function iconDots(variant) {
  return iconDotList(variant)
    .map(
      (d) =>
        `<circle cx="${d.x.toFixed(2)}" cy="${d.y.toFixed(2)}" r="${d.r}" fill="${d.fill}" opacity="${d.opacity}"/>`
    )
    .join('');
}

/* variant: 'a' 点阵舱（推荐） / 'b' 地平线 + 点阵 / 'c' 静止点阵 / 'mono' 单色层 */
function iconSvg(size, variant) {
  const mono = variant === 'mono';
  const stops = ICON_FIELD[variant === 'b' ? 'b' : 'a'];
  const horizon = variant === 'b'
    ? '<rect x="20" y="61" width="88" height="6" rx="3" fill="#fff" opacity=".14"/>'
    : '';
  // 渐变 id 必须按 variant 分开：同一页里放多个实例时，
  // 重复 id 会让后面的图标取到第一个的渐变（实测 B 方案会串色）。
  const gid = `mcG-${variant}`;
  const defs = mono
    ? ''
    : `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${stops[0]}"/><stop offset=".55" stop-color="${stops[1]}"/><stop offset="1" stop-color="${stops[stops.length - 1]}"/></linearGradient></defs>`;
  const bg = mono ? '' : `<rect width="128" height="128" rx="28" fill="url(#${gid})"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 128 128" role="img" aria-label="防晕车助手图标">
${defs}
${bg}${horizon}${iconDots(variant)}
</svg>`;
}
