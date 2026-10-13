import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState, NativeModules, Platform, Linking } from 'react-native';

const { OverlayModule } = NativeModules;

export interface OverlayServiceHook {
  hasPermission: boolean | null;
  isRunning: boolean;
  /** 原生 OverlayModule 是否可用（未接入原生层时为 false） */
  isSupported: boolean;
  checkPermission: () => Promise<boolean>;
  requestPermission: () => Promise<void>;
  /**
   * 启动前台服务
   * @param autoMode true = 检测到车辆运动时才显示圆点（对标 Apple「自动」）
   */
  startService: (autoMode?: boolean) => Promise<void>;
  stopService: () => Promise<void>;
}

export function useOverlayService(): OverlayServiceHook {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const isSupported = Platform.OS === 'android' ? !!OverlayModule : true;

  const isRunningRef = useRef(false);
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  const checkPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      setHasPermission(true);
      return true;
    }

    try {
      if (!OverlayModule) {
        setHasPermission(false);
        return false;
      }
      const result = await OverlayModule.hasOverlayPermission();
      setHasPermission(result);
      return result;
    } catch (error) {
      console.error('Check permission error:', error);
      setHasPermission(false);
      return false;
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<void> => {
    if (Platform.OS === 'android' && OverlayModule) {
      try {
        await OverlayModule.openOverlaySettings();
      } catch (error) {
        console.error('Open settings error:', error);
        Linking.openSettings();
      }
    }
  }, []);

  const startService = useCallback(async (autoMode = true): Promise<void> => {
    if (Platform.OS !== 'android') return;
    if (!OverlayModule) {
      throw new Error('原生悬浮窗模块未接入，请先完成 Android 原生构建');
    }
    try {
      // 原生侧会在服务真正跑起来后才 resolve，失败则 reject
      await OverlayModule.startService(autoMode);
      isRunningRef.current = true;
      setIsRunning(true);
    } catch (error) {
      console.error('Start service error:', error);
      throw error;
    }
  }, []);

  const stopService = useCallback(async (): Promise<void> => {
    if (Platform.OS !== 'android' || !OverlayModule) return;
    try {
      await OverlayModule.stopService();
      isRunningRef.current = false;
      setIsRunning(false);
    } catch (error) {
      console.error('Stop service error:', error);
    }
  }, []);

  useEffect(() => {
    checkPermission();
    // 从系统授权页返回时自动刷新权限与运行状态
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkPermission();
      }
    });
    // 与服务真实状态对齐（例如从后台回到前台、或服务被系统重启）
    if (Platform.OS === 'android' && OverlayModule?.isServiceRunning) {
      OverlayModule.isServiceRunning()
        .then((running: boolean) => {
          isRunningRef.current = running;
          setIsRunning(running);
        })
        .catch(() => {
          /* ignore */
        });
    }
    return () => {
      subscription.remove();
      if (isRunningRef.current && OverlayModule) {
        OverlayModule.stopService().catch(() => {
          /* ignore */
        });
        isRunningRef.current = false;
      }
    };
  }, [checkPermission]);

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