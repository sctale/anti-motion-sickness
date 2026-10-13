# 更新日志 (Changelog)

## [0.3.0] - 2026-10-11

**主题：对标行业第一方案重写运动提示算法 + 原生模块真正入库**

### 🎯 对标重构（Apple Vehicle Motion Cues / Google Motion Assist）

针对「顶尖方案」逐项对齐，并以 The Verge 实测、Google 官方支持页、Popular Science 等公开资料确定方向语义：

- **圆点布局改为左右两侧**（各 8 个，共 16 个）：此前为上 8 下 8。Apple 官方明确「圆点位于屏幕两侧、避免干扰内容」，本项目同时把位移限制在 56dp 边缘带内。
- **方向语义对齐「车窗外景物流向」**：加速前进 → 圆点自上而下；刹车 → 自下而上；左转 → 整体右移；右转 → 整体左移（与 The Verge 实测「右转圆点左移、刹车圆点上滑」一致）。
- **转向检测改用世界垂直轴偏航角速度**：原实现只取设备 Z 轴陀螺仪，**竖握手机时车头转向分量在设备 Y 轴上，导致转向完全无响应**（已用 JVM 验证台量化：旧实现读数 0.00 rad/s，新实现 0.40 rad/s）。
- **前进方向改为姿态自适应推断**：竖握时取屏幕背面朝向、平放时取屏幕上边缘朝向，按倾角平滑混合；**废弃「世界 Y 轴（磁北）加速度」**——车头朝向与磁北无关（车头朝东时旧实现完全失效）。
- **平滑改为临界阻尼弹簧**（ω=12 rad/s，ζ=1.0）替代「一阶/二阶提前 300ms 预测」，无过冲、约 0.25s 跟上。
- **新增自动模式**：检测到车辆运动淡入、静止约 10s 淡出，对标 Apple「自动」/ Google「Start in a moving vehicle」；App 内提供开关。
- **传感器回退链**：`TYPE_LINEAR_ACCELERATION` → 加速度计 − `TYPE_GRAVITY` → 加速度计低通估重力。
- **息屏暂停传感器**（省电）、通知栏新增「停止」操作、注入专用通知小图标。

### 🐛 关键修复

- **原生源码未真正入库（Critical）**：`.gitignore` 的 `android/` 规则是「任意层级」匹配，`native/android/` 被一并忽略，导致上一轮「原生模块入库」实际失效。已改为根锚定 `/android/`、`/ios/`。
- **乘车检测未扣除重力（Critical）**：加速度计单位是 g，静止时合矢量约 1g，原阈值把静止误判为 `IN_VEHICLE`。已改为 `|magnitude − 1g|`（新增常量 `GRAVITY_G`）。
- **release.ps1 不递增 versionCode（Critical）**：原 `Update-Version -JsonKey "android.versionCode"` 匹配不到数字字段，versionCode 恒为 202。新增 `Update-VersionCode` 按 `major*10000+minor*100+patch` 写入。
- **启动成功判定**：`startService` 现在等待服务真实运行（`OverlayService.isRunning`）后再 resolve，失败给出明确原因；新增 `isServiceRunning` 供界面同步状态。
- **缺少原生模块时误报权限问题**：新增 `isSupported` 区分「模块缺失」与「缺权限」。
- **useVibrationService**：删除重复 effect；`Haptics` 调用补异常捕获。
- **CarDetectionScreen**：补状态栏样式、类型化回调、移除未使用变量。
- **app.json 清理**：移除已失效的 `androidStatusBar`、`edgeToEdgeEnabled`（新版 Expo 构建时告警「no effect」）、未使用的 `WAKE_LOCK` / `HIGH_SAMPLING_RATE_SENSORS` 权限。

### ♻️ 重构 / 清理

- 删除不可达死代码：`src/services/*`、`useVehicleMotion`、`useAntiSickness`、`useMotionDetection`、`components/*`、`src/assets/*.json`、`utils/{types,coordinate,filter}.ts`。
- 依赖调整：移除 `lottie-react-native`、`react-native-reanimated`、`expo-local-authentication`、`expo-status-bar`；新增 `expo-constants`、`react-native-safe-area-context`。
- **版本号单一数据源**：`App.tsx` 通过 `expo-constants` 读取 `app.json.expo.version`。
- 原生算法层拆分为纯 Kotlin（`RotationMath` / `SensorFusion` / `MotionCueEngine`），不依赖 Android API。

### 🧪 验证（新增）

- 新增 [`tools/verify/`](./tools/verify/) 算法验证台：`bash tools/verify/run.sh` 在 JVM 上以合成传感器数据回归 11 个场景、22 项断言（竖握/平放 × 加速/刹车/左转/右转、车头朝东、噪声抑制、自动模式淡入淡出、重力回退、极端限幅），当前全部通过。

### 📜 文档同步

- README 新增「与行业方案对标」表；AGENTS 新增算法设计要点与验证命令；采样率、圆点布局等描述全部更新。

### ⚖️ 许可

- 修正 [`LICENSE`](./LICENSE) 版权归属：原为 Expo 模板自带的 `Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)`，改为 `Copyright (c) 2026 sctale`。
- `package.json` 补充 `"license": "MIT"` 字段。

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