# 更新日志 (Changelog)

## [0.3.0] - 2026-10-11

### 🐛 关键修复

- **原生模块入库（Critical）**: 此前 `OverlayModule` / `OverlayService` 等原生源码只存在于被 gitignore 的 `android/` 目录，新克隆仓库 `prebuild` 后原生模块缺失、悬浮窗功能整体失效。现改为 `native/android/*.kt` 纳入版本管理，并通过 Config Plugin [plugins/withOverlayModule.js](./plugins/withOverlayModule.js) 在 prebuild 时自动注入 + 注册 service/Package。
- **乘车检测未扣除重力（Critical）**: 加速度计单位是 g，静止时合矢量约 1g，原阈值判定把所有静止/轻晃都判为 `IN_VEHICLE`。已改为 `|magnitude - 1g|` 计算线性加速度（新增常量 `GRAVITY_G`）。
- **release.ps1 不递增 versionCode（Critical）**: 原 `Update-Version -JsonKey "android.versionCode"` 匹配不到数字字段，导致每个版本 versionCode 恒为 202、无法覆盖安装。新增 `Update-VersionCode` 按 `major*10000+minor*100+patch` 正确写入。
- **缺少原生模块时误报权限问题**: `useOverlayService` 新增 `isSupported`，缺原生模块时给出明确提示并让 `startService` 抛错。
- **useVibrationService**: 删除重复的第二个 effect；`Haptics.impactAsync` 补充异常捕获。
- **CarDetectionScreen**: 修复状态栏样式缺失、移除未使用变量。

### ♻️ 重构 / 清理

- 删除不可达死代码：`src/services/*`、`useVehicleMotion`、`useAntiSickness`、`useMotionDetection`、`components/*`（ModeSelector/ExerciseView/CompleteScreen）、`src/assets/*.json`、`utils/{types,coordinate,filter}.ts`。
- 依赖调整：移除 `lottie-react-native`、`react-native-reanimated`、`expo-local-authentication`、`expo-status-bar`（均未使用）；新增 `expo-constants`（读取版本号）、`react-native-safe-area-context`。
- **版本号单一数据源**: `App.tsx` 改为通过 `expo-constants` 读取 `app.json.expo.version`，消除硬编码漂移。

### 🤖 Android 16

- edge-to-edge 安全区改用 `react-native-safe-area-context`（RN 内置 `SafeAreaView` 在 Android 无效）。

### 📜 文档同步

- README / AGENTS 更新项目结构、依赖清单、原生源码注入说明；采样率描述统一为 SENSOR_DELAY_GAME。

---

## [0.2.2] - 2026-06-21

### 📌 流程固化

- **明确本地构建策略**：本项目全部本地构建，不使用 GitHub Actions / CI（节省 Actions 配额和 storage）
- `.gitignore` 增加 CI/CD 配置屏蔽：`.github/workflows/`、`.circleci/`、`.travis.yml`、`.gitlab-ci.yml`、`azure-pipelines.yml`、`Jenkinsfile`
- 所有发布通过 `release.ps1` 一键脚本完成（本地 prebuild + gradlew assembleRelease + gh release upload）

### 📜 文档同步

- [AGENTS.md](./AGENTS.md) - 新增「构建策略」表格，明确不使用 GitHub Actions 的理由
- [README.md](./README.md) - 「开发者：构建 + 发布」章节增加本地构建声明

### 🗑️ 清理

- 合并目录：删除废弃的 `anti-car-sickness-rn/`（仅含 Gradle 缓存残留），统一使用 `anti-car-sickness/`

---

## [0.2.1] - 2026-06-21

### 🔄 流程变更

- **真机测试策略**：放弃 AVD 模拟器测试，改为「开发者本地构建 → GitHub Release → 用户真机测试」
- **`release.ps1` 一键发布**：自动完成版本号 bump、prebuild、图标替换、APK 构建、版本验证、APK 复制、git tag、gh release upload 全流程
- **`generate_icons.ps1` / `replace_icons.ps1` 路径修复**：从硬编码 `D:\V-Coding\anti-car-sickness-rn` 改为 `$PSScriptRoot`，可任意位置调用

### 📜 文档同步

- [AGENTS.md](./AGENTS.md) 重写：删除 AVD 相关章节，新增「一键发布流程」「真机测试步骤」
- [README.md](./README.md) 同步：移除 AVD 描述，新增 `release.ps1` 入口

---

## [0.2.0] - 2026-06-21

### 🐛 关键 Bug 修复

- **依赖缺失**: `lottie-react-native` 与 `react-native-reanimated` 之前未安装却被 4 个文件引用，运行崩溃。已加回 `package.json`。
- **SensorService 旋转矢量赋值错误**: 之前 `rotationVectorData = [accelerometer.x, .y, .z]`，把加速度计当旋转矢量。已修复为占位 `[0,0,0,0]`，由原生层注入。
- **SensorFusion EMA 封装破坏**: 之前绕过 `updateEMAFilter` 直接赋值 `gyroFilter.z.value`。已统一调用 `updateEMAFilter`。
- **MotionAnalyzer 阈值不一致**: 阈值 0.05/0.5 与 README 声明的 0.3/1.2 不一致。已抽取到 `utils/constants.ts` 统一管理。
- **PredictionEngine 二阶预测空实现**: 之前 y 永远为 0。已实现真正的角加速度估计和 jerk 估计。
- **useAntiSickness 时序错乱**: `mode` 在 `setState` 之前被读取。已用 `modeRef` 修复。
- **useOverlayService cleanup 闭包**: 依赖 `isRunning` 旧值。已用 `isRunningRef` 修复。
- **死代码清理**: 删除未引用的 `useOverlayPermission.ts`。
- **路由缺失**: `CarDetectionScreen` 已实现但未挂载。已加入 Home → CarDetection 入口。

### ✨ 新增功能

- **Home 屏多入口**: 新增"乘车检测"入口卡片。
- **统一常量文件**: `src/utils/constants.ts` 集中所有阈值、采样率、滤波器参数。
- **FusionData 扩展**: 增加 `filteredGyroZ` 字段，避免重复滤波。

### 🤖 Android 16 (API 36) 适配

- `predictiveBackGestureEnabled: true`（应用预测性返回手势）
- `edgeToEdgeEnabled: true`（边缘到边缘显示）
- `newArchEnabled: true`（启用新架构）
- `versionCode: 200`（基于 0.2.0 = 200）
- `app.json` 配置 `androidStatusBar` 显式声明状态栏样式

### 🔧 技术栈

- React Native 0.85.3
- Expo SDK 56
- Kotlin 2.x
- Android Gradle Plugin（兼容 16KB 页面对齐）

### 📦 依赖

- expo ~56.0.8
- expo-haptics ^56.0.3
- expo-local-authentication ^56.0.4
- expo-sensors ^56.0.5
- expo-status-bar ~56.0.4
- lottie-react-native ^7.3.8
- react-native-reanimated ^4.4.0
- react 19.2.3
- react-native 0.85.3

---

## [0.1.0] - 2026-06-21

### ✨ 新增功能

- **原生 Android 悬浮窗**
  - 使用 `TYPE_APPLICATION_OVERLAY` 系统级悬浮窗
  - 覆盖在其他 App 之上显示
  - 支持微信、浏览器等任何应用

- **前台服务（Foreground Service）**
  - 持续运行传感器监听
  - 显示持久通知
  - Android 16 完整适配（`foregroundServiceType="specialUse"`）

- **传感器融合**
  - 使用 `TYPE_ROTATION_VECTOR` 融合加速度计和陀螺仪
  - EMA 滤波（alpha=0.15）平滑数据
  - 转换为世界坐标系

- **运动分析器**
  - 状态机检测：TurnLeft / TurnRight / Accelerating / Braking / Straight
  - 检测阈值：gyroZ > 0.3 rad/s，accY > 1.2 m/s²

- **预测引擎**
  - 一阶预测：θ + ωΔt
  - 二阶预测：θ + ωΔt + 0.5αΔt²
  - 预测时间：300ms

- **圆点渲染**
  - 屏幕上下边缘各 8 个圆点（共 16 个）
  - Canvas 自定义 View 绘制
  - 圆点大小 12dp，颜色 #6366F1
  - 最大偏移 60dp

### 🔧 技术栈

- React Native 0.85.3
- Expo SDK 56
- Kotlin 2.x
- Android Gradle Plugin
- ForegroundService + WindowManager

### 📦 依赖

- expo-sensors ^56.0.5
- expo-status-bar ~56.0.4
- react-native-reanimated ^4.4.0
- lottie-react-native ^7.3.8