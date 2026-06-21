import { MotionState, FusionData } from '../utils/types';
import {
  TURN_THRESHOLD_RAD_S,
  ACCEL_THRESHOLD_M_S2,
} from '../utils/constants';

type MotionStateType =
  | 'Straight'
  | 'TurnLeft'
  | 'TurnRight'
  | 'Accelerating'
  | 'Braking';

class MotionAnalyzer {
  private state: MotionStateType = 'Straight';
  private stateStartTime = Date.now();

  process(fusionData: FusionData, gyroZ: number): MotionState {
    const now = Date.now();
    const gyroAbs = Math.abs(gyroZ);
    const accY = fusionData.worldAcceleration.y;

    let detectedState: MotionStateType = 'Straight';

    if (gyroAbs > TURN_THRESHOLD_RAD_S) {
      detectedState = gyroZ > 0 ? 'TurnLeft' : 'TurnRight';
    } else if (accY > ACCEL_THRESHOLD_M_S2) {
      detectedState = 'Accelerating';
    } else if (accY < -ACCEL_THRESHOLD_M_S2) {
      detectedState = 'Braking';
    }

    if (detectedState !== this.state) {
      this.state = detectedState;
      this.stateStartTime = now;
    }

    const intensity = Math.min(1, gyroAbs / Math.max(TURN_THRESHOLD_RAD_S * 3, 0.001));

    return {
      state: detectedState,
      intensity,
      timestamp: now,
    };
  }

  getCurrentState(): MotionStateType {
    return this.state;
  }

  getStateDurationMs(): number {
    return Date.now() - this.stateStartTime;
  }

  reset(): void {
    this.state = 'Straight';
    this.stateStartTime = Date.now();
  }
}

export const motionAnalyzer = new MotionAnalyzer();