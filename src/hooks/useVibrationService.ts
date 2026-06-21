import { useEffect, useRef, useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Vibration } from 'react-native';

export type VibrationFrequency = 'low' | 'medium' | 'high';

const FREQUENCY_INTERVALS: Record<VibrationFrequency, number> = {
  low: 3000,
  medium: 2000,
  high: 1000,
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
    if (now - lastVibrationRef.current < 200) return;
    lastVibrationRef.current = now;

    Vibration.vibrate(100);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setVibrationCount(prev => prev + 1);
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
    Vibration.cancel();
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

  useEffect(() => {
    if (isActive && enabled) {
      startPeriodicVibration();
    }
  }, [frequency, isActive, enabled, startPeriodicVibration]);

  return {
    vibrationCount,
    triggerVibration,
    startPeriodicVibration,
    stopVibration,
    resetCount,
  };
}