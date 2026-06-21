import { MotionState } from '../utils/types';
import {
  DOT_MAX_OFFSET_DP,
  PREDICTION_LEAD_TIME_S,
  PREDICTION_GYRO_SENSITIVITY,
  PREDICTION_ACCEL_SENSITIVITY,
} from '../utils/constants';

interface RateSample {
  value: number;
  timestamp: number;
}

class PredictionEngine {
  private gyroHistory: RateSample[] = [];
  private accelHistory: RateSample[] = [];
  private readonly HISTORY_WINDOW_MS = 200;

  process(
    motionState: MotionState,
    gyroZ: number,
    worldAccY: number,
    timestamp: number
  ): { x: number; y: number } {
    this.appendHistory(this.gyroHistory, gyroZ, timestamp);
    this.appendHistory(this.accelHistory, worldAccY, timestamp);

    const dt = PREDICTION_LEAD_TIME_S;
    const omega = gyroZ;
    const alpha = this.estimateAngularAccel(this.gyroHistory, timestamp);

    const offsetX = omega * PREDICTION_GYRO_SENSITIVITY;

    const accY = worldAccY;
    const jerkY = this.estimateJerk(this.accelHistory, timestamp);
    const offsetY =
      accY * PREDICTION_ACCEL_SENSITIVITY +
      0.5 * jerkY * dt * PREDICTION_ACCEL_SENSITIVITY;

    const angleX = omega * dt + 0.5 * alpha * dt * dt;
    const scaleFromAngle = angleX * PREDICTION_GYRO_SENSITIVITY;
    const finalX = Math.abs(scaleFromAngle) > Math.abs(offsetX)
      ? scaleFromAngle
      : offsetX;

    return {
      x: this.clamp(finalX, DOT_MAX_OFFSET_DP),
      y: this.clamp(offsetY, DOT_MAX_OFFSET_DP),
    };
  }

  getFirstOrderPrediction(currentAngle: number, angularVelocity: number): number {
    return currentAngle + angularVelocity * PREDICTION_LEAD_TIME_S;
  }

  getSecondOrderPrediction(
    currentAngle: number,
    angularVelocity: number,
    angularAccel: number
  ): number {
    const dt = PREDICTION_LEAD_TIME_S;
    return currentAngle + angularVelocity * dt + 0.5 * angularAccel * dt * dt;
  }

  reset(): void {
    this.gyroHistory = [];
    this.accelHistory = [];
  }

  private appendHistory(buffer: RateSample[], value: number, timestamp: number): void {
    buffer.push({ value, timestamp });
    const cutoff = timestamp - this.HISTORY_WINDOW_MS;
    while (buffer.length > 0 && buffer[0].timestamp < cutoff) {
      buffer.shift();
    }
    if (buffer.length > 8) buffer.shift();
  }

  private estimateAngularAccel(buffer: RateSample[], now: number): number {
    if (buffer.length < 2) return 0;
    const first = buffer[0];
    const last = buffer[buffer.length - 1];
    const dt = (last.timestamp - first.timestamp) / 1000;
    if (dt <= 0) return 0;
    return (last.value - first.value) / dt;
  }

  private estimateJerk(buffer: RateSample[], now: number): number {
    return this.estimateAngularAccel(buffer, now);
  }

  private clamp(value: number, max: number): number {
    return Math.max(-max, Math.min(max, value));
  }
}

export const predictionEngine = new PredictionEngine();