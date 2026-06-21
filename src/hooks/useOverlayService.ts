import { useState, useCallback, useEffect, useRef } from 'react';
import { NativeModules, Platform, Linking } from 'react-native';

const { OverlayModule } = NativeModules;

export interface OverlayServiceHook {
  hasPermission: boolean | null;
  isRunning: boolean;
  checkPermission: () => Promise<boolean>;
  requestPermission: () => Promise<void>;
  startService: () => Promise<void>;
  stopService: () => Promise<void>;
}

export function useOverlayService(): OverlayServiceHook {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRunning, setIsRunning] = useState(false);

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

  const startService = useCallback(async (): Promise<void> => {
    if (Platform.OS === 'android' && OverlayModule) {
      try {
        await OverlayModule.startService();
        isRunningRef.current = true;
        setIsRunning(true);
      } catch (error) {
        console.error('Start service error:', error);
      }
    }
  }, []);

  const stopService = useCallback(async (): Promise<void> => {
    if (Platform.OS === 'android' && OverlayModule) {
      try {
        await OverlayModule.stopService();
        isRunningRef.current = false;
        setIsRunning(false);
      } catch (error) {
        console.error('Stop service error:', error);
      }
    }
  }, []);

  useEffect(() => {
    checkPermission();
    return () => {
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
    checkPermission,
    requestPermission,
    startService,
    stopService,
  };
}