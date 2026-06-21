import { useState, useEffect, useCallback, useRef } from 'react';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import {
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import {
  SHAKE_DETECTION_THRESHOLD,
  SWIPE_DETECTION_THRESHOLD,
  TWIST_DETECTION_THRESHOLD_DEG,
  MOTION_SENSOR_INTERVAL_MS,
} from '../utils/constants';

export type AntiSicknessMode = 'shake' | 'swipe' | 'twist' | 'auto';

export interface SensorData {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

export interface AntiSicknessState {
  isActive: boolean;
  mode: AntiSicknessMode;
  sensorData: SensorData;
  exerciseProgress: number;
  exerciseCount: number;
}

export function useAntiSickness() {
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<AntiSicknessMode>('auto');
  const [sensorData, setSensorData] = useState<SensorData>({
    x: 0,
    y: 0,
    z: 0,
    timestamp: 0,
  });
  const [exerciseProgress, setExerciseProgress] = useState(0);
  const [exerciseCount, setExerciseCount] = useState(0);

  const shakeDetected = useSharedValue(false);
  const swipeOffset = useSharedValue(0);
  const twistRotation = useSharedValue(0);

  const modeRef = useRef<AntiSicknessMode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const startSensors = useCallback(() => {
    Accelerometer.setUpdateInterval(MOTION_SENSOR_INTERVAL_MS);
    const accelSubscription = Accelerometer.addListener((data) => {
      setSensorData({
        x: data.x,
        y: data.y,
        z: data.z,
        timestamp: Date.now(),
      });
    });

    Gyroscope.setUpdateInterval(MOTION_SENSOR_INTERVAL_MS);
    const gyroSubscription = Gyroscope.addListener((data) => {
      const rotation =
        Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2) * 57.2958;
      const currentMode = modeRef.current;
      if (currentMode === 'twist' || currentMode === 'auto') {
        if (rotation > TWIST_DETECTION_THRESHOLD_DEG) {
          twistRotation.value = rotation;
          setExerciseCount((prev) => prev + 1);
        }
      }
    });

    return () => {
      accelSubscription.remove();
      gyroSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const currentMode = modeRef.current;
    if (currentMode !== 'shake' && currentMode !== 'auto') return;

    const magnitude = Math.sqrt(
      sensorData.x ** 2 + sensorData.y ** 2 + sensorData.z ** 2
    );
    if (magnitude > SHAKE_DETECTION_THRESHOLD) {
      shakeDetected.value = true;
      setExerciseCount((prev) => prev + 1);
      const timer = setTimeout(() => {
        shakeDetected.value = false;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [sensorData, isActive, shakeDetected]);

  useEffect(() => {
    if (!isActive) return;

    const currentMode = modeRef.current;
    if (currentMode !== 'swipe' && currentMode !== 'auto') return;

    if (Math.abs(sensorData.x) > SWIPE_DETECTION_THRESHOLD) {
      swipeOffset.value = sensorData.x * 50;
      setExerciseCount((prev) => prev + 1);
    }
  }, [sensorData, isActive, swipeOffset]);

  const start = useCallback((selectedMode?: AntiSicknessMode) => {
    if (selectedMode) {
      modeRef.current = selectedMode;
      setMode(selectedMode);
    }
    setIsActive(true);
    setExerciseCount(0);
    startSensors();
  }, [startSensors]);

  const stop = useCallback(() => {
    setIsActive(false);
    setExerciseProgress(0);
  }, []);

  const switchMode = useCallback((newMode: AntiSicknessMode) => {
    modeRef.current = newMode;
    setMode(newMode);
    setExerciseCount(0);
  }, []);

  return {
    isActive,
    mode,
    sensorData,
    exerciseProgress,
    exerciseCount,
    start,
    stop,
    switchMode,
    shakeDetected,
    swipeOffset,
    twistRotation,
  };
}

export function calculateMotionIntensity(sensorData: SensorData): number {
  const magnitude = Math.sqrt(
    sensorData.x ** 2 + sensorData.y ** 2 + sensorData.z ** 2
  );
  return Math.min(1, magnitude / 3);
}

export function getSuggestedDuration(mode: AntiSicknessMode): number {
  switch (mode) {
    case 'shake':
      return 60;
    case 'swipe':
      return 45;
    case 'twist':
      return 90;
    case 'auto':
      return 120;
    default:
      return 60;
  }
}

export type SharedValues = {
  shakeDetected: SharedValue<boolean>;
  swipeOffset: SharedValue<number>;
  twistRotation: SharedValue<number>;
};