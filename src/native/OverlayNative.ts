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

  /**
   * 打开 App 内预览，resolve 本机实际用到的传感器说明。
   * 预览复用常驻服务同一套融合与引擎（见 native/android/CuePreview.kt），
   * 所以「预览里看到的就是真机上会发生的」，不是另写的动画。
   */
  startPreview(): Promise<string>;
  stopPreview(): Promise<boolean>;
  /** 轮询预览结果；面板关闭后不要再调 */
  getPreviewCue(): Promise<PreviewCue>;
  /** 圆点排布常量（dp），JS 预览按同一比例画，避免两边各写一套尺寸 */
  getOverlayGeometry(): Promise<OverlayGeometryInfo>;
  /** 传感器健康概况 */
  getSensorHealth(): Promise<SensorHealth>;
  /** 通知是否真的能显示（通知栏的「停止」是少数外部关闭通道之一） */
  areNotificationsEnabled(): Promise<boolean>;
  /** 打开本应用的通知设置页 */
  openNotificationSettings(): Promise<boolean>;
}

/** 预览帧：位移单位 dp，两个 0~1 的量分别是运动强度与姿态可信度 */
export interface PreviewCue {
  offsetXdp: number;
  offsetYdp: number;
  magnitude01: number;
  /** 1 = 手机放法让方向判断很可靠；接近 0 = 那根轴几乎指向天或地，提示会不可信 */
  confidence01: number;
  /** 预览是否已经拿到传感器数据 */
  active: boolean;
}

/** 与 native/android/OverlayGeometry.kt 同源 */
export interface OverlayGeometryInfo {
  dotCountPerSide: number;
  dotRadiusDp: number;
  edgeInsetDp: number;
  bandMaxDp: number;
  maxShiftXDp: number;
  radiusMinScale: number;
  radiusMaxScale: number;
}

export interface SensorHealth {
  /** 例如「旋转矢量 + 陀螺仪 + 线性加速度」 */
  summary: string;
  /** 缺旋转矢量或陀螺仪：转向提示会变钝 */
  degraded: boolean;
  available: boolean;
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

/** 原生侧 reject 的错误码，逐条对照 OverlayModule.kt（改原生错误码时同步这里） */
export const OVERLAY_ERRORS = {
  NO_PERMISSION: 'ERR_NO_PERMISSION',
  CHECK_PERMISSION: 'ERR_CHECK_PERMISSION',
  OPEN_SETTINGS: 'ERR_OPEN_SETTINGS',
  PERMISSION_REVOKED: 'ERR_PERMISSION_REVOKED',
  OVERLAY_ADD_FAILED: 'ERR_OVERLAY_ADD_FAILED',
  START_TIMEOUT: 'ERR_START_TIMEOUT',
  START_SERVICE: 'ERR_START_SERVICE',
  /** 原生把失败原因拼进错误码：ERR_START_<REASON>，见 OverlayService.REASON_* */
  START_FGS_DENIED: 'ERR_START_FOREGROUND_SERVICE_DENIED',
  START_PIPELINE_FAILED: 'ERR_START_PIPELINE_FAILED',
  START_PERMISSION_REVOKED: 'ERR_START_PERMISSION_REVOKED',
  START_OVERLAY_ADD_FAILED: 'ERR_START_OVERLAY_ADD_FAILED',
  STOP_SERVICE: 'ERR_STOP_SERVICE',
  GET_SETTINGS: 'ERR_GET_SETTINGS',
  UPDATE_SETTINGS: 'ERR_UPDATE_SETTINGS',
  GET_PREF: 'ERR_GET_PREF',
  SET_PREF: 'ERR_SET_PREF',
  REQUEST_NOTIFICATIONS: 'ERR_REQUEST_NOTIFICATIONS',
  NO_ACTIVITY: 'ERR_NO_ACTIVITY',
  TILE_UNSUPPORTED: 'ERR_TILE_UNSUPPORTED',
  NO_STATUS_BAR_SERVICE: 'ERR_NO_STATUS_BAR_SERVICE',
  TILE_NOT_ADDED: 'ERR_TILE_NOT_ADDED',
  TILE_NOT_FOREGROUND: 'ERR_TILE_NOT_FOREGROUND',
  REQUEST_ADD_TILE: 'ERR_REQUEST_ADD_TILE',
  BATTERY_STATE: 'ERR_BATTERY_STATE',
  START_PREVIEW: 'ERR_START_PREVIEW',
  STOP_PREVIEW: 'ERR_STOP_PREVIEW',
  GET_PREVIEW: 'ERR_GET_PREVIEW',
  SENSOR_HEALTH: 'ERR_SENSOR_HEALTH',
} as const;

export type OverlayErrorCode = (typeof OVERLAY_ERRORS)[keyof typeof OVERLAY_ERRORS];

/** 灵敏度档位（与原生 SettingsStore 的常量保持一致） */
export const SENSITIVITY = {
  low: 0.7,
  medium: 1.0,
  high: 1.4,
  veryHigh: 1.8,
} as const;

export type SensitivityLevel = keyof typeof SENSITIVITY;

export const SENSITIVITY_LABELS: Record<SensitivityLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
  veryHigh: '极高',
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

/**
 * 错误码 → 可读中文。
 * 只维护这张表：原生新增 reject 码时在这里补一行，界面就不会露出英文异常串。
 */
const ERROR_TEXT: Record<string, string> = {
  [OVERLAY_ERRORS.NO_PERMISSION]: '缺少悬浮窗权限，请先允许「显示在其他应用上层」',
  [OVERLAY_ERRORS.CHECK_PERMISSION]: '检查悬浮窗权限时出错，请重试',
  [OVERLAY_ERRORS.OPEN_SETTINGS]: '打不开系统授权页，请在系统设置中手动允许「显示在其他应用上层」',
  [OVERLAY_ERRORS.PERMISSION_REVOKED]: '悬浮窗权限已被撤销，请重新授权',
  [OVERLAY_ERRORS.OVERLAY_ADD_FAILED]: '悬浮窗添加失败，请确认已允许「显示在其他应用上层」',
  [OVERLAY_ERRORS.START_TIMEOUT]: '前台服务启动超时，请检查通知权限与系统后台运行限制',
  [OVERLAY_ERRORS.START_SERVICE]: '前台服务启动失败，请检查通知权限与系统后台运行限制',
  [OVERLAY_ERRORS.STOP_SERVICE]: '停止服务时出错，可从通知栏或快捷磁贴关闭',
  [OVERLAY_ERRORS.GET_SETTINGS]: '读取设置失败，本次仅在本机界面生效',
  [OVERLAY_ERRORS.UPDATE_SETTINGS]: '保存设置失败，修改没有生效',
  [OVERLAY_ERRORS.GET_PREF]: '读取偏好失败，已回到默认值',
  [OVERLAY_ERRORS.SET_PREF]: '保存偏好失败，下次进入可能会恢复默认',
  [OVERLAY_ERRORS.REQUEST_NOTIFICATIONS]: '无法弹出通知权限请求，请到系统设置里手动允许通知',
  [OVERLAY_ERRORS.NO_ACTIVITY]: '当前界面不可用，请回到 App 内再试一次',
  [OVERLAY_ERRORS.TILE_UNSUPPORTED]:
    '当前系统版本不支持应用内添加磁贴，请在下拉快捷设置面板中手动拖入',
  [OVERLAY_ERRORS.NO_STATUS_BAR_SERVICE]: '系统未提供快捷设置服务，无法应用内添加磁贴',
  [OVERLAY_ERRORS.TILE_NOT_ADDED]: '磁贴未添加（系统拒绝了本次请求），可在下拉面板中手动拖入',
  [OVERLAY_ERRORS.TILE_NOT_FOREGROUND]: '请在 App 前台时再试一次',
  [OVERLAY_ERRORS.REQUEST_ADD_TILE]: '发起添加磁贴时出错，可在下拉面板中手动拖入',
  [OVERLAY_ERRORS.BATTERY_STATE]: '无法查询后台运行限制状态',
  [OVERLAY_ERRORS.START_PREVIEW]: '预览打不开，可能是这台设备没有可用的运动传感器',
  [OVERLAY_ERRORS.STOP_PREVIEW]: '关闭预览时出错，重新进入本页即可',
  [OVERLAY_ERRORS.GET_PREVIEW]: '读取预览数据失败，请重新打开预览',
  [OVERLAY_ERRORS.SENSOR_HEALTH]: '查询传感器状态失败',
  [OVERLAY_ERRORS.START_FGS_DENIED]:
    '系统拒绝该服务进入前台（常见于省电策略或通知被禁用），请在系统设置里允许本应用后台运行',
  [OVERLAY_ERRORS.START_PIPELINE_FAILED]:
    '运动提示计算连续失败，服务已自动停止；请反馈机型与系统版本以便定位',
  [OVERLAY_ERRORS.START_PERMISSION_REVOKED]: '悬浮窗权限已被系统撤销，服务已停止',
  [OVERLAY_ERRORS.START_OVERLAY_ADD_FAILED]: '悬浮窗没能挂上，请重新授权「显示在其他应用上层」',
};

/** 把原生 reject（code/message）转成可读中文 */
export function describeOverlayError(error: unknown): string {
  const e = error as { code?: string; message?: string } | undefined;
  if (!e) return '未知错误';

  // 先按错误码查表：原生用 reject(code, throwable) 的形式报错时，message 是英文异常串，
  // 直接显示它等于把堆栈甩给用户看。
  const mapped = e.code ? ERROR_TEXT[e.code] : undefined;
  if (mapped) return mapped;
  if (e.message) return e.message;
  return e.code ?? '未知错误';
}
