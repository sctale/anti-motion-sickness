# Anti Motion Sickness 项目开发规范

## 项目简介

防晕车助手是基于 **Android 原生 ForegroundService + WindowManager** 实现的 iOS Vehicle Motion Cues 风格 App，通过屏幕边缘的动态圆点帮助缓解乘车时的晕车症状。

### 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React Native + Expo SDK 56 |
| 版本 | React Native 0.85.3 / React 19.2.3 / TypeScript 6.0 |
| 原生层 | Kotlin 2.x (ForegroundService、Custom View、WindowManager) |
| 传感器 | Android SensorManager (TYPE_ROTATION_VECTOR) |
| 悬浮窗 | TYPE_APPLICATION_OVERLAY 系统级窗口 |
| 最低支持 | Android 6.0 (API 23) |
| 目标 | Android 16 (API 36) |

---

## Expo 版本

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

当前使用的依赖：

```json
{
  "expo": "~56.0.8",
  "expo-haptics": "^56.0.3",
  "expo-local-authentication": "^56.0.4",
  "expo-sensors": "^56.0.5",
  "expo-status-bar": "~56.0.4",
  "lottie-react-native": "^7.3.8",
  "react": "19.2.3",
  "react-native": "0.85.3",
  "react-native-reanimated": "^4.4.0"
}
```

---

## 关键技术架构

```
React Native (JS)
       ↓
OverlayModule (Native Module 桥接)
       ↓
OverlayService (Foreground Service)
       ↓
SensorManager → SensorFusion → MotionAnalyzer → PredictionEngine
       ↓
OverlayManager → OverlayView (Canvas 绘制 16 个圆点)
       ↓
TYPE_APPLICATION_OVERLAY 窗口
```

### 原生 Android 模块结构

```
android/app/src/main/java/com/anonymous/anticarsicknessrn/
├── MainActivity.kt          # 主 Activity（android:screenOrientation="portrait"）
├── MainApplication.kt       # Application（注册 OverlayPackage）
├── OverlayService.kt        # Foreground Service ⭐ 核心
├── OverlayView.kt           # Canvas 自定义 View，绘制 16 个圆点 ⭐
├── OverlayManager.kt        # WindowManager 悬浮窗管理 ⭐
├── OverlayModule.kt         # React Native Native Module ⭐
├── OverlayPackage.kt        # React Native Package 注册 ⭐
├── SensorFusion.kt          # 旋转矢量 → 世界坐标系 + EMA 滤波 ⭐
├── MotionAnalyzer.kt        # 状态机检测运动 ⭐
└── PredictionEngine.kt      # 一阶/二阶运动预测 ⭐
```

### React Native 代码结构

```
src/
├── hooks/
│   ├── useOverlayService.ts     # 控制原生服务
│   ├── useVehicleMotion.ts      # 运动数据 Hook
│   ├── useActivityRecognition.ts # 乘车检测
│   ├── useAntiSickness.ts       # 练习模式（shake/swipe/twist/auto）
│   ├── useVibrationService.ts   # 震动服务
│   └── useMotionDetection.ts    # 动作识别
├── screens/
│   ├── VehicleMotionScreen.tsx  # 主功能屏
│   └── CarDetectionScreen.tsx   # 乘车检测屏
├── components/                  # UI 组件
├── services/                    # JS 端后备实现
└── utils/
    ├── constants.ts             # 统一常量 ⭐
    ├── types.ts                 # 类型定义
    ├── coordinate.ts            # 坐标变换
    └── filter.ts                # EMA / Kalman
```

**注意**：实际运动处理在 **原生 Kotlin** 层（`OverlayService.kt` 等），JS 层只是简单的服务控制。

### 关键参数

| 参数 | 值 | 说明 |
|------|-----|------|
| EMA alpha | 0.15 | 指数移动平均滤波系数 |
| 左转阈值 | gyroZ > 0.3 rad/s | 陀螺仪 Z 轴角速度 |
| 右转阈值 | gyroZ < -0.3 rad/s | 陀螺仪 Z 轴角速度 |
| 加速阈值 | accY > 1.2 m/s² | 加速度计 Y 轴（世界坐标系） |
| 刹车阈值 | accY < -1.2 m/s² | 加速度计 Y 轴（世界坐标系） |
| 预测时间 | 300ms | 一阶/二阶预测提前量 |
| 圆点数量 | 16 (上 8 下 8) | 屏幕边缘圆点 |
| 最大偏移 | 60dp | 圆点最大移动距离 |
| 采样率 | SENSOR_DELAY_GAME | ~50-100Hz |
| 窗口类型 | TYPE_APPLICATION_OVERLAY | Android 系统级悬浮窗 |

> 阈值常量定义于 [`src/utils/constants.ts`](./src/utils/constants.ts)，单点修改即可全局生效。

### AndroidManifest 关键配置

```xml
<!-- 权限 -->
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.WAKE_LOCK"/>
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS"/>
<uses-permission android:name="android.permission.HIGH_SAMPLING_RATE_SENSORS"/>

<!-- 服务 -->
<service
  android:name=".OverlayService"
  android:exported="false"
  android:foregroundServiceType="specialUse">
  <property
    android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
    android:value="Vehicle Motion Cues display to prevent motion sickness"/>
</service>
```

### Android 16 适配要点

| 规范项 | 处理方式 |
|--------|----------|
| 预测性返回手势 | `app.json` 中 `predictiveBackGestureEnabled: true`，原生 `enableOnBackInvokedCallback="true"` |
| 边缘到边缘 | `app.json` 中 `edgeToEdgeEnabled: true`，原生 `WindowCompat.setDecorFitsSystemWindows(window, false)` |
| 前台服务类型 | `foregroundServiceType="specialUse"` + `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` |
| 16KB 页面对齐 | Gradle/CMake 配置 `max-page-size=16384`（生成项目后需手动添加） |
| 状态栏 | `androidStatusBar` 显式声明 `barStyle` 与 `backgroundColor` |

---

## 🚀 一键发布流程（推荐）

**项目采用真机测试策略**：本地构建 APK → 上传 GitHub Release → 用户手机真机测试。不再使用 AVD 模拟器。

### 1. 一键发布到 GitHub

```powershell
# 完整流程：升级 patch 版本号 + prebuild + 构建 + 上传
.\release.ps1

# 升级次版本号
.\release.ps1 -BumpType minor

# 升级主版本号
.\release.ps1 -BumpType major

# 不升级版本号
.\release.ps1 -BumpType none

# 创建 draft release
.\release.ps1 -Draft

# 只上传已构建的 APK（跳过 prebuild + 构建）
.\release.ps1 -UploadOnly

# 自定义 release notes
.\release.ps1 -NotesFile .\custom-notes.md
```

**release.ps1 自动执行的流程**：
1. 检查 git 状态
2. 升级 `app.json` / `package.json` 版本号（默认 patch）
3. 在 `CHANGELOG.md` 添加新版本占位条目
4. 提交版本号变更并 push
5. 执行 `npx expo prebuild --platform android --no-install`
6. 执行 `replace_icons.ps1` 替换图标
7. 执行 `gradlew assembleRelease` 构建 APK
8. 用 `aapt dump badging` 验证 APK 版本号
9. 复制 APK 到根目录 `anti-car-sickness-rn.apk`
10. 创建/更新 git tag
11. 用 `gh release upload` 上传 APK 到 GitHub Release
12. 输出 Release 下载链接

### 2. 真机测试步骤（用户）

1. 收到 Release 链接后访问：https://github.com/sctale/anti-motion-sickness/releases
2. 下载最新版本的 APK（`anti-motion-sickness-vX.Y.Z.apk`）
3. **首次安装**：需要允许"安装来自未知来源的应用"
4. 启动 App → 看到 Home 屏（两个入口：Vehicle Motion / 乘车检测）
5. 点击"启动 Vehicle Motion"
6. **首次启动**：授予"显示在其他应用上层"权限
7. 返回 App → 点击"▶ 启动"
8. **观察**：圆点出现在屏幕上下边缘
9. **摇晃手机**：圆点随运动方向移动
10. **切换到微信/浏览器**：圆点仍然显示，覆盖在其他 App 上
11. 测试完毕后通过 GitHub Issue 反馈问题

### 3. 用户反馈 → 修复 → 重新发布

1. 用户在 GitHub Issue 报告问题
2. 开发者修复代码 → 提交 → push
3. 运行 `.\release.ps1`（自动 bump 版本号 + 构建 + 上传）
4. 用户下载新版本 APK 真机测试

---

## 手动构建流程（备选）

如果 `release.ps1` 失败或需要更细的控制，可以手动执行：

### 1. Prebuild

```powershell
npx expo prebuild --platform android --no-install
```

- 首次或修改了 Config Plugin 时必须执行
- **不要使用 `--clean`**，除非需要完全重建
- 修改 `app.json` 或 `package.json` 后必须 prebuild 一次

**⚠️ 警告**：prebuild 会重置 `android/app/src/main/res/mipmap-*/ic_launcher*.webp` 为 Expo 默认图标，需要运行 `replace_icons.ps1` 恢复自定义图标。

### 2. 替换图标

```powershell
powershell -ExecutionPolicy Bypass -File replace_icons.ps1
```

### 3. 构建 Release APK

```powershell
cd android
.\gradlew assembleRelease
```

- **仅 JS 改动**：约 25 秒
- **Prebuild 增量后**：约 30-60 秒
- **Prebuild `--clean` 后**：约 3-4 分钟
- APK 输出路径：`android\app\build\outputs\apk\release\app-release.apk`

### 4. 验证版本号

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\34.0.0\aapt.exe" dump badging "android\app\build\outputs\apk\release\app-release.apk" | Select-String "package"
```

**必须确认**：
- `versionName` 与 `app.json.expo.version` 一致
- `versionCode` 是 `major*10000 + minor*100 + patch`

### 5. 上传到 GitHub

```powershell
$env:APK = "android\app\build\outputs\apk\release\app-release.apk"
$env:VER = "v0.2.0"
Copy-Item $env:APK ".\anti-car-sickness-rn.apk" -Force
git tag -a $env:VER -m $env:VER
git push origin main; git push origin $env:VER
& "C:\Program Files\GitHub CLI\gh.exe" release upload $env:VER ".\anti-car-sickness-rn.apk#anti-motion-sickness-$env:VER.apk" --repo sctale/anti-motion-sickness --clobber
```

---

## 自动版本号同步

**单一数据源：`app.json.expo.version`**

- `release.ps1` 自动从 `app.json.expo.version` 同步到 `package.json` 和 `android.versionCode`
- 手动构建时，如果 prebuild 后版本号不对，需要修改 `android/app/build.gradle`：
  ```gradle
  versionCode 200
  versionName "0.2.0"
  ```

### 版本号规则

- 新功能 → 次版本号 +1（0.2.0 → 0.3.0）
- Bug 修复 → 修订号 +1（0.2.0 → 0.2.1）
- 破坏性更新 → 主版本号 +1（0.x.x → 1.0.0）
- versionCode 派生：`major*10000 + minor*100 + patch`

---

## 工具脚本

| 脚本 | 作用 |
|------|------|
| `release.ps1` | 一键发布到 GitHub Release（推荐入口） |
| `generate_icons.ps1` | 重新生成 `assets/*.png` 图标源文件 |
| `replace_icons.ps1` | 把 `assets/*.png` 替换到 `android/app/src/main/res/mipmap-*/` |

> 所有脚本都使用 `$PSScriptRoot` 解析路径，可在任意位置调用。

---

## GitHub 工具链

### 1. gh CLI OAuth 登录（推荐，0 token）

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" auth login --hostname github.com --git-protocol https --web
```

- 浏览器 OAuth 一次，本机 `gh` 永久有权限
- 撤销：`gh auth logout`

### 2. GitHub MCP 工具

适合 `create_or_update_file`、`push_files` 等细粒度操作。

### 3. GitHub PAT（紧急情况）

```powershell
$env:GH_TOKEN = "ghp_xxx"
& "C:\Program Files\GitHub CLI\gh.exe" release create ...
```

> ⚠️ 不要把 PAT 直接粘到聊天框——会进对话历史。优先走 `gh auth login`。

---

## 常见问题

### EBUSY: resource busy or locked

- 原因：Gradle daemon 或其他进程占用 `android/` 目录
- 解决：关闭占用进程，或直接运行 `npx expo prebuild --platform android`

### 圆点不移动（真机）

- **传感器数据为空**：检查 `TYPE_ROTATION_VECTOR` 传感器是否存在
- **启动后立即停止**：检查 Foreground Service 通知是否被关闭
- **真机没动**：手动摇晃手机测试

### 圆点不显示在其他 App 上方

- 必须在系统设置中开启"显示在其他应用上层"
- 部分国产 ROM（小米 MIUI、华为 EMUI）需要在权限管理中额外开启
- 检查 `Settings.canDrawOverlays(context)` 是否返回 true

### APK 图标没改

- 原因：`assets/icon.png` 改了但 `android/app/src/main/res/mipmap-*/ic_launcher*.webp` 没更新
- 解决：运行 `powershell -ExecutionPolicy Bypass -File replace_icons.ps1`

### APK 版本号不对

- 原因：忘了用 `app.json.expo.version` 自动同步
- 解决：改 `app.json.expo.version` → prebuild → 验证 `aapt dump badging` → 用 `gh release upload --clobber` 覆盖

### App 启动崩溃

- 检查 `MainApplication.kt` 中 `SoLoader.init(this, false)` 是否正确
- 检查 `AndroidManifest.xml` 是否声明了所有权限和服务
- 检查 `OverlayPackage` 是否在 `MainApplication` 中注册
- 真机可以用 `adb logcat` 抓 stacktrace（开发机调试用）

### PowerShell 不支持 HEREDOC

- 不要使用 `$(cat <<'EOF' ... EOF)` 语法
- 使用简单的单行 commit message，或用 `-m` 参数直接写

### gh CLI 路径

- 正确路径：`C:\Program Files\GitHub CLI\gh.exe`
- 系统 PATH 中的 `gh` 可能指向错误的脚本

### release.ps1 推送失败

- 检查 git 是否有未解决的冲突
- 检查 `gh auth status` 是否已认证
- 检查 `versionCode` 是否与 `versionName` 一致

---

## 快速参考

```powershell
# ===== 推荐：完整发布 =====
.\release.ps1                              # patch 升级
.\release.ps1 -BumpType minor             # minor 升级
.\release.ps1 -BumpType none -UploadOnly  # 只重传当前版本

# ===== 手动分步 =====
npx expo prebuild --platform android --no-install
powershell -ExecutionPolicy Bypass -File replace_icons.ps1
cd android; .\gradlew assembleRelease
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\34.0.0\aapt.exe" dump badging android\app\build\outputs\apk\release\app-release.apk | Select-String "package"

# ===== Git 常用 =====
git add <files>
git commit -m "feat/fix/docs: 中文描述"
git push origin main
git tag -a v0.2.1 -m v0.2.1
git push origin v0.2.1

# ===== gh Release =====
# 创建 release
& "C:\Program Files\GitHub CLI\gh.exe" release create v0.2.1 `
  ".\anti-car-sickness-rn.apk#anti-motion-sickness-v0.2.1.apk" `
  --repo sctale/anti-motion-sickness `
  --title "v0.2.1" `
  --notes-file release_notes.md

# 覆盖 release APK
& "C:\Program Files\GitHub CLI\gh.exe" release upload v0.2.1 `
  .\anti-car-sickness-rn.apk#anti-motion-sickness-v0.2.1.apk `
  --repo sctale/anti-motion-sickness --clobber

# 删除 release
& "C:\Program Files\GitHub CLI\gh.exe" release delete v0.2.1 --repo sctale/anti-motion-sickness --cleanup-tag --yes
```

---

## 目录约定

### 包含在 GitHub 中的文件

```
AGENTS.md                  # 本文档
README.md                  # 项目说明
CHANGELOG.md               # 版本历史
package.json               # npm 依赖
app.json                   # Expo 配置
tsconfig.json              # TypeScript 配置
index.ts                   # 入口
App.tsx                    # 主组件
src/                       # 所有 RN 代码
assets/                    # 图标资源
release.ps1                # 一键发布脚本
generate_icons.ps1         # 图标生成
replace_icons.ps1          # 图标替换
LICENSE                    # MIT
```

### 不包含在 GitHub 中的文件（.gitignore）

```
node_modules/              # npm 包
android/                   # Expo prebuild 产物
.gradle-cache/             # Gradle 缓存
.expo/                     # Expo 缓存
dist/, web-build/          # 构建输出
*.apk, *.aab, *.ipa        # 二进制包
*.log                      # 日志
*.tsbuildinfo              # TS 缓存
.claude/                   # Claude 配置
CLAUDE.md                  # Claude 文档
AGENTS - 副本.md           # 其他项目副本
AGENTS*.md                 # 防止意外添加其他 AGENTS 文件（!AGENTS.md 保留根文件）
anti-car-sickness-refer/   # 参考资料（不发布）
encode-image.ps1           # 旧脚本
run-mmx.bat                # 旧批处理
release_notes.md           # 发布说明
```

---

## 联系方式

- GitHub: https://github.com/sctale
- 项目仓库: https://github.com/sctale/anti-motion-sickness
- Issue: https://github.com/sctale/anti-motion-sickness/issues
