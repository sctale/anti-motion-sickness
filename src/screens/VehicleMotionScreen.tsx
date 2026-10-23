import React, { useCallback, useState } from 'react';
import { View, Text, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOverlayServiceContext } from '../hooks/OverlayServiceContext';
import { PreviewPanel } from '../components/PreviewPanel';
import {
  SENSITIVITY,
  SENSITIVITY_LABELS,
  toSensitivityLevel,
  type SensitivityLevel,
} from '../native/OverlayNative';
import {
  Banner,
  Button,
  Card,
  Chevron,
  FadeIn,
  Pill,
  Row,
  SectionLabel,
  Segmented,
  Tap,
  Toggle,
} from '../components/ui';
import { radius, space, leading, type as t, useIsDark, useTheme } from '../theme/tokens';

interface VehicleMotionScreenProps {
  onExit: () => void;
}

const SENSITIVITY_OPTIONS: { value: SensitivityLevel; label: string }[] = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'veryHigh', label: '极高' },
];

const SENSITIVITY_HINTS: Record<SensitivityLevel, string> = {
  low: '只有明显加减速或转弯时才有动作',
  medium: '推荐：对应日常驾驶的幅度',
  high: '轻微动作也会跟着动',
  veryHigh: '最灵敏：很小的动作就推满，走路拿在手里也会跟着晃',
};

export const VehicleMotionScreen: React.FC<VehicleMotionScreenProps> = ({ onExit }) => {
  const theme = useTheme();
  const isDark = useIsDark();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tileHint, setTileHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const {
    hasPermission,
    isRunning,
    isSupported,
    settings,
    checkPermission,
    requestPermission,
    startService,
    stopService,
    updateSettings,
    requestNotificationPermission,
    canRequestAddTile,
    requestAddTile,
    batteryExempt,
    openBatterySettings,
    serviceHint,
    notificationsEnabled,
    openNotificationSettings,
  } = useOverlayServiceContext();

  const handleStart = useCallback(async () => {
    setErrorMessage(null);
    setBusy(true);
    try {
      const granted = await checkPermission();
      if (!granted) {
        setErrorMessage('需要「显示在其他应用上层」权限，圆点才能盖在别的 App 上');
        return;
      }
      // 通知被隐藏时，用户只能回 App 才能关掉圆点，所以首次启动顺带请求一次通知权限
      requestNotificationPermission();
      await startService();
    } catch (e) {
      setErrorMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [checkPermission, startService, requestNotificationPermission]);

  const handleStop = useCallback(async () => {
    setBusy(true);
    try {
      await stopService();
    } finally {
      setBusy(false);
    }
  }, [stopService]);

  const handleRequestPermission = useCallback(async (): Promise<void> => {
    setErrorMessage(null);
    await requestPermission();
    // 授权页返回后 AppState 会触发重新检查，不需要再用 setTimeout 猜时间
  }, [requestPermission]);

  // 开关与灵敏度走「乐观更新」（在 useOverlayService 里先改本地再落原生）：
  // 等原生回包才动界面，用户会觉得点没生效
  const handleAutoModeChange = useCallback(
    async (value: boolean): Promise<void> => {
      setErrorMessage(null);
      try {
        await updateSettings({ autoMode: value });
      } catch (e) {
        setErrorMessage((e as Error).message);
      }
    },
    [updateSettings]
  );

  const handleSensitivityChange = useCallback(
    async (level: SensitivityLevel): Promise<void> => {
      setErrorMessage(null);
      try {
        await updateSettings({ sensitivity: SENSITIVITY[level] });
      } catch (e) {
        setErrorMessage((e as Error).message);
      }
    },
    [updateSettings]
  );

  const handleAddTile = useCallback(async (): Promise<void> => {
    setTileHint(null);
    try {
      // 原生只在系统回调「已添加 / 已存在」时才 resolve，所以成功文案不能说成「已发起请求」
      await requestAddTile();
      setTileHint('磁贴已添加到下拉快捷面板，点一下即可开关圆点');
    } catch (e) {
      setTileHint((e as Error).message);
    }
  }, [requestAddTile]);

  const handleOpenBatterySettings = useCallback(async (): Promise<void> => {
    setTileHint(null);
    try {
      await openBatterySettings();
      setTileHint('请在系统页面选择「不限制 / 允许后台运行」，回到 App 后本页会自动复查');
    } catch (e) {
      setTileHint((e as Error).message);
    }
  }, [openBatterySettings]);

  // 返回不再停服务：圆点的用途就是盖在其他 App 上，在 App 内翻页不应该把提示关掉
  const handleExit = useCallback(() => onExit(), [onExit]);

  const level = toSensitivityLevel(settings.sensitivity);
  const showSystemRows = isSupported && (canRequestAddTile || batteryExempt === false);

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
            onPress={handleExit}
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
          {/* 标题行右侧放状态胶囊：原来是一整张卡只说「圆点未显示」，
              占一屏高度还和下面的预览舱抢焦点 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.xs }}>
            <Text
              style={{
                flex: 1,
                color: theme.text,
                fontSize: t.headline,
                fontWeight: '800',
                letterSpacing: -0.6,
                lineHeight: leading.headline,
              }}
            >
              防晕圆点
            </Text>
            <Pill tone={isRunning ? 'live' : 'neutral'} label={isRunning ? '显示中' : '未显示'} />
          </View>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: t.footnote,
              lineHeight: leading.footnote,
              marginTop: space.sm,
              marginBottom: space.lg,
            }}
          >
            {!isSupported
              ? '当前构建不包含悬浮窗能力（仅 Android 完整构建可用）'
              : [
                  settings.autoMode ? '自动模式' : '始终显示',
                  '灵敏度 ' + SENSITIVITY_LABELS[toSensitivityLevel(settings.sensitivity)],
                  isRunning ? '切到其他应用也不会中断' : '点「开始显示」后生效',
                ].join(' · ')}
          </Text>

          {isSupported ? <PreviewPanel /> : null}

          {!isSupported ? (
            <Banner
              tone="warning"
              title="这个构建不支持悬浮窗"
              body="圆点依赖 Android 的悬浮窗与前台服务，iOS 没有对应能力；如果你正在用 Android，说明该包未包含原生模块，请安装完整构建。"
            />
          ) : null}

          {isSupported && hasPermission === false ? (
            <Banner
              tone="warning"
              title="需要「显示在其他应用上层」权限"
              body="没有这个权限，圆点无法盖在微信、浏览器等其他应用上。"
              action={
                <Button label="前往系统设置授权" variant="soft" onPress={handleRequestPermission} />
              }
            />
          ) : null}

          {isSupported && isRunning && notificationsEnabled === false ? (
            <Banner
              tone="warning"
              title="通知被禁用，你只能回到应用里关闭圆点"
              body="通知栏里的「停止」是最方便的关闭通道；也建议添加快捷面板磁贴。"
              action={
                <Button
                  label="去开启通知"
                  variant="soft"
                  onPress={() => {
                    openNotificationSettings().catch(() => undefined);
                  }}
                />
              }
            />
          ) : null}

          {errorMessage ? <Banner tone="danger" title="操作没有成功" body={errorMessage} /> : null}

          {serviceHint ? <Banner tone="info" title="状态与画面不一致" body={serviceHint} /> : null}

          <SectionLabel>显示</SectionLabel>
          <Card>
            <View style={{ padding: space.lg }}>
              <Button
                label={isRunning ? '停止显示' : '开始显示'}
                variant={isRunning ? 'danger' : 'primary'}
                busy={busy}
                disabled={!isSupported || hasPermission === false}
                onPress={isRunning ? handleStop : handleStart}
              />
            </View>
            <Row
              title="自动模式"
              detail="检测到车辆运动时显示，静止约 10 秒后淡出；运行中也能切换"
              accessory={
                <Toggle
                  value={settings.autoMode}
                  onChange={handleAutoModeChange}
                  accessibilityLabel="自动模式"
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
                灵敏度
              </Text>
              <Segmented
                options={SENSITIVITY_OPTIONS}
                value={level}
                onChange={handleSensitivityChange}
                accessibilityLabel="灵敏度"
              />
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: t.footnote,
                  lineHeight: leading.footnote,
                  marginTop: space.md,
                }}
              >
                {SENSITIVITY_HINTS[level]}
              </Text>
            </View>
          </Card>

          {showSystemRows ? (
            <>
              <SectionLabel>系统入口</SectionLabel>
              <Card>
                {canRequestAddTile ? (
                  <Row
                    first
                    title="添加到快捷设置面板"
                    detail="下拉通知栏点一下即可开关圆点，不用回到 App"
                    accessory={<Chevron direction="right" color={theme.textTertiary} />}
                    onPress={handleAddTile}
                  />
                ) : null}
                {batteryExempt === false ? (
                  <Row
                    first={!canRequestAddTile}
                    title="允许后台常驻"
                    detail="系统仍可能在息屏或后台时冻结服务，圆点会自己消失；设置为「无限制」后这一行会自动隐藏"
                    accessory={<Chevron direction="right" color={theme.textTertiary} />}
                    onPress={handleOpenBatterySettings}
                  />
                ) : null}
              </Card>
            </>
          ) : null}

          {tileHint ? <Banner tone="info" title={tileHint} /> : null}

          <SectionLabel>圆点在告诉你什么</SectionLabel>
          <Card>
            <Row
              first
              title="加速时圆点向下流"
              detail="刹车时向上流，与车窗外景物的流向一致 —— 眼睛看到的和耳朵感受到的对上了，就不容易晕"
            />
            <Row
              title="左转时圆点向右移"
              detail="右转时向左移；偏航角速度与横向加速度两路合成，缓转与急转的幅度也不同"
            />
            <Row
              title="竖握、平放都能识别"
              detail="前进方向由手机姿态自适应推断，不依赖手机朝向，也不依赖磁北"
            />
            <Row
              title="只在屏幕两侧活动"
              detail="左右各 8 个点，不侵入中间的内容区；息屏时自动暂停传感器省电"
            />
          </Card>

          <Text
            style={{
              color: theme.textTertiary,
              fontSize: t.footnote,
              lineHeight: leading.footnote,
              marginTop: space.lg,
              paddingHorizontal: space.xs,
            }}
          >
            停止方式：本页的「停止显示」、通知栏的「停止」，或下拉快捷面板的磁贴。在 App 内翻页不会中断圆点。
          </Text>
        </ScrollView>
      </SafeAreaView>
    </FadeIn>
  );
};
