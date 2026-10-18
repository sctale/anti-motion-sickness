import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useActivityRecognition, ActivityType } from '../hooks/useActivityRecognition';
import { useVibrationService, VibrationFrequency } from '../hooks/useVibrationService';
import { useBooleanPreference, useStringPreference } from '../hooks/usePreference';
import { useOverlayServiceContext } from '../hooks/OverlayServiceContext';
import { ACTIVITY_IN_VEHICLE_CONFIDENCE } from '../utils/constants';

interface CarDetectionScreenProps {
  onExit: () => void;
}

const activityLabels: Record<ActivityType, string> = {
  'IN_VEHICLE': '🚗 乘车中',
  'STILL': '😌 静止',
  'WALKING': '🚶 步行中',
  'RUNNING': '🏃 跑步中',
  'UNKNOWN': '❓ 检测中',
};

const frequencyLabels: Record<VibrationFrequency, string> = {
  low: '低 (3秒)',
  medium: '中 (2秒)',
  high: '高 (1秒)',
};

const frequencyOptions: VibrationFrequency[] = ['low', 'medium', 'high'];

const PREF_VIBRATION_ENABLED = 'vibration_enabled';
const PREF_VIBRATION_FREQUENCY = 'vibration_frequency';
const PREF_AUTO_START_CUES = 'auto_start_cues';

export const CarDetectionScreen: React.FC<CarDetectionScreenProps> = ({ onExit }) => {
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
    (frequencyOptions as string[]).includes(rawFrequency)
      ? (rawFrequency as VibrationFrequency)
      : 'medium';

  const {
    currentActivity,
    confidence,
  } = useActivityRecognition({ isActive: isDetectionActive });

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
        setLinkageHint('检测到乘车，但缺少悬浮窗权限，请先到 Vehicle Motion 授权');
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

  const handleFrequencyChange = useCallback(
    (freq: VibrationFrequency) => {
      setRawFrequency(freq);
    },
    [setRawFrequency]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" translucent={false} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onExit}>
          <Text style={styles.backButtonText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🚗 乘车检测</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.statusCard}>
          <View style={[
            styles.statusIndicator,
            isDetectionActive && styles.statusIndicatorActive,
          ]} />
          <Text style={styles.statusText}>
            {isDetectionActive ? '检测中' : '已停止'}
          </Text>
        </View>

        <View style={styles.activityCard}>
          <Text style={styles.activityLabel}>
            当前状态
          </Text>
          <Text style={[
            styles.activityValue,
            currentActivity === 'IN_VEHICLE' && styles.activityValueActive,
          ]}>
            {activityLabels[currentActivity]}
          </Text>
          <View style={styles.confidenceBar}>
            <View style={[
              styles.confidenceFill,
              { width: `${confidence}%` }
            ]} />
          </View>
          <Text style={styles.confidenceText}>
            置信度: {Math.round(confidence)}%
          </Text>
        </View>

        <View style={styles.controlCard}>
          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>启动检测</Text>
            <Switch
              value={isDetectionActive}
              onValueChange={handleToggleDetection}
              trackColor={{ false: '#E2E8F0', true: '#6366F1' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>震动反馈</Text>
            <Switch
              value={vibrationEnabled}
              onValueChange={setVibrationEnabled}
              trackColor={{ false: '#E2E8F0', true: '#6366F1' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.frequencySection}>
            <Text style={styles.controlLabel}>震动频率</Text>
            <View style={styles.frequencyButtons}>
              {frequencyOptions.map((freq) => (
                <TouchableOpacity
                  key={freq}
                  style={[
                    styles.frequencyButton,
                    vibrationFrequency === freq && styles.frequencyButtonActive,
                  ]}
                  onPress={() => handleFrequencyChange(freq)}
                >
                  <Text style={[
                    styles.frequencyButtonText,
                    vibrationFrequency === freq && styles.frequencyButtonTextActive,
                  ]}>
                    {frequencyLabels[freq]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.controlRow}>
            <View style={styles.controlLabelBlock}>
              <Text style={styles.controlLabel}>乘车时自动开启圆点</Text>
              <Text style={styles.controlSubLabel}>
                检测到 IN_VEHICLE 后直接启动防晕车悬浮窗（仅在本页检测开启期间有效）
              </Text>
            </View>
            <Switch
              value={autoStartCues}
              onValueChange={setAutoStartCues}
              trackColor={{ false: '#E2E8F0', true: '#6366F1' }}
              thumbColor="#fff"
            />
          </View>

          {linkageHint !== null && (
            <Text style={styles.linkageHint}>{linkageHint}</Text>
          )}
        </View>

        <View style={styles.statsCard}>
          <Text style={styles.statsLabel}>震动统计</Text>
          <Text style={styles.statsValue}>{vibrationCount}</Text>
          <Text style={styles.statsUnit}>次震动</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          💡 提示：乘车时保持手机平稳放置。检测只在本页打开期间进行，
          离开或退出本页即停止；已经开启的圆点由后台服务继续负责
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 10 : 20,
    paddingBottom: 10,
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#6366F1',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#94A3B8',
    marginRight: 12,
  },
  statusIndicatorActive: {
    backgroundColor: '#22C55E',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  activityCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  activityLabel: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 8,
  },
  activityValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
  },
  activityValueActive: {
    color: '#6366F1',
  },
  confidenceBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 4,
  },
  confidenceText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  controlCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  controlLabel: {
    fontSize: 16,
    color: '#1E293B',
  },
  controlLabelBlock: {
    flex: 1,
    marginRight: 12,
  },
  controlSubLabel: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginTop: 4,
  },
  linkageHint: {
    marginTop: 12,
    fontSize: 13,
    color: '#4F46E5',
    lineHeight: 19,
  },
  frequencySection: {
    marginTop: 8,
  },
  frequencyButtons: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 12,
  },
  frequencyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  frequencyButtonActive: {
    backgroundColor: '#6366F1',
  },
  frequencyButtonText: {
    fontSize: 14,
    color: '#64748B',
  },
  frequencyButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  statsCard: {
    backgroundColor: '#6366F1',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  statsLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  statsValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
  },
  statsUnit: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  footerText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
  },
});

export default CarDetectionScreen;