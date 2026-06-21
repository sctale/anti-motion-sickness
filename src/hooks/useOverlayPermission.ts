import { useCallback } from 'react';
import { Platform, Linking } from 'react-native';

export interface OverlayPermissionHook {
  openSettings: () => void;
}

export function useOverlayPermission(): OverlayPermissionHook {
  const openSettings = useCallback((): void => {
    if (Platform.OS === 'android') {
      Linking.openSettings();
    }
  }, []);

  return {
    openSettings,
  };
}