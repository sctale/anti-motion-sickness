import { useColorScheme } from 'react-native';

/**
 * 设计令牌（唯一真源）。
 *
 * 这一版是从高保真原型逐值抄过来的（visualizations/motion-cues-redesign.html），
 * 不是又拍一次脑袋选颜色：原型里每个色值都在浏览器里量过 WCAG 对比度，
 * 深浅两套主题的最低配对是 4.77:1（浅色主题按钮白字/按钮底），其余 5:1 以上。
 *
 * 三条硬规则，改之前先想清楚为什么要破：
 * 1. 只有一个强调色。上一版同时有靛蓝（强调）、绿（运行中）、青（别的），
 *    三个色互相抢，页面就没有重点 —— 现在「可点」和「正在生效」共用 Signal Teal。
 * 2. 间距、圆角、字号都只能取表里的值。之前 10~24 的圆角混用、8/12/16/20/32 混用，
 *    是「像模板拼出来的」的直接原因。
 * 3. 预览舱（stage）永远是深色画布。它模拟的是悬浮在用户屏幕上的圆点，
 *    跟着 App 主题翻成浅底白点，用户就会看到一圈空心环 —— 那不是他上车后会看到的东西。
 *
 * 视觉方向：分组内嵌列表 + 发丝分隔线 + 单一强调色 + 左对齐文案，
 * 不用 emoji 当图标，不用重投影。
 */

export const palette = {
  light: {
    page: '#F6F7F9',
    card: '#FFFFFF',
    cardAlt: '#F3F4F7',
    sunken: '#EDEFF3',
    separator: 'rgba(39,49,63,0.10)',
    separatorStrong: 'rgba(39,49,63,0.18)',
    text: '#151D28',
    textSecondary: '#515E70',
    textTertiary: '#546378',
    // 浅色主题下强调色要压到 30% 明度以下才够白字对比，
    // 之前用的 #4F46E5 配白字只有 3.5:1，小字直接看不清
    accent: '#0B7A73',
    accentHi: '#1BB198',
    accentText: '#F3FCF9',
    accentSoft: 'rgba(11,122,115,0.10)',
    button: '#096360',
    positive: '#0B7A73',
    positiveSoft: 'rgba(11,122,115,0.10)',
    warning: '#A24A07',
    warningSoft: 'rgba(162,74,7,0.10)',
    danger: '#C51B35',
    dangerSoft: 'rgba(197,27,53,0.10)',
    pressed: 'rgba(39,49,63,0.05)',
    controlTrack: 'rgba(39,49,63,0.18)',
    grid: 'rgba(39,49,63,0.04)',
  },
  dark: {
    page: '#0B0F13',
    card: '#161B22',
    cardAlt: '#1F252D',
    sunken: '#0F131A',
    separator: 'rgba(228,235,241,0.09)',
    separatorStrong: 'rgba(228,235,241,0.16)',
    text: '#F5F7FA',
    textSecondary: '#ABB4BF',
    textTertiary: '#8693A2',
    accent: '#28DCB5',
    accentHi: '#56F0CC',
    accentText: '#02211E',
    accentSoft: 'rgba(40,220,181,0.14)',
    button: '#28DCB5',
    positive: '#28DCB5',
    positiveSoft: 'rgba(40,220,181,0.14)',
    warning: '#FAB53D',
    warningSoft: 'rgba(250,181,61,0.14)',
    danger: '#F2697D',
    dangerSoft: 'rgba(242,105,125,0.14)',
    pressed: 'rgba(228,235,241,0.06)',
    controlTrack: 'rgba(228,235,241,0.16)',
    grid: 'rgba(228,235,241,0.043)',
  },
} as const;

/**
 * 预览舱专用色：不随主题变。
 * 真机上圆点是白色实心 + 一圈深色描边（保证在任何应用背景上都看得见），
 * 预览要还原的就是这个，所以底色锁死成夜色。
 */
export const stage = {
  canvas: '#0B0F13',
  canvasAlt: '#0F1620',
  dot: '#FFFFFF',
  dotStroke: 'rgba(11,15,19,0.55)',
  frame: 'rgba(228,235,241,0.16)',
} as const;

/** 结构类型：两套调色板字段必须完全一致，缺一个键就编译不过 */
export type Theme = { [K in PaletteName]: string };
type PaletteName = keyof (typeof palette)['light'];

/** 间距只用这套刻度，避免 13/17/21 这种随手数 */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  hero: 48,
} as const;

/** 圆角：控件 < 卡片 < 主视觉，三档封顶 */
export const radius = {
  control: 12,
  card: 18,
  hero: 26,
  pill: 999,
} as const;

/** 字号：两档标题 + 三档正文，行高跟着字号走 */
export const type = {
  display: 30,
  headline: 26,
  title: 21,
  body: 16,
  control: 15,
  footnote: 13,
  caption: 11,
} as const;

/** 行高（RN 要显式给，否则中文会挤） */
export const leading = {
  display: 36,
  headline: 34,
  title: 28,
  body: 24,
  control: 21,
  footnote: 19,
  caption: 16,
} as const;

export function useTheme(): Theme {
  // 跟随系统：这个 App 一半的使用场景是车内/暗光，只有浅色版会很刺眼
  const scheme = useColorScheme();
  return scheme === 'dark' ? palette.dark : palette.light;
}

export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}

/**
 * 动效时长统一在这里定义：界面里不再出现裸数字。
 * 三档，对应「按下要有反馈」「状态要变过来」「内容要补间到位」。
 */
export const motion = {
  pressIn: 120,
  pressOut: 180,
  toggle: 240,
  screen: 240,
  banner: 240,
  cue: 520,
} as const;
