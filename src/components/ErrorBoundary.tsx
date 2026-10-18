import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { OverlayModule } from '../native/OverlayNative';
import { LAST_CRASH_KEY } from '../utils/constants';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: string;
}

/**
 * 根级错误边界。
 *
 * 没有它时，渲染期任何抛错在 release 包里都是「点图标 → 直接闪退」，
 * 用户和开发者都拿不到任何信息（本机也没有连手机抓 logcat 的条件）。
 * 有它时，错误会留在屏幕上：组件名 + message + 堆栈前几行，
 * 用户截图就能反馈，或者自己点「重试」恢复。
 *
 * 注意边界只管 JS 渲染期。import 阶段的抛错已在 OverlayNative 里就地吞掉；
 * 真正的原生崩溃（Java/Kotlin 层）仍然只能靠 logcat。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const info = (errorInfo.componentStack ?? '').trim();
    this.setState({ info });
    const text = `JS 渲染崩溃: ${error.message}\n${(error.stack ?? '').split('\n').slice(1, 12).join('\n')}\n${info}`;
    // 存进与原生崩溃同一个键，下次启动首页就能直接看到原因，
    // 而不是只留下一句「闪退」
    OverlayModule?.setStringPref(LAST_CRASH_KEY, text.slice(0, 6000)).catch(() => {
      /* 存不上也不能再抛，否则错误边界自己就成了崩溃源 */
    });
    console.error('渲染崩溃:', error.message, info);
  }

  private handleRetry = (): void => {
    this.setState({ error: null, info: '' });
  };

  render(): ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const stack = (error.stack ?? '')
      .split('\n')
      .slice(1, 7)
      .join('\n');

    return (
      <View style={styles.container}>
        <Text style={styles.title}>界面出错了</Text>
        <Text style={styles.message}>{error.message || '未知错误'}</Text>
        <ScrollView style={styles.logBox}>
          <Text style={styles.log}>{[stack, info].filter(Boolean).join('\n\n')}</Text>
        </ScrollView>
        <Text style={styles.hint}>
          如果每次启动都停在这里，请把这一屏截图反馈到 GitHub Issue，
          这比「闪退」两个字有用得多。
        </Text>
        <TouchableOpacity style={styles.button} onPress={this.handleRetry}>
          <Text style={styles.buttonText}>重试</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
  },
  message: {
    color: '#FCA5A5',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  logBox: {
    maxHeight: 300,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  log: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'monospace',
  },
  hint: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#6366F1',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
