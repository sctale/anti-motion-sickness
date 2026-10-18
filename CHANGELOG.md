# 更新日志 (Changelog)

## [0.3.6] - 2026-10-18

### 🐛 修复

- **APK 清单里 `OverlayService` 被声明两次**：把 v0.3.5 的产物用
  `aapt2 dump xmltree` 打开才看出来 —— 复用中的 `android/` 目录（prebuild 不带 `--clean`）
  留着 v0.2.x 手写的相对名 `.OverlayService`，而 Config Plugin 只按**原始字符串**去重，
  `".OverlayService"` 与 `"com.anonymous.anticarsicknessrn.OverlayService"` 被判定为两个组件，
  于是又追加了一条全限定声明。
  `ensureService()` 现在按**解析后的组件名**判重，把相对名原地归一为全限定名，
  并合并同名重复项。实测连续两次 `expo prebuild` 清单稳定为 2 个 `<service>`（幂等）。
- 文档订正：v0.3.5 变更记录里添加磁贴的 API 名写错（正确入口是
  `StatusBarManager.requestAddTileService(...)`，API 33+），已原地更正。
  错误的 `TileService.requestAddTileService` 在平台 `android.jar` 里不存在，
  编译期由 `Unresolved reference` 拦下，代码自 v0.3.5 起即为正确实现。

### 🧪 验证

- `tsc --noEmit` 通过；`tools/verify/run.sh` 14 场景 31 断言通过；
  `compileReleaseKotlin` 通过；APK 16KB 页对齐校验通过。

---

## [0.3.5] - 2026-10-18

第三轮：**产品闭环**。补上 README 对标表里自己标着 ⚠️ 的两项，并把「两个功能各玩各的」连起来。

### ✨ 新增

- **Quick Settings 磁贴**（[`native/android/MotionCueTileService.kt`](./native/android/MotionCueTileService.kt)）：
  下拉通知栏点一下就能开关圆点。此前唯一的关闭路径是「回到 App 点停止」，
  而圆点正盖在整个屏幕上 —— 对标 Apple 的控制中心 / Google 的 Quick Settings 磁贴。
  - `ACTIVE_TILE=true`：点击直接切换，不跳进 App
  - 缺少悬浮窗权限时才回 App 引导授权（Android 14+ 走 `startActivityAndCollapse(PendingIntent)`）
  - Android 13+ 提供「＋ 添加磁贴」按钮（`StatusBarManager.requestAddTileService`），
    低版本给出「长按快捷设置面板手动拖入」的提示而不是没反应
  - 磁贴声明由 Config Plugin 注入（`BIND_QUICK_SETTINGS_TILE` + `QS_TILE` intent-filter + 图标）
- **灵敏度三档（低 / 中 / 高）**：改变「多大动作算满行程」，运行中即时生效。
  只缩放满行程参考输入（0.55 rad/s / 3.5 / 3.0），不放大位移上限，
  以免重新引入「引擎请求 40dp、View 只给 20dp」的静默裁剪。
- **偏好持久化**：新增 `SettingsStore`（SharedPreferences）作为设置唯一真源，
  自动模式、灵敏度、震动开关、震动频率、乘车联动都记得住。
  刻意**不**用 AsyncStorage：磁贴与前台服务是原生组件，读不到 JS 存储，
  而且省掉一个新依赖。JS 侧用 `useBooleanPreference` / `useStringPreference` 走同一份存储。
- **乘车 → 圆点联动**：乘车检测页新增「乘车时自动开启圆点」开关，
  检测到 `IN_VEHICLE` 且置信度 ≥ 60 时直接启动悬浮窗（仅在本页检测开启期间有效，界面已注明）。
- **通知权限请求**：`requestNotificationPermission()`（Android 13+）。
  通知被隐藏时用户就没法从通知栏停止服务，所以启动时顺带请求一次。
- 首页 Vehicle Motion 卡片显示「圆点运行中」徽标，不用进二级页才知道当前状态。

### ♻️ 重构

- **服务状态改为单例上下文**（`OverlayServiceContext`）：以前每个页面各自
  `useOverlayService()`，两份权限/运行状态可能不同步，且各自注册 AppState 监听。
- **在 App 内返回不再停止服务**：圆点的用途就是盖在其他 App 上，翻页不该把它关掉；
  停止只由「停止」按钮、通知栏动作和磁贴触发。界面文案同步说明。
- `startService()` 不再接收 `autoMode` 参数 —— 设置只有一个真源，
  服务每次 `onStartCommand` 从 `SettingsStore` 重读（磁贴、App、系统重启服务走同一路径）。
  设置变更后重新投递启动命令，同时再次 `startForeground` 以满足 Android 8+ 的时限要求。
- `OverlayModule` 新增 `getSettings` / `updateSettings` / `isOverlayShown` /
  `canRequestAddTile` / `requestAddTile` / `getStringPref` / `setStringPref`，
  并在 `src/native/OverlayNative.ts` 声明对应的 TS 契约（不再是 any）。
- `useActivityRecognition`：`onActivityChanged` 改为可选并放进 ref
  （调用方每次渲染换新函数会反复重建监听器）；删掉只写不读的 `accumulatorRef`；
  魔法数字（2.0 / 60 / 30 / 10）抽到 `src/utils/constants.ts`。
- 启动按钮文案 `⏸ 暂停` → `⏹ 停止`，与实际行为一致。

### 🧪 验证

- `tsc --noEmit` 无错误；`tools/verify/run.sh` 14 场景 31 断言全绿。
- 本轮改动含新的原生组件（磁贴）与 manifest 注入，需真机确认：
  磁贴是否出现在可添加列表、点击能否直接切换、Android 14+ 无权限时能否正确跳回 App 授权。

### 📜 文档

- README：核心功能新增 4 条，对标表两行 ⚠️ 转为 ✅/部分实现，项目结构补 5 个新文件。
- AGENTS：原生/RN 结构、磁贴的 manifest 声明、设置单一真源的红线（不要再引 AsyncStorage）、
  验证场景数 12 → 14。

---

## [0.3.4] - 2026-10-18

第二轮：**算法保真**。重点是让圆点在真实驾驶里看得出差别，而不是永远顶在钳位上。

### 🐛 修复

- **普通驾驶直接打满**：偏航通道（110 dp/(rad/s)）与横向加速度通道（20 dp/(m/s²)）
  符号一致却**各按满增益相加**，一个 2.5 m/s² 的正常转弯光靠横向加速度就能算出 50dp。
  验证台实测：左转 0.4 rad/s 输出 `offsetXdp=40.00`（钳位），急转和缓转看起来一样。
  现在两路各自按「满行程参考输入」归一（偏航 0.55 rad/s、横向 3.5 m/s²、纵向 3.0 m/s²），
  横向再按 0.65 / 0.35 权重合成。实测动态范围：缓转 3.84dp / 正常 8.91dp / 急转 17.61dp。
- **引擎与 View 的位移上限互相裁剪，且左右两列不同步**：`CueConfig.maxOffsetXdp = 40dp`，
  而 `OverlayView` 把圆点锁在 `[radius, 56dp]` 边缘带、静止位 26dp ——
  左列实际只能走 +30/−21.5dp，右列 +21.5/−30dp，大位移时两列撞墙位置不同，
  「整组平移」的视觉一致性被破坏，引擎算出的后半段位移静默丢失。
  现在位移由几何单点推出（`OverlayView.MAX_SHIFT_X_DP ≈ 20.4`），
  左右两列共用同一个 shiftX，引擎满行程对齐为 20dp。
- **纵向逐点裁剪破坏平移**：原来每个圆点各自 `coerceIn(radius, height−radius)`，
  分屏/小窗下边缘的点会被「按住」而中间的还在动。现在整组按上下留白统一限幅。
- **自动模式忽隐忽现**：单一阈值 0.25 m/s² 判「在动」，城市跟车的轻刹缓加速常在阈值下，
  匀速巡航时信号弱会让圆点消失，而拿起手机晃一下反而可能触发。
  改为进入/退出双阈值 + 600ms 确认窗口的迟滞状态机。
- **磁北兜底死代码**：`hasForward == false` 时前进方向兜底成世界 Y 轴（磁北），
  正是 AGENTS 明文禁止的做法；而该分支里纵向/横向都直接输出 0，兜底值根本没被用到。
  现在显式不输出提示，去掉误导性的磁北默认值。

### ♻️ 重构

- `CueConfig` 从「增益」表达改为「满行程参考输入 + 权重」表达，参数可读且不再互相抵消。
- 断言改为按 `CueConfig` 折算的比例（如 `> 0.5 × 满行程`），重新调参不会再引起验证台假失败。

### 🧪 验证（14 场景 / 31 断言，全部通过）

- 场景 13：缓转 / 正常 / 急转三档必须单调、落在中段、急转不撞钳位（直接锁住防饱和）。
- 场景 14：自动模式迟滞四段 —— 300ms 晃动不显示 → 2s 运动淡入 →
  巡航弱信号 5s 维持 → 真静止 12s 淡出。
- 场景 1–12 断言改为相对满行程后全部通过。

### 📜 文档

- README / AGENTS 关键参数表按新模型重写；App 首页技术架构文案去掉过期的
  「EMA 滤波 + 状态机 + 二阶预测引擎」（v0.3.0 已换成临界阻尼弹簧）。

---

## [0.3.3] - 2026-10-18

双轴代码审查（标准轴 + 规格轴）的第一轮修复，主题是**构建与运行链的确定性**。

### 🐛 关键修复

- **仓库自带代码打不出包（Critical）**：Config Plugin 注入原生源码时只复制、不清理，
  `android/` 里残留 v0.2.x 的 `MotionAnalyzer.kt` / `PredictionEngine.kt`，其引用的
  `MotionData` 类在新版 `SensorFusion.kt` 已删除。实测复现
  `compileReleaseKotlin FAILED: Unresolved reference 'MotionData'`，
  而 `release.ps1` 用的正是不带 `--clean` 的 prebuild。现在插件按注入清单
  （`.overlay-injected.json`）+ 历史注入名单清理陈旧 `.kt`，模板自带的
  `MainActivity` / `MainApplication` 不在名单内不会被误删。
- **算法质量门从未执行（Critical）**：AGENTS 规定改算法必须跑 `tools/verify/run.sh`，
  但脚本只认 PATH 上的全局 `kotlinc`，本机没有 → 这道门实际一直是跳过状态。
  脚本现在按 `PATH → $KOTLIN_HOME → Android Studio 自带 Kotlin 发行版` 顺序查找，
  并显式用 UTF-8 输出（Windows 控制台原本中文乱码）。
- **iOS 假装可用**：`isSupported` 与 `checkPermission` 在非 Android 一律返回 true，
  导致按钮可点、点了无事发生。现在未注入原生模块 / 非 Android 均为不支持，
  界面直接说明原因。
- **启动成功判定靠固定 450ms 猜测**：慢机型冷启动会被误报为「启动失败」。
  改为有界轮询（100ms 一次、3s 超时），并区分权限被撤销 / 添加窗口失败 / 启动超时
  三种可读原因（`OverlayModule.kt` 新增错误码，JS 侧 `describeOverlayError()` 翻译）。

### ⚡ 性能 / 省电

- **传感器管线移出主线程**：5 路 `SENSOR_DELAY_GAME`（50-100Hz）原本跑在 Service 主线程，
  且每个传感器事件都做一次完整「融合 + 引擎 + 重绘」，同一批数据被重算 3-5 遍。
  现在回调只存最新值，计算按 60Hz 合并（`OverlayService.TARGET_UI_HZ`），
  中间数组复用并去掉每帧 `copyOf()` 分配，时间戳改用 `elapsedRealtime()`。
- **息屏暂停重绘**：除了注销传感器，额外暂停悬浮窗绘制，避免亮屏瞬间画出一帧过期数据。
- `startForeground` 显式携带 `specialUse` 类型（Android 14+），保留退回无类型调用的兜底。

### ♻️ 重构

- 新增 `src/native/OverlayNative.ts`：原生桥的类型化契约（替代 `NativeModules` 的 any）、
  错误码常量与可读错误转换。
- `SensorFusion.reset()` 补 `gravityEstimated = false`，让低通估重力重新播种（语义一致性）。
- `release.ps1`：构建前自动跑 `tsc --noEmit` + 算法验证台；prebuild 后校验注入文件集；
  aapt 按 build-tools 版本自动挑选（不再硬编码 34.0.0）；JSON/Markdown 写回改用无 BOM UTF-8
  （PowerShell 5.1 的 `Set-Content -Encoding UTF8` 会写 BOM 并让 Expo 解析 app.json 失败）。

### ✅ 发布校验

- 新增 **16KB 页对齐实测**：`zipalign -c -P 16 -v 4` 直接校验 APK 产物，未对齐即中止发布。
  此前 README 写「已在 Gradle 配置」、AGENTS 写「需手动添加」，两处描述互相矛盾且都未落实。

### 🧪 验证

- 算法验证台扩到 **12 场景 / 23 断言**，新增场景 12：45° 倾斜 + 只有加速度计（含全部重力）
  + 中途 reset，锁住「纯重力投影到水平面必为 0，姿态再歪也不会让圆点自己飘」这一性质。
- 本轮实测通过：`tsc --noEmit` 无错误、`tools/verify/run.sh` 12 场景全绿、
  `compileReleaseKotlin` 由 FAILED 转为 BUILD SUCCESSFUL。

### 📜 文档

- 构建策略回到「全部本地构建，不使用 GitHub Actions」，删除 v0.3.0 引入的
  `android-release.yml` 并恢复 `.gitignore` 对 `.github/` 的屏蔽。
- 修正过期描述：AGENTS 真机测试步骤「圆点出现在屏幕上下边缘」→ 左右两侧；
  验证场景数 11 → 12。

---

## [0.3.2] - 2026-10-13

### 🎨 图标重做（第二版）

上一版的"两侧圆点"过于抽象、缺少焦点，不符合图标设计规范。本版按 Apple HIG / WWDC25 与 ASO 实践重做：

- **单一焦点、一个概念**：唯一主体改为一辆现代轿车（产品核心场景），不再是抽象点阵
- **高对比剪影**：白色车身压在深靛蓝→紫渐变上，缩到 48px 仍清晰可辨（已验证 48/72/96/120/180px 五档）
- **分层深度**：背景层（渐变 + 中心晕光 + 暗角）→ 地面投影 → 轮拱内阴影 → 车身（渐变 + 高光）→ 车舱（双窗 + B 柱）→ 轮毂，共 6 层，营造 iOS 26 式的层次感
- **色彩克制**：靛蓝紫（品牌）+ 白（主体）+ 深靛（车舱/轮胎）三色，淡青仅作车灯点缀
- **工程**：新增 [`tools/icons/sizes.png`](./tools/icons/sizes.png) 小尺寸预览，`render.mjs` 现在同时输出遮罩预览与尺寸预览；自适应图标前景层已验证在圆形/圆角方形/圆角矩形三种遮罩下均不裁切

---

## [0.3.1] - 2026-10-13

### 🎨 应用图标重做

- 旧图标（脚本绘制的车形剪影）观感粗糙，重新设计为：**品牌渐变底（#4F46E5 → #8B5CF6，与应用主色 #6366F1 同源）+ 左右两列白色圆点**，直接对应产品核心交互（屏幕两侧的运动提示圆点）。
- 图标改为**设计稿即代码**：[`tools/icons/render.mjs`](./tools/icons/render.mjs) 生成全部 6 个资源，可复现、可微调；同时输出 [`tools/icons/preview.png`](./tools/icons/preview.png) 模拟圆形/圆角方形/圆角矩形三种启动器遮罩，便于检查裁切。
- 自适应图标遵循 Android 规范：前景层与单色层图形限制在中心安全区（72/108dp），已验证 prebuild 生成的 mipmap 正确。
- 移除旧的 `generate_icons.ps1`（会覆盖新图标）；`replace_icons.ps1`（PNG → mipmap）保持不变。

---

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

### 🚀 构建

- 新增 GitHub Actions 工作流 [`android-release.yml`](./.github/workflows/android-release.yml)：
  - **触发方式**：`workflow_dispatch` 手动触发，或推送 `v*` 标签触发；普通 push 不触发（不消耗配额）
  - **流程**：装依赖 → `tsc` 检查 → `expo prebuild` → 校验原生层注入 → `gradlew assembleRelease` → 校验 APK versionName 与版本号一致 → 上传 artifact → 从 CHANGELOG 生成说明并创建/更新 GitHub Release
  - **守卫**：若该版本 Release 已附带 APK（例如已用 `release.ps1` 本地发布），自动跳过构建，避免本地/CI 两套 debug 签名互相覆盖
  - **环境**：ubuntu-latest + Node 20 + JDK 17（AGP 8.12 / Gradle 9.3.1）
- `.gitignore` 解除 `.github/workflows/` 屏蔽（仅允许该工作流），其余 CI 配置继续忽略。

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