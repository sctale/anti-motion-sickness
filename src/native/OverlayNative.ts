import { NativeModules, Platform } from 'react-native';

/**
 * 原生悬浮窗模块的类型化入口。
 *
 * 之前各处直接 `NativeModules.OverlayModule`，类型是 any：方法名写错、
 * 参数个数变化都只能到运行时（真机上）才暴露。这里把与
 * `native/android/OverlayModule.kt` 一一对应的契约集中声明一次。
 */
export interface OverlayNativeModule {
  /** 是否已授予「显示在其他应用上层」 */
  hasOverlayPermission(): Promise<boolean>;
  /** 跳转系统悬浮窗授权页 */
  openOverlaySettings(): Promise<boolean>;
  /** 启动前台服务；原生侧确认「服务在跑 + 悬浮窗已挂上」后才 resolve */
  startService(autoMode: boolean): Promise<boolean>;
  /** 停止前台服务并移除圆点 */
  stopService(): Promise<boolean>;
  /** 服务是否正在运行（用于界面恢复真实状态） */
  isServiceRunning(): Promise<boolean>;
}

/** 非 Android、或未注入原生模块时为 null */
export const OverlayModule: OverlayNativeModule | null =
  Platform.OS === 'android'
    ? ((NativeModules as { OverlayModule?: OverlayNativeModule }).OverlayModule ?? null)
    : null;

/** 原生侧 reject 的错误码，见 OverlayModule.kt */
export const OVERLAY_ERRORS = {
  NO_PERMISSION: 'ERR_NO_PERMISSION',
  PERMISSION_REVOKED: 'ERR_PERMISSION_REVOKED',
  OVERLAY_ADD_FAILED: 'ERR_OVERLAY_ADD_FAILED',
  START_TIMEOUT: 'ERR_START_TIMEOUT',
  START_SERVICE: 'ERR_START_SERVICE',
} as const;

export type OverlayErrorCode = (typeof OVERLAY_ERRORS)[keyof typeof OVERLAY_ERRORS];

/** 把 RN 的 NativeError（code/message 分列）取成可读中文 */
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
    default:
      return e.code ?? '未知错误';
  }
}
