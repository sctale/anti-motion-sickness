import React, { useCallback } from 'react';
import { Text, View } from 'react-native';
import { Banner, Button, Card, Chevron, Row, SectionLabel, StatusDot } from './ui';
import { radius, space, type as t, useTheme } from '../theme/tokens';
import { BRAND } from '../theme/brand';
import { useBooleanPreference } from '../hooks/usePreference';
import { useOverlayServiceContext } from '../hooks/OverlayServiceContext';

const PREF_FIRST_RUN_DONE = 'first_run_done';

/**
 * 首次使用清单。
 *
 * 走查发现的问题：三个权限（悬浮窗 / 通知 / 后台常驻）分散在不同页面、不同时机出现，
 * 新用户点完第一个就以为完事了，结果圆点盖不上去、或者几分钟后被系统冻结。
 * 这里把它们收成一屏，每项显示当前状态，做完自动消失（也可以「暂不设置」）。
 */
export function OnboardingChecklist({
  onOpenFeature,
}: {
  onOpenFeature: () => void;
}): React.JSX.Element | null {
  const theme = useTheme();
  const [dismissed, setDismissed] = useBooleanPreference(PREF_FIRST_RUN_DONE, false);
  const {
    hasPermission,
    notificationsEnabled,
    batteryExempt,
    isSupported,
    requestPermission,
    openNotificationSettings,
    openBatterySettings,
    ready,
  } = useOverlayServiceContext();

  const requestNotifications = useCallback(async (): Promise<void> => {
    if (!isSupported) return;
    try {
      await openNotificationSettings();
    } catch {
      /* 打不开系统页面时保持原状，用户仍可在系统设置里找 */
    }
  }, [isSupported, openNotificationSettings]);

  const requestBattery = useCallback(async (): Promise<void> => {
    try {
      await openBatterySettings();
    } catch {
      /* 同上 */
    }
  }, [openBatterySettings]);

  if (dismissed || !ready) return null;

  const steps = [
    {
      key: 'overlay',
      title: '允许显示在其他应用上层',
      detail: '没有它，圆点只能显示在本应用里，盖不到微信、浏览器上。',
      done: hasPermission === true,
      action: onOpenFeature,
      actionLabel: '去开启',
    },
    {
      key: 'notification',
      title: '允许发通知',
      detail: '通知栏里的「停止」是你随时关掉圆点的通道之一。',
      done: notificationsEnabled !== false,
      action: requestNotifications,
      actionLabel: '去设置',
    },
    {
      key: 'battery',
      title: '允许后台常驻',
      detail: '系统的省电策略会冻结常驻服务 —— 圆点「用着用着没了」多半是这个原因。',
      done: batteryExempt !== false,
      action: requestBattery,
      actionLabel: '去设置',
    },
  ];

  const pending = steps.filter((s) => !s.done);

  return (
    <>
      <SectionLabel>开始之前</SectionLabel>
      <Card>
        {steps.map((step, index) => (
          <Row
            key={step.key}
            first={index === 0}
            title={step.title}
            detail={step.detail}
            accessory={
              step.done ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <StatusDot on size={9} />
                  <Text
                    style={{
                      color: theme.positive,
                      fontSize: t.footnote,
                      fontWeight: '700',
                      marginLeft: space.sm,
                    }}
                  >
                    已开启
                  </Text>
                </View>
              ) : (
                <Chevron direction="right" color={theme.textTertiary} />
              )
            }
            onPress={step.done ? undefined : step.action}
          />
        ))}
      </Card>

      {pending.length > 0 ? (
        <Banner
          tone="info"
          title={`还有 ${pending.length} 项没设置`}
          body={
            BRAND.appName +
            ' 需要这几项才能在车上稳定工作；全部完成后这一屏会自动消失。'
          }
          action={
            <Button
              label="暂不设置，先看看"
              variant="soft"
              onPress={() => setDismissed(true)}
              style={{ height: 44 }}
            />
          }
        />
      ) : null}
    </>
  );
}
