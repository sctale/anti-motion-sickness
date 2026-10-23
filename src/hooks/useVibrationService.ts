import { useEffect, useRef, useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  VIBRATION_LOW_INTERVAL_MS,
  VIBRATION_MEDIUM_INTERVAL_MS,
  VIBRATION_HIGH_INTERVAL_MS,
  VIBRATION_MIN_GAP_MS,
} from '../utils/constants';

export type VibrationFrequency = 'low' | 'medium' | 'high';

const FREQUENCY_INTERVALS: Record<VibrationFrequency, number> = {
  low: VIBRATION_LOW_INTERVAL_MS,
  medium: VIBRATION_MEDIUM_INTERVAL_MS,
  high: VIBRATION_HIGH_INTERVAL_MS,
};

interface VibrationServiceProps {
  isActive: boolean;
  frequency: VibrationFrequency;
  enabled: boolean;
  onVibrationTriggered?: () => void;
}

export function useVibrationService({
  isActive,
  frequency,
  enabled,
  onVibrationTriggered,
}: VibrationServiceProps) {
  const [vibrationCount, setVibrationCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastVibrationRef = useRef(0);

  const triggerVibration = useCallback(() => {
    const now = Date.now();
    if (now - lastVibrationRef.current < VIBRATION_MIN_GAP_MS) return;
    lastVibrationRef.current = now;

    // 只走一条震动通道：之前 Vibration.vibrate 与 Haptics.impactAsync 连着调用，
    // 同一时刻发两次脉冲，手感是「嗡嗡」两下而不是干脆一下。
    // 留 expo-haptics：它跟随系统触感开关，也是 Expo 官方维护的那条路。
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {
      /* 部分设备无震动马达，忽略 */
    });
    setVibrationCount((prev) => prev + 1);
    onVibrationTriggered?.();
  }, [onVibrationTriggered]);

  const startPeriodicVibration = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const interval = FREQUENCY_INTERVALS[frequency];
    intervalRef.current = setInterval(() => {
      if (enabled) {
        triggerVibration();
      }
    }, interval);
  }, [frequency, enabled, triggerVibration]);

  const stopVibration = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // 没有需要 cancel 的东西：脉冲由 expo-haptics 发出且自限时（约 30ms），
    // 停掉定时器就是真正的停止。
  }, []);

  const resetCount = useCallback(() => {
    setVibrationCount(0);
  }, []);

  useEffect(() => {
    if (!isActive || !enabled) {
      stopVibration();
      return;
    }

    startPeriodicVibration();

    return () => {
      stopVibration();
    };
  }, [isActive, enabled, frequency, startPeriodicVibration, stopVibration]);

  return {
    vibrationCount,
    triggerVibration,
    startPeriodicVibration,
    stopVibration,
    resetCount,
  };
}