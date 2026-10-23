import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';
import { useActivityRecognition, ActivityType } from '../hooks/useActivityRecognition';
import { useVibrationService, VibrationFrequency } from '../hooks/useVibrationService';
import { useBooleanPreference, useStringPreference } from '../hooks/usePreference';
import { useOverlayServiceContext } from '../hooks/OverlayServiceContext';
import { ACTIVITY_IN_VEHICLE_CONFIDENCE } from '../utils/constants';
import {
  Banner,
  Button,
  Card,
  Chevron,
  FadeIn,
  Row,
  SectionLabel,
  Segmented,
  StatusDot,
  Tap,
  Toggle,
} from '../components/ui';
import { radius, space, type as t, useIsDark, useTheme } from '../theme/tokens';

interface CarDetectionScreenProps {
  onExit: () => void;
}

const activityLabels: Record<ActivityType, string> = {
  'IN_VEHICLE': '正在乘车',
  'STILL': '静止',
  'WALKING': '步行',
  'UNKNOWN': '识别中',
};

const frequencyOptions: { value: VibrationFrequency; label: string }[] = [
  { value: 'low', label: '3 秒' },
  { value: 'medium', label: '2 秒' },
  { value: 'high', label: '1 秒' },
];

const PREF_VIBRATION_ENABLED = 'vibration_enabled';
const PREF_VIBRATION_FREQUENCY = 'vibration_frequency';
const PREF_AUTO_START_CUES = 'auto_start_cues';

export const CarDetectionScreen: React.FC<CarDetectionScreenProps> = ({ onExit }) => {
  const theme = useTheme();
  const isDark = useIsDark();
  const [isDetectionActive, setIsDetectionActive] = useState(false);
  const [linkageHint, setLinkageHint] = useState<string | null>(null);

  // 偏好写在原生 SharedPreferences，重启 App 后还记得
  const [vibrationEnabled, setVibrationEnabled] = useBooleanPreference(
    PREF_VIBRATION_ENABLED,
    true
  );
  const [rawFrequency, setRawFrequency] = useStringPreference(
    PREF_VIBRATION_FREQUENCY,
    'medium'
  );
  const [autoStartCues, setAutoStartCues] = useBooleanPreference(
    PREF_AUTO_START_CUES,
    false
  );

  const vibrationFrequency: VibrationFrequency =
    frequencyOptions.some((o) => o.value === rawFrequency)
      ? (rawFrequency as VibrationFrequency)
      : 'medium';

  const { currentActivity, confidence } = useActivityRecognition({
    isActive: isDetectionActive,
  });

  const shouldVibrate = isDetectionActive && currentActivity === 'IN_VEHICLE';

  const { vibrationCount, resetCount } = useVibrationService({
    isActive: shouldVibrate,
    frequency: vibrationFrequency,
    enabled: vibrationEnabled,
  });

  const {
    isRunning: cuesRunning,
    hasPermission,
    isSupported: cuesSupported,
    startService,
  } = useOverlayServiceContext();

  // 联动：检测到乘车时自动开启防晕圆点（这是「两个功能各玩各的」的直接修补）。
  // 只在检测页处于开启状态时有效 —— 关闭本页后不再持续检测。
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoStartCues || !isDetectionActive) {
      autoStartedRef.current = false;
      return;
    }
    if (currentActivity !== 'IN_VEHICLE' || confidence < ACTIVITY_IN_VEHICLE_CONFIDENCE) {
      return;
    }
    if (autoStartedRef.current || cuesRunning) return;
    // hasPermission 还没查完时是 null，这一步必须等它出结果：
    // 直接发起会撞上原生的 ERR_NO_PERMISSION，界面冒出一句吓人的失败提示，
    // 而且 autoStartedRef 被置位后本轮再也不会重试，等于「自动开启」悄悄坏了
    if (hasPermission !== true) {
      if (hasPermission === false) {
        setLinkageHint('检测到乘车，但缺少悬浮窗权限，请先到「防晕圆点」页授权');
        autoStartedRef.current = true;
      }
      return;
    }
    if (!cuesSupported) {
      setLinkageHint('当前构建不支持悬浮窗，无法自动开启圆点');
      autoStartedRef.current = true;
      return;
    }
    autoStartedRef.current = true;
    startService()
      .then(() => setLinkageHint('检测到乘车，已自动开启防晕圆点'))
      .catch((e: Error) => setLinkageHint('自动开启失败：' + e.message));
  }, [
    autoStartCues,
    isDetectionActive,
    currentActivity,
    confidence,
    cuesRunning,
    cuesSupported,
    hasPermission,
    startService,
  ]);

  const handleToggleDetection = useCallback(() => {
    if (isDetectionActive) {
      setIsDetectionActive(false);
      setLinkageHint(null);
      resetCount();
    } else {
      setIsDetectionActive(true);
    }
  }, [isDetectionActive, resetCount]);

  return (
    <FadeIn>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.page }} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={theme.page}
          translucent={false}
        />

        <View style={{ paddingHorizontal: space.sm, paddingTop: space.xs }}>
          <Tap
            onPress={onExit}
            accessibilityLabel="返回主页"
            style={{
              minHeight: 44,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: space.md,
              borderRadius: radius.control,
              alignSelf: 'flex-start',
            }}
          >
            <Chevron direction="left" color={theme.accent} />
            <Text style={{ color: theme.accent, fontSize: t.control, marginLeft: space.xs + 2 }}>
              返回
            </Text>
          </Tap>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={{
              color: theme.text,
              fontSize: t.title,
              fontWeight: '800',
              letterSpacing: -0.4,
              marginTop: space.xs,
              marginBottom: space.lg,
            }}
          >
            乘车检测
          </Text>

          <Card>
            <Row
              first
              title={isDetectionActive ? `当前${activityLabels[currentActivity]}` : '检测未开启'}
              detail={
                isDetectionActive
                  ? '靠加速度计的节奏判断是否在车里；离开本页会停止检测'
                  : '打开下面的开关，开始用加速度计判断你是否在乘车'
              }
              accessory={<StatusDot on={isDetectionActive} size={12} />}
            />
            <ConfidenceBar value={isDetectionActive ? confidence : 0} />
          </Card>

          {linkageHint ? <Banner tone="info" title={linkageHint} /> : null}

          <SectionLabel>检测与提醒</SectionLabel>
          <Card>
            <Row
              first
              title="启动检测"
              detail="只在本页打开期间运行；离开或返回主页即停止"
              accessory={
                <Toggle
                  value={isDetectionActive}
                  onChange={handleToggleDetection}
                  accessibilityLabel="启动检测"
                />
              }
            />
            <Row
              title="震动反馈"
              detail="乘车状态下按下面的节奏震动"
              accessory={
                <Toggle
                  value={vibrationEnabled}
                  onChange={setVibrationEnabled}
                  accessibilityLabel="震动反馈"
                  disabled={!isDetectionActive}
                />
              }
            />
            <View
              style={{
                paddingHorizontal: space.lg,
                paddingBottom: space.lg,
                paddingTop: space.lg,
                borderTopWidth: 1,
                borderTopColor: theme.separator,
              }}
            >
              <Text style={{ color: theme.text, fontSize: t.body, fontWeight: '500', marginBottom: space.md }}>
                震动节奏
              </Text>
              <Segmented
                options={frequencyOptions}
                value={vibrationFrequency}
                onChange={setRawFrequency}
                accessibilityLabel="震动节奏"
              />
            </View>
            <Row
              title="乘车时自动开启圆点"
              detail="识别到乘车就直接把防晕圆点开起来，不用回主页再点一次（仅本页检测期间有效）"
              accessory={
                <Toggle
                  value={autoStartCues}
                  onChange={setAutoStartCues}
                  accessibilityLabel="乘车时自动开启圆点"
                />
              }
            />
          </Card>

          <SectionLabel>本次会话</SectionLabel>
          <Card>
            <Row
              first
              title="已震动"
              detail={`${vibrationCount} 次`}
              accessory={
                vibrationCount > 0 ? (
                  <Button label="清零" variant="soft" onPress={resetCount} style={{ height: 36, paddingHorizontal: space.lg }} />
                ) : null
              }
            />
          </Card>

          <Text
            style={{
              color: theme.textTertiary,
              fontSize: t.footnote,
              lineHeight: 19,
              marginTop: space.lg,
              paddingHorizontal: space.xs,
            }}
          >
            提示：把手机放在腿上或杯架里最准；拿在手里频繁晃动会被判成步行。
          </Text>
        </ScrollView>
      </SafeAreaView>
    </FadeIn>
  );
};

/**
 * 置信度条。
 *
 * 之前是直接 `width: ${confidence}%`，传感器每来一次结果就硬跳一次，看起来像坏掉的进度条；
 * 这里改成 scaleX + native driver，数值变化被补间成连续动作 —— 这类「有过程」的细节
 * 就是所谓流畅感的主要来源。
 */
function ConfidenceBar({ value }: { value: number }): React.JSX.Element {
  const theme = useTheme();
  const ratio = Math.max(0, Math.min(1, value / 100));
  const anim = useRef(new Animated.Value(ratio)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: ratio,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // 需要改 width，native driver 不支持布局属性
    }).start();
  }, [ratio, anim]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View
      style={{
        paddingHorizontal: space.lg,
        paddingTop: space.md,
        paddingBottom: space.lg,
        borderTopWidth: 1,
        borderTopColor: theme.separator,
      }}
    >
      <View
        style={{
          height: 6,
          borderRadius: radius.pill,
          backgroundColor: theme.cardAlt,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={{
            height: '100%',
            width,
            borderRadius: radius.pill,
            backgroundColor: ratio >= 0.7 ? theme.positive : theme.accent,
          }}
        />
      </View>
      <Text style={{ color: theme.textTertiary, fontSize: t.caption, marginTop: space.sm }}>
        识别可信度 {Math.round(value)}%
      </Text>
    </View>
  );
}
