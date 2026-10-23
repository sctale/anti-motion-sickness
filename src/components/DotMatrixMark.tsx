import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/tokens';

/**
 * 点阵母题。
 *
 * 和 tools/icons/icon-mark.js 是同一个几何：两列各 4 颗、整片朝同一方向倾斜、
 * 前缘亮后缘暗、最前一格用品牌色。图标、启动屏、首页品牌位用同一套形状，
 * 用户才会在桌面、在应用里、在通知栏认出「这是同一个东西」。
 *
 * 这里画的是静态的：首页不该为了好看常驻开一路传感器。
 * 需要看到点在动，去「防晕圆点」页的实时预览舱。
 */

/**
 * 与 icon-mark.js 的 ICON_DOTS 保持一致 —— 由 tools/verify/mark-sync.mjs 逐值比对，
 * 改一边忘了改另一边会直接在发布脚本里失败（RN 侧不能 import tools/，只能抄，
 * 那就把「抄」这件事变成有守卫的抄）。
 */
const VIEW = 128;
const ROWS = 4;
const TOP = 26;
const BOTTOM = 102;
const RADIUS = 7.6;
const LEAN = 7;
const EDGE_X = 33;
/** 后缘最低亮度：低于这个值白点在深色场底上就消失了 */
const TRAIL_OPACITY = 0.52;

export function DotMatrixMark({
  size = 96,
  opacity = 1,
}: {
  size?: number;
  opacity?: number;
}): React.JSX.Element {
  const theme = useTheme();
  const scale = size / VIEW;
  const r = RADIUS * scale;

  const dots: React.JSX.Element[] = [];
  for (let side = 0; side < 2; side++) {
    const baseX = side === 0 ? EDGE_X : VIEW - EDGE_X;
    for (let i = 0; i < ROWS; i++) {
      const t = i / (ROWS - 1);
      const x = (baseX + LEAN * (t - 0.5) * 2) * scale;
      const y = (TOP + t * (BOTTOM - TOP)) * scale;
      const isLeading = i === ROWS - 1;
      dots.push(
        <View
          key={`${side}-${i}`}
          style={{
            position: 'absolute',
            left: x - r,
            top: y - r,
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            // 前缘用品牌色，其余靠透明度做拖影 —— 不靠第二种颜色
            backgroundColor: isLeading ? theme.accent : theme.text,
            opacity: isLeading ? 1 : TRAIL_OPACITY + (1 - TRAIL_OPACITY) * t,
          }}
        />
      );
    }
  }

  return (
    <View
      accessible
      accessibilityLabel="防晕圆点示意图标"
      style={{ width: size, height: size, opacity }}
    >
      {dots}
    </View>
  );
}
