import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOverlayService } from '../hooks/useOverlayService';

interface VehicleMotionScreenProps {
  onExit: () => void;
}

export const VehicleMotionScreen: React.FC<VehicleMotionScreenProps> = ({ onExit }) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // 对标 Apple「自动」/ Google「Start in a moving vehicle」：静止时隐藏圆点
  const [autoMode, setAutoMode] = useState(true);

  const {
    hasPermission,
    isRunning,
    isSupported,
    checkPermission,
    requestPermission,
    startService,
    stopService,
  } = useOverlayService();

  const handleStart = useCallback(async () => {
    setErrorMessage(null);
    const granted = await checkPermission();
    if (!granted) {
      setErrorMessage('需要悬浮窗权限才能在其他应用上显示防晕车圆点');
      return;
    }
    try {
      await startService(autoMode);
    } catch (e) {
      setErrorMessage('启动服务失败：' + (e as Error).message);
    }
  }, [checkPermission, startService, autoMode]);

  const handleRequestPermission = useCallback(async () => {
    setErrorMessage(null);
    await requestPermission();
    setTimeout(() => {
      checkPermission();
    }, 1000);
  }, [requestPermission, checkPermission]);

  const handleStop = useCallback(async () => {
    await stopService();
  }, [stopService]);

  const handleExit = useCallback(async () => {
    if (isRunning) {
      await stopService();
    }
    onExit();
  }, [isRunning, stopService, onExit]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#0F172A"
        translucent={false}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={handleExit} style={styles.backButton}>
          <Text style={styles.backButtonText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🚗 Vehicle Motion</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.statusCard}>
          <View style={[styles.statusDot, isRunning && styles.statusDotActive]} />
          <Text style={styles.statusText}>
            {isRunning ? '运行中' : '已停止'}
          </Text>
        </View>

        {!isSupported && (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>⚠️ 当前平台不支持</Text>
            <Text style={styles.warningText}>
              悬浮圆点依赖 Android 的悬浮窗与前台服务，iOS 没有对应能力；若你已在 Android 上，说明该构建未包含原生模块 OverlayModule，请使用完整 Android 构建。
            </Text>
          </View>
        )}

        {isSupported && hasPermission === false && (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>⚠️ 需要悬浮窗权限</Text>
            <Text style={styles.warningText}>
              为了在其他应用上显示防晕车圆点，需要授予悬浮窗权限。
            </Text>
            <TouchableOpacity
              style={styles.permissionButton}
              onPress={handleRequestPermission}
            >
              <Text style={styles.permissionButtonText}>前往授权</Text>
            </TouchableOpacity>
          </View>
        )}

        {errorMessage && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        <View style={styles.controlsCard}>
          <Text style={styles.controlsTitle}>控制面板</Text>

          <View style={styles.controlRow}>
            <View style={styles.controlLabelBlock}>
              <Text style={styles.controlLabel}>自动模式</Text>
              <Text style={styles.controlHint}>
                检测到车辆运动时显示圆点，静止约 10 秒后自动隐藏（启动时生效）
              </Text>
            </View>
            <Switch
              value={autoMode}
              onValueChange={setAutoMode}
              trackColor={{ false: '#334155', true: '#6366F1' }}
              thumbColor="#fff"
            />
          </View>

          <TouchableOpacity
            style={[styles.controlButton, isRunning && styles.controlButtonActive]}
            onPress={isRunning ? handleStop : handleStart}
            disabled={!isSupported || hasPermission === false}
          >
            <Text style={styles.controlButtonText}>
              {isRunning ? '⏸ 暂停' : '▶ 启动'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>工作原理</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>
              旋转矢量融合，圆点左右各 8 个（共 16 个）
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>
              横向提示：左转圆点右移、右转左移（偏航角速度 + 横向加速度）
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>
              纵向提示：加速圆点下滑、刹车上滑（同车窗外景物流向）
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>
              姿态自适应：竖握、平放均能正确识别转向
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>
              临界阻尼弹簧平滑，圆点始终停留在屏幕两侧
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>覆盖其他 App 显示，息屏自动暂停省电</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    paddingVertical: 8,
  },
  backButtonText: {
    color: '#6366F1',
    fontSize: 16,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  placeholder: {
    width: 60,
  },
  scrollContent: {
    padding: 20,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    marginBottom: 16,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#94A3B8',
    marginRight: 12,
  },
  statusDotActive: {
    backgroundColor: '#22C55E',
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  warningCard: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  warningTitle: {
    color: '#F59E0B',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  warningText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  permissionButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  errorCard: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
  },
  controlsCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  controlsTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  controlLabelBlock: {
    flex: 1,
    marginRight: 12,
  },
  controlLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  controlHint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    lineHeight: 17,
  },
  controlButton: {
    backgroundColor: '#6366F1',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: '#EF4444',
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  infoCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 20,
  },
  infoTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  infoBullet: {
    color: '#6366F1',
    fontSize: 14,
    marginRight: 8,
    lineHeight: 20,
  },
  infoText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    flex: 1,
    lineHeight: 20,
  },
});

export default VehicleMotionScreen;