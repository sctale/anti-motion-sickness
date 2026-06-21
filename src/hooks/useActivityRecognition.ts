import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Accelerometer } from 'expo-sensors';

export type ActivityType = 'IN_VEHICLE' | 'STILL' | 'WALKING' | 'RUNNING' | 'UNKNOWN';

export interface ActivityRecognitionResult {
  activity: ActivityType;
  confidence: number;
  timestamp: number;
}

interface UseActivityRecognitionProps {
  isActive: boolean;
  onActivityChanged: (result: ActivityRecognitionResult) => void;
  samplingInterval?: number;
}

const MOTION_THRESHOLD = 0.3;
const STILL_THRESHOLD = 0.1;
const VEHICLE_SAMPLING_WINDOW = 3000;
const CONFIDENCE_INCREASE = 20;
const CONFIDENCE_DECREASE = 10;

export function useActivityRecognition({
  isActive,
  onActivityChanged,
  samplingInterval = 500,
}: UseActivityRecognitionProps) {
  const [currentActivity, setCurrentActivity] = useState<ActivityType>('STILL');
  const [confidence, setConfidence] = useState(0);
  const [isMonitoring, setIsMonitoring] = useState(false);

  const motionHistoryRef = useRef<number[]>([]);
  const lastUpdateRef = useRef(0);
  const accumulatorRef = useRef(0);
  const activityConfidenceRef = useRef(0);

  const updateActivity = useCallback((motionLevel: number, currentTime: number) => {
    motionHistoryRef.current.push(motionLevel);
    if (motionHistoryRef.current.length > 10) {
      motionHistoryRef.current.shift();
    }

    if (currentTime - lastUpdateRef.current >= VEHICLE_SAMPLING_WINDOW) {
      lastUpdateRef.current = currentTime;

      const avgMotion = motionHistoryRef.current.reduce((a, b) => a + b, 0) / motionHistoryRef.current.length;
      const isInVehicle = avgMotion > MOTION_THRESHOLD && avgMotion < 2.0;
      const isStill = avgMotion < STILL_THRESHOLD;

      if (isInVehicle) {
        activityConfidenceRef.current = Math.min(100, activityConfidenceRef.current + CONFIDENCE_INCREASE);
      } else if (isStill) {
        activityConfidenceRef.current = Math.max(0, activityConfidenceRef.current - CONFIDENCE_DECREASE);
      } else {
        activityConfidenceRef.current = Math.max(0, activityConfidenceRef.current - CONFIDENCE_DECREASE / 2);
      }

      let newActivity: ActivityType = 'UNKNOWN';
      if (activityConfidenceRef.current > 60) {
        newActivity = 'IN_VEHICLE';
      } else if (activityConfidenceRef.current < 30) {
        newActivity = 'STILL';
      } else {
        newActivity = avgMotion > STILL_THRESHOLD ? 'WALKING' : 'STILL';
      }

      setCurrentActivity(newActivity);
      setConfidence(activityConfidenceRef.current);

      const result: ActivityRecognitionResult = {
        activity: newActivity,
        confidence: activityConfidenceRef.current,
        timestamp: currentTime,
      };

      onActivityChanged(result);
    }
  }, [onActivityChanged]);

  useEffect(() => {
    if (!isActive) {
      Accelerometer.removeAllListeners();
      setIsMonitoring(false);
      setCurrentActivity('STILL');
      setConfidence(0);
      motionHistoryRef.current = [];
      activityConfidenceRef.current = 0;
      return;
    }

    Accelerometer.setUpdateInterval(samplingInterval);
    setIsMonitoring(true);
    lastUpdateRef.current = Date.now();

    const subscription = Accelerometer.addListener((data) => {
      const motionLevel = Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2);
      accumulatorRef.current += motionLevel;
      updateActivity(motionLevel, Date.now());
    });

    return () => {
      subscription.remove();
      setIsMonitoring(false);
    };
  }, [isActive, samplingInterval, updateActivity]);

  const getCurrentActivity = useCallback((): ActivityRecognitionResult => {
    return {
      activity: currentActivity,
      confidence,
      timestamp: Date.now(),
    };
  }, [currentActivity, confidence]);

  return {
    currentActivity,
    confidence,
    isMonitoring,
    getCurrentActivity,
  };
}