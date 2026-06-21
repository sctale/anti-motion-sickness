import { MotionState, FusionData } from '../utils/types';

const TURN_THRESHOLD = 0.05;
const ACCEL_THRESHOLD = 0.5;

type MotionStateType = 'Straight' | 'TurnLeft' | 'TurnRight' | 'Accelerating' | 'Braking';

class MotionAnalyzer {
  private state: MotionStateType = 'Straight';
  private stateStartTime = Date.now();

  process(fusionData: FusionData, gyroZ: number): MotionState {
    const now = Date.now();
    const gyroAbs = Math.abs(gyroZ);

    let detectedState: MotionStateType = 'Straight';

    if (gyroAbs > TURN_THRESHOLD) {
      if (gyroZ > 0) {
        detectedState = 'TurnLeft';
      } else {
        detectedState = 'TurnRight';
      }
    } else if (fusionData.worldAcceleration.y > ACCEL_THRESHOLD) {
      detectedState = 'Accelerating';
    } else if (fusionData.worldAcceleration.y < -ACCEL_THRESHOLD) {
      detectedState = 'Braking';
    }

    if (detectedState !== this.state) {
      this.state = detectedState;
      this.stateStartTime = now;
    }

    const intensity = Math.min(1, gyroAbs / 1.0);

    return {
      state: detectedState,
      intensity,
      timestamp: now,
    };
  }

  getCurrentState(): MotionStateType {
    return this.state;
  }

  reset(): void {
    this.state = 'Straight';
    this.stateStartTime = Date.now();
  }
}

export const motionAnalyzer = new MotionAnalyzer();