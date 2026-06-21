# 🚗 防晕车助手 (Anti Motion Sickness) v0.2.0

基于 iOS Vehicle Motion Cues 的设计理念，使用 **Android 原生 ForegroundService + WindowManager** 实现的防晕车助手，通过屏幕边缘的动态圆点帮助缓解乘车时的晕车症状。完整适配 Android 16 (API 36)。

## ✨ 核心功能

- 🎯 **原生悬浮窗** - 使用 `TYPE_APPLICATION_OVERLAY` 系统级悬浮窗，覆盖在任何 App 之上
- 🌀 **传感器融合** - 基于 `TYPE_ROTATION_VECTOR` 融合加速度计和陀螺仪数据
- 🎨 **动态圆点** - 屏幕上下边缘各 8 个圆点（共 16 个），随车辆运动方向移动
- ⚡ **实时响应** - 60Hz 采样率，SENSOR_DELAY_GAME 模式
- 🔋 **后台运行** - Foreground Service 后台持续运行
- 🤖 **Android 16 适配** - 完整适配 Android 16 (API 36) 的所有新限制
- 📳 **乘车检测** - 通过加速度计阈值法识别 IN_VEHICLE / WALKING / STILL
- 🤸 **4 种练习模式** - shake / swipe / twist / auto

## 🏗️ 技术架构

```
React Native (JS)                       ←  UI + 服务控制（Home/VehicleMotion/CarDetection）
       ↓
OverlayModule (Native Module 桥接)     ←  useOverlayService.ts
       ↓
OverlayService (Foreground Service)     ←  原生 Kotlin (specialUse)
       ↓
SensorManager → SensorFusion → MotionAnalyzer → PredictionEngine
       ↓
OverlayManager → OverlayView (Canvas 16 圆点)
       ↓
TYPE_APPLICATION_OVERLAY 窗口
```

### 关键组件

| 组件 | 功能 |
|------|------|
| **OverlayService** | Android 前台服务，集成 SensorManager |
| **OverlayView** | 自定义 View，使用 Canvas 绘制圆点 |
| **OverlayManager** | 管理 TYPE_APPLICATION_OVERLAY 悬浮窗 |
| **OverlayModule** | React Native Native Module 桥接 |
| **SensorFusion** | 旋转矢量→世界坐标系，EMA 滤波 |
| **MotionAnalyzer** | 状态机检测运动（TurnLeft/TurnRight/Accelerating/Braking） |
| **PredictionEngine** | 一阶 + 二阶运动预测，提前 300ms 渲染 |

## 📊 关键参数

| 参数 | 值 |
|------|-----|
| EMA alpha | 0.15 |
| 左转阈值 | gyroZ > 0.3 rad/s |
| 右转阈值 | gyroZ < -0.3 rad/s |
| 加速阈值 | accY > 1.2 m/s² |
| 刹车阈值 | accY < -1.2 m/s² |
| 预测时间 | 300ms |
| 圆点数量 | 16 (上 8 下 8) |
| 最大偏移 | 60dp |
| 采样率 | 16ms (~60Hz) |
| 窗口类型 | TYPE_APPLICATION_OVERLAY |

> 阈值常量定义于 [`src/utils/constants.ts`](./src/utils/constants.ts)

## 🤖 Android 16 适配要点

| 规范项 | 处理 |
|--------|------|
| 预测性返回手势 | `app.json` 中 `predictiveBackGestureEnabled: true`，原生 `enableOnBackInvokedCallback="true"` |
| 边缘到边缘 | `app.json` 中 `edgeToEdgeEnabled: true`，原生 `WindowCompat.setDecorFitsSystemWindows(window, false)` |
| 前台服务类型 | `foregroundServiceType="specialUse"` + `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` |
| 16KB 页面对齐 | Gradle/CMake 配置 `max-page-size=16384` |
| 强制权限 | `SYSTEM_ALERT_WINDOW` + `POST_NOTIFICATIONS`（Android 13+） |
| 状态栏 | `androidStatusBar` 显式声明 `barStyle` 与 `backgroundColor` |

## 🚀 快速开始

### 安装 APK

前往 [Releases](https://github.com/sctale/anti-motion-sickness/releases) 下载最新版本的 APK。

### 真机测试步骤

1. 安装 APK 到 Android 设备（Android 6.0+，推荐 Android 14+）
2. 启动 App → 点击"启动 Vehicle Motion"
3. **首次启动**：授予"显示在其他应用上层"权限
4. 返回 App → 点击"▶ 启动"
5. **观察**：圆点出现在屏幕上下边缘
6. **摇晃手机**：圆点随运动方向移动
7. **切换到微信/浏览器**：圆点仍然显示，覆盖在其他 App 上

### 开发环境

```bash
# 1. 安装依赖
npm install

# 2. 生成 Android 原生代码
npx expo prebuild --platform android --no-install

# 3. 编译 Release APK
cd android
.\gradlew assembleRelease

# APK 路径: android/app/build/outputs/apk/release/app-release.apk
```

## 📱 兼容性

- **最低 Android 版本**: Android 6.0 (API 23)
- **目标 Android 版本**: Android 16 (API 36)
- **推荐 Android 版本**: Android 14+ (API 34+)
- **传感器要求**: 加速度计 + 陀螺仪
- **权限要求**: SYSTEM_ALERT_WINDOW, FOREGROUND_SERVICE, POST_NOTIFICATIONS

## 📁 项目结构

```
anti-car-sickness-rn/
├── App.tsx                              # 入口（Home 多入口）
├── app.json                             # Expo 配置（Android 16 适配）
├── package.json                         # npm 依赖
├── android/                             # prebuild 生成（已 gitignore）
│   └── app/src/main/
│       ├── AndroidManifest.xml          # Android 清单
│       └── java/com/anonymous/anticarsicknessrn/
│           ├── MainActivity.kt          # 主 Activity
│           ├── MainApplication.kt       # Application
│           ├── OverlayService.kt        # 前台服务 ⭐
│           ├── OverlayView.kt           # 自定义 View ⭐
│           ├── OverlayManager.kt        # 悬浮窗管理 ⭐
│           ├── OverlayModule.kt         # RN 桥接 ⭐
│           ├── OverlayPackage.kt        # RN Package ⭐
│           ├── SensorFusion.kt          # 传感器融合 ⭐
│           ├── MotionAnalyzer.kt        # 运动分析 ⭐
│           └── PredictionEngine.kt      # 预测引擎 ⭐
├── src/
│   ├── hooks/
│   │   ├── useOverlayService.ts         # 服务控制 Hook
│   │   ├── useVehicleMotion.ts          # 运动数据 Hook
│   │   ├── useActivityRecognition.ts    # 乘车检测 Hook
│   │   ├── useAntiSickness.ts           # 练习模式 Hook
│   │   ├── useVibrationService.ts       # 震动服务 Hook
│   │   └── useMotionDetection.ts        # 动作识别 Hook
│   ├── screens/
│   │   ├── VehicleMotionScreen.tsx      # 主功能屏
│   │   └── CarDetectionScreen.tsx       # 乘车检测屏
│   ├── components/
│   │   ├── ModeSelector.tsx             # 模式选择
│   │   ├── ExerciseView.tsx             # 练习视图
│   │   └── CompleteScreen.tsx           # 完成页
│   ├── services/                        # JS 端后备实现
│   │   ├── SensorService.ts
│   │   ├── SensorFusion.ts
│   │   ├── MotionAnalyzer.ts
│   │   └── PredictionEngine.ts
│   └── utils/
│       ├── constants.ts                 # 统一常量 ⭐
│       ├── types.ts                     # 类型定义
│       ├── coordinate.ts                # 坐标变换
│       └── filter.ts                    # EMA / Kalman
└── assets/                              # 图标资源
```

## 🔧 已知限制

- AVD 模拟器对陀螺仪支持有限，建议真机测试
- 部分国产 ROM（小米、华为、OPPO）需要在系统设置中额外允许后台运行
- 16KB 页面设备需要原生 SO 库对齐（已在 Gradle 配置）

## 📝 版本历史

详见 [CHANGELOG.md](./CHANGELOG.md)

## 📄 License

MIT License

## 👤 作者

[sctale](https://github.com/sctale)