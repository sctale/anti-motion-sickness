import React, { useEffect, useState } from 'react';
import { BackHandler, View, Text, StatusBar, ScrollView } from 'react-native';
import Constants from 'expo-constants';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { OverlayServiceProvider, useOverlayServiceContext } from './src/hooks/OverlayServiceContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { useStringPreference } from './src/hooks/usePreference';
import { LAST_CRASH_KEY } from './src/utils/constants';
import { installGlobalCrashReporter } from './src/utils/globalCrashReporter';
import { VehicleMotionScreen } from './src/screens/VehicleMotionScreen';
import { CarDetectionScreen } from './src/screens/CarDetectionScreen';
import { AboutScreen } from './src/screens/AboutScreen';
import { OnboardingChecklist } from './src/components/OnboardingChecklist';
import { BRAND } from './src/theme/brand';
import {
  Banner,
  Button,
  Card,
  Chevron,
  FadeIn,
  Row,
  SectionLabel,
  StatusDot,
} from './src/components/ui';
import { space, type as t, useIsDark, useTheme } from './src/theme/tokens';

// 必须早于任何可能抛错的代码：错误边界只接得住渲染期，effect/定时器/原生事件回调里的
// 致命错误要走全局处理器，趁进程终止前把原因同步落盘。
installGlobalCrashReporter();

type Screen = 'home' | 'vehicleMotion' | 'carDetection' | 'about';

// 版本号单一数据源：app.json -> expo.version（由 expo-constants 读取）
const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <OverlayServiceProvider>
          <RootNavigator />
        </OverlayServiceProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

/**
 * 三个界面共用一个 provider（见 OverlayServiceContext），这里只做整屏替换：
 * 进出场由各自的 FadeIn 负责，所以切页不再是「瞬间蹦出来」。
 */
function RootNavigator() {
  const [screen, setScreen] = useState<Screen>('home');

  /**
   * 系统返回手势 / 返回键。
   *
   * 本项目用 state 手管路由（没有 react-navigation），所以 RN 拿不到任何返回栈：
   * `BackHandler.android.js` 的行为是「没有任何监听返回 true 就 exitApp()」，
   * 于是 Android 16 上从边缘一划，整个 App 直接没了 —— 而不是回到主页。
   * 这里必须自己接一层：不在主页就先回主页并消费掉这次返回，在主页才交还系统退出。
   *
   * 依赖 screen 重新注册是有意的：监听器按注册倒序调用，重注册能保证拿到的总是当前路由，
   * 不必再多一个 ref 与它同步。
   */
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'home') return false;
      setScreen('home');
      return true;
    });
    return () => subscription.remove();
  }, [screen]);

  if (screen === 'vehicleMotion') {
    return <VehicleMotionScreen onExit={() => setScreen('home')} />;
  }

  if (screen === 'carDetection') {
    return <CarDetectionScreen onExit={() => setScreen('home')} />;
  }

  if (screen === 'about') {
    return <AboutScreen onExit={() => setScreen('home')} />;
  }

  return <Home onOpen={setScreen} />;
}

function Home({ onOpen }: { onOpen: (s: Screen) => void }): React.JSX.Element {
  const theme = useTheme();
  const isDark = useIsDark();
  const { isRunning, hasPermission, isSupported } = useOverlayServiceContext();

  return (
    <FadeIn distance={0}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.page }} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={theme.page}
          translucent={false}
        />

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={{
              color: theme.text,
              fontSize: 30,
              fontWeight: '800',
              letterSpacing: -0.6,
              marginTop: space.xl,
            }}
          >
            {BRAND.appName}
          </Text>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: t.control,
              lineHeight: 21,
              marginTop: space.sm,
              marginBottom: space.xl,
            }}
          >
            在屏幕两侧显示随车辆运动流动的点，让眼睛和内耳收到同一个信号。
          </Text>

          <CrashReportCard />

          <OnboardingChecklist onOpenFeature={() => onOpen('vehicleMotion')} />

          {isSupported && hasPermission === false ? (
            <Banner
              tone="warning"
              title="还没有悬浮窗权限"
              body="不授权的话圆点只能显示在本 App 里，盖不到微信、浏览器上。"
              action={
                <Button
                  label="进入防晕圆点页授权"
                  variant="soft"
                  onPress={() => onOpen('vehicleMotion')}
                />
              }
            />
          ) : null}

          <SectionLabel>功能</SectionLabel>
          <Card>
            <Row
              first
              title={BRAND.featureName}
              detail="常驻后台运行，覆盖在其他应用之上；息屏自动暂停省电"
              accessory={
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {isRunning ? (
                    <>
                      <StatusDot on size={9} />
                      <Text
                        style={{
                          color: theme.positive,
                          fontSize: t.footnote,
                          fontWeight: '700',
                          marginHorizontal: space.sm,
                        }}
                      >
                        显示中
                      </Text>
                    </>
                  ) : null}
                  <Chevron direction="right" color={theme.textTertiary} />
                </View>
              }
              onPress={() => onOpen('vehicleMotion')}
            />
            <Row
              title={BRAND.detectionName}
              detail="用加速度计判断是否正在乘车，检测期间按节奏震动提醒"
              accessory={<Chevron direction="right" color={theme.textTertiary} />}
              onPress={() => onOpen('carDetection')}
            />
            <Row
              title={BRAND.aboutName}
              detail="常见问题、反馈渠道，以及「数据只在本机处理」的说明"
              accessory={<Chevron direction="right" color={theme.textTertiary} />}
              onPress={() => onOpen('about')}
            />
          </Card>

          <Text
            style={{
              color: theme.textTertiary,
              fontSize: t.caption,
              marginTop: space.xl,
              textAlign: 'center',
            }}
          >
            v{APP_VERSION} · 原生前台服务 + 系统级悬浮窗 · Android 7.0 以上
          </Text>
        </ScrollView>
      </SafeAreaView>
    </FadeIn>
  );
}

/**
 * 上次启动的崩溃现场。
 *
 * 原生 CrashCapture、JS 错误边界与全局致命错误处理都写同一个偏好键，所以这里一次读出来
 * 就能覆盖三类崩溃。「点图标就闪退」在没有真机日志时是没法排查的 ——
 * 让 App 自己把原因显示在首页，用户截一张图就等于交出了 stacktrace。
 */
function CrashReportCard(): React.JSX.Element | null {
  const theme = useTheme();
  const [crash, setCrash] = useStringPreference(LAST_CRASH_KEY, '');
  if (!crash) return null;

  return (
    <View
      style={{
        backgroundColor: theme.dangerSoft,
        borderRadius: 16,
        padding: space.lg,
        marginBottom: space.md,
      }}
    >
      <Text style={{ color: theme.danger, fontSize: t.control, fontWeight: '800' }}>
        上次启动发生了崩溃
      </Text>
      <ScrollView
        style={{
          maxHeight: 150,
          backgroundColor: theme.cardAlt,
          borderRadius: 10,
          padding: space.md,
          marginTop: space.sm,
        }}
        nestedScrollEnabled
      >
        <Text
          style={{
            color: theme.textSecondary,
            fontSize: 11,
            lineHeight: 17,
            fontFamily: 'monospace',
          }}
        >
          {crash}
        </Text>
      </ScrollView>
      <Text
        style={{
          color: theme.textSecondary,
          fontSize: t.footnote,
          lineHeight: 19,
          marginTop: space.sm,
        }}
      >
        把上面这段截图发到 GitHub Issue，就能直接定位原因。
      </Text>
      <View style={{ marginTop: space.md }}>
        <Button label="已知晓，清除提示" variant="soft" onPress={() => setCrash('')} />
      </View>
    </View>
  );
}
