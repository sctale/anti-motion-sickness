export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface MotionState {
  state: 'Straight' | 'TurnLeft' | 'TurnRight' | 'Accelerating' | 'Braking';
  intensity: number;
  timestamp: number;
}

export interface SensorData {
  rotationVector: number[];
  accelerometer: Vector3;
  gyroscope: Vector3;
  timestamp: number;
}

export interface FusionData {
  rotationMatrix: number[];
  eulerAngles: { yaw: number; pitch: number; roll: number };
  worldAcceleration: Vector3;
}

export interface MotionData {
  state: 'Straight' | 'TurnLeft' | 'TurnRight' | 'Accelerating' | 'Braking';
  intensity: number;
  gyroZ: number;
  accY: number;
  yaw: number;
  pitch: number;
  roll: number;
  predictedOffset: { x: number; y: number };
  timestamp: number;
}