import { useState, useCallback, useEffect } from 'react';
import { NativeModules, Platform, Linking, PermissionsAndroid } from 'react-native';

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
        setIsRunning(false);
      } catch (error) {
        console.error('Stop service error:', error);
      }
    }
  }, []);

  useEffect(() => {
    checkPermission();
    return () => {
      if (isRunning) {
        stopService();
      }
    };
  }, []);

  return {
    hasPermission,
    isRunning,
    checkPermission,
    requestPermission,
    startService,
    stopService,
  };
}