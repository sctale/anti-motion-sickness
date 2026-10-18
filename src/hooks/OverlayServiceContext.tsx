import React, { createContext, useContext } from 'react';
import { useOverlayService, type OverlayServiceHook } from './useOverlayService';

/**
 * 悬浮窗服务的单例上下文。
 *
 * 服务状态（权限 / 是否运行 / 用户设置）必须只有一个实例：
 * 每个界面各自 useOverlayService() 会各自注册 AppState 监听、各自查权限，
 * 两份状态一旦不同步，就会出现「这页显示运行中、那页显示已停止」。
 * 乘车检测页还需要在检测到乘车时直接开启圆点，跨页面拿同一份状态才做得到。
 */
const OverlayServiceContext = createContext<OverlayServiceHook | null>(null);

export function OverlayServiceProvider({ children }: { children: React.ReactNode }) {
  // 不做 useMemo 包装：useOverlayService 每次渲染都会返回新对象，
  // 包一层 memo 只是自欺，实际共享的是同一份 state/ref
  const service = useOverlayService();

  return (
    <OverlayServiceContext.Provider value={service}>
      {children}
    </OverlayServiceContext.Provider>
  );
}

export function useOverlayServiceContext(): OverlayServiceHook {
  const context = useContext(OverlayServiceContext);
  if (!context) {
    throw new Error('useOverlayServiceContext 必须在 OverlayServiceProvider 内使用');
  }
  return context;
}
