# 防晕车助手 (Anti Motion Sickness)

Android 上的 Vehicle Motion Cues：在屏幕**左右两侧**显示随车辆运动流动的点，让眼睛看到的运动与内耳感受到的运动重新对上，缓解乘车看手机时的晕车感。

原生实现（Kotlin 前台服务 + 系统级悬浮窗 + 传感器融合），React Native / Expo 只负责控制界面。
完整适配 Android 16 (API 36)，支持浅色与深色主题。

最新安装包：<https://github.com/sctale/anti-motion-sickness/releases>（下载 `anti-motion-sickness-vX.Y.Z.apk`）

---

## 它能做什么

- **覆盖在任何 App 之上** —— `TYPE_APPLICATION_OVERLAY` 系统级悬浮窗，看微信、浏览器、电子书时圆点照常显示
- **自动模式** —— 检测到车辆运动才淡入，静止约 10 秒后淡出；短暂晃动不会闪现，匀速巡航不会闪断（进入/维持双阈值迟滞）
- **姿态自适应** —— 手机竖握、平放、斜靠都能正确判断转向：前进方向由姿态推断，不依赖手机朝向，也不依赖磁北
- **灵敏度三档** —— 改的是「多大动作算满行程」，运行中即时生效
- **下拉快捷面板磁贴** —— 点一下开关圆点，不用回到 App；Android 13+ 还能在 App 内直接请求添加
- **省电** —— 息屏即注销传感器；静止时自动降低采样档位（有运动或圆点正在显示时立刻回到最高档）
- **后台常驻引导** —— 直接显示当前是否被系统省电策略限制，并给出跳转入口（这是圆点「用着用着没了」最常见的原因）
- **乘车检测** —— 用已扣除重力的线性加速度判断是否在车里，按设定节奏震动提醒，并可自动开启圆点
- **偏好持久化** —— 自动模式、灵敏度、震动设置存在原生 SharedPreferences，重启不丢
- **崩溃可诊断** —— 原生未捕获异常、JS 渲染错误、JS 致命错误都会留下堆栈，下次启动直接显示在首页；不用连电脑抓 logcat 也能定位「闪退」

方向语义与 Apple 一致：**加速 → 圆点向下流；刹车 → 向上流；左转 → 右移；右转 → 左移**（模拟车窗外景物的流向）。

---

## 与行业方案对标

| 能力 | Apple Vehicle Motion Cues | Google Motion Assist | 本项目 |
|------|---------------------------|----------------------|--------|
| 圆点位置 | 屏幕左右两侧边缘 | 屏幕边缘气泡 | ✅ 左右各 8 个，限制在 56dp 边缘带内 |
| 运动语义 | 与车辆加速度相反（景物流向） | 跟随车辆转向 / 加减速 | ✅ 加速下滑 / 刹车上滑 / 左转右移 / 右转左移 |
| 传感器 | 加速度计 + 陀螺仪 | 手机运动传感器 | ✅ 旋转矢量 + 线性加速度 + 陀螺仪，世界坐标系融合 |
| 自动显示 | 「自动」 | 检测到乘车自动开始 | ✅ 双阈值迟滞 + 静止淡出 |
| 快捷入口 | 控制中心 | Quick Settings 磁贴 | ✅ App 内 + 通知栏 + **QS 磁贴**（Android 13+ 可应用内请求添加） |
| 外观自定义 | 颜色 / 大小 / 数量 | 透明度 / 配色 / 形状 | ❌ 固定白点 + 深色描边（任意背景下都可见），只能调灵敏度 |
| 系统集成 | 系统级合成器 | Play Services | 第三方方案：悬浮窗 + 前台服务（与 KineStop 同架构） |

---

## 架构

```
React Native (JS)            界面 + 服务控制：Home / 防晕圆点 / 乘车检测
      ↓  OverlayModule（类型化桥接，错误码 → 可读中文）
OverlayService               常驻前台服务（foregroundServiceType=specialUse）
      ↓
SensorManager → SensorFusion → MotionCueEngine → SamplingPolicy
      ↓                            （世界坐标融合）  （方向映射/弹簧/迟滞）  （静止降档）
OverlayManager → OverlayView（Canvas 绘制，几何量在 OverlayGeometry）
      ↓
TYPE_APPLICATION_OVERLAY 窗口
```

### 原生组件（`native/android/`，共 13 个 Kotlin 文件）

| 组件 | 职责 |
|------|------|
| `OverlayService` | 前台服务：传感器注册与回退、独立 `HandlerThread` + 60Hz 合并、息屏暂停、通知与「停止」、失败原因落盘 |
| `SensorFusion` | 旋转矢量→世界坐标；重力扣除（线性加速度 / 重力传感器 / 低通兜底）；世界垂直轴偏航角速度 |
| `MotionCueEngine` | 姿态自适应方向映射、软死区、临界阻尼弹簧、自动模式迟滞、灵敏度缩放 |
| `SamplingPolicy` | 静止降档 / 运动与显示中回档的采样强度策略（纯逻辑，可在 JVM 断言） |
| `OverlayGeometry` | 边缘带排布的唯一真源：半径、行程、钳位、两列位置（不变量由断言守住） |
| `OverlayView` / `OverlayManager` | Canvas 绘制 + `TYPE_APPLICATION_OVERLAY` 窗口管理（不聚焦、不拦截触摸） |
| `OverlayModule` / `OverlayPackage` | RN 桥接与注册：权限、启停、设置、通知权限、添加磁贴、通用偏好、真实运行状态 |
| `SettingsStore` | SharedPreferences —— 设置只有一个真源（JS 与磁贴、服务共用，因此不引入 AsyncStorage） |
| `MotionCueTileService` | Quick Settings 磁贴：下拉栏直接开关 |
| `CrashCapture` | 未捕获异常同步落盘，下次启动在首页显示堆栈 |
| `RotationMath` | 纯数学：旋转矢量→旋转矩阵（与 Android 约定一致） |

`native/res/drawable/ic_stat_motion.xml` 是通知栏与磁贴的素描矢量图标，与桌面图标由同一批生成器产出。

### JS 层

| 文件 | 职责 |
|------|------|
| `src/native/OverlayNative.ts` | 原生模块的类型化契约、错误码表（与原生 `reject` 逐条对应）、灵敏度档位、错误文案 |
| `src/hooks/useOverlayService.ts` | 权限 / 启停 / 设置 / 状态同步；**乐观更新**与真实状态回读 |
| `src/hooks/OverlayServiceContext.tsx` | 服务状态单例上下文（跨页共享，避免两份状态） |
| `src/hooks/useActivityRecognition.ts` / `useVibrationService.ts` / `usePreference.ts` | 乘车检测、震动反馈、原生偏好读写 |
| `src/theme/tokens.ts` | 设计令牌唯一真源：浅/深两套调色板、间距、圆角、字号、动效时长 |
| `src/components/ui.tsx` | 界面基元：`Tap` `Card` `Row` `Toggle` `Segmented` `Button` `Banner` `StatusDot` `Chevron` `FadeIn`（全部 `Animated` + `useNativeDriver`，不引额外动画库） |
| `src/components/ErrorBoundary.tsx` / `src/utils/globalCrashReporter.ts` | 渲染期错误边界 + 致命错误落盘（边界接不住的那一类） |

---

## 关键参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 圆点数量 | 16（左右各 8） | 纵向分布 15%~85% 屏高 |
| 边缘带宽度 | ≤ 56dp | 圆点不侵入内容区 |
| 水平 / 垂直满行程 | ±20dp / ±48dp | 横向由几何推出：`OverlayGeometry.MAX_SHIFT_X_DP` = 20.375（公式，不是手写数字） |
| 满行程参考输入 | 偏航 0.55 rad/s / 横向 3.5 m/s² / 纵向 3.0 m/s² | 各自归一到满行程，避免普通驾驶直接顶到钳位 |
| 横向通道配比 | 偏航 0.65 : 横向加速度 0.35 | 两路符号一致，按权重合成（不能各按满增益相加） |
| 死区 | 0.12 m/s² / 0.015 rad/s | 软死区，抑制静止噪声 |
| 平滑 | 临界阻尼弹簧 ω=12 rad/s, ζ=1.0 | 无过冲，约 0.25s 跟上 |
| 自动模式 | 进入 0.30 m/s² 或 0.06 rad/s 且连续 600ms；维持 0.12 / 0.02；静止 10s 淡出（0.8s） | 短晃不闪现、巡航不断、停车才收 |
| 计算与重绘 | 合并到 60Hz | 融合与绘制都在独立 `HandlerThread`，不占主线程 |
| 采样率 | 自适应：有运动 GAME(~50-100Hz) → 静止 20s UI(~66ms) → 静止 120s NORMAL(~200ms) | 圆点正在显示时不降档；息屏一律注销传感器 |
| 窗口类型 | `TYPE_APPLICATION_OVERLAY` | 不聚焦 + 不拦截触摸 |

> 运动学参数在 `native/android/MotionCueEngine.kt` 的 `CueConfig`，排布参数在 `OverlayGeometry.kt`，采样策略在 `SamplingPolicy.kt`，JS 常量在 `src/utils/constants.ts`。

---

## 算法验证（不需要真机）

核心算法是纯 Kotlin、不依赖 Android API，可以直接在 JVM 上回归：

```bash
bash tools/verify/run.sh
```

当前 **18 组场景 / 65 项断言**：竖握与平放 × 加速/刹车/左转/右转、车头朝任意朝向、噪声抑制、
自动模式淡入淡出、重力回退路径、极端输入限幅、倾斜姿态下纯重力不泄漏、转弯动态范围（缓转与急转必须看得出差别）、
自动模式迟滞、静止降档与运动回档、档位切换不抖动、圆点显示中不降档、
以及边缘带几何的不变量（引擎满行程 ≤ 几何可走行程、两列共用同一位移、极限位置不出屏不侵入内容区、退化尺寸下不画）。

`kotlinc` 会自动查找（PATH → `KOTLIN_HOME` → Android Studio 自带的那份）。
改 `SensorFusion` / `MotionCueEngine` / `RotationMath` / `SamplingPolicy` / `OverlayGeometry` 后必须全绿。

---

## 安装与使用

1. 到 [Releases](https://github.com/sctale/anti-motion-sickness/releases) 下载最新的 `anti-motion-sickness-vX.Y.Z.apk`（Android 7.0 以上，推荐 Android 13+）
2. 安装时需允许「安装来自未知来源的应用」
3. 打开 App → 首页点 **防晕圆点** → **前往系统设置授权**（允许「显示在其他应用上层」）
4. 回到 App → 点 **开始显示**
5. 圆点出现在屏幕左右两侧；切到微信、浏览器、电子书，圆点仍然盖在上面
6. 转弯 / 加速 / 刹车时观察圆点是否随之左右移动、上下流动
7. 建议顺手做两件事：**添加到快捷设置面板**（以后下拉就能开关）、若你的 ROM 限制后台则**允许后台常驻**

默认是「自动模式」：车辆静止时圆点会淡出，这是预期行为，不是坏了。
如果圆点没出现，首页与页面里的提示条会直接说明原因（权限被撤销、系统拒绝进入前台、没有可用传感器等）。

---

## 兼容性

| 项 | 值 |
|----|----|
| 最低版本 | Android 7.0 (API 24)（以 APK 的 `sdkVersion` 为准） |
| 目标版本 | Android 16 (API 36) |
| 推荐 | Android 13+（通知权限、应用内添加磁贴） |
| 必需能力 | 加速度计；`TYPE_ROTATION_VECTOR` 与陀螺仪缺失时会自动降级，完全没有可用传感器时服务会带原因拒绝启动 |
| 权限 | `SYSTEM_ALERT_WINDOW`、`FOREGROUND_SERVICE`、`FOREGROUND_SERVICE_SPECIAL_USE`、`POST_NOTIFICATIONS`、`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` |
| iOS | 不支持（悬浮窗与前台服务无对应能力），构建会显示「这个构建不支持悬浮窗」而不是崩溃 |

### Android 16 适配

| 规范项 | 处理 |
|--------|------|
| 预测性返回手势 | `app.json` 中 `predictiveBackGestureEnabled: true` |
| 边缘到边缘 | 系统强制；界面用 `react-native-safe-area-context` 处理安全区（三页都含 `bottom`） |
| 前台服务类型 | `foregroundServiceType="specialUse"` + `PROPERTY_SPECIAL_USE_FGS_SUBTYPE`（Config Plugin 注入） |
| 16KB 页面对齐 | 无自有 C/C++ 源码；`release.ps1` 用 `zipalign -c -P 16 -v 4` 对产物实测校验，未对齐即中止发布 |
| 深浅色 | `userInterfaceStyle: "automatic"`（写成 `light` 会被 `expo-system-ui` 强制 `MODE_NIGHT_NO`，深色主题永远不生效） |

---

## 构建与发布

**全部本地构建**（Windows + Android SDK），本项目不使用 GitHub Actions。

```powershell
.\release.ps1                    # 前置检查 + 升 patch 版本 + prebuild + 构建 + 校验 + 推 tag + 上传 Release
.\release.ps1 -BumpType minor    # 升次版本号
.\release.ps1 -BumpType none     # 不升版本号（版本号与 CHANGELOG 自己写好时）
.\release.ps1 -SkipChecks        # 跳过 tsc 与算法验证台（不建议）
```

脚本会依次做：环境自检（含 node/npx 是否同目录）→ 版本号与 `versionCode` → CHANGELOG 占位 →
`tsc --noEmit` + `bash tools/verify/run.sh` 门禁 → `expo prebuild --clean`（杜绝原生配置漂移）→
原生注入与图标一致性核对 → `replace_icons.ps1` → `gradlew assembleRelease` →
`aapt dump badging` 核对版本号与桌面名字 → `zipalign` 核对 16KB 对齐 →
产物复制为根目录 `anti-motion-sickness-v<版本>.apk` → push + tag + Release 上传。

图标有三条独立链路，改完都要在产物里核对，不能只看日志：

| 链路 | 来源 | 落点 |
|------|------|------|
| 桌面 | `assets/*.png`（`node tools/icons/render.mjs` 生成，固定种子可复现） | `replace_icons.ps1` → `mipmap-*/ic_launcher*.webp` |
| 启动页 | `assets/splash-icon.png` + `app.json` 的 `expo-splash-screen` 参数 | `drawable/splashscreen_logo` |
| 通知栏 / 磁贴 | `native/res/drawable/ic_stat_motion.xml` | Config Plugin 复制进 `res/drawable/` |

> 原生源码经 Config Plugin 注入：`native/android/*.kt` 由 [`plugins/withOverlayModule.js`](./plugins/withOverlayModule.js) 在 `expo prebuild` 时复制进 `android/` 并注册服务、磁贴与 Package。
> **不要手改 `android/`**（prebuild 会重建，历史上正是残留的手改 `gradle.properties` 导致「点开就闪退」）。

---

## 项目结构

```
anti-car-sickness/
├── App.tsx                         # 根：ErrorBoundary + SafeArea + 服务上下文 + 三屏路由
├── app.json                        # Expo 配置（版本、权限、自适应图标、启动页、插件）
├── plugins/withOverlayModule.js    # Config Plugin：注入原生源码 / 服务 / 磁贴 / Package / 通知图标
├── native/
│   ├── android/*.kt                # 原生 Kotlin 源码（纳入版本管理）
│   └── res/drawable/ic_stat_motion.xml
├── src/
│   ├── native/OverlayNative.ts     # 桥契约 + 错误码表
│   ├── hooks/                      # 服务控制 / 上下文 / 乘车检测 / 震动 / 偏好
│   ├── components/                 # ui.tsx 基元 + ErrorBoundary
│   ├── theme/tokens.ts             # 设计令牌
│   ├── screens/                    # 防晕圆点屏、乘车检测屏
│   └── utils/                      # 常量、全局致命错误上报
├── assets/                         # 图标 PNG（由 tools/icons/render.mjs 生成）
├── tools/
│   ├── verify/                     # JVM 算法验证台（run.sh + VerifyMain.kt）
│   └── icons/                      # 图标生成器 + 遮罩/尺寸/通知图标预览
├── release.ps1                     # 一键发布
├── replace_icons.ps1               # PNG → 各 dpi mipmap
├── CHANGELOG.md                    # 版本历史（发布说明取自这里）
└── AGENTS.md                       # 开发规范与踩坑记录
```

`android/` 是 prebuild 产物（已 gitignore）；APK 产物按 `anti-motion-sickness-vX.Y.Z.apk` 命名放在项目根目录。

---

## 已知限制

- **外观不可自定义**：圆点固定为白底 + 深色描边（保证任意背景下都看得见），只能调灵敏度；颜色、大小、数量都不开放
- **乘车检测只在该页打开期间运行**：离开页面即停止（它不是后台服务），已开启的圆点则由后台服务继续负责
- **省电策略仍可能被 ROM 覆盖**：部分小米 / 华为 / OPPO 需要在系统设置里额外允许后台运行，App 内提供了状态检查与跳转入口，但不能替你点确认
- **无 iOS 版本**：悬浮窗与常驻前台服务在 iOS 上没有对应能力
- **真机验证依赖用户**：开发环境没有可用设备与 Android 模拟器，所以算法层靠 JVM 验证台自证（65 项断言），界面与耗电表现靠用户反馈迭代

---

## 反馈

问题与新需求请开 [Issue](https://github.com/sctale/anti-motion-sickness/issues)。
如果 App 崩溃过，**重开一次 App**，首页会直接显示上次的堆栈，截图附上就等于交出了 logcat。

## 版本历史

见 [CHANGELOG.md](./CHANGELOG.md)。开发规范与踩坑记录见 [AGENTS.md](./AGENTS.md)。

## License

MIT · 作者 [sctale](https://github.com/sctale)
