import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleProp,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import {
  motion,
  radius,
  space,
  type as t,
  useTheme,
  type Theme,
} from '../theme/tokens';

/**
 * 界面基元。
 *
 * 这些组件解决的是「点下去没反应、切换没有过程、卡片之间没有层级」这三件事 ——
 * 之前每个界面直接摆 `TouchableOpacity + Text`，按压只有 0.8 透明度、开关用系统默认样式、
 * 页面切换是瞬间替换，所以整体感觉「卡、糙」。
 * 全部用 RN 自带 `Animated` + `useNativeDriver`（不引新依赖，动画跑在 UI 线程，不掉帧）。
 */

interface PressableProps {
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  /** 用于无障碍朗读，必须给 */
  accessibilityLabel: string;
}

/** 带「状态层」的可按压容器：按下时铺一层半透明色并轻微收缩，松手回弹 */
export function Tap({
  onPress,
  disabled,
  style,
  children,
  accessibilityLabel,
}: PressableProps): React.JSX.Element {
  const theme = useThemeSafe();
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);

  const animate = useCallback(
    (to: number, duration: number) => {
      Animated.timing(scale, {
        toValue: to,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [scale]
  );

  useEffect(() => {
    animate(pressed && !disabled ? 0.985 : 1, pressed ? motion.pressIn : motion.pressOut);
  }, [pressed, disabled, animate]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      style={{ transform: [{ scale }] }}
    >
      <View
        style={[
          style,
          pressed && !disabled ? { backgroundColor: theme.pressed } : null,
        ]}
      >
        {children}
      </View>
    </Pressable>
  );
}

/** 分组卡片：iOS 设置那种「一组一行行」的内嵌容器 */
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const theme = useThemeSafe();
  return (
    <View
      style={[
        {
          backgroundColor: theme.card,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: theme.separator,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionLabel({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const theme = useThemeSafe();
  return (
    <Text
      style={{
        color: theme.textTertiary,
        fontSize: t.caption,
        fontWeight: '700',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        marginLeft: space.lg + space.xs,
        marginTop: space.xl,
        marginBottom: space.sm,
      }}
    >
      {children}
    </Text>
  );
}

/** 一行：标题 + 可选说明 + 右侧控件；自动画分隔线（非首行） */
export function Row({
  title,
  detail,
  accessory,
  first,
  onPress,
}: {
  title: string;
  detail?: string;
  accessory?: React.ReactNode;
  first?: boolean;
  onPress?: () => void;
}): React.JSX.Element {
  const theme = useThemeSafe();
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: space.lg,
        paddingVertical: space.lg,
        minHeight: 60,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: theme.separator,
      }}
    >
      <View style={{ flex: 1, paddingRight: space.md }}>
        <Text style={{ color: theme.text, fontSize: t.body, fontWeight: '500' }}>
          {title}
        </Text>
        {detail ? (
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: t.footnote,
              lineHeight: 18,
              marginTop: space.xs + 1,
            }}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {accessory ?? null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Tap onPress={onPress} accessibilityLabel={title}>
      {body}
    </Tap>
  );
}

/** 自定义开关：轨道与滑块都是画的，切换有位移与颜色过渡（系统 Switch 在 Android 上风格不统一） */
export function Toggle({
  value,
  onChange,
  disabled,
  accessibilityLabel,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
}): React.JSX.Element {
  const theme = useThemeSafe();
  const W = 50;
  const H = 30;
  const knob = H - 8;
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: motion.toggle,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [value, progress]);

  const trackColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.controlTrack, theme.accent],
  });
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, W - knob - 8],
  });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onChange(!value)}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <Animated.View
        style={{
          width: W,
          height: H,
          borderRadius: radius.pill,
          backgroundColor: trackColor,
          justifyContent: 'center',
          paddingHorizontal: 4,
        }}
      >
        <Animated.View
          style={{
            width: knob,
            height: knob,
            borderRadius: radius.pill,
            backgroundColor: '#FFFFFF',
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            transform: [{ translateX }],
          }}
        />
      </Animated.View>
    </Pressable>
  );
}

/** 分段选择器：选中底色在段间滑动，而不是「换了个背景色」 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  accessibilityLabel: string;
}): React.JSX.Element {
  const theme = useThemeSafe();
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const slide = useRef(new Animated.Value(index)).current;
  const segWidth = width > 0 ? width / options.length : 0;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: index,
      useNativeDriver: true,
      speed: 26,
      bounciness: 0,
    }).start();
  }, [index, slide]);

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        flexDirection: 'row',
        backgroundColor: theme.cardAlt,
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: theme.separator,
        padding: 3,
      }}
    >
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 3,
            top: 3,
            bottom: 3,
            width: segWidth,
            transform: [{ translateX: slide.interpolate({ inputRange: [0, options.length - 1], outputRange: [0, segWidth * (options.length - 1)] }) }],
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: theme.accent,
              borderRadius: radius.control - 3,
            }}
          />
        </Animated.View>
      ) : null}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: space.sm + 2 }}
          >
            <Text
              style={{
                fontSize: t.control,
                fontWeight: '600',
                color: active ? theme.accentText : theme.textSecondary,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
      <View accessibilityLabel={accessibilityLabel} style={{ display: 'none' }} />
    </View>
  );
}

/** 主按钮：带忙碌态，避免「点了没反应就再点一次」 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  busy,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'soft' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const theme = useThemeSafe();
  const bg =
    variant === 'primary'
      ? theme.accent
      : variant === 'danger'
        ? theme.dangerSoft
        : theme.accentSoft;
  const fg =
    variant === 'primary'
      ? theme.accentText
      : variant === 'danger'
        ? theme.danger
        : theme.onAccentSoft;

  return (
    <Tap
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityLabel={label}
      style={[
        {
          height: 50,
          borderRadius: radius.control,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          opacity: disabled ? 0.45 : busy ? 0.75 : 1,
        },
        style
      ]}
    >
      {busy ? (
        <ActivityIndicator
          size="small"
          color={fg}
          style={{ marginRight: space.sm }}
          testID="button-busy"
        />
      ) : null}
      <Text style={{ color: fg, fontSize: t.body, fontWeight: '700' }}>{label}</Text>
    </Tap>
  );
}

export type BannerTone = 'info' | 'warning' | 'danger' | 'positive';

/** 统一的通知条：以前 warning / error / hint 是三套各自摆出来的 Text，会叠成一串 */
export function Banner({
  tone = 'info',
  title,
  body,
  action,
}: {
  tone?: BannerTone;
  title: string;
  body?: string;
  action?: React.ReactNode;
}): React.JSX.Element {
  const theme = useThemeSafe();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: motion.banner,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [fade, title]);

  const map = useMemo(
    () => ({
      info: { bg: theme.accentSoft, fg: theme.onAccentSoft },
      warning: { bg: theme.warningSoft, fg: theme.warning },
      danger: { bg: theme.dangerSoft, fg: theme.danger },
      positive: { bg: theme.positiveSoft, fg: theme.positive },
    }),
    [theme]
  );
  const tone2 = map[tone];

  return (
    <Animated.View
      style={{
        opacity: fade,
        backgroundColor: tone2.bg,
        borderRadius: radius.card - 4,
        padding: space.lg,
        marginTop: space.md,
      }}
    >
      <Text style={{ color: tone2.fg, fontSize: t.control, fontWeight: '700' }}>
        {title}
      </Text>
      {body ? (
        <Text
          style={{
            color: theme.text,
            fontSize: t.footnote,
            lineHeight: 19,
            marginTop: space.xs + 2,
          }}
        >
          {body}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: space.md }}>{action}</View> : null}
    </Animated.View>
  );
}

/** 状态点：唯一的「运行中」视觉，不用 emoji */
export function StatusDot({ on, size = 10 }: { on: boolean; size?: number }): React.JSX.Element {
  const theme = useThemeSafe();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 只做一次性淡入，不再常驻循环：一个「防晕」产品自己放一个永远在闪的元素是自我矛盾，
    // 而且首页与二级页各挂一个循环动画在低配机上是白送的开销。
    Animated.timing(pulse, {
      toValue: on ? 1 : 0,
      duration: on ? motion.toggle : motion.pressOut,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [on, pulse]);

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={{
          flex: 1,
          borderRadius: size,
          backgroundColor: on ? theme.positive : theme.textTertiary,
          opacity: on ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) : 1,
          transform: [{ scale: on ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) : 1 }],
        }}
      />
    </View>
  );
}

/** 返回箭头：两条旋转的边拼成 chevron，比「←」字符干净 */
export function Chevron({
  direction = 'left',
  color,
}: {
  direction?: 'left' | 'right' | 'down';
  color: string;
}): React.JSX.Element {
  // 三条边各留两条：左 = 返回，右 = 进入 / 展开前，下 = 展开后
  const rotate = direction === 'left' ? '45deg' : direction === 'right' ? '-135deg' : '-45deg';
  return (
    <View
      style={{
        width: 11,
        height: 11,
        borderLeftWidth: 2,
        borderBottomWidth: 2,
        borderColor: color,
        transform: [{ rotate }, { translateY: direction === 'down' ? -3 : direction === 'left' ? 0 : -1 }],
      }}
    />
  );
}

/** 页面进出场：淡入 + 轻微上移。之前 setScreen 是瞬间替换，观感上就是「卡了一下」 */
export function FadeIn({
  children,
  distance = 12,
}: {
  children: React.ReactNode;
  distance?: number;
}): React.JSX.Element {
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: motion.screen,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter]);

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: enter,
        transform: [
          {
            translateY: enter.interpolate({
              inputRange: [0, 1],
              outputRange: [distance, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

// 让基元不必每个都接收 theme prop：内部直接取主题（避免调用方漏传导致风格不一致）
function useThemeSafe(): Theme {
  return useTheme();
}
