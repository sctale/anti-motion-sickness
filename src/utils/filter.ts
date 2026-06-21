export interface EMAFilter {
  value: number;
  alpha: number;
}

export function createEMAFilter(alpha: number = 0.15): EMAFilter {
  return {
    value: 0,
    alpha,
  };
}

export function updateEMAFilter(filter: EMAFilter, currentValue: number): number {
  filter.value = filter.alpha * currentValue + (1 - filter.alpha) * filter.value;
  return filter.value;
}

export function createVector3EMAFilter(alpha: number = 0.15) {
  return {
    x: createEMAFilter(alpha),
    y: createEMAFilter(alpha),
    z: createEMAFilter(alpha),
  };
}

export function updateVector3EMAFilter(
  filter: { x: EMAFilter; y: EMAFilter; z: EMAFilter },
  currentValue: { x: number; y: number; z: number }
): { x: number; y: number; z: number } {
  return {
    x: updateEMAFilter(filter.x, currentValue.x),
    y: updateEMAFilter(filter.y, currentValue.y),
    z: updateEMAFilter(filter.z, currentValue.z),
  };
}

export function createLowPassFilter(alpha: number = 0.15) {
  return {
    alpha,
    previous: 0,
    initialized: false,
  };
}

export function updateLowPassFilter(
  filter: { alpha: number; previous: number; initialized: boolean },
  currentValue: number
): number {
  if (!filter.initialized) {
    filter.previous = currentValue;
    filter.initialized = true;
    return currentValue;
  }

  filter.previous = filter.alpha * currentValue + (1 - filter.alpha) * filter.previous;
  return filter.previous;
}

export function createKalmanFilter(processNoise: number = 0.01, measurementNoise: number = 0.1) {
  return {
    estimate: 0,
    errorCovariance: 1,
    processNoise,
    measurementNoise,
    initialized: false,
  };
}

export function updateKalmanFilter(
  filter: {
    estimate: number;
    errorCovariance: number;
    processNoise: number;
    measurementNoise: number;
    initialized: boolean;
  },
  measurement: number
): number {
  if (!filter.initialized) {
    filter.estimate = measurement;
    filter.initialized = true;
    return filter.estimate;
  }

  const predictionCovariance = filter.errorCovariance + filter.processNoise;
  const kalmanGain = predictionCovariance / (predictionCovariance + filter.measurementNoise);
  
  filter.estimate = filter.estimate + kalmanGain * (measurement - filter.estimate);
  filter.errorCovariance = (1 - kalmanGain) * predictionCovariance;

  return filter.estimate;
}