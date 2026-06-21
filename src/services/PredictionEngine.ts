import { MotionState } from '../utils/types';

const MAX_OFFSET = 60;
const GYRO_SENSITIVITY = 100;

class PredictionEngine {
  process(motionState: MotionState, gyroZ: number, timestamp: number): { x: number; y: number } {
    const offsetX = gyroZ * GYRO_SENSITIVITY;
    const clampedOffsetX = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, offsetX));

    return { x: clampedOffsetX, y: 0 };
  }

  getFirstOrderPrediction(currentAngle: number, angularVelocity: number): number {
    return currentAngle + angularVelocity * 0.3;
  }

  reset(): void {
  }
}

export const predictionEngine = new PredictionEngine();