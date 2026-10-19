import { useColorScheme } from 'react-native';

/**
 * 设计令牌（唯一真源）。
 *
 * 为什么要有这个文件：之前每个界面各自写死 `#0F172A` / `#6366F1` / `#F8FAFC` 这类色值，
 * 首页是浅色、二级页是深色，圆角从 10 到 24 都有，间距 8/12/16/20/32 混用 ——
 * 这就是「页面像模板拼出来的」的直接原因。所有界面只允许从这里取值，
 * 换配色或调密度时改一处。
 *
 * 视觉方向参考 iOS 设置 / Apple Vehicle Motion Cues 那类系统级工具 App：
 * 分组内嵌列表 + 发丝分隔线 + 单一强调色 + 左对齐文案 + 次级灰色说明，
 * 不用 emoji 当图标，不用重投影。
 */

export const palette = {
  light: {
    page: '#F4F5F7',
    card: '#FFFFFF',
    cardAlt: '#FAFAFC',
    separator: 'rgba(15,23,42,0.08)',
    text: '#0C1220',
    textSecondary: 'rgba(12,18,32,0.58)',
    textTertiary: 'rgba(12,18,32,0.40)',
    accent: '#4F46E5',
    accentText: '#FFFFFF',
    onAccentSoft: '#4F46E5',
    accentSoft: 'rgba(79,70,229,0.10)',
    positive: '#15803D',
    positiveSoft: 'rgba(21,128,61,0.12)',
    warning: '#B45309',
    warningSoft: 'rgba(180,83,9,0.12)',
    danger: '#B91C1C',
    dangerSoft: 'rgba(185,28,28,0.10)',
    pressed: 'rgba(12,18,32,0.04)',
    controlTrack: 'rgba(12,18,32,0.14)',
  },
  dark: {
    page: '#0D1015',
    card: '#171C24',
    cardAlt: '#1C222B',
    separator: 'rgba(255,255,255,0.08)',
    text: '#F3F5F8',
    textSecondary: 'rgba(243,245,248,0.62)',
    textTertiary: 'rgba(243,245,248,0.42)',
    accent: '#818CF8',
    accentText: '#0B0E14',
    onAccentSoft: '#A5B4FC',
    accentSoft: 'rgba(129,140,248,0.16)',
    positive: '#4ADE80',
    positiveSoft: 'rgba(74,222,128,0.16)',
    warning: '#FBBF24',
    warningSoft: 'rgba(251,191,36,0.16)',
    danger: '#F87171',
    dangerSoft: 'rgba(248,113,113,0.14)',
    pressed: 'rgba(255,255,255,0.06)',
    controlTrack: 'rgba(255,255,255,0.18)',
  },
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
} as const;

/** 圆角：卡片与控件分开，卡片比控件略大才像「一组」 */
export const radius = {
  control: 10,
  card: 16,
  pill: 999,
} as const;

/** 字号只用这六档（对应 iOS 的 body/footnote/caption + 标题层级） */
export const type = {
  title: 26,
  section: 19,
  body: 16,
  control: 15,
  footnote: 13,
  caption: 12,
} as const;

export function useTheme(): Theme {
  // 跟随系统：这个 App 一半的使用场景是车内/暗光，只有浅色版会很刺眼
  const scheme = useColorScheme();
  return scheme === 'dark' ? palette.dark : palette.light;
}

export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}

/** 动效时长统一在这里定义：界面里不再出现裸数字 */
export const motion = {
  pressIn: 90,
  pressOut: 180,
  toggle: 220,
  screen: 260,
  banner: 200,
} as const;
