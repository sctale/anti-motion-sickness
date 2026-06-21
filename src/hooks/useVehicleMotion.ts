import { useEffect, useState, useRef, useCallback } from 'react';
import { sensorService } from '../services/SensorService';
import { sensorFusion } from '../services/SensorFusion';
import { motionAnalyzer } from '../services/MotionAnalyzer';
import { predictionEngine } from '../services/PredictionEngine';
import { MotionData, SensorData } from '../utils/types';

interface UseVehicleMotionOptions {
  isActive: boolean;
  onMotionUpdate?: (data: MotionData) => void;
}

export function useVehicleMotion({ isActive, onMotionUpdate }: UseVehicleMotionOptions) {
  const [motionData, setMotionData] = useState<MotionData | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const processSensorData = useCallback((data: SensorData) => {
    const fusionResult = sensorFusion.process(data);

    const motionState = motionAnalyzer.process(
      fusionResult,
      fusionResult.filteredGyroZ
    );

    const predictedOffset = predictionEngine.process(
      motionState,
      fusionResult.filteredGyroZ,
      fusionResult.worldAcceleration.y,
      data.timestamp
    );

    const result: MotionData = {
      state: motionState.state,
      intensity: motionState.intensity,
      gyroZ: fusionResult.filteredGyroZ,
      accY: fusionResult.worldAcceleration.y,
      yaw: fusionResult.eulerAngles.yaw,
      pitch: fusionResult.eulerAngles.pitch,
      roll: fusionResult.eulerAngles.roll,
      predictedOffset,
      timestamp: data.timestamp,
    };

    setMotionData(result);
    onMotionUpdate?.(result);
  }, [onMotionUpdate]);

  useEffect(() => {
    if (isActive) {
      sensorService.start();
      setIsMonitoring(true);
      unsubscribeRef.current = sensorService.subscribe(processSensorData);
    } else {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      sensorService.stop();
      sensorFusion.reset();
      motionAnalyzer.reset();
      predictionEngine.reset();
      setMotionData(null);
      setIsMonitoring(false);
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      sensorService.stop();
    };
  }, [isActive, processSensorData]);

  const getCurrentMotionData = useCallback((): MotionData | null => {
    if (!isMonitoring) return null;

    const sensorData = sensorService.getCurrentData();
    const fusionResult = sensorFusion.process(sensorData);
    const motionState = motionAnalyzer.process(
      fusionResult,
      fusionResult.filteredGyroZ
    );
    const predictedOffset = predictionEngine.process(
      motionState,
      fusionResult.filteredGyroZ,
      fusionResult.worldAcceleration.y,
      sensorData.timestamp
    );

    return {
      state: motionState.state,
      intensity: motionState.intensity,
      gyroZ: fusionResult.filteredGyroZ,
      accY: fusionResult.worldAcceleration.y,
      yaw: fusionResult.eulerAngles.yaw,
      pitch: fusionResult.eulerAngles.pitch,
      roll: fusionResult.eulerAngles.roll,
      predictedOffset,
      timestamp: sensorData.timestamp,
    };
  }, [isMonitoring]);

  return {
    motionData,
    isMonitoring,
    getCurrentMotionData,
  };
}