import { useEffect, useRef, useCallback, useState } from 'react';
import { Accelerometer } from 'expo-sensors';
import {
  GRAVITY_G,
  ACCEL_MOTION_THRESHOLD,
  ACCEL_MOTION_UPPER_BOUND,
  STILL_MOTION_THRESHOLD,
  ACTIVITY_VEHICLE_SAMPLING_WINDOW_MS,
  ACTIVITY_CONFIDENCE_INCREASE,
  ACTIVITY_CONFIDENCE_DECREASE,
  ACTIVITY_DEFAULT_SAMPLING_INTERVAL_MS,
  ACTIVITY_HISTORY_SIZE,
  ACTIVITY_IN_VEHICLE_CONFIDENCE,
  ACTIVITY_STILL_CONFIDENCE,
} from '../utils/constants';

/** 本 hook 实际会产出的状态；不列 RUNNING —— 判定逻辑从不输出它，留着只会多一条死分支 */
export type ActivityType = 'IN_VEHICLE' | 'STILL' | 'WALKING' | 'UNKNOWN';

export interface ActivityRecognitionResult {
  activity: ActivityType;
  confidence: number;
  timestamp: number;
}

interface UseActivityRecognitionProps {
  isActive: boolean;
  /** 可选：界面直接用返回的 currentActivity / confidence 即可，不必再自己镜像一份 */
  onActivityChanged?: (result: ActivityRecognitionResult) => void;
  samplingInterval?: number;
}

export function useActivityRecognition({
  isActive,
  onActivityChanged,
  samplingInterval = ACTIVITY_DEFAULT_SAMPLING_INTERVAL_MS,
}: UseActivityRecognitionProps) {
  const [currentActivity, setCurrentActivity] = useState<ActivityType>('STILL');
  const [confidence, setConfidence] = useState(0);
  const [isMonitoring, setIsMonitoring] = useState(false);

  const motionHistoryRef = useRef<number[]>([]);
  const lastUpdateRef = useRef(0);
  const activityConfidenceRef = useRef(0);

  // 回调放进 ref：避免调用方每次渲染都换一个新函数引用，
  // 导致监听器被反复注销 / 重建
  const onActivityChangedRef = useRef(onActivityChanged);
  useEffect(() => {
    onActivityChangedRef.current = onActivityChanged;
  }, [onActivityChanged]);

  const updateActivity = useCallback(
    (motionLevel: number, currentTime: number) => {
      motionHistoryRef.current.push(motionLevel);
      if (motionHistoryRef.current.length > ACTIVITY_HISTORY_SIZE) {
        motionHistoryRef.current.shift();
      }

      if (
        currentTime - lastUpdateRef.current >=
        ACTIVITY_VEHICLE_SAMPLING_WINDOW_MS
      ) {
        lastUpdateRef.current = currentTime;

        const avgMotion =
          motionHistoryRef.current.reduce((a, b) => a + b, 0) /
          motionHistoryRef.current.length;
        const isInVehicle =
          avgMotion > ACCEL_MOTION_THRESHOLD &&
          avgMotion < ACCEL_MOTION_UPPER_BOUND;
        const isStill = avgMotion < STILL_MOTION_THRESHOLD;

        if (isInVehicle) {
          activityConfidenceRef.current = Math.min(
            100,
            activityConfidenceRef.current + ACTIVITY_CONFIDENCE_INCREASE
          );
        } else if (isStill) {
          activityConfidenceRef.current = Math.max(
            0,
            activityConfidenceRef.current - ACTIVITY_CONFIDENCE_DECREASE
          );
        } else {
          activityConfidenceRef.current = Math.max(
            0,
            activityConfidenceRef.current - ACTIVITY_CONFIDENCE_DECREASE / 2
          );
        }

        let newActivity: ActivityType = 'UNKNOWN';
        if (activityConfidenceRef.current > ACTIVITY_IN_VEHICLE_CONFIDENCE) {
          newActivity = 'IN_VEHICLE';
        } else if (activityConfidenceRef.current < ACTIVITY_STILL_CONFIDENCE) {
          newActivity = 'STILL';
        } else {
          newActivity = avgMotion > STILL_MOTION_THRESHOLD ? 'WALKING' : 'STILL';
        }

        setCurrentActivity(newActivity);
        setConfidence(activityConfidenceRef.current);

        onActivityChangedRef.current?.({
          activity: newActivity,
          confidence: activityConfidenceRef.current,
          timestamp: currentTime,
        });
      }
    },
    []
  );

  const reset = useCallback(() => {
    setCurrentActivity('STILL');
    setConfidence(0);
    motionHistoryRef.current = [];
    activityConfidenceRef.current = 0;
    setIsMonitoring(false);
  }, []);

  useEffect(() => {
    if (!isActive) {
      reset();
      return;
    }

    Accelerometer.setUpdateInterval(samplingInterval);
    setIsMonitoring(true);
    lastUpdateRef.current = Date.now();

    const subscription = Accelerometer.addListener((data) => {
      // 合矢量包含重力，先扣除静止时的 1g 基线，得到线性加速度（单位 g）
      const magnitude = Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2);
      updateActivity(Math.abs(magnitude - GRAVITY_G), Date.now());
    });

    // 只注销自己这条订阅：Accelerometer.removeAllListeners() 会把
    // 其他使用加速度计的模块一起踢掉
    return () => subscription.remove();
  }, [isActive, samplingInterval, updateActivity, reset]);

  return {
    currentActivity,
    confidence,
    isMonitoring,
  };
}
