import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useActivityRecognition, ActivityType } from '../hooks/useActivityRecognition';
import { useVibrationService, VibrationFrequency } from '../hooks/useVibrationService';

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

export const CarDetectionScreen: React.FC<CarDetectionScreenProps> = ({ onExit }) => {
  const [isDetectionActive, setIsDetectionActive] = useState(false);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [vibrationFrequency, setVibrationFrequency] = useState<VibrationFrequency>('medium');
  const [currentActivity, setCurrentActivity] = useState<ActivityType>('STILL');
  const [confidence, setConfidence] = useState(0);

  const handleActivityChange = useCallback((result: any) => {
    setCurrentActivity(result.activity);
    setConfidence(result.confidence);
  }, []);

  const {
    isMonitoring,
    confidence: activityConfidence,
  } = useActivityRecognition({
    isActive: isDetectionActive,
    onActivityChanged: handleActivityChange,
  });

  const shouldVibrate = isDetectionActive && currentActivity === 'IN_VEHICLE';

  const {
    vibrationCount,
    resetCount,
  } = useVibrationService({
    isActive: shouldVibrate,
    frequency: vibrationFrequency,
    enabled: vibrationEnabled,
  });

  const handleToggleDetection = useCallback(() => {
    if (isDetectionActive) {
      setIsDetectionActive(false);
      setCurrentActivity('STILL');
      setConfidence(0);
      resetCount();
    } else {
      setIsDetectionActive(true);
    }
  }, [isDetectionActive, resetCount]);

  const handleFrequencyChange = useCallback((freq: VibrationFrequency) => {
    setVibrationFrequency(freq);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
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
        </View>

        <View style={styles.statsCard}>
          <Text style={styles.statsLabel}>震动统计</Text>
          <Text style={styles.statsValue}>{vibrationCount}</Text>
          <Text style={styles.statsUnit}>次震动</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          💡 提示：乘车时保持手机平稳放置，系统将自动检测并提供震动反馈
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