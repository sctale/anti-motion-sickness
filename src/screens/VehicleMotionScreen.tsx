import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useOverlayService } from '../hooks/useOverlayService';

interface VehicleMotionScreenProps {
  onExit: () => void;
}

export const VehicleMotionScreen: React.FC<VehicleMotionScreenProps> = ({ onExit }) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    hasPermission,
    isRunning,
    checkPermission,
    requestPermission,
    startService,
    stopService,
  } = useOverlayService();

  useEffect(() => {
    return () => {
      if (isRunning) {
        stopService();
      }
    };
  }, [isRunning]);

  const handleStart = useCallback(async () => {
    setErrorMessage(null);
    const granted = await checkPermission();
    if (!granted) {
      setErrorMessage('需要悬浮窗权限才能在其他应用上显示防晕车圆点');
      return;
    }
    try {
      await startService();
    } catch (e) {
      setErrorMessage('启动服务失败：' + (e as Error).message);
    }
  }, [checkPermission, startService]);

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
    <SafeAreaView style={styles.container}>
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

        {hasPermission === false && (
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

          <TouchableOpacity
            style={[styles.controlButton, isRunning && styles.controlButtonActive]}
            onPress={isRunning ? handleStop : handleStart}
            disabled={hasPermission === false}
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
            <Text style={styles.infoText}>传感器融合 (TYPE_ROTATION_VECTOR)</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>EMA滤波 (alpha=0.15) 平滑数据</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>状态机检测运动方向</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>预测引擎提前300ms渲染</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>屏幕边缘16个圆点 (上8下8)</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>覆盖其他APP显示</Text>
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