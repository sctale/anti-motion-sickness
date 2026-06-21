import { Accelerometer, Gyroscope } from 'expo-sensors';
import { SensorData } from '../utils/types';

const SENSOR_UPDATE_INTERVAL = 16;

export type SensorCallback = (data: SensorData) => void;

class SensorService {
  private isRunning = false;
  private callbacks: Set<SensorCallback> = new Set();
  private rotationVectorData: number[] = [0, 0, 0];
  private accelerometerData = { x: 0, y: 0, z: 0 };
  private gyroscopeData = { x: 0, y: 0, z: 0 };
  private lastTimestamp = 0;

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    Accelerometer.setUpdateInterval(SENSOR_UPDATE_INTERVAL);
    Gyroscope.setUpdateInterval(SENSOR_UPDATE_INTERVAL);

    Accelerometer.addListener((data) => {
      this.accelerometerData = { x: data.x, y: data.y, z: data.z };
      this.rotationVectorData = [data.x, data.y, data.z];
      this.emit();
    });

    Gyroscope.addListener((data) => {
      this.gyroscopeData = { x: data.x, y: data.y, z: data.z };
      this.emit();
    });
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    Accelerometer.removeAllListeners();
    Gyroscope.removeAllListeners();
  }

  subscribe(callback: SensorCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  private emit(): void {
    const timestamp = Date.now();
    if (timestamp - this.lastTimestamp < SENSOR_UPDATE_INTERVAL) return;
    this.lastTimestamp = timestamp;

    const data: SensorData = {
      rotationVector: [...this.rotationVectorData],
      accelerometer: { ...this.accelerometerData },
      gyroscope: { ...this.gyroscopeData },
      timestamp,
    };

    this.callbacks.forEach((callback) => callback(data));
  }

  getCurrentData(): SensorData {
    return {
      rotationVector: [...this.rotationVectorData],
      accelerometer: { ...this.accelerometerData },
      gyroscope: { ...this.gyroscopeData },
      timestamp: Date.now(),
    };
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

export const sensorService = new SensorService();