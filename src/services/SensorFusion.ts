import { SensorData, FusionData, Vector3 } from '../utils/types';
import { rotationVectorToMatrix, calculateYawPitchRoll } from '../utils/coordinate';
import { createVector3EMAFilter, updateVector3EMAFilter } from '../utils/filter';

const EMA_ALPHA = 0.15;

class SensorFusion {
  private rotationMatrix: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private accelFilter = createVector3EMAFilter(EMA_ALPHA);
  private gyroFilter = createVector3EMAFilter(EMA_ALPHA);
  private isFirstData = true;

  process(data: SensorData): FusionData {
    this.rotationMatrix = rotationVectorToMatrix(data.rotationVector);

    const eulerAngles = calculateYawPitchRoll(this.rotationMatrix);

    const rawAccel = data.accelerometer;
    const worldAccel = this.transformToWorld(rawAccel);
    const filteredAccel = updateVector3EMAFilter(this.accelFilter, worldAccel);

    const gyroZ = data.gyroscope.z;
    this.gyroFilter.z.value = EMA_ALPHA * gyroZ + (1 - EMA_ALPHA) * this.gyroFilter.z.value;

    return {
      rotationMatrix: [...this.rotationMatrix],
      eulerAngles,
      worldAcceleration: filteredAccel,
    };
  }

  private transformToWorld(deviceAccel: Vector3): Vector3 {
    if (this.isFirstData) {
      this.isFirstData = false;
      return { x: 0, y: 0, z: 0 };
    }

    const matrix = this.rotationMatrix;

    const worldX = matrix[0] * deviceAccel.x + matrix[1] * deviceAccel.y + matrix[2] * deviceAccel.z;
    const worldY = matrix[3] * deviceAccel.x + matrix[4] * deviceAccel.y + matrix[5] * deviceAccel.z;
    const worldZ = matrix[6] * deviceAccel.x + matrix[7] * deviceAccel.y + matrix[8] * deviceAccel.z;

    return {
      x: worldX,
      y: worldY,
      z: worldZ,
    };
  }

  reset(): void {
    this.rotationMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    this.accelFilter = createVector3EMAFilter(EMA_ALPHA);
    this.gyroFilter = createVector3EMAFilter(EMA_ALPHA);
    this.isFirstData = true;
  }
}

export const sensorFusion = new SensorFusion();