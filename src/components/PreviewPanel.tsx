import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import {
  OverlayModule,
  describeOverlayError,
  type OverlayGeometryInfo,
  type PreviewCue,
  type SensorHealth,
} from '../native/OverlayNative';
import { Banner, Card, SectionLabel, Tap } from './ui';
import { leading, radius, space, stage, type as t, useTheme } from '../theme/tokens';

/**
 * 预览 / 自检面板。
 *
 * 为什么必须有：这个产品原本唯一的验证方式是「上车试」。用户在客厅点开 App 按「开始显示」，
 * 自动模式下静止时什么都不会出现 —— 他无法区分「功能坏了」「传感器没有」「我手机放错了」，
 * 只能认为 App 有问题。Apple / Google 都在设置界面里给实时预览，就是为了解决这一件事。
 *
 * 数据来源是原生 `CuePreview`：与常驻服务同一套 SensorFusion + MotionCueEngine + 同一份设置，
 * 所以预览里的流动就是真机运行时的流动。
 */

/** 预览轮询间隔：16Hz 足够跟手，又不至于把 JS 线程占满 */
const POLL_INTERVAL_MS = 60;

/** 示意用的标称屏宽（dp）：预览是示意图，按 360dp 折算比例即可 */
const NOMINAL_WIDTH_DP = 360;

const STAGE_WIDTH = 150;
const STAGE_HEIGHT = 262;

/** 舱体背景的网格：静态几十条线，比引一个渐变依赖划算 */
const GRID_CELL = 26;

/** 低于这个可信度就提示换个放法：此时左右提示最容易反直觉 */
const LOW_CONFIDENCE = 0.4;

export function PreviewPanel(): React.JSX.Element | null {
  const theme = useTheme();
  const [geometry, setGeometry] = useState<OverlayGeometryInfo | null>(null);
  const [health, setHealth] = useState<SensorHealth | null>(null);
  const [cue, setCue] = useState<PreviewCue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback((): void => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (!OverlayModule) return;
    setError(null);
    try {
      const [summary, geo] = await Promise.all([
        OverlayModule.startPreview(),
        OverlayModule.getOverlayGeometry(),
      ]);
      setGeometry(geo ?? null);
      // 传感器概况失败不该让预览整体不可用，降级为不显示即可
      try {
        setHealth(await OverlayModule.getSensorHealth());
      } catch {
        setHealth(null);
      }
      if (!summary || summary.includes('无可用')) {
        setError('这台设备没有可用的运动传感器，预览与圆点都无法工作。');
        return;
      }
      setRunning(true);
    } catch (e) {
      setError(describeOverlayError(e));
    }
  }, []);

  const stop = useCallback((): void => {
    stopPolling();
    setRunning(false);
    setCue(null);
    OverlayModule?.stopPreview().catch(() => {
      /* 关不掉也不能让界面报错：预览本身是辅助功能 */
    });
  }, [stopPolling]);

  useEffect(() => {
    void start();
    return () => {
      stopPolling();
      OverlayModule?.stopPreview().catch(() => undefined);
    };
  }, [start, stopPolling]);

  // 退到后台就停表：不预览时不该占一路传感器
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        stopPolling();
        OverlayModule?.stopPreview().catch(() => undefined);
        setRunning(false);
      } else {
        void start();
      }
    });
    return () => subscription.remove();
  }, [start, stopPolling]);

  useEffect(() => {
    if (!running || !OverlayModule) return;
    timerRef.current = setInterval(async () => {
      try {
        setCue(await OverlayModule!.getPreviewCue());
      } catch (e) {
        stopPolling();
        setError(describeOverlayError(e));
      }
    }, POLL_INTERVAL_MS);
    return stopPolling;
  }, [running, stopPolling]);

  if (!OverlayModule) return null;

  const scale = STAGE_WIDTH / NOMINAL_WIDTH_DP;
  const dotCount = geometry?.dotCountPerSide ?? 8;
  const dotRadius = (geometry?.dotRadiusDp ?? 4.5) * scale * 2.1;
  const edgeInset = (geometry?.edgeInsetDp ?? 26) * scale;
  const maxShift = geometry?.maxShiftXDp ?? 20.375;
  const shiftX = Math.max(-maxShift, Math.min(maxShift, cue?.offsetXdp ?? 0)) * scale;
  const shiftY = Math.max(-48, Math.min(48, cue?.offsetYdp ?? 0)) * scale * 1.6;
  const strength = cue?.magnitude01 ?? 0;
  const confidence = cue?.confidence01 ?? 1;
  const dotAlpha = 0.35 + strength * 0.65;

  return (
    <>
      <SectionLabel>预览 · 自检</SectionLabel>
      {/* 舱体：外层跟着主题走，只有中间那块「屏幕」锁死成夜色 ——
          它模拟的是悬浮在用户屏幕上的圆点，跟着主题翻成浅底白点就成了空心环 */}
      <Card style={{ borderRadius: radius.hero }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: space.lg }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: t.body, fontWeight: '700' }}>
              摇一摇手机
            </Text>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: t.footnote,
                lineHeight: leading.footnote,
                marginTop: space.xs + 2,
              }}
            >
              不用上车就能确认它在工作：点随转向左右移、随加减速上下流。
            </Text>
          </View>
        </View>

        <View style={{ alignItems: 'center', paddingBottom: space.xl, paddingHorizontal: space.lg }}>
          <View style={{ width: STAGE_WIDTH + 40, height: STAGE_HEIGHT + 24 }}>
            {/* 网格底纹：给舱体一点纵深，4% 透明度，静态不重绘 */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                opacity: 0.9,
              }}
            >
              {Array.from({ length: Math.floor((STAGE_WIDTH + 40) / GRID_CELL) + 1 }).map((_, i) => (
                <View
                  key={`v${i}`}
                  style={{
                    position: 'absolute',
                    left: i * GRID_CELL,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    backgroundColor: theme.grid,
                  }}
                />
              ))}
              {Array.from({ length: Math.floor((STAGE_HEIGHT + 24) / GRID_CELL) + 1 }).map((_, i) => (
                <View
                  key={`h${i}`}
                  style={{
                    position: 'absolute',
                    top: i * GRID_CELL,
                    left: 0,
                    right: 0,
                    height: 1,
                    backgroundColor: theme.grid,
                  }}
                />
              ))}
            </View>

            {/* 手机示意框 */}
            <View
              style={{
                position: 'absolute',
                left: 20,
                top: 12,
                width: STAGE_WIDTH,
                height: STAGE_HEIGHT,
                borderRadius: 22,
                borderWidth: 1.6,
                borderColor: stage.frame,
                backgroundColor: stage.canvas,
                overflow: 'hidden',
              }}
            >
              {[0, 1].map((side) =>
                Array.from({ length: dotCount }).map((_, i) => {
                  const baseY = STAGE_HEIGHT * (0.15 + (0.7 * i) / Math.max(1, dotCount - 1));
                  const x =
                    side === 0
                      ? edgeInset + shiftX
                      : STAGE_WIDTH - edgeInset + shiftX;
                  return (
                    <View
                      key={`${side}-${i}`}
                      style={{
                        position: 'absolute',
                        left: x - dotRadius / 2,
                        top: baseY + shiftY - dotRadius / 2,
                        width: dotRadius,
                        height: dotRadius,
                        borderRadius: dotRadius / 2,
                        backgroundColor: stage.dot,
                        borderColor: stage.dotStroke,
                        borderWidth: 1,
                        opacity: dotAlpha,
                      }}
                    />
                  );
                })
              )}
            </View>
          </View>
        </View>

        {/* 读数条：把「用到了什么传感器」「现在的姿态能不能信」这两件事摆成一行 */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderTopWidth: 1,
            borderTopColor: theme.separator,
            paddingHorizontal: space.xl,
            paddingVertical: space.lg,
          }}
        >
          <View style={{ flex: 1, paddingRight: space.md }}>
            <Text
              style={{
                color: theme.textTertiary,
                fontSize: t.caption,
                fontWeight: '700',
                letterSpacing: 0.6,
                textTransform: 'uppercase',
              }}
            >
              传感器
            </Text>
            <Text
              style={{
                color: theme.text,
                fontSize: t.footnote,
                lineHeight: leading.footnote,
                marginTop: space.xs + 1,
              }}
              numberOfLines={2}
            >
              {health ? health.summary : '读取中'}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text
              style={{
                color: theme.textTertiary,
                fontSize: t.caption,
                fontWeight: '700',
                letterSpacing: 0.6,
                textTransform: 'uppercase',
              }}
            >
              姿态可信度
            </Text>
            <Text
              style={{
                color: confidence < LOW_CONFIDENCE ? theme.warning : theme.accent,
                fontSize: t.footnote,
                marginTop: space.xs + 1,
              }}
            >
              {cue?.active ? `${Math.round(confidence * 100)}%` : '—'}
            </Text>
          </View>
        </View>
      </Card>

      {health?.degraded ? (
        <Banner
          tone="warning"
          title="这台设备缺少陀螺仪或旋转矢量"
          body={health.summary + '。转向提示会比预期迟钝，加速/刹车的上下流动仍正常。'}
        />
      ) : null}

      {cue && cue.active && confidence < LOW_CONFIDENCE ? (
        <Banner
          tone="warning"
          title="手机放法让方向判断不可靠"
          body="把手机竖起来、屏幕朝向自己，或平放在腿上（屏幕朝上）。现在这个角度，左右提示可能不明显或反向。"
        />
      ) : null}

      {error ? (
        <Banner
          tone="danger"
          title="预览不可用"
          body={error}
          action={
            <Tap
              onPress={() => void start()}
              accessibilityLabel="重试预览"
              style={{
                height: 40,
                borderRadius: radius.control,
                backgroundColor: theme.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: theme.accent, fontSize: t.control, fontWeight: '700' }}>
                重试
              </Text>
            </Tap>
          }
        />
      ) : null}
    </>
  );
}
