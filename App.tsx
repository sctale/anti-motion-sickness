import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  StatusBar,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { VehicleMotionScreen } from './src/screens/VehicleMotionScreen';
import { CarDetectionScreen } from './src/screens/CarDetectionScreen';

type Screen = 'home' | 'vehicleMotion' | 'carDetection';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');

  if (screen === 'vehicleMotion') {
    return <VehicleMotionScreen onExit={() => setScreen('home')} />;
  }

  if (screen === 'carDetection') {
    return <CarDetectionScreen onExit={() => setScreen('home')} />;
  }

  return (
    <SafeAreaView style={styles.container}>
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
        <FeatureCard
          icon="🚗"
          title="Vehicle Motion"
          description="基于原生 Android 传感器融合 + 实时悬浮窗的视觉反馈，在其他应用上显示防晕车圆点"
          buttonLabel="启动 Vehicle Motion"
          onPress={() => setScreen('vehicleMotion')}
        />

        <FeatureCard
          icon="📳"
          title="乘车检测"
          description="通过加速度计判断是否处于乘车状态，检测到乘车时自动震动反馈"
          buttonLabel="启动乘车检测"
          onPress={() => setScreen('carDetection')}
        />

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>技术架构</Text>
          <InfoRow text="原生 Foreground Service 后台运行" />
          <InfoRow text="TYPE_APPLICATION_OVERLAY 系统级悬浮窗" />
          <InfoRow text="TYPE_ROTATION_VECTOR 传感器融合" />
          <InfoRow text="EMA 滤波 + 状态机 + 二阶预测引擎" />
          <InfoRow text="覆盖微信、浏览器等任何 App" />
          <InfoRow text="完整适配 Android 16 (API 36)" />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          💡 提示：首次启动需要授予悬浮窗权限
        </Text>
        <Text style={styles.versionText}>v0.2.0 - Native Overlay · Android 16</Text>
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
}

function FeatureCard({ icon, title, description, buttonLabel, onPress }: FeatureCardProps) {
  return (
    <View style={styles.featureCard}>
      <View style={styles.featureIcon}>
        <Text style={styles.featureIconText}>{icon}</Text>
      </View>
      <Text style={styles.featureTitle}>{title}</Text>
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