import { Vector3 } from './types';

export const GRAVITY = 9.81;

export function rotateVector(vector: Vector3, rotationMatrix: number[]): Vector3 {
  if (rotationMatrix.length < 9) {
    return vector;
  }

  const r = rotationMatrix;
  return {
    x: r[0] * vector.x + r[1] * vector.y + r[2] * vector.z,
    y: r[3] * vector.x + r[4] * vector.y + r[5] * vector.z,
    z: r[6] * vector.x + r[7] * vector.y + r[8] * vector.z,
  };
}

export function deviceToVehicleCoordinate(
  deviceVector: Vector3,
  rotationMatrix: number[]
): Vector3 {
  const rotated = rotateVector(deviceVector, rotationMatrix);
  
  return {
    x: rotated.x,
    y: rotated.y,
    z: rotated.z,
  };
}

export function normalizeVector(vector: Vector3): Vector3 {
  const magnitude = Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2);
  if (magnitude === 0) return { x: 0, y: 0, z: 0 };
  
  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude,
  };
}

export function calculateYawPitchRoll(rotationMatrix: number[]): { yaw: number; pitch: number; roll: number } {
  if (rotationMatrix.length < 9) {
    return { yaw: 0, pitch: 0, roll: 0 };
  }

  const r = rotationMatrix;
  
  const yaw = Math.atan2(r[2], r[0]);
  const pitch = Math.asin(-r[1]);
  const roll = Math.atan2(r[4], r[7]);

  return {
    yaw: yaw * 57.2958,
    pitch: pitch * 57.2958,
    roll: roll * 57.2958,
  };
}

export function quaternionToRotationMatrix(q: Vector3): number[] {
  const x = q.x, y = q.y, z = q.z;
  const w = Math.sqrt(1 - (x * x + y * y + z * z));

  const matrix = new Array(9);
  
  matrix[0] = 1 - 2 * y * y - 2 * z * z;
  matrix[1] = 2 * x * y - 2 * w * z;
  matrix[2] = 2 * x * z + 2 * w * y;
  
  matrix[3] = 2 * x * y + 2 * w * z;
  matrix[4] = 1 - 2 * x * x - 2 * z * z;
  matrix[5] = 2 * y * z - 2 * w * x;
  
  matrix[6] = 2 * x * z - 2 * w * y;
  matrix[7] = 2 * y * z + 2 * w * x;
  matrix[8] = 1 - 2 * x * x - 2 * y * y;

  return matrix;
}

export function rotationVectorToMatrix(rotationVector: number[]): number[] {
  if (rotationVector.length < 4) {
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }

  const q = {
    x: rotationVector[0],
    y: rotationVector[1],
    z: rotationVector[2],
  };

  return quaternionToRotationMatrix(q);
}