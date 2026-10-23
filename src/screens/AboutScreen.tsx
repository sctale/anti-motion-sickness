import React, { useCallback, useState } from 'react';
import { Linking, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';
import { Banner, Card, Chevron, Row, SectionLabel, Tap } from '../components/ui';
import { radius, space, type as t, useIsDark, useTheme } from '../theme/tokens';
import { BRAND, SUPPORT } from '../theme/brand';
import { useStringPreference } from '../hooks/usePreference';
import { LAST_CRASH_KEY } from '../utils/constants';
import Constants from 'expo-constants';

interface AboutScreenProps {
  onExit: () => void;
}

const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

/**
 * 常见问题。
 *
 * 这五条对应客服与 Issue 里最可能出现的疑问，也是走查时发现的「应用内零帮助入口」的直接修补：
 * 用户遇到「圆点不动」时，原本只能退出 App 或去 GitHub 提 Issue。
 */
const FAQ: { question: string; answer: string }[] = [
  {
    question: '点了「开始显示」，但屏幕上什么都没有',
    answer:
      '最常见的原因是自动模式：车辆静止时圆点会淡出，这是预期行为。先在「预览 · 自检」里摇一摇手机，' +
      '如果预览里的点会动，说明功能正常，上车即可看到。若预览也不动，请检查「显示在其他应用上层」权限是否被撤销。',
  },
  {
    question: '圆点用着用着自己消失了',
    answer:
      '多半是系统省电策略冻结了后台常驻服务。到「防晕圆点」页点「允许后台常驻」，' +
      '在系统页面选择「不限制 / 允许后台运行」。息屏时圆点会暂停传感器，亮屏自动恢复。',
  },
  {
    question: '怎么彻底关掉它',
    answer:
      '三个地方都可以：应用内的「停止显示」、通知栏里的「停止」、下拉快捷面板的磁贴。' +
      '在应用内翻页或返回不会关闭圆点 —— 它的用途本来就是盖在其他应用上。',
  },
  {
    question: '会不会很耗电',
    answer:
      '息屏时不再采样；静止 20 秒后自动降低采样频率，120 秒后降到最低档；' +
      '只要圆点还在显示就不降档（保证跟手）。行车中的功耗主要来自屏幕本身。',
  },
  {
    question: '我的数据会上传吗',
    answer:
      '不会。传感器数据只在这台手机上实时处理，不存储历史记录、不上传、不需要账号。' +
      '应用内也没有任何第三方统计。',
  },
];

export const AboutScreen: React.FC<AboutScreenProps> = ({ onExit }) => {
  const theme = useTheme();
  const isDark = useIsDark();
  const [open, setOpen] = useState<number | null>(0);
  const [crash] = useStringPreference(LAST_CRASH_KEY, '');

  const toggle = useCallback((index: number): void => {
    setOpen((current) => (current === index ? null : index));
  }, []);

  const openLink = useCallback((url: string): void => {
    Linking.openURL(url).catch(() => undefined);
  }, []);

  const copyCrash = useCallback((): void => {
    if (!crash) return;
    Share.share({ message: crash, title: '上次异常退出的详细信息' }).catch(() => undefined);
  }, [crash]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.page }} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={theme.page}
          translucent={false}
        />

        <View style={{ paddingHorizontal: space.sm, paddingTop: space.xs }}>
          <Tap
            onPress={onExit}
            accessibilityLabel="返回主页"
            style={{
              minHeight: 44,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: space.sm,
              borderRadius: radius.control,
              alignSelf: 'flex-start',
            }}
          >
            <Chevron direction="left" color={theme.accent} />
            <Text style={{ color: theme.accent, fontSize: t.control, marginLeft: space.xs + 2 }}>
              返回
            </Text>
          </Tap>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={{
              color: theme.text,
              fontSize: t.title,
              fontWeight: '800',
              letterSpacing: -0.4,
              marginTop: space.xs,
              marginBottom: space.lg,
            }}
          >
            {BRAND.aboutName}
          </Text>

          <SectionLabel>常见问题</SectionLabel>
          <Card>
            {FAQ.map((item, index) => (
              <View
                key={item.question}
                style={{
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: theme.separator,
                }}
              >
                <Row
                  first={index === 0}
                  title={item.question}
                  accessory={
                    <Chevron
                      direction={open === index ? 'down' : 'right'}
                      color={theme.textTertiary}
                    />
                  }
                  onPress={() => toggle(index)}
                />
                {open === index ? (
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: t.footnote,
                      lineHeight: 20,
                      paddingHorizontal: space.lg,
                      paddingBottom: space.lg,
                    }}
                  >
                    {item.answer}
                  </Text>
                ) : null}
              </View>
            ))}
          </Card>

          <SectionLabel>反馈</SectionLabel>
          <Card>
            <Row
              first
              title="提交问题（GitHub）"
              detail="崩溃信息会被自动带上，截图即可定位"
              accessory={<Chevron direction="right" color={theme.textTertiary} />}
              onPress={() => openLink(SUPPORT.issuesUrl)}
            />
            <Row
              title="查看新版本"
              detail={`当前 v${APP_VERSION} · 发布页可下载最新安装包`}
              accessory={<Chevron direction="right" color={theme.textTertiary} />}
              onPress={() => openLink(SUPPORT.releasesUrl)}
            />
          </Card>

          {crash ? (
            <Banner
              tone="danger"
              title="上次异常退出过"
              body="详情已保存在首页，可一键复制或分享给我们 —— 这段信息比「闪退」两个字有用得多。"
              action={
                <Tap
                  onPress={copyCrash}
                  accessibilityLabel="复制崩溃信息"
                  style={{
                    height: 44,
                    borderRadius: radius.control,
                    backgroundColor: theme.dangerSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: theme.danger, fontSize: t.control, fontWeight: '700' }}>
                    复制 / 分享详细信息
                  </Text>
                </Tap>
              }
            />
          ) : null}

          <Text
            style={{
              color: theme.textTertiary,
              fontSize: t.footnote,
              lineHeight: 19,
              marginTop: space.xl,
              paddingHorizontal: space.xs,
            }}
          >
            {BRAND.appName} v{APP_VERSION} · 传感器数据只在本机处理，不联网上传、不存历史。
          </Text>
        </ScrollView>
    </SafeAreaView>
  );
};
