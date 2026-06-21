import { useEffect, useRef, useCallback } from 'react';
import {
  Accelerometer,
  Gyroscope,
  AccelerometerMeasurement,
  GyroscopeMeasurement,
} from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import {
  SHAKE_DETECTION_THRESHOLD,
  MOTION_SENSOR_INTERVAL_MS,
} from '../utils/constants';

const SHAKE_COUNT_THRESHOLD = 3;
const SHAKE_INTERVAL_MS = 300;
const TWIST_THRESHOLD_DEG = 25;
const SWIPE_MIN_DISTANCE_PX = 100;
const TWIST_DEBOUNCE_MS = 500;
const TWIST_RESET_ANGLE_DEG = 30;

export interface MotionStateHook {
  isShaking: boolean;
  shakeCount: number;
  shakeIntensity: number;
  swipeCount: number;
  swipeDirection: 'left' | 'right' | 'up' | 'down' | 'none';
  twistCount: number;
  rotationAngle: number;
  motionQuality: number;
}

interface UseMotionDetectionProps {
  mode: 'shake' | 'swipe' | 'twist' | 'auto';
  isActive: boolean;
  onShakeComplete?: () => void;
  onSwipeComplete?: () => void;
  onTwistComplete?: () => void;
}

export function useMotionDetection({
  mode,
  isActive,
  onShakeComplete,
  onSwipeComplete,
  onTwistComplete,
}: UseMotionDetectionProps) {
  const stateRef = useRef<MotionStateHook>({
    isShaking: false,
    shakeCount: 0,
    shakeIntensity: 0,
    swipeCount: 0,
    swipeDirection: 'none',
    twistCount: 0,
    rotationAngle: 0,
    motionQuality: 0,
  });

  const shakeQualityRef = useRef(0);
  const lastShakeTimeRef = useRef(0);
  const lastTwistTimeRef = useRef(0);
  const accumulatedRotationRef = useRef(0);

  const triggerSuccessFeedback = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  useEffect(() => {
    if (!isActive) {
      Accelerometer.removeAllListeners();
      Gyroscope.removeAllListeners();
      return;
    }

    if (mode !== 'shake' && mode !== 'auto') return;

    Accelerometer.setUpdateInterval(MOTION_SENSOR_INTERVAL_MS);

    const accelSubscription = Accelerometer.addListener(
      (data: AccelerometerMeasurement) => {
        const magnitude = Math.sqrt(
          data.x ** 2 + data.y ** 2 + data.z ** 2
        );
        const isCurrentlyShaking = magnitude > SHAKE_DETECTION_THRESHOLD;

        stateRef.current.shakeIntensity = Math.min(1, magnitude / 3);
        stateRef.current.isShaking = isCurrentlyShaking;

        if (isCurrentlyShaking) {
          shakeQualityRef.current++;

          if (shakeQualityRef.current >= SHAKE_COUNT_THRESHOLD) {
            const now = Date.now();
            if (now - lastShakeTimeRef.current > SHAKE_INTERVAL_MS) {
              lastShakeTimeRef.current = now;
              stateRef.current.shakeCount++;
              stateRef.current.motionQuality = Math.min(
                100,
                stateRef.current.motionQuality + 10
              );
              triggerSuccessFeedback();
              onShakeComplete?.();
            }
            shakeQualityRef.current = 0;
          }
        } else {
          shakeQualityRef.current = Math.max(0, shakeQualityRef.current - 1);
        }
      }
    );

    return () => {
      accelSubscription.remove();
    };
  }, [isActive, mode, onShakeComplete, triggerSuccessFeedback]);

  useEffect(() => {
    if (!isActive) {
      Gyroscope.removeAllListeners();
      return;
    }

    if (mode !== 'twist' && mode !== 'auto') return;

    Gyroscope.setUpdateInterval(MOTION_SENSOR_INTERVAL_MS);

    let lastTimestamp = 0;

    const gyroSubscription = Gyroscope.addListener(
      (data: GyroscopeMeasurement) => {
        if (lastTimestamp === 0) {
          lastTimestamp = data.timestamp;
          return;
        }

        const deltaTime = (data.timestamp - lastTimestamp) / 1_000_000_000;
        lastTimestamp = data.timestamp;

        const rotationMagnitude = Math.sqrt(
          data.x ** 2 + data.y ** 2 + data.z ** 2
        );
        const rotationDegrees = rotationMagnitude * deltaTime * 57.2958;
        accumulatedRotationRef.current += rotationDegrees;

        stateRef.current.rotationAngle = accumulatedRotationRef.current;

        if (
          Math.abs(accumulatedRotationRef.current) > TWIST_THRESHOLD_DEG
        ) {
          const now = Date.now();
          if (now - lastTwistTimeRef.current > TWIST_DEBOUNCE_MS) {
            lastTwistTimeRef.current = now;
            stateRef.current.twistCount++;
            stateRef.current.motionQuality = Math.min(
              100,
              stateRef.current.motionQuality + 10
            );
            triggerSuccessFeedback();
            onTwistComplete?.();
          }
          accumulatedRotationRef.current = 0;
        }
      }
    );

    return () => {
      gyroSubscription.remove();
    };
  }, [isActive, mode, onTwistComplete, triggerSuccessFeedback]);

  const resetSwipe = useCallback(() => {
    stateRef.current.swipeDirection = 'none';
  }, []);

  const getSwipeDirection = useCallback(
    (
      dx: number,
      dy: number
    ): 'left' | 'right' | 'up' | 'down' | 'none' => {
      if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > SWIPE_MIN_DISTANCE_PX) {
          return dx > 0 ? 'right' : 'left';
        }
      } else {
        if (Math.abs(dy) > SWIPE_MIN_DISTANCE_PX) {
          return dy > 0 ? 'down' : 'up';
        }
      }
      return 'none';
    },
    []
  );

  const handleSwipe = useCallback(
    (dx: number, dy: number) => {
      const direction = getSwipeDirection(dx, dy);
      if (direction !== 'none') {
        stateRef.current.swipeDirection = direction;
        stateRef.current.swipeCount++;
        stateRef.current.motionQuality = Math.min(
          100,
          stateRef.current.motionQuality + 10
        );
        triggerSuccessFeedback();
        onSwipeComplete?.();
      }
    },
    [getSwipeDirection, onSwipeComplete, triggerSuccessFeedback]
  );

  const getMotionState = useCallback((): MotionStateHook => {
    return stateRef.current;
  }, []);

  const reset = useCallback(() => {
    stateRef.current = {
      isShaking: false,
      shakeCount: 0,
      shakeIntensity: 0,
      swipeCount: 0,
      swipeDirection: 'none',
      twistCount: 0,
      rotationAngle: 0,
      motionQuality: 0,
    };
    shakeQualityRef.current = 0;
    lastShakeTimeRef.current = 0;
    lastTwistTimeRef.current = 0;
    accumulatedRotationRef.current = 0;
  }, []);

  return {
    motionState: stateRef.current,
    getMotionState,
    handleSwipe,
    resetSwipe,
    reset,
  };
}