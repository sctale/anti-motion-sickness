/**
 * JS 层常量。
 *
 * 注意：悬浮窗圆点的运动学参数（阈值、增益、滤波系数）全部在原生层，
 * 见 native/android/ 下的 MotionCueEngine.kt / SensorFusion.kt / OverlayView.kt。
 */

// ===== 乘车检测（useActivityRecognition）=====
// 加速度计（expo-sensors）单位为 g，静止时合矢量约为 1g（重力）
export const GRAVITY_G = 1.0;

export const ACCEL_MOTION_THRESHOLD = 0.3;
export const STILL_MOTION_THRESHOLD = 0.1;

export const ACTIVITY_VEHICLE_SAMPLING_WINDOW_MS = 3000;
export const ACTIVITY_CONFIDENCE_INCREASE = 20;
export const ACTIVITY_CONFIDENCE_DECREASE = 10;
export const ACTIVITY_DEFAULT_SAMPLING_INTERVAL_MS = 500;

// ===== 震动反馈（useVibrationService）=====
export const VIBRATION_LOW_INTERVAL_MS = 3000;
export const VIBRATION_MEDIUM_INTERVAL_MS = 2000;
export const VIBRATION_HIGH_INTERVAL_MS = 1000;
export const VIBRATION_MIN_GAP_MS = 200;
export const VIBRATION_PULSE_MS = 100;