import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  StatusBar,
  ScrollView,
} from 'react-native';
import Constants from 'expo-constants';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { OverlayServiceProvider, useOverlayServiceContext } from './src/hooks/OverlayServiceContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { useStringPreference } from './src/hooks/usePreference';
import { LAST_CRASH_KEY } from './src/utils/constants';
import { VehicleMotionScreen } from './src/screens/VehicleMotionScreen';
import { CarDetectionScreen } from './src/screens/CarDetectionScreen';

type Screen = 'home' | 'vehicleMotion' | 'carDetection';

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
 * 上次启动的崩溃现场。
 *
 * 原生 CrashCapture 与 JS ErrorBoundary 都写同一个偏好键，所以这里一次读出来就能覆盖两类崩溃。
 * 「点图标就闪退」在没有真机日志时是没法排查的 —— 让 App 自己把原因显示在首页，
 * 用户截一张图就等于交出了 stacktrace。
 */
function CrashReportCard() {
  const [crash, setCrash] = useStringPreference(LAST_CRASH_KEY, '');
  if (!crash) return null;

  return (
    <View style={styles.crashCard}>
      <Text style={styles.crashTitle}>⚠️ 上次启动发生了崩溃</Text>
      <ScrollView style={styles.crashLog} nestedScrollEnabled>
        <Text style={styles.crashText}>{crash}</Text>
      </ScrollView>
      <Text style={styles.crashHint}>
        把上面这段截图发到 GitHub Issue，就能直接定位原因（比「闪退」两个字有用得多）。
      </Text>
      <TouchableOpacity style={styles.crashClear} onPress={() => setCrash('')}>
        <Text style={styles.crashClearText}>已知晓，清除提示</Text>
      </TouchableOpacity>
    </View>
  );
}

function RootNavigator() {
  const [screen, setScreen] = useState<Screen>('home');

  if (screen === 'vehicleMotion') {
    return <VehicleMotionScreen onExit={() => setScreen('home')} />;
  }

  if (screen === 'carDetection') {
    return <CarDetectionScreen onExit={() => setScreen('home')} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F8FAFC"
        translucent={false}
      />

      <View style={styles.header}>
        <Text style={styles.title}>🚗 防晕车助手</Text>
        <Text style={styles.subtitle}>iOS Vehicle Motion Cues 风格</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <CrashReportCard />

        <FeatureCard
          icon="🚗"
          title="Vehicle Motion"
          description="基于原生 Android 传感器融合 + 实时悬浮窗的视觉反馈，在其他应用上显示防晕车圆点"
          buttonLabel="启动 Vehicle Motion"
          badge={<RunningBadge />}
          onPress={() => setScreen('vehicleMotion')}
        />

        <FeatureCard
          icon="📳"
          title="乘车检测"
          description="用加速度计判断是否处于乘车状态，检测期间自动震动反馈（仅本页打开时有效）"
          buttonLabel="启动乘车检测"
          onPress={() => setScreen('carDetection')}
        />

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>技术架构</Text>
          <InfoRow text="原生 Foreground Service 后台运行" />
          <InfoRow text="TYPE_APPLICATION_OVERLAY 系统级悬浮窗" />
          <InfoRow text="旋转矢量 + 线性加速度 + 陀螺仪，世界坐标系融合" />
          <InfoRow text="姿态自适应方向映射 + 临界阻尼弹簧平滑" />
          <InfoRow text="自动模式：检测到车辆运动显示，静止后淡出" />
          <InfoRow text="覆盖微信、浏览器等任何 App" />
          <InfoRow text="完整适配 Android 16 (API 36)" />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          💡 提示：首次启动需要授予悬浮窗权限
        </Text>
        <Text style={styles.versionText}>v{APP_VERSION} - Native Overlay · Android 16</Text>
      </View>
    </SafeAreaView>
  );
}

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
  buttonLabel: string;
  onPress: () => void;
  badge?: React.ReactNode;
}

/** 首页直接显示圆点是否在跑：以前要进二级页才知道当前状态 */
function RunningBadge() {
  const { isRunning } = useOverlayServiceContext();
  if (!isRunning) return null;
  return (
    <View style={styles.runningBadge}>
      <View style={styles.runningDot} />
      <Text style={styles.runningBadgeText}>圆点运行中</Text>
    </View>
  );
}

function FeatureCard({ icon, title, description, buttonLabel, onPress, badge }: FeatureCardProps) {
  return (
    <View style={styles.featureCard}>
      <View style={styles.featureIcon}>
        <Text style={styles.featureIconText}>{icon}</Text>
      </View>
      <Text style={styles.featureTitle}>{title}</Text>
      {badge ?? null}
      <Text style={styles.featureDescription}>{description}</Text>
      <TouchableOpacity
        style={styles.startButton}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Text style={styles.startButtonText}>{buttonLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function InfoRow({ text }: { text: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoBullet}>•</Text>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 10 : 40,
    paddingBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  crashCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  crashTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#B91C1C',
    marginBottom: 10,
  },
  crashLog: {
    maxHeight: 180,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  crashText: {
    fontSize: 11,
    lineHeight: 17,
    color: '#7F1D1D',
    fontFamily: 'monospace',
  },
  crashHint: {
    fontSize: 12,
    lineHeight: 18,
    color: '#991B1B',
    marginBottom: 12,
  },
  crashClear: {
    backgroundColor: '#B91C1C',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  crashClearText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  featureCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 20,
  },
  featureIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  featureIconText: {
    fontSize: 40,
  },
  featureTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  runningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#DCFCE7',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  runningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 8,
  },
  runningBadgeText: {
    color: '#15803D',
    fontSize: 13,
    fontWeight: '700',
  },
  featureDescription: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  startButton: {
    backgroundColor: '#6366F1',
    borderRadius: 30,
    paddingVertical: 18,
    paddingHorizontal: 48,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  infoBullet: {
    fontSize: 14,
    color: '#6366F1',
    marginRight: 8,
    lineHeight: 20,
  },
  infoText: {
    fontSize: 14,
    color: '#64748B',
    flex: 1,
    lineHeight: 20,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    paddingTop: 20,
  },
  footerText: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 8,
    textAlign: 'center',
  },
  versionText: {
    fontSize: 11,
    color: '#CBD5E1',
  },
});