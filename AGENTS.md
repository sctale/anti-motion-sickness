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
  "expo-constants": "~56.0.4",
  "expo-haptics": "^56.0.3",
  "expo-sensors": "^56.0.5",
  "expo-system-ui": "~56.0.5",
  "react": "19.2.3",
  "react-native": "0.85.3",
  "react-native-safe-area-context": "~5.6.0"
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
SensorManager → SensorFusion → MotionCueEngine
       ↓
OverlayManager → OverlayView (Canvas 绘制左右两列圆点)
       ↓
TYPE_APPLICATION_OVERLAY 窗口
```

### 原生 Android 模块结构

原生源码**纳入版本管理**，存放于 `native/android/`，由 Config Plugin 在 prebuild 时注入 `android/`：

```
plugins/withOverlayModule.js   # Config Plugin：复制 .kt（改写包名）+ 注册 service/Package + 通知图标
native/android/
├── OverlayService.kt        # 前台服务：传感器注册/回退、息屏暂停、通知与「停止」操作 ⭐
├── OverlayView.kt           # Canvas 自定义 View：左右各 8 个圆点，白点 + 深色描边 ⭐
├── OverlayManager.kt        # WindowManager 悬浮窗管理（不聚焦、不拦截触摸）⭐
├── OverlayModule.kt         # RN 桥接：权限 / 启停 / isServiceRunning ⭐
├── OverlayPackage.kt        # RN Package 注册 ⭐
├── SensorFusion.kt          # 世界坐标系融合、重力扣除回退、世界垂直轴偏航角速度 ⭐
├── MotionCueEngine.kt       # 姿态自适应方向映射、死区、临界阻尼弹簧、自动模式 ⭐
└── RotationMath.kt          # 旋转矢量 → 旋转矩阵（纯数学，与 Android 约定一致）

# prebuild 后会被注入到：
# android/app/src/main/java/com/anonymous/anticarsicknessrn/
```

> ⚠️ 不要直接修改 `android/` 下的 Kotlin 文件（prebuild 会重建）。所有原生改动请改 `native/android/`。
> ⚠️ `.gitignore` 必须用根锚定 `/android/`，否则 `native/android/` 会被一并忽略（历史踩坑）。

### React Native 代码结构

```
src/
├── hooks/
│   ├── useOverlayService.ts      # 控制原生服务（权限 / 启停 / 自动模式 / 运行状态同步）
│   ├── useActivityRecognition.ts # 乘车检测（扣除重力的线性加速度）
│   └── useVibrationService.ts    # 震动服务
├── screens/
│   ├── VehicleMotionScreen.tsx   # 主功能屏（含自动模式开关）
│   └── CarDetectionScreen.tsx    # 乘车检测屏
└── utils/
    └── constants.ts              # JS 层常量（乘车检测 / 震动；运动学参数在原生层）
```

**注意**：实际运动处理在 **原生 Kotlin** 层（`OverlayService.kt` / `MotionCueEngine.kt`），JS 层只是服务控制。

### 运动提示算法（对标 Apple Vehicle Motion Cues）

方向语义（模拟「车窗外景物流向」）：

| 车辆运动 | 圆点运动 |
|---------|---------|
| 加速前进 | 自上而下流动 |
| 刹车 | 自下而上流动 |
| 左转 | 整体向右移动 |
| 右转 | 整体向左移动 |

实现要点：

1. **转向检测用世界垂直轴偏航角速度**（`R · gyro`，与手持姿态无关）。**不要**直接用设备 Z 轴陀螺仪：竖握手机时车头转向的分量在设备 Y 轴上，只用 Z 轴会完全无响应。
2. **前进方向由姿态自适应推断**：竖握时 ≈ 屏幕背面朝向（手机顶部朝上、屏幕朝乘客），平放时 ≈ 屏幕上边缘朝向，按屏幕倾角平滑混合。
3. **不要使用世界坐标 Y 轴（磁北）作为前进方向** —— 车头朝向与磁北无关。
4. 横向提示同时使用偏航角速度（瞬时、跟手）与横向加速度（转弯持续力），两者符号一致。
5. 使用临界阻尼弹簧平滑，不使用一阶/二阶「提前 N ms 预测」。

### 关键参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 圆点数量 | 16（左右各 8） | 纵向分布 15%~85% 屏高 |
| 边缘带宽度 | ≤ 56dp | 圆点不侵入内容区 |
| 水平 / 垂直最大位移 | ±40dp / ±48dp | 转向 / 加减速 |
| 偏航增益 | 110 dp/(rad/s) | 转向瞬时响应 |
| 横向 / 纵向加速度增益 | 20 / 24 dp/(m/s²) | 转弯持续力 / 加减速 |
| 死区 | 0.12 m/s²，0.015 rad/s | 抑制静止噪声 |
| 弹簧 | ω=12 rad/s，ζ=1.0 | 无过冲，约 0.25s 跟上 |
| 自动模式静止超时 | 10s（淡出 0.8s） | 对标 Apple「自动」 |
| 采样率 | SENSOR_DELAY_GAME | ~50-100Hz，息屏暂停 |
| 窗口类型 | TYPE_APPLICATION_OVERLAY | 系统级悬浮窗，不拦截触摸 |

> 运动学参数定义于 [`native/android/MotionCueEngine.kt`](./native/android/MotionCueEngine.kt) 的 `CueConfig`；
> 绘制参数定义于 [`native/android/OverlayView.kt`](./native/android/OverlayView.kt) 常量；
> JS 层常量见 [`src/utils/constants.ts`](./src/utils/constants.ts)。

### 算法验证（改算法后必须跑）

核心算法是纯 Kotlin、不依赖 Android API，可在 JVM 上回归：

```bash
bash tools/verify/run.sh
```

覆盖 11 个场景：竖握/平放 × 加速/刹车/左转/右转、车头朝任意朝向、噪声抑制、自动模式、重力回退、极端限幅。
修改 `SensorFusion.kt` / `MotionCueEngine.kt` / `RotationMath.kt` 后必须全部断言通过。

### AndroidManifest 关键配置

```xml
<!-- 权限 -->
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>

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
| 预测性返回手势 | `app.json` 中 `predictiveBackGestureEnabled: true` |
| 边缘到边缘 | Android 16 强制执行（无需配置）；UI 用 `react-native-safe-area-context` 处理安全区 |
| 前台服务类型 | `foregroundServiceType="specialUse"` + `PROPERTY_SPECIAL_USE_FGS_SUBTYPE`（Config Plugin 注入） |
| 16KB 页面对齐 | Gradle/CMake 配置 `max-page-size=16384`（生成项目后需手动添加） |
| 状态栏 | 各屏用 RN `StatusBar` 组件显式声明（`androidStatusBar` / `edgeToEdgeEnabled` 在新版 Expo 已失效，勿再使用） |

---

## 🚀 发布流程

### 📌 构建策略

**默认本地构建（Windows + Android SDK）；GitHub Actions 仅保留「手动触发」的 APK 构建工作流。**

| 项目 | 策略 |
|------|------|
| 首选构建环境 | 开发者本地 Windows + Android SDK |
| 本地构建 | `npx expo prebuild` + `gradlew assembleRelease`（`release.ps1` 一键完成） |
| GitHub 构建 | [`.github/workflows/android-release.yml`](./.github/workflows/android-release.yml)（**仅 `workflow_dispatch` 手动触发**，无 push 自动触发，不消耗配额） |
| 发布方式 | `gh release upload` / 工作流内自动 `gh release create` |
| 测试方式 | 用户下载 APK 真机测试 |

何时用 GitHub 构建：本地没有 Android SDK / Gradle 环境（如纯云端开发）时，用 Actions 出包。
**注意**：工作流使用 debug 签名（与本地一致，仅够真机测试安装，不可上架应用商店）；签名密钥不落库。

**真机测试策略**：构建 APK（本地或 Actions）→ 上传 GitHub Release → 用户手机真机测试。

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

排障顺序（按发生概率）：

1. **自动模式**：默认开启，「自动模式」下车辆静止时圆点会淡出（这是预期行为）。先确认开关或先在真机上摇动/开车测试。
2. **传感器数据为空**：检查设备是否有 `TYPE_ROTATION_VECTOR` 与（`TYPE_LINEAR_ACCELERATION` 或 `TYPE_ACCELEROMETER`）；服务会打印/降级处理。
3. **启动后立即停止**：`OverlayService.isRunning` 为 false —— 检查悬浮窗权限是否被撤销、通知权限与国产 ROM 的后台限制。
4. **方向不对**：先跑 `bash tools/verify/run.sh` 验证算法（无需真机）；再确认手机不是「屏幕朝上平放且顶部朝向乘客」这类反直觉姿态。
5. **辅助手段**：`adb shell dumpsys activity services <包名>` 确认服务存活；`adb logcat | grep Overlay` 查看异常。

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

# ===== 算法验证（无需真机，改算法后必跑）=====
bash tools/verify/run.sh

# ===== GitHub Actions 出包（本地无 Android SDK 时）=====
gh workflow run android-release.yml          # 手动触发构建 + 发布 Release
gh run watch                                 # 观察进度
gh run view --log-failed                     # 失败时看日志

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
native/android/            # 原生 Kotlin 源码（8 个文件，必须入库）⭐
plugins/                   # Config Plugin（prebuild 注入原生层）⭐
tools/verify/              # 算法验证台（JVM 运行，无需真机）
.github/workflows/         # 手动触发的 APK 构建工作流（唯一允许的 CI 文件）
assets/                    # 图标资源
release.ps1                # 一键发布脚本
generate_icons.ps1         # 图标生成
replace_icons.ps1          # 图标替换
LICENSE                    # MIT
```

### 不包含在 GitHub 中的文件（.gitignore）

```
node_modules/              # npm 包
/android/                  # Expo prebuild 产物（根锚定，勿写成 android/，否则会误吞 native/android）
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
