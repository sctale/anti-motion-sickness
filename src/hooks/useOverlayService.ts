import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState, Linking } from 'react-native';
import {
  DEFAULT_SETTINGS,
  OverlayModule,
  describeOverlayError,
  type OverlaySettings,
} from '../native/OverlayNative';

export interface OverlayServiceHook {
  hasPermission: boolean | null;
  isRunning: boolean;
  /** 当前构建是否具备悬浮窗能力（仅 Android + 已注入原生模块） */
  isSupported: boolean;
  /** 用户设置（自动模式 / 灵敏度），真源在原生 SharedPreferences */
  settings: OverlaySettings;
  checkPermission: () => Promise<boolean>;
  requestPermission: () => Promise<void>;
  /** 启动前台服务（使用当前保存的设置）；失败时抛出可读原因 */
  startService: () => Promise<void>;
  stopService: () => Promise<void>;
  /** 写入设置；服务正在运行时原生侧会立刻重新套用 */
  updateSettings: (patch: Partial<OverlaySettings>) => Promise<void>;
  reloadSettings: () => Promise<void>;
  /** 请求通知权限，返回是否已授予 */
  requestNotificationPermission: () => Promise<boolean>;
  /** 是否已被允许忽略电池优化（null = 未知/不支持查询） */
  batteryExempt: boolean | null;
  /** 打开系统电池优化设置页 */
  openBatterySettings: () => Promise<void>;
  /** 系统是否支持应用内添加 Quick Settings 磁贴 */
  canRequestAddTile: boolean;
  /** 弹出系统「添加磁贴」确认框 */
  requestAddTile: () => Promise<void>;
  /**
   * 「服务状态」与「用户实际所见」不一致时的说明（例如服务在跑但圆点被系统冻结），
   * 一致时为 null。以前这种不一致会被静默吞掉，用户只会认为「App 坏了」。
   */
  serviceHint: string | null;
}

/** 原生模块缺失时的统一提示（避免「点了没反应」） */
const MODULE_MISSING = '当前构建不支持悬浮窗：该功能仅在 Android 上可用';

export function useOverlayService(): OverlayServiceHook {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [settings, setSettings] = useState<OverlaySettings>(DEFAULT_SETTINGS);
  const [canRequestAddTile, setCanRequestAddTile] = useState(false);
  const [batteryExempt, setBatteryExempt] = useState<boolean | null>(null);
  const [serviceHint, setServiceHint] = useState<string | null>(null);

  /** settings 的镜像：乐观更新失败时要回滚到「改动前」，但闭包里的 settings 可能是旧的 */
  const settingsRef = useRef<OverlaySettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const isSupported = OverlayModule !== null;

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

  const reloadSettings = useCallback(async (): Promise<void> => {
    if (!OverlayModule) return;
    try {
      setSettings(await OverlayModule.getSettings());
    } catch (error) {
      console.warn('Load settings error:', describeOverlayError(error));
    }
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<OverlaySettings>): Promise<void> => {
      if (!OverlayModule) {
        setSettings((prev) => ({ ...prev, ...patch }));
        return;
      }
      // 先改本地：原生回包要跨一次 JNI + SharedPreferences，等它才动界面就是「点了没反应」。
      // 原生返回后会用真实值覆盖；失败则回滚到改动前，并抛出可读原因。
      const previous = settingsRef.current;
      setSettings((current) => ({ ...current, ...patch }));
      try {
        const applied = await OverlayModule.updateSettings(
          patch.autoMode ?? null,
          patch.sensitivity ?? null
        );
        setSettings(applied);
      } catch (error) {
        setSettings(previous);
        throw new Error(describeOverlayError(error));
      }
    },
    []
  );

  const syncServiceState = useCallback(async (): Promise<void> => {
    if (!OverlayModule) return;
    try {
      // 两个查询互不依赖，串行 await 等于把「回到前台」的等待时间翻倍
      const [running, overlayShown] = await Promise.all([
        OverlayModule.isServiceRunning(),
        OverlayModule.isOverlayShown(),
      ]);
      const shown = running && overlayShown;
      // 圆点是否真的挂在屏幕上比「服务在跑」更贴近用户所见：
      // 前台服务被 ROM 冻结、或窗口被系统移除时，服务还活着但屏幕上什么都没有，
      // 只查 isServiceRunning 就会一直显示「运行中」，用户只能认为 App 坏了。
      setIsRunning(shown);
      setServiceHint(
        running && !shown
          ? '服务在运行，但圆点没有显示（常被系统省电策略冻结）。可点「开始显示」重新挂上，或按下方允许后台运行。'
          : null
      );
    } catch {
      /* 查询失败保持现状，等下次回到前台再同步 */
    }
  }, []);

  const refreshBatteryExempt = useCallback(async (): Promise<void> => {
    if (!OverlayModule) return;
    try {
      setBatteryExempt(await OverlayModule.isIgnoringBatteryOptimizations());
    } catch {
      setBatteryExempt(null);
    }
  }, []);

  const openBatterySettings = useCallback(async (): Promise<void> => {
    if (!OverlayModule) return;
    try {
      await OverlayModule.openBatteryOptimizationSettings();
    } catch (error) {
      throw new Error(describeOverlayError(error));
    }
  }, []);

  const startService = useCallback(async (): Promise<void> => {
    if (!OverlayModule) throw new Error(MODULE_MISSING);
    try {
      // 原生侧会在「服务运行 + 悬浮窗挂上」后才 resolve，失败带原因 reject
      await OverlayModule.startService();
      setIsRunning(true);
      setServiceHint(null);
    } catch (error) {
      // 启动失败时不要留着上一次的「运行中」假象
      await syncServiceState();
      throw new Error(describeOverlayError(error));
    }
  }, [syncServiceState]);

  const stopService = useCallback(async (): Promise<void> => {
    if (!OverlayModule) return;
    try {
      await OverlayModule.stopService();
    } catch (error) {
      console.warn('Stop service error:', describeOverlayError(error));
    } finally {
      // 以原生真实状态收尾：直接写死「已停止」会在停止失败时
      // 让圆点还挂在别的 App 上、界面却显示「▶ 启动」，用户完全不知道发生了什么
      await syncServiceState();
    }
  }, [syncServiceState]);

  const requestNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (!OverlayModule) return false;
    try {
      return await OverlayModule.requestNotificationPermission();
    } catch {
      return false;
    }
  }, []);

  const requestAddTile = useCallback(async (): Promise<void> => {
    if (!OverlayModule) return;
    try {
      await OverlayModule.requestAddTile();
    } catch (error) {
      throw new Error(describeOverlayError(error));
    }
  }, []);

  useEffect(() => {
    checkPermission();
    reloadSettings();
    syncServiceState();
    refreshBatteryExempt();

    if (OverlayModule) {
      OverlayModule.canRequestAddTile()
        .then(setCanRequestAddTile)
        .catch(() => setCanRequestAddTile(false));
    }

    // 从系统授权页返回 / 从后台回到前台时重新对齐权限与真实运行状态。
    // 国产 ROM 会静默杀掉前台服务，靠挂载时查一次是不够的。
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkPermission();
        syncServiceState();
        reloadSettings();
        refreshBatteryExempt();
      }
    });

    // 注意：这里**不**在卸载时停止服务。
    // 圆点的用途就是盖在别的 App 上，用户在 App 内切换页面不应该把提示关掉；
    // 停止只由「停止」按钮、通知栏动作和 Quick Settings 磁贴触发。
    return () => subscription.remove();
  }, [checkPermission, reloadSettings, syncServiceState, refreshBatteryExempt]);

  return {
    hasPermission,
    isRunning,
    isSupported,
    settings,
    checkPermission,
    requestPermission,
    startService,
    stopService,
    updateSettings,
    reloadSettings,
    requestNotificationPermission,
    canRequestAddTile,
    requestAddTile,
    batteryExempt,
    openBatterySettings,
    serviceHint,
  };
}
