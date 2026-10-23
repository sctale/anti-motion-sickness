/**
 * 品牌与命名（JS 侧唯一真源）。
 *
 * 原生侧对应 `native/android/UiStrings.kt`：磁贴标签、通知标题、通知渠道都从那里取。
 * 之前一个功能四个名字（防晕车助手 / 防晕圆点 / 防晕车提示 / anti-car-sickness-rn），
 * 用户在通知栏看到的名字在 App 里找不到对应入口。
 */
export const BRAND = {
  /** 应用名：桌面标签（= app.json 的 android.applicationName）、首页大标题 */
  appName: '防晕车助手',
  /** 功能名：入口、页面标题、通知与磁贴都用它 */
  featureName: '防晕圆点',
  detectionName: '乘车检测',
  aboutName: '关于与帮助',
} as const;

/** 反馈渠道：关于页与错误文案都指向这里，改邮箱只改一处 */
export const SUPPORT = {
  issuesUrl: 'https://github.com/sctale/anti-motion-sickness/issues',
  releasesUrl: 'https://github.com/sctale/anti-motion-sickness/releases',
  email: 'sctale@users.noreply.github.com',
} as const;
