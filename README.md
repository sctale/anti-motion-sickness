# 🚗 防晕车助手 (Anti Motion Sickness) v0.3.2

基于 iOS Vehicle Motion Cues 的设计理念，使用 **Android 原生 ForegroundService + WindowManager** 实现的防晕车助手，通过屏幕边缘的动态圆点帮助缓解乘车时的晕车症状。完整适配 Android 16 (API 36)。

## ✨ 核心功能

- 🎯 **原生悬浮窗** - 使用 `TYPE_APPLICATION_OVERLAY` 系统级悬浮窗，覆盖在任何 App 之上
- 🌀 **传感器融合** - 基于 `TYPE_ROTATION_VECTOR` 融合线性加速度与陀螺仪数据
- 🎨 **动态圆点** - 屏幕**左右两侧各 8 个圆点**（共 16 个），停留在边缘带内，不遮挡内容
- 🧭 **姿态自适应** - 竖握、平放手机都能正确识别转向（基于世界坐标系偏航角速度）
- 🤖 **自动模式** - 检测到车辆运动时淡入，静止约 10 秒后自动淡出（对标 Apple「自动」）
- ⚡ **实时响应** - SENSOR_DELAY_GAME 采样（~50-100Hz）+ 临界阻尼弹簧平滑
- 🔋 **后台运行** - Foreground Service 后台持续运行，息屏自动暂停传感器省电
- 📱 **Android 16 适配** - `specialUse` 前台服务、预测性返回、边缘到边缘安全区
- 📳 **乘车检测** - 通过线性加速度（已扣除重力）识别 IN_VEHICLE / WALKING / STILL

## 🎯 与行业方案对标

| 能力 | Apple Vehicle Motion Cues | Google Motion Assist (Android 17) | 本项目 |
|------|---------------------------|-----------------------------------|--------|
| 圆点位置 | 屏幕左右两侧边缘 | 屏幕边缘气泡 | ✅ 左右两侧各 8 个，限制在 56dp 边缘带内 |
| 运动语义 | 与车辆加速度相反（模拟车窗外景物流向） | "match how the vehicle turns, speeds up, or brakes" | ✅ 同：加速下滑 / 刹车上滑 / 左转右移 / 右转左移 |
| 传感器 | 加速度计 + 陀螺仪 | 手机运动传感器 | ✅ 旋转矢量 + 线性加速度 + 陀螺仪（世界坐标系） |
| 自动显示 | 「自动」：检测到乘车显示，停车隐藏 | "Start in a moving vehicle" | ✅ 自动模式开关 + 10 秒静止淡出 |
| 手动开关 | 控制中心 / 快捷指令 | Quick Settings 磁贴 | ⚠️ App 内开关（Quick Settings 磁贴待实现） |
| 外观自定义 | 颜色 / 大小 / 数量 / 模式 | 透明度 / 配色 / 形状 / 随机化 | ⚠️ 固定白点 + 深色描边（对比度自适应），可配置项待实现 |
| 系统集成 | 系统级合成器 | Play Services 系统级 | 第三方方案（悬浮窗 + 前台服务），与 KineStop 同架构 |

方向语义依据：The Verge 实测（右转圆点左移、刹车圆点上滑）、Google 官方支持页、Popular Science（圆点以「路边景物掠过」的方式移动）等公开测评。

## 🏗️ 技术架构

```
React Native (JS)                       ←  UI + 服务控制（Home/VehicleMotion/CarDetection）
       ↓
OverlayModule (Native Module 桥接)     ←  useOverlayService.ts
       ↓
OverlayService (Foreground Service)     ←  原生 Kotlin (specialUse)
       ↓
SensorManager → SensorFusion → MotionCueEngine
       ↓
OverlayManager → OverlayView (Canvas 绘制左右两列圆点)
       ↓
TYPE_APPLICATION_OVERLAY 窗口
```

### 关键组件

| 组件 | 功能 |
|------|------|
| **OverlayService** | 前台服务：传感器注册/回退、息屏暂停、通知与停止操作 |
| **SensorFusion** | 旋转矢量→世界坐标系；重力扣除（线性加速度/重力传感器/低通兜底）；世界垂直轴偏航角速度 |
| **MotionCueEngine** | 姿态自适应方向映射、死区、临界阻尼弹簧、自动模式可见性 |
| **OverlayView** | Canvas 绘制左右各 8 个圆点，白点 + 深色描边保证任意背景可见 |
| **OverlayManager** | 管理 TYPE_APPLICATION_OVERLAY 悬浮窗（不聚焦、不拦截触摸） |
| **OverlayModule** | React Native Native Module 桥接（权限 / 启停 / 运行状态校验） |
| **RotationMath** | 纯数学：旋转矢量→旋转矩阵（与 Android 约定一致） |

## 📊 关键参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 圆点数量 | 16（左右各 8） | 纵向分布 15%~85% 屏高 |
| 边缘带宽度 | ≤ 56dp | 圆点不会侵入内容区 |
| 水平最大位移 | ±40dp | 转向提示 |
| 垂直最大位移 | ±48dp | 加减速提示 |
| 偏航增益 | 110 dp/(rad/s) | 转向瞬时响应 |
| 横向加速度增益 | 20 dp/(m/s²) | 转弯持续力提示 |
| 纵向加速度增益 | 24 dp/(m/s²) | 加/减速提示 |
| 死区 | 0.12 m/s² / 0.015 rad/s | 抑制静止噪声 |
| 平滑 | 临界阻尼弹簧 ω=12 rad/s, ζ=1.0 | 无过冲、约 0.25s 跟上 |
| 自动模式静止超时 | 10s | 之后淡出（0.8s） |
| 采样率 | SENSOR_DELAY_GAME (~50-100Hz) | 息屏暂停 |
| 窗口类型 | TYPE_APPLICATION_OVERLAY | 不聚焦 + 不拦截触摸 |

> 参数集中定义于 [`native/android/MotionCueEngine.kt`](./native/android/MotionCueEngine.kt) 的 `CueConfig` 与 [`native/android/OverlayView.kt`](./native/android/OverlayView.kt) 常量。

## 🧪 算法验证（无需真机）

核心算法为纯 Kotlin（不依赖 Android API），可直接在 JVM 上回归验证：

```bash
bash tools/verify/run.sh
```

覆盖 11 个场景：竖握/平放 × 加速/刹车/左转/右转、车头朝任意朝向、噪声抑制、自动模式淡入淡出、重力回退路径、极端输入限幅。

## 🤖 Android 16 适配要点

| 规范项 | 处理 |
|--------|------|
| 预测性返回手势 | `app.json` 中 `predictiveBackGestureEnabled: true` |
| 边缘到边缘 | Android 16 强制执行；UI 使用 `react-native-safe-area-context` 处理安全区 |
| 前台服务类型 | `foregroundServiceType="specialUse"` + `PROPERTY_SPECIAL_USE_FGS_SUBTYPE`（由 Config Plugin 注入） |
| 16KB 页面对齐 | Gradle/CMake 配置 `max-page-size=16384` |
| 强制权限 | `SYSTEM_ALERT_WINDOW` + `POST_NOTIFICATIONS`（Android 13+） |
| 状态栏 | 各屏用 `StatusBar` 组件显式声明（`androidStatusBar` 配置项在新版 Expo 已失效） |

> ⚠️ 原生源码通过 Config Plugin 注入：`native/android/*.kt` 由 [`plugins/withOverlayModule.js`](./plugins/withOverlayModule.js) 在 `expo prebuild` 时复制到 `android/` 并自动注册。**不要手改 `android/` 目录**（prebuild 会重建）。
> ⚠️ `.gitignore` 中的原生忽略规则已改为根锚定 `/android/`，否则 `native/android/` 会被误忽略（历史踩坑）。

## 🚀 快速开始

### 真机测试（推荐流程）

> **项目采用真机测试策略**：开发者本地构建 → 上传 GitHub Release → 用户手机真机测试。

1. 访问 [Releases](https://github.com/sctale/anti-motion-sickness/releases) 下载最新版本的 APK
2. 在 Android 设备上安装（Android 6.0+，推荐 Android 14+）
3. **首次安装**：允许"安装来自未知来源的应用"
4. 启动 App → 选择"启动 Vehicle Motion"或"启动乘车检测"
5. **首次启动**：授予"显示在其他应用上层"权限
6. 返回 App → 点击"▶ 启动"
7. **观察**：圆点出现在屏幕**左右两侧**
8. **开车转弯 / 加速 / 刹车**：圆点随之左右移动、上下流动
9. **切换到微信/浏览器**：圆点仍然显示，覆盖在其他 App 上

> 默认开启「自动模式」：仅在检测到车辆运动时显示圆点，静止约 10 秒后淡出。

### 开发者：构建 + 发布

> **默认本地构建**（Windows + Android SDK），`release.ps1` 一键完成；本地无构建环境时可用**手动触发的 GitHub Actions 工作流**出包。

```powershell
# 本地一键发布（升级 patch 版本号 + prebuild + 构建 + 上传 GitHub Release）
.\release.ps1

# 升级次版本号
.\release.ps1 -BumpType minor
```

```bash
# GitHub Actions 出包（方式1：手动触发，版本号取自 app.json）
gh workflow run android-release.yml

# GitHub Actions 出包（方式2：推送标签触发，版本号取自标签）
git push origin v0.3.0
```

> 工作流使用 debug 签名（与本地 release 构建一致），仅用于真机测试安装，不可上架应用商店。
> 若该版本 Release 已带 APK（例如已用 `release.ps1` 本地发布），工作流会自动跳过，避免两套 debug 签名互相覆盖。

完整发布流程详见 [AGENTS.md](./AGENTS.md)。

## 📱 兼容性

- **最低 Android 版本**: Android 6.0 (API 23)
- **目标 Android 版本**: Android 16 (API 36)
- **推荐 Android 版本**: Android 14+ (API 34+)
- **传感器要求**: 加速度计 + 陀螺仪
- **权限要求**: SYSTEM_ALERT_WINDOW, FOREGROUND_SERVICE, POST_NOTIFICATIONS

## 📁 项目结构

```
anti-car-sickness/
├── App.tsx                              # 入口（Home 多入口）
├── app.json                             # Expo 配置（Android 16 适配）
├── package.json                         # npm 依赖
├── plugins/
│   └── withOverlayModule.js             # Config Plugin：注入原生源码 / 服务 / Package ⭐
├── native/android/                      # 原生 Kotlin 源码（纳入版本管理）⭐
│   ├── OverlayService.kt                # 前台服务（specialUse / 传感器回退 / 息屏暂停）
│   ├── OverlayView.kt                   # 自定义 View（左右各 8 个圆点）
│   ├── OverlayManager.kt                # TYPE_APPLICATION_OVERLAY 悬浮窗管理
│   ├── OverlayModule.kt                 # RN 桥接模块（含启动状态校验）
│   ├── OverlayPackage.kt                # RN Package 注册
│   ├── SensorFusion.kt                  # 世界坐标系融合 + 偏航角速度 + 重力扣除
│   ├── MotionCueEngine.kt               # 运动提示引擎（方向映射 / 弹簧 / 自动模式）
│   └── RotationMath.kt                  # 旋转矢量 → 旋转矩阵（纯数学）
├── tools/verify/                        # 纯 Kotlin 算法验证台（JVM 运行，无需真机）
├── android/                             # prebuild 生成（已 gitignore）
├── src/
│   ├── hooks/
│   │   ├── useOverlayService.ts         # 服务控制 Hook（悬浮窗权限 / 启停）
│   │   ├── useActivityRecognition.ts    # 乘车检测 Hook（扣除重力的线性加速度）
│   │   └── useVibrationService.ts       # 震动服务 Hook
│   ├── screens/
│   │   ├── VehicleMotionScreen.tsx      # 主功能屏
│   │   └── CarDetectionScreen.tsx       # 乘车检测屏
│   └── utils/
│       └── constants.ts                 # JS 层统一常量
└── assets/                              # 图标资源
```

## 🔧 已知限制

- 项目已切换为真机测试流程，不再依赖 AVD 模拟器
- 部分国产 ROM（小米、华为、OPPO）需要在系统设置中额外允许后台运行
- 16KB 页面设备需要原生 SO 库对齐（已在 Gradle 配置）
- 用户反馈通过 GitHub Issue 收集，开发者据此迭代修复并发布新版本

## 📝 版本历史

详见 [CHANGELOG.md](./CHANGELOG.md)

## 📄 License

MIT License

## 👤 作者

[sctale](https://github.com/sctale)