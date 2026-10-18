import { NativeModules, Platform } from 'react-native';

/**
 * 原生悬浮窗模块的类型化入口。
 *
 * 原生桥以前是 NativeModules.OverlayModule（类型 any），方法名或参数写错
 * 只能等真机运行时暴露。这里把与 `native/android/OverlayModule.kt` 一一对应的
 * 契约集中声明一次。
 */
export interface OverlaySettings {
  /** true = 检测到车辆运动才显示圆点（对标 Apple「自动」） */
  autoMode: boolean;
  /** 灵敏度档位，见原生 SettingsStore：0.7 / 1.0 / 1.4 */
  sensitivity: number;
}

export interface OverlayNativeModule {
  /** 是否已授予「显示在其他应用上层」 */
  hasOverlayPermission(): Promise<boolean>;
  /** 跳转系统悬浮窗授权页 */
  openOverlaySettings(): Promise<boolean>;
  /** 启动前台服务（使用当前保存的设置）；确认「服务在跑 + 悬浮窗挂上」后才 resolve */
  startService(): Promise<boolean>;
  /** 停止前台服务并移除圆点 */
  stopService(): Promise<boolean>;
  /** 服务是否正在运行（用于界面恢复真实状态） */
  isServiceRunning(): Promise<boolean>;
  /** 圆点当前是否真的可见（比 isServiceRunning 更贴近用户所见） */
  isOverlayShown(): Promise<boolean>;
  /** 读取用户设置 */
  getSettings(): Promise<OverlaySettings>;
  /** 写入设置并返回生效后的值；服务运行中会即时重新套用 */
  updateSettings(
    autoMode: boolean | null,
    sensitivity: number | null
  ): Promise<OverlaySettings>;
  /** 请求通知权限（Android 13+）；resolve false 表示已发起请求但尚未确认 */
  requestNotificationPermission(): Promise<boolean>;
  /** 系统是否支持应用内请求添加 Quick Settings 磁贴（Android 13+） */
  canRequestAddTile(): Promise<boolean>;
  /** 弹出系统的「添加磁贴」确认框 */
  requestAddTile(): Promise<boolean>;
  /** 是否已被允许忽略电池优化（国产 ROM 冻结后台服务的主因） */
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  /** 打开系统的「忽略电池优化」设置页；resolve false = 系统未提供该入口 */
  openBatteryOptimizationSettings(): Promise<boolean>;
  /** 通用界面偏好（震动开关、频率等），与设置同一份存储 */
  getStringPref(key: string, fallback: string): Promise<string>;
  setStringPref(key: string, value: string): Promise<boolean>;
}

/**
 * 安全解析原生模块。
 *
 * 必须在 import 阶段就不抛错：新架构（bridgeless）下访问未注册的原生模块，
 * NativeModules 的 Proxy 可能直接抛 invariant，而不是返回 undefined。
 * 这段代码在 App 启动时被求值，一旦抛出就是「点图标立刻闪退」，
 * 连一屏错误信息都看不到。吞掉后界面会走「当前平台不支持」的降级路径。
 */
function resolveOverlayModule(): OverlayNativeModule | null {
  if (Platform.OS !== 'android') return null;
  try {
    const mod = (NativeModules as Record<string, unknown>).OverlayModule;
    return (mod as OverlayNativeModule | undefined) ?? null;
  } catch (error) {
    console.warn('读取原生模块 OverlayModule 失败，悬浮窗功能将不可用：', error);
    return null;
  }
}

/** 非 Android、原生模块未注入、或读取时抛错 —— 一律为 null */
export const OverlayModule: OverlayNativeModule | null = resolveOverlayModule();

/** 原生侧 reject 的错误码，见 OverlayModule.kt */
export const OVERLAY_ERRORS = {
  NO_PERMISSION: 'ERR_NO_PERMISSION',
  PERMISSION_REVOKED: 'ERR_PERMISSION_REVOKED',
  OVERLAY_ADD_FAILED: 'ERR_OVERLAY_ADD_FAILED',
  START_TIMEOUT: 'ERR_START_TIMEOUT',
  START_SERVICE: 'ERR_START_SERVICE',
  TILE_UNSUPPORTED: 'ERR_TILE_UNSUPPORTED',
  NO_ACTIVITY: 'ERR_NO_ACTIVITY',
} as const;

export type OverlayErrorCode = (typeof OVERLAY_ERRORS)[keyof typeof OVERLAY_ERRORS];

/** 灵敏度档位（与原生 SettingsStore 的常量保持一致） */
export const SENSITIVITY = {
  low: 0.7,
  medium: 1.0,
  high: 1.4,
} as const;

export type SensitivityLevel = keyof typeof SENSITIVITY;

export const SENSITIVITY_LABELS: Record<SensitivityLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

export const DEFAULT_SETTINGS: OverlaySettings = {
  autoMode: true,
  sensitivity: SENSITIVITY.medium,
};

/** 把档位数值映射回档位名（容错：未知数值就近取档） */
export function toSensitivityLevel(value: number): SensitivityLevel {
  const entries = Object.entries(SENSITIVITY) as [SensitivityLevel, number][];
  let best: SensitivityLevel = 'medium';
  let bestGap = Number.POSITIVE_INFINITY;
  for (const [level, number] of entries) {
    const gap = Math.abs(number - value);
    if (gap < bestGap) {
      bestGap = gap;
      best = level;
    }
  }
  return best;
}

/** 把原生 reject（code/message）转成可读中文 */
export function describeOverlayError(error: unknown): string {
  const e = error as { code?: string; message?: string } | undefined;
  if (!e) return '未知错误';
  if (e.message) return e.message;
  switch (e.code) {
    case OVERLAY_ERRORS.NO_PERMISSION:
      return '缺少悬浮窗权限';
    case OVERLAY_ERRORS.PERMISSION_REVOKED:
      return '悬浮窗权限已被撤销，请重新授权';
    case OVERLAY_ERRORS.OVERLAY_ADD_FAILED:
      return '悬浮窗添加失败，请确认已允许「显示在其他应用上层」';
    case OVERLAY_ERRORS.START_TIMEOUT:
      return '前台服务启动超时，请检查通知权限与系统后台运行限制';
    case OVERLAY_ERRORS.TILE_UNSUPPORTED:
      return '当前系统版本不支持应用内添加磁贴，请在下拉快捷设置面板中手动拖入';
    default:
      return e.code ?? '未知错误';
  }
}
