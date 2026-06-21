import { useState, useEffect, useCallback } from 'react';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import { useSharedValue, useAnimatedStyle, withSpring, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

// 防晕车模式类型
export type AntiSicknessMode = 'shake' | 'swipe' | 'twist' | 'auto';

// 传感器数据
export interface SensorData {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

// 当前状态
export interface AntiSicknessState {
  isActive: boolean;
  mode: AntiSicknessMode;
  sensorData: SensorData;
  exerciseProgress: number;
  exerciseCount: number;
}

// 检测阈值
const SHAKE_THRESHOLD = 1.5;
const SWIPE_THRESHOLD = 2.0;
const TWIST_THRESHOLD = 30;

// 传感器更新间隔 (ms)
const SENSOR_UPDATE_INTERVAL = 100;

export function useAntiSickness() {
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<AntiSicknessMode>('auto');
  const [sensorData, setSensorData] = useState<SensorData>({ x: 0, y: 0, z: 0, timestamp: 0 });
  const [exerciseProgress, setExerciseProgress] = useState(0);
  const [exerciseCount, setExerciseCount] = useState(0);

  // 检测状态
  const shakeDetected = useSharedValue(false);
  const swipeOffset = useSharedValue(0);
  const twistRotation = useSharedValue(0);

  // 启动传感器
  const startSensors = useCallback(() => {
    // 加速计
    Accelerometer.setUpdateInterval(SENSOR_UPDATE_INTERVAL);
    const accelSubscription = Accelerometer.addListener((data) => {
      setSensorData({
        x: data.x,
        y: data.y,
        z: data.z,
        timestamp: Date.now()
      });
    });

    // 陀螺仪
    Gyroscope.setUpdateInterval(SENSOR_UPDATE_INTERVAL);
    const gyroSubscription = Gyroscope.addListener((data) => {
      // 检测转动
      const rotation = Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2) * 57.2958;
      if (mode === 'twist' || mode === 'auto') {
        if (rotation > TWIST_THRESHOLD) {
          twistRotation.value = withSpring(data.x * 45);
          setExerciseCount(prev => prev + 1);
        }
      }
    });

    return () => {
      accelSubscription.remove();
      gyroSubscription.remove();
    };
  }, [mode]);

  // 检测摇动
  useEffect(() => {
    if (mode === 'shake' || mode === 'auto') {
      const magnitude = Math.sqrt(sensorData.x ** 2 + sensorData.y ** 2 + sensorData.z ** 2);
      if (magnitude > SHAKE_THRESHOLD) {
        shakeDetected.value = true;
        setExerciseCount(prev => prev + 1);
        // 重置动画
        setTimeout(() => {
          shakeDetected.value = false;
        }, 500);
      }
    }
  }, [sensorData, mode]);

  // 检测滑动
  useEffect(() => {
    if (mode === 'swipe' || mode === 'auto') {
      if (Math.abs(sensorData.x) > SWIPE_THRESHOLD) {
        swipeOffset.value = withSpring(sensorData.x * 50);
        setExerciseCount(prev => prev + 1);
      }
    }
  }, [sensorData, mode]);

  // 启动防晕车
  const start = useCallback((selectedMode?: AntiSicknessMode) => {
    if (selectedMode) setMode(selectedMode);
    setIsActive(true);
    setExerciseCount(0);
    startSensors();
  }, [startSensors]);

  // 停止
  const stop = useCallback(() => {
    setIsActive(false);
    setExerciseProgress(0);
  }, []);

  // 切换模式
  const switchMode = useCallback((newMode: AntiSicknessMode) => {
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
    // 动画值
    shakeDetected,
    swipeOffset,
    twistRotation
  };
}

// 计算运动强度 (用于视觉反馈)
export function calculateMotionIntensity(sensorData: SensorData): number {
  const magnitude = Math.sqrt(sensorData.x ** 2 + sensorData.y ** 2 + sensorData.z ** 2);
  return Math.min(1, magnitude / 3);
}

// 获取建议的练习时长
export function getSuggestedDuration(mode: AntiSicknessMode): number {
  switch (mode) {
    case 'shake': return 60; // 60秒
    case 'swipe': return 45;  // 45秒
    case 'twist': return 90;  // 90秒
    case 'auto': return 120; // 2分钟
    default: return 60;
  }
}