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
import { useOverlayServiceContext } from '../hooks/OverlayServiceContext';
import {
  SENSITIVITY,
  SENSITIVITY_LABELS,
  toSensitivityLevel,
  type SensitivityLevel,
} from '../native/OverlayNative';

interface VehicleMotionScreenProps {
  onExit: () => void;
}

const SENSITIVITY_LEVELS: SensitivityLevel[] = ['low', 'medium', 'high'];

const SENSITIVITY_HINTS: Record<SensitivityLevel, string> = {
  low: '只有明显加减速 / 转弯时才有动作',
  medium: '推荐：日常驾驶幅度',
  high: '轻微动作也会跟着动',
};

export const VehicleMotionScreen: React.FC<VehicleMotionScreenProps> = ({ onExit }) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tileHint, setTileHint] = useState<string | null>(null);

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
  } = useOverlayServiceContext();

  const handleStart = useCallback(async () => {
    setErrorMessage(null);
    const granted = await checkPermission();
    if (!granted) {
      setErrorMessage('需要悬浮窗权限才能在其他应用上显示防晕车圆点');
      return;
    }
    // 通知被隐藏时，用户只能回 App 才能关掉圆点，所以首次启动顺带请求一次通知权限
    requestNotificationPermission();
    try {
      await startService();
    } catch (e) {
      setErrorMessage('启动服务失败：' + (e as Error).message);
    }
  }, [checkPermission, startService, requestNotificationPermission]);

  const handleRequestPermission = useCallback(async (): Promise<void> => {
    setErrorMessage(null);
    await requestPermission();
    // 授权页返回后 AppState 会触发重新检查，不需要再用 setTimeout 猜时间
  }, [requestPermission]);

  const handleStop = useCallback(async () => {
    await stopService();
  }, [stopService]);

  const handleAutoModeChange = useCallback(
    async (value: boolean): Promise<void> => {
      setErrorMessage(null);
      try {
        await updateSettings({ autoMode: value });
      } catch (e) {
        setErrorMessage('保存设置失败：' + (e as Error).message);
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
        setErrorMessage('保存设置失败：' + (e as Error).message);
      }
    },
    [updateSettings]
  );

  const handleAddTile = useCallback(async (): Promise<void> => {
    setTileHint(null);
    try {
      await requestAddTile();
      setTileHint('已发起请求，请在系统弹窗中确认添加');
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

  // 返回不再停服务：圆点的用途就是盖在其他 App 上，
  // 在 App 内翻页不应该把提示关掉（停止交给「停止」按钮 / 通知栏 / 磁贴）
  const handleExit = useCallback(() => {
    onExit();
  }, [onExit]);

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
                检测到车辆运动时显示圆点，静止约 10 秒后自动隐藏。运行中也能切换
              </Text>
            </View>
            <Switch
              value={settings.autoMode}
              onValueChange={handleAutoModeChange}
              trackColor={{ false: '#334155', true: '#6366F1' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.sensitivitySection}>
            <Text style={styles.controlLabel}>灵敏度</Text>
            <View style={styles.sensitivityButtons}>
              {SENSITIVITY_LEVELS.map((level) => {
                const active = toSensitivityLevel(settings.sensitivity) === level;
                return (
                  <TouchableOpacity
                    key={level}
                    style={[styles.sensitivityButton, active && styles.sensitivityButtonActive]}
                    onPress={() => handleSensitivityChange(level)}
                  >
                    <Text
                      style={[
                        styles.sensitivityButtonText,
                        active && styles.sensitivityButtonTextActive,
                      ]}
                    >
                      {SENSITIVITY_LABELS[level]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.controlHint}>
              {SENSITIVITY_HINTS[toSensitivityLevel(settings.sensitivity)]}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.controlButton, isRunning && styles.controlButtonActive]}
            onPress={isRunning ? handleStop : handleStart}
            disabled={!isSupported || hasPermission === false}
          >
            <Text style={styles.controlButtonText}>
              {isRunning ? '⏹ 停止' : '▶ 启动'}
            </Text>
          </TouchableOpacity>

          {isSupported && canRequestAddTile && (
            <TouchableOpacity style={styles.tileButton} onPress={handleAddTile}>
              <Text style={styles.tileButtonText}>＋ 添加快捷设置磁贴</Text>
            </TouchableOpacity>
          )}
          {isSupported && batteryExempt === false && (
            <TouchableOpacity
              style={styles.tileButton}
              onPress={handleOpenBatterySettings}
            >
              <Text style={styles.tileButtonText}>🔋 允许后台常驻（防止圆点被系统冻结）</Text>
            </TouchableOpacity>
          )}
          {tileHint !== null && (
            <Text style={styles.tileHint}>{tileHint}</Text>
          )}

          <Text style={styles.controlHint}>
            返回或切到其他 App 都不会中断圆点；停止请用上面的按钮、通知栏的「停止」，
            或下拉快捷设置点磁贴。
          </Text>
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
  sensitivitySection: {
    marginBottom: 16,
  },
  sensitivityButtons: {
    flexDirection: 'row',
    marginTop: 10,
    marginBottom: 6,
  },
  sensitivityButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'transparent',
    marginRight: 8,
  },
  sensitivityButtonActive: {
    backgroundColor: 'rgba(99,102,241,0.25)',
    borderColor: '#6366F1',
  },
  sensitivityButtonText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
  sensitivityButtonTextActive: {
    color: '#fff',
  },
  tileButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  tileButtonText: {
    color: '#C7D2FE',
    fontSize: 15,
    fontWeight: '600',
  },
  tileHint: {
    marginTop: 8,
    color: '#A5B4FC',
    fontSize: 12,
    lineHeight: 17,
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