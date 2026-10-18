import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState, Linking } from 'react-native';
import {
  OverlayModule,
  describeOverlayError,
  type OverlayNativeModule,
} from '../native/OverlayNative';

export interface OverlayServiceHook {
  hasPermission: boolean | null;
  isRunning: boolean;
  /** 当前构建是否具备悬浮窗能力（仅 Android + 已注入原生模块） */
  isSupported: boolean;
  checkPermission: () => Promise<boolean>;
  requestPermission: () => Promise<void>;
  /**
   * 启动前台服务
   * @param autoMode true = 检测到车辆运动时才显示圆点（对标 Apple「自动」）
   * @throws 启动失败时抛出可读原因（原生侧给出具体错误码）
   */
  startService: (autoMode?: boolean) => Promise<void>;
  stopService: () => Promise<void>;
}

/** 原生模块缺失时的统一提示（避免「点了没反应」） */
const MODULE_MISSING = '当前构建不支持悬浮窗：该功能仅在 Android 上可用';

export function useOverlayService(): OverlayServiceHook {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const isSupported = OverlayModule !== null;

  const isRunningRef = useRef(false);
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  const checkPermission = useCallback(async (): Promise<boolean> => {
    if (!OverlayModule) {
      // 不支持的平台一律报 false：曾经 iOS 直接返回 true，
      // 会让界面显示「可以启动」而点启动又什么都不发生
      setHasPermission(false);
      return false;
    }

    try {
      const result = await OverlayModule.hasOverlayPermission();
      setHasPermission(result);
      return result;
    } catch (error) {
      console.warn('Check permission error:', describeOverlayError(error));
      setHasPermission(false);
      return false;
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<void> => {
    if (!OverlayModule) return;
    try {
      await OverlayModule.openOverlaySettings();
    } catch {
      // 部分国产 ROM 没有 ACTION_MANAGE_OVERLAY_PERMISSION 页面，退回本 App 的设置页
      try {
        await Linking.openSettings();
      } catch (error) {
        console.warn('Open settings error:', describeOverlayError(error));
      }
    }
  }, []);

  const startService = useCallback(async (autoMode = true): Promise<void> => {
    if (!OverlayModule) throw new Error(MODULE_MISSING);
    try {
      // 原生侧会在「服务运行 + 悬浮窗挂上」后才 resolve，失败带原因 reject
      await OverlayModule.startService(autoMode);
      isRunningRef.current = true;
      setIsRunning(true);
    } catch (error) {
      throw new Error(describeOverlayError(error));
    }
  }, []);

  const stopService = useCallback(async (): Promise<void> => {
    if (!OverlayModule) return;
    try {
      await OverlayModule.stopService();
    } catch (error) {
      console.warn('Stop service error:', describeOverlayError(error));
    } finally {
      // 无论原生调用结果如何，本地状态都要落到「已停止」
      isRunningRef.current = false;
      setIsRunning(false);
    }
  }, []);

  const syncServiceState = useCallback(async () => {
    if (!OverlayModule) return;
    try {
      const running = await OverlayModule.isServiceRunning();
      isRunningRef.current = running;
      setIsRunning(running);
    } catch {
      /* 查询失败保持现状，等下次回到前台再同步 */
    }
  }, []);

  useEffect(() => {
    checkPermission();
    syncServiceState();

    // 从系统授权页返回 / 从后台回到前台时重新对齐权限与真实运行状态。
    // 国产 ROM 会静默杀掉前台服务，靠挂载时查一次是不够的。
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkPermission();
        syncServiceState();
      }
    });

    return () => {
      subscription.remove();
      if (isRunningRef.current && OverlayModule) {
        OverlayModule.stopService().catch(() => {
          /* ignore */
        });
        isRunningRef.current = false;
      }
    };
  }, [checkPermission, syncServiceState]);

  return {
    hasPermission,
    isRunning,
    isSupported,
    checkPermission,
    requestPermission,
    startService,
    stopService,
  };
}

/** 便于测试/复用：导出类型化模块引用 */
export type { OverlayNativeModule };
