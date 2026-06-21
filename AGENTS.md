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
│   └── useOverlayService.ts    # 控制原生服务的 Hook
├── screens/
│   └── VehicleMotionScreen.tsx # 主界面
├── services/
│   ├── SensorService.ts        # 传感器监听（JS 端备用）
│   ├── SensorFusion.ts         # 传感器融合（JS 端备用）
│   ├── MotionAnalyzer.ts       # 运动分析（JS 端备用）
│   └── PredictionEngine.ts     # 预测引擎（JS 端备用）
├── components/                 # UI 组件
└── utils/                      # 工具函数
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

---

## Android 构建流程（标准流程）

每次修改代码后，按以下步骤构建 APK：

### 1. Prebuild（生成原生代码）

```powershell
cd d:\V-Coding\anti-car-sickness-rn
npx expo prebuild --platform android --no-install
```

- 首次构建或修改了 Config Plugin 时必须执行
- 如果 `android/` 目录被锁定（EBUSY），先关闭占用进程再重试
- **不要使用 `--clean`**，除非明确需要完全重建
- 修改 `app.json` 或 `package.json` 后必须 prebuild 一次

**⚠️ 警告**：prebuild 会重新生成 `android/app/src/main/res/mipmap-*/ic_launcher*.webp` 为 Expo 默认图标。如果已经用 `replace_icons.ps1` 替换过图标，需要重新替换。

### 2. 替换图标（如已自定义）

```powershell
powershell -ExecutionPolicy Bypass -File replace_icons.ps1
```

将 `assets/icon.png`、`android-icon-foreground.png`、`android-icon-background.png`、`android-icon-monochrome.png` 转换为各 DPI 的 WEBP 文件并覆盖默认图标。

### 3. 构建 Release APK

```powershell
cd d:\V-Coding\anti-car-sickness-rn\android
.\gradlew assembleRelease
```

- **仅 JS 改动**（上次 build 后只改了 src/）：约 25 秒
- **Prebuild 增量后**（改了 app.json）：约 30-60 秒
- **Prebuild `--clean` 后**：约 3-4 分钟（native 重编译）
- APK 输出路径：`android\app\build\outputs\apk\release\app-release.apk`
- 复制到根目录：`d:\V-Coding\anti-car-sickness-rn\anti-car-sickness-rn.apk`

### 4. 验证构建结果（强制步骤）

```powershell
# 验证版本号
& "C:\Users\HAOHAO\AppData\Local\Android\Sdk\build-tools\34.0.0\aapt.exe" dump badging "d:\V-Coding\anti-car-sickness-rn\anti-car-sickness-rn.apk" | Select-String "package"
```

**必须确认**：
- `versionName` 与 `app.json.expo.version` 一致
- `versionCode` 是 `major*10000 + minor*100 + patch`（0.1.0 → 100）

---

## 自动版本号同步

**单一数据源：`app.json.expo.version`**

- Expo prebuild 会自动从 `app.json.expo.version` 读取版本号
- 如果 prebuild 后版本号不对，需要手动修改 `android/app/build.gradle`：
  ```gradle
  versionCode 100
  versionName "0.1.0"
  ```

### 版本号规则

- 新功能 → 次版本号 +1（0.1.0 → 0.2.0）
- Bug 修复 → 修订号 +1（0.1.0 → 0.1.1）
- 破坏性更新 → 主版本号 +1（0.x.x → 1.0.0）
- versionCode 派生：`major*10000 + minor*100 + patch`

---

## 版本发布流程

### 1. 发布前检查清单

- [ ] `app.json` → `expo.version` 已更新
- [ ] `package.json` → `version` 与 `app.json` 一致
- [ ] `app.json` → `android.versionCode` 与派生值一致
- [ ] `android/app/build.gradle` → `versionCode`/`versionName` 正确
- [ ] `README.md` → "版本" 信息已同步
- [ ] `CHANGELOG.md` → 顶部已添加新版本记录
- [ ] 跑了 `npx expo prebuild --platform android --no-install`
- [ ] 跑了 `powershell -ExecutionPolicy Bypass -File replace_icons.ps1`
- [ ] `.\gradlew assembleRelease` 成功
- [ ] aapt dump badging 验证版本号

### 2. Git 提交

```powershell
cd d:\V-Coding\anti-car-sickness-rn
git add <相关文件>
git commit -m "feat/fix/docs: 中文描述"
```

- commit message 格式：`feat:` / `fix:` / `docs:` + 中文描述
- **不要 `git add .`**，逐个添加文件避免误提交
- PowerShell 不支持 HEREDOC，commit message 写一行

### 3. 推送到 GitHub

```powershell
git push origin main
```

`android/` 目录在 `.gitignore` 中被排除（`/android`），因此 build.gradle 修改不会进版本控制。

### 4. 创建 GitHub Release（推荐 gh CLI）

```powershell
# 一次性登录（永久有效）
& "C:\Program Files\GitHub CLI\gh.exe" auth login --hostname github.com --git-protocol https --web

# 创建 release
& "C:\Program Files\GitHub CLI\gh.exe" release create v<版本号> `
  "d:\V-Coding\anti-car-sickness-rn\anti-car-sickness-rn.apk#anti-motion-sickness-v<版本号>.apk" `
  --repo sctale/anti-motion-sickness `
  --title "v<版本号>" `
  --notes-file release_notes.md
```

- 使用 `& "C:\Program Files\GitHub CLI\gh.exe"` 而非 `gh`（系统 PATH 中的 gh 可能指向错误脚本）
- APK **必须**上传到 Release（用 `#别名` 语法指定下载显示名）
- 使用 `--notes-file` 而非 `--notes` 避免 PowerShell emoji glob 问题

### 5. 覆盖已发布 release 的 APK

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" release upload v<版本号> `
  d:\V-Coding\anti-car-sickness-rn\anti-car-sickness-rn.apk#anti-motion-sickness-v<版本号>.apk `
  --repo sctale/anti-motion-sickness --clobber
```

### 6. 删除 release

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" release delete v<版本号> --repo sctale/anti-motion-sickness --cleanup-tag --yes
```

### 7. GitHub MCP 工具（替代 git push）

如果不想用 git CLI，可以用 MCP 工具 `mcp_GitHub`：
- `create_or_update_file` - 创建/更新文件
- `create_repository` - 创建仓库
- `push_files` - 批量推送
- `create_branch` - 创建分支

---

## GitHub 工具链（按推荐度排序）

### 1. gh CLI OAuth 登录（推荐，0 token）

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" auth login --hostname github.com --git-protocol https --web
```

- 浏览器 OAuth 一次，本机 `gh` 永久有权限
- 之后 `gh release create` / `gh release upload` / `git push` 都不需要 token
- 撤销：`gh auth logout`

### 2. GitHub MCP 工具（推荐用于文件操作）

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

### 圆点不移动

- **AVD 模拟器**：陀螺仪支持有限，建议真机测试
- **真机未动**：检查是否授予了"显示在其他应用上层"权限
- **传感器数据为空**：检查 `TYPE_ROTATION_VECTOR` 传感器是否存在
- **启动后立即停止**：检查 Foreground Service 通知是否被关闭

### 圆点不显示在其他 App 上方

- 必须在系统设置中开启"显示在其他应用上层"
- 部分国产 ROM（小米 MIUI、华为 EMUI）需要在权限管理中额外开启
- 检查 `Settings.canDrawOverlays(context)` 是否返回 true

### APK 图标没改

- 原因：`assets/icon.png` 改了但 `android/app/src/main/res/mipmap-*/ic_launcher*.webp` 没更新
- 解决：运行 `powershell -ExecutionPolicy Bypass -File replace_icons.ps1`

### APK 版本号不对

- 原因：忘了用 `app.json.expo.version` 自动同步，或者 build.gradle 没改
- 解决：改 `app.json.expo.version` → 修改 `android/app/build.gradle` → 重新 prebuild + assembleRelease → 验证 `aapt dump badging` → 用 `gh release upload --clobber` 覆盖

### App 启动崩溃

- 检查 `MainApplication.kt` 中 `SoLoader.init(this, false)` 是否正确
- 检查 `AndroidManifest.xml` 是否声明了所有权限和服务
- 检查 `OverlayPackage` 是否在 `MainApplication` 中注册
- 用 `adb logcat` 查看具体 stacktrace

### PowerShell 不支持 HEREDOC

- 不要使用 `$(cat <<'EOF' ... EOF)` 语法
- 使用简单的单行 commit message，或用 `-m` 参数直接写

### gh release notes 含 emoji 导致 PowerShell glob 失败

- 现象：`gh release create ... --notes "..."` 里出现 emoji 字符时报 `no matches found`
- 原因：PowerShell 把 emoji 解释为 glob 模式
- 解决：把 notes 写入文件，用 `--notes-file <path>` 代替 `--notes`

### gh CLI 路径

- 正确路径：`C:\Program Files\GitHub CLI\gh.exe`
- 系统 PATH 中的 `gh` 可能指向错误的脚本

### git push 失败 - remote 已有内容

- 现象：`! [rejected] main -> main (fetch first)`
- 解决：使用 `git push -u origin main --force`（首次推送时强制覆盖）

### PowerShell 执行策略阻断 npx / npm

- 现象：`PSSecurityException` 或脚本无法运行
- 解决：用 `powershell -ExecutionPolicy Bypass -Command "..."` 包装

---

## 快速参考（最常用命令速查）

```powershell
# ===== 日常开发 =====
# 启动 dev server
npx expo start

# ===== Prebuild =====
npx expo prebuild --platform android --no-install

# ===== 图标替换 =====
powershell -ExecutionPolicy Bypass -File replace_icons.ps1

# ===== Build =====
cd android; .\gradlew assembleRelease

# 复制 APK 到根目录
Copy-Item "android\app\build\outputs\apk\release\app-release.apk" "anti-car-sickness-rn.apk" -Force

# 验证版本号
& "C:\Users\HAOHAO\AppData\Local\Android\Sdk\build-tools\34.0.0\aapt.exe" dump badging android\app\build\outputs\apk\release\app-release.apk | Select-String "package"

# ===== Git =====
git add <files>
git commit -m "feat/fix/docs: 中文描述"
git push origin main

# ===== GitHub Release =====
# 一次性登录（永久有效）
& "C:\Program Files\GitHub CLI\gh.exe" auth login --hostname github.com --git-protocol https --web

# 创建 release
& "C:\Program Files\GitHub CLI\gh.exe" release create v<版本号> "anti-car-sickness-rn.apk#anti-motion-sickness-v<版本号>.apk" --repo sctale/anti-motion-sickness --title "v<版本号>" --notes-file release_notes.md

# 覆盖已发布 release 的 APK
& "C:\Program Files\GitHub CLI\gh.exe" release upload v<版本号> anti-car-sickness-rn.apk#anti-motion-sickness-v<版本号>.apk --repo sctale/anti-motion-sickness --clobber

# 删除 release
& "C:\Program Files\GitHub CLI\gh.exe" release delete v<版本号> --repo sctale/anti-motion-sickness --cleanup-tag --yes

# ===== AVD 测试 =====
# 启动前台 AVD
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd test-android-36 -no-audio -no-snapshot-load -gpu swiftshader_indirect

# 安装 APK
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r anti-car-sickness-rn.apk

# 启动 App
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell am start -n com.anonymous.anticarsicknessrn/.MainActivity
```

---

## 目录约定

### 包含在 GitHub 中的文件

```
AGENTS.md                  # 本文档
README.md                  # 项目说明
CHANGELOG.md               # 版本历史
package.json               # npm 依赖（version: 0.1.0）
app.json                   # Expo 配置（expo.version: 0.1.0）
tsconfig.json              # TypeScript 配置
index.ts                   # 入口
App.tsx                    # 主组件
src/                       # 所有 RN 代码
assets/                    # 图标资源
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
*.jpg, *.jpeg              # 截图
```

---

## 联系方式

- GitHub: https://github.com/sctale
- 项目仓库: https://github.com/sctale/anti-motion-sickness