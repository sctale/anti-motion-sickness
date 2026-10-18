import { OverlayModule } from '../native/OverlayNative';
import { LAST_CRASH_KEY } from './constants';

type GlobalHandler = (error: Error, isFatal?: boolean) => void;

interface ErrorUtilsLike {
  getGlobalHandler(): GlobalHandler | null | undefined;
  setGlobalHandler(handler: GlobalHandler): void;
}

/**
 * 把 JS 致命错误也写进与原生崩溃同一个偏好键。
 *
 * 为什么错误边界不够：`ErrorBoundary` 只能接住**渲染期**抛出的错误，
 * 而真正让 App「点图标就闪退」的往往是别的位置 —— effect 里的异步回调、
 * 定时器、原生事件订阅回调。这些错误不会经过任何组件，直接交给 RN 的全局处理器，
 * 在 release 包里就是进程终止，屏幕上什么都留不下。
 *
 * 这里只做一件事：赶在默认处理器之前，把原因同步落盘（`setStringPref` 走 commit()），
 * 然后原样交给上一任处理器，不改变崩溃行为本身 —— 掩盖崩溃比留下崩溃更糟。
 */
export function installGlobalCrashReporter(): void {
  const errorUtils = (
    globalThis as unknown as { ErrorUtils?: ErrorUtilsLike }
  ).ErrorUtils;
  if (!errorUtils) return;

  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    if (isFatal) {
      try {
        const stack = (error?.stack ?? '')
          .split('\n')
          .slice(0, 12)
          .join('\n');
        const text = `JS 致命错误: ${error?.name ?? 'Error'}: ${
          error?.message ?? '无消息'
        }\n${stack}`;
        OverlayModule?.setStringPref(LAST_CRASH_KEY, text.slice(0, 6000)).catch(
          () => {
            /* 上报自身再失败也不能抛出去，否则会变成递归崩溃 */
          }
        );
      } catch {
        /* 同上 */
      }
    }
    previous?.(error, isFatal);
  });
}
