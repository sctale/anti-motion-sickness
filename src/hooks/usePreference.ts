import { useCallback, useEffect, useRef, useState } from 'react';
import { OverlayModule } from '../native/OverlayNative';

/**
 * 存在原生 SharedPreferences 里的一项界面偏好。
 *
 * 为什么不用 AsyncStorage：Quick Settings 磁贴和前台服务都是原生组件，
 * 它们要能读到同一份设置；用原生存储还省掉一个依赖
 * （本项目 v0.3.0 起在刻意精简依赖）。
 * 原生模块缺失（iOS / 未注入原生层的构建）时退回组件内 state，不阻塞界面。
 */
export function useStringPreference(
  key: string,
  fallback: string
): [string, (value: string) => void] {
  const [value, setValue] = useState(fallback);
  const requested = useRef(false);

  useEffect(() => {
    if (!OverlayModule || requested.current) return;
    requested.current = true;
    OverlayModule.getStringPref(key, fallback)
      .then(setValue)
      .catch(() => setValue(fallback));
  }, [key, fallback]);

  const update = useCallback(
    (next: string) => {
      setValue(next);
      OverlayModule?.setStringPref(key, next).catch(() => {
        /* 写失败只影响下次启动的记忆，不打断当前交互 */
      });
    },
    [key]
  );

  return [value, update];
}

export function useBooleanPreference(
  key: string,
  fallback: boolean
): [boolean, (value: boolean) => void] {
  const [raw, setRaw] = useStringPreference(key, String(fallback));

  const update = useCallback(
    (value: boolean) => setRaw(String(value)),
    [setRaw]
  );

  // 只认严格的 'true'，脏数据回退到默认值而不是「意外开启」
  return [raw === 'true', update];
}
