# 更新日志 (Changelog)

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