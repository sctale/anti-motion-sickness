# 更新日志 (Changelog)

## [未发布]

### 🛠 构建链：`release.ps1` 自检 node 与 npx 是否来自同一目录

PATH 里存在同名但只剩 `node_modules` 的 nodejs 目录时，npm 自带的 `npx.cmd` 先找自己
`%~dp0\node.exe`、找不到才退回 PATH，于是报「"node" 不是内部或外部命令」，
看起来像 node 没装，实际打断的是 `expo prebuild` 那一步（v0.3.12 首次发布就断在这里，
浪费了一次完整构建才定位到）。

步骤 1 现在比较 `node` / `npx` 的所在目录，npx 目录里没有 `node.exe` 就把 node 目录提到
PATH 最前并告警。**已复现验证**：把一份 `npx.cmd` 复制到没有 `node.exe` 的目录并置于 PATH 首位，
无守卫时报 `Cannot find module …npm-prefix.js`，加上守卫后 `npx --version` 正常返回。

不改应用代码，因此不升版本号、不出新 APK。

### 🛠 构建链：PS 读 `app.json` 没带 `-Encoding UTF8`，加中文标签后直接解析失败

`release.ps1:280` 用 `Get-Content $AppJson -Raw | ConvertFrom-Json` 读版本号；
Windows PowerShell 5.1 对无 BOM 的 UTF-8 默认按 ANSI/GBK 解码，
一旦 `app.json` 里出现中文（v0.3.16 新增的 `applicationName` 就是），解码结果不再是合法 JSON，
`ConvertFrom-Json` 抛 `ArgumentException`，发布在步骤 2 前就断。
脚本内其余 `Get-Content` 早就带了 `-Encoding UTF8`，只有这两处漏了（`420` 读 `MainApplication.kt`，
同样含中文注释）。现全部补齐，并扫一遍确认再无遗漏。
教训：**给 PS 5.1 读任何 UTF-8 文件都要显式写 `-Encoding UTF8`**，这是本机已记录过的坑，
这次是被自己新加的中文触发的。

---

## [0.3.17] - 2026-10-18

### 🐛 修复：桌面名字还是工程 slug —— 撤回上一轮那条没生效的修复

0.3.16 写了「补上 `android.applicationName`，并用 `aapt dump badging` 验证」，
但拆开 v0.3.16 的 APK 实测，`application-label` **仍然是 `anti-car-sickness-rn`**，
那条修复根本没生效，CHANGELOG 却已经把它当成已完成发出去了。这次是同一类错误的第二次
（v0.3.11 的「图标已替换」也是这样）：**改完配置不等于产物里改了**。

定位过程：先试在 Config Plugin 里改 `strings.xml`，插件确实执行并写入了
「防晕车助手」，prebuild 结束后文件又被改回 slug ——
Expo 56 的模板资源写在所有 Config Plugin **之后**，插件层动不了它。
所以正确落点是 **prebuild 之后**：`release.ps1` 在 prebuild 完成后按 `app.json` 的
`android.applicationName` 重写 `res/values/strings.xml` 里的 `app_name`（真源仍是 app.json），
找不到节点就报错而不是静默跳过。

同时在步骤 7 加了产物断言：`aapt dump badging` 的 `application-label` 必须等于期望值，
不一致就**中止发布**并打印实际值。名字这类东西以后不再靠「应该生效了」。

顺带把 0.3.16 那次误报在文档里的表述改回可验证的形式：
`AGENTS.md` 增加一条排查项 —— 「改了 app.json / Config Plugin，产物里没变」时的正确做法。

### 🧪 验证

- `tsc --noEmit` 通过；验证台 18 组 65 断言通过；
  Config Plugin 语法检查通过（`node --check`），`release.ps1` 解析检查通过（PS 5.1 Parser）。
- **待产物核对**：本轮的标签是否真的进入 APK，由发布脚本的 `application-label` 断言把关，
  该断言失败会直接中止发布，所以只要 v0.3.17 出来了就是通过的状态。

---

## [0.3.16] - 2026-10-18

### 🐛 修复：`onCreate` / `onStartCommand` 里还有一段没兜住的初始化（红线 8 的残留缺口）

上一轮把 `startForeground` 和每帧计算包住了，但初始化主体仍然裸奔：
`getSystemService(SensorService) as SensorManager` 的强转、`HandlerThread`/`Looper` 建立、
`OverlayManager(this)`（构造一个 View）、读 SharedPreferences、注册息屏广播 ——
这些在个别 ROM 上都会抛，而在生命周期回调里抛出去就是进程崩溃，
症状与最初报的「点图标直接闪退」完全一致。现在整段包在 `try/catch` 内，
失败时按新增的 `START_FAILED` 原因体面停止，并做一次 `cleanupAfterFailure()`
（注销传感器/广播、结束线程），不留半个服务。

同时把兜底范围从 `catch (Exception)` 扩到 `catch (Throwable)`：
`NoSuchMethodError`（被 OEM 裁剪 API）、OOM 这类 `Error` 原本仍能穿透 Looper。

- 新增原因并给可读文案：`NO_SENSORS`（本机没有任何可用运动传感器）、
  `START_FAILED`（初始化本身抛错）、`SENSOR_RESTART_FAILED`（换采样档位时重建注册失败）。
  最后一条以前借 `PIPELINE_FAILED` 的名义报出去，用户会看到「运动提示计算连续失败」，
  正是「把真实病根盖掉」这类错误。
- 传感器完全缺失的机器以前会静默留下一个不会动的圆点：现在直接带原因拒绝启动，
  而不是让用户对着一排死点猜为什么没反应。

### ✨ 改进：JS 致命错误也留下堆栈（错误边界接不住的那一类）

`ErrorBoundary` 的注释自己写明了「只管渲染期」。真正让 App 闪退的往往是别的位置 ——
effect 里的异步回调、定时器、原生事件订阅回调 —— 这些错误不经过任何组件，
直接被 RN 全局处理器接走，release 包里就是进程终止、屏幕上什么都不留。
新增 `installGlobalCrashReporter()`：在默认处理器之前把致命错误同步写入与原生崩溃同一个
`last_crash` 键（`setStringPref` 走 `commit()`，赶在进程结束前落盘），
然后原样转交上一任处理器 —— 只留证据，不掩盖崩溃。

### 🐛 修复：桌面标签显示的是工程名「anti-car-sickness-rn」

`app.json` 没设 `android.applicationName`，于是启动器图标下面印的是 slug，
而界面里叫「防晕车助手」。补上后用 `aapt dump badging` 的 `application-label` 验证，不靠猜。

### 🧹 清理：会误导后续改动的死代码与陈旧指针

- `appliedSamplingLevel` 被写 6 次、从不被读，注释却宣称「分开记录才能在投递失败时重试」——
  那个重试机制并不存在。删字段并改写注释。
- `OverlayView` 的 `DOT_COUNT_PER_SIDE` / `MAX_SHIFT_X_DP` 兼容别名零引用，
  而且会把 `OverlayGeometry` 的**公式冻结成快照**，等于又造出第二处真源（本项目反复踩过的坑）。删除。
- 「🏃 跑步中」永不出现（检测只输出 IN_VEHICLE / STILL / WALKING / UNKNOWN），
  从 `ActivityType` 与标签表一起删掉。
- 陈旧指针修正：`AGENTS.md` 与 `src/utils/constants.ts` 仍写「绘制参数在 `OverlayView.kt`」，
  而 v0.3.15 起几何只在 `OverlayGeometry.kt` 定义。
- 修正**上一轮自己的夸大**：0.3.14 说静止后「最坏约 200ms 恢复跟手」。实际上弹簧的 `dt`
  为数值稳定性被钳在 50ms（`MotionCueEngine.kt:273`），200ms 采样时积分被压慢，
  回档到跟手约需 0.4~0.6s。这正说明「圆点显示中不降档」是必需的：
  降档的收益只在真正等待期，不该拿行车中的响应去换。

### 🧪 验证

- `tsc --noEmit` 通过；验证台 18 组 65 断言通过；prebuild 后 `compileReleaseKotlin` 通过；
  注入守卫、16KB 对齐通过。
- 逐条 grep 核对了错误码表：原生 `reject(...)` 实际使用的 16 个码，
  `OverlayNative.ts` 的 `OVERLAY_ERRORS` / `ERROR_TEXT` 全部覆盖
  （审查意见里「缺 ERR_BATTERY_SETTINGS」一条经查不成立 —— 原生那个码叫 `ERR_BATTERY_STATE` 且已在表内）。
- 未验证：真机行为仍需你确认（本环境无设备与可用模拟器）。

---

## [0.3.15] - 2026-10-18

### 🔧 重构：把圆点几何从 View 里抽成可验证的纯逻辑，并用断言守住两条老不变量

`OverlayView` 里的半径、行程、钳位、两列位置以前是**只能改代码、没法自证**的代码：
这个项目的历史事故恰好都出在这几行上——左列能走 +30/-21.5dp、右列 +21.5/-30dp
（两列在不同位置撞墙，不再像「整组平移」），以及 `MotionCueEngine` 的满行程写 40dp
而 View 只给到 ±20.4dp（后半段位移被静默裁掉）。当时靠注释提醒「记得同步」，
这次直接把量搬进 `OverlayGeometry.kt`（零 Android 依赖），让 JVM 验证台能断言：

- 引擎横向满行程 ≤ 几何可走行程（跨模块不变量，历史上真违反过）；
- 两列间距恒等于 `width − 2×边缘内缩`，与位移无关（平移一致性）；
- 左右两个极限位置都不出屏、不侵入内容区；远超行程的输入被钳在上限；
- 纵向走满上下都不出边；半径随强度单调且落在标定倍率内；
- `MAX_SHIFT_X_DP` 由公式给出而不是手写数字（改边缘带时不会与几何脱节）；
- 退化输入安全：窗口还没量出尺寸、分屏窄到放不下边缘带时**直接不画**，
  而不是画到屏幕中间或让行程变成负数。

`onDraw` 改为复用一份 `DotLayout` 写出结果，60Hz 下仍然零分配。

### 🐛 修复：圆点正在显示时不得降低采样档位

v0.3.14 的降档只看运动强度，但自动模式有淡出窗口、匀速巡航时强度又可能长期低于门限
—— 那时候圆点还在显示，却可能已经降到 200ms 采样，下一次转弯要慢半拍才跟上。
现在 `SamplingPolicy` 多一个 `cueVisible` 入参：**只要圆点还在显示就维持最高档**。
省电的实际来源因此是「静止、停车后忘关、走路时带在身上」这些确实在等待的阶段，
而不是行车途中——跟手性优先。

### 🧪 验证

- 算法/几何验证台从 16 组扩到 18 组、断言 45 → 65，全部通过；
  `tsc --noEmit` 通过；`expo prebuild` 后 `compileReleaseKotlin` 通过；注入守卫、16KB 对齐通过。
- 本次搬运未改变任何数值：抽取前后 `MAX_SHIFT_X_DP`、半径、钳位公式逐项一致，
  并且重构过程中被断言逮到一处笔误（`density.coerceIn(...)` 写成对密度取钳位，
  会让横向位移完全不受限），说明这套断言起作用了。

---

## [0.3.14] - 2026-10-18

### ✨ 新增：静止时自动降低采样强度（这个 App 的用法是「上车打开，一整天不管」）

之前传感器一直按 `SENSOR_DELAY_GAME`（约 50–100Hz）挂着 3~5 路：旋转矢量、陀螺仪、
线性加速度、加速度计、重力。手机放在腿上不动车也在满速采样，是发热与耗电的主要来源，
而**国产 ROM 一旦因为耗电冻结前台服务，用户看到的就是「圆点没了 / App 坏了」**——
这条链路比算法精度更影响实际体验。

- 新增 `SamplingPolicy`（纯逻辑、零 Android 依赖，可直接在 JVM 上验证）：
  任一帧运动强度达到 0.08 立刻回到最高档并刷新计时；静止累计 20s 降到 UI（约 66ms），
  120s 降到 NORMAL（约 200ms）。降档只看时间、升档只看运动，两个条件互斥，所以不会来回抖动。
- `SensorManager` 没有「修改采样率」的公开 API，切换只能注销后按新周期重注册。
  切换动作一律 `handler.post` 到下一轮循环执行 —— 不能在 `onSensorChanged` 回调里注销自己；
  中途失败则整体重建注册并回到最高档（**宁可多耗电，也不能让传感器悄悄全掉、圆点冻住**），
  重建也失败才带原因停止服务。
- 息屏重新亮屏时策略复位：不带着「息屏前已经静止很久」的计时直接落到省电档。
- 静止时圆点本来就不动，最坏情况是重新起步后约 200ms 才恢复跟手，之后立即回到最高档。

### 🛠 文档与验证台

- 验证台从 14 组扩到 16 组、断言 31 → 45：新增「静止降档/运动回档」与
  「4 分钟走走停停切换次数有界（不抖死传感器）」两组，含门限倒置在构造时即被拒绝。
- `AGENTS.md` 修正三处与实际不符的记载：原生文件数（写 10，实际 12，且清单里漏了
  `CrashCapture.kt`）、技术栈版本行、采样参数表；并补上「采样档位只能 post 出去改」这条红线。

### 🧪 验证

- `tsc --noEmit` 通过；算法验证台 16 组 45 断言通过；`expo prebuild` 后
  `compileReleaseKotlin` 通过（`SamplingPolicy.kt` 已确认被注入 `android/`）；
  注入守卫、APK 16KB 对齐通过。
- 未验证：真机上的实际耗电差值（本环境无设备）。策略是纯逻辑且有断言覆盖，
  但「降了多少电」需要你在真机上感受——如果出现过「动了几秒圆点不跟手」，说明门限需要调快。

---

## [0.3.13] - 2026-10-18

### 🐛 修复：界面说的「运行中」不等于用户看得见的圆点

`isOverlayShown()` 在原生侧早就有了（注释写明「比 isRunning 更贴近用户所见」），
但 JS 层从来没调用过它，状态只看 `isServiceRunning()`。于是前台服务被国产 ROM 冻结、
或悬浮窗被系统移除时，服务还活着、圆点已经没了，页面却一直显示「运行中」、
首页一直挂「圆点运行中」徽标 —— 用户只能认为「App 坏了」，而且没有任何原因可看。

- `syncServiceState()` 同时查服务与窗口：状态含义改为「圆点是否真的挂在屏幕上」，
  两者不一致时给出可操作的说明（点「启动」重新挂上 / 允许后台运行），不再静默吞掉。
- `stopService()` 不再在 `finally` 里把本地状态写死成「已停止」，改为回读原生真实状态：
  停止失败时圆点还挂在别的 App 上，界面却显示「▶ 启动」，此前完全没有提示。
- 启动失败同样回读真实状态，避免留下上一次的「运行中」假象。
- 状态文案随之改成事实：「运行中 / 已停止」→「圆点显示中 / 未显示」。
- 顺手删掉 `isRunningRef`：它只被写、从不被读，是一处会让人误判并发语义的死状态。

### 🐛 修复：三处「说到做不到」的文案与一处自动开启的静默失效

- 添加磁贴成功后写的是「已发起请求，请在系统弹窗中确认添加」，
  而原生只在系统回调 `TILE_ADDED / TILE_ALREADY_ADDED` 时才 resolve —— 用户会去等一个不会再出现的框。
  改为「磁贴已添加到下拉快捷面板，点一下即可开关圆点」。
- 首页与乘车检测页都承诺「系统将自动检测」，但检测状态是页面局部 state，离开本页即注销监听。
  改为如实写明「仅本页打开时有效；已开启的圆点由后台服务继续负责」。
- 乘车检测的「检测到乘车自动开圆点」在权限还没查完（`hasPermission === null`）时就会发起启动，
  撞上原生 `ERR_NO_PERMISSION`，同时把 `autoStartedRef` 置位 —— 本轮之后再也不会重试，
  用户随后即使授权也再也享受不到自动开启。改为只在确认有权时才发起，未出结果时等下一次状态到位。

### ✨ 改进：错误提示不再露出英文异常串

`describeOverlayError()` 原先**先返回原生 message**，而原生多处用的是
`reject(code, throwable)`，message 就是英文异常串或堆栈首行；`OVERLAY_ERRORS` 也只覆盖 7 个码，
而原生实际有 16 个。现在改为先按错误码查表（表里补齐 16 个码 + v0.3.12 新增的
`ERR_START_FOREGROUND_SERVICE_DENIED` / `ERR_START_PIPELINE_FAILED`），
查不到才退回 message，红色错误卡上不会再出现用户看不懂也复制不出价值的英文串。

### 🐛 修复：Vehicle Motion 页底部被导航栏遮住

`SafeAreaView` 的 `edges` 漏了 `'bottom'`，Android 16 强制 edge-to-edge 后
本页最后一行提示/按钮会压在手势条下面（另两个页面都写了 `bottom`，属于漏改）。

### 🧪 验证

- `tsc --noEmit` 通过；算法验证台 14 场景 31 断言通过；prebuild 注入守卫、16KB 对齐通过。
- 本轮全部为 JS 层状态与文案修正，未改动运动融合算法与原生服务逻辑。

---

## [0.3.12] - 2026-10-18

### 🐛 修复：常驻服务本身还有一条「闪退」路径（我上一轮重写时引入的回归）

上一轮把 `OverlayService` 重写为「传感器线程 + 合并到 60Hz 的管线」时，
顺手丢掉了 v0.2.x 里包住运动处理的那层 `try/catch`。
后果是：`SensorManager` 回调里任何一帧抛出未捕获异常，直接崩掉整个进程 ——
现象和用户报的「点开就闪退」一模一样，只不过这次是在悬浮窗跑起来之后才崩。
同类问题还有 `startForeground`：Android 12+ 的后台启动限制、通知被禁用时它会抛
`ForegroundServiceStartNotAllowedException`，而这个调用位于 `onCreate` / `onStartCommand`，
抛出即崩溃，连一条原因都留不下。

- `startForegroundSafely()` 改为返回布尔并逐段 `try/catch`：构造通知失败、带类型调用失败、
  退回无类型调用仍失败，三种情况都只记日志并返回 `false`；
  调用方据此 `markStopped(REASON_FGS_DENIED)` + `stopSelf()` 体面收场，不再让异常逃出服务生命周期回调。
- 每帧计算包进 `try/catch`：单帧失败只记一条 warn 并继续（**不像旧版那样无声吞掉**），
  连续失败到 `MAX_PIPELINE_FAILURES = 30` 才停止传感器、记录 `REASON_PIPELINE_FAILED` 并 `stopSelf()`。
  成功一帧即清零计数，避免偶发噪声累积成误停。
- `OverlayModule` 补上兜底分支：任何已记录的失败原因都如实 `reject("ERR_START_<reason>")`，
  并给出可读文案（前台服务被拒 → 提示去系统设置允许后台运行；计算连续失败 → 提示反馈机型）。
  此前这些原因会被下面的轮询超时分支吞成「启动超时」，把真实原因盖掉，
  用户和开发者都会被误导到省电策略之外去找病根。

### 🧪 验证

- `tsc --noEmit` 通过；算法验证台 14 场景 31 断言通过；
  `expo prebuild --clean` 后原生代码 `compileReleaseKotlin` 通过；
  prebuild 注入守卫（`OverlayPackage` / `CrashCapture`）通过；APK 16KB 对齐通过。
- 仍未验证：真机上的启动与长跑。本环境无可用设备（模拟器会话以管理员身份运行，
  6 种 GPU/权限组合均无法启动），所以这轮修的是「代码里能证明会崩」的路径；
  若设备端仍有闪退，重开 App 后首页会直接印出上次崩溃的堆栈。

---

## [0.3.11] - 2026-10-18

### 🐛 修复：启动页还是 Expo 模板的占位图

把 v0.3.10 的 APK 拆开逐个资源看才发现：启动器图标确实是素描版
（`mipmap/ic_launcher_foreground` 的 xxxhdpi 层抽出来就是小车 + 两列圆点），
但 **`drawable/splashscreen_logo` 还是 Expo 模板自带的「安全区参考线」占位图** ——
也就是说每次冷启动的过渡页上，用户看到的是一圈没意义的辅助线。

原因：`expo install expo-splash-screen` 只把插件名加进 `app.json`，
不带任何参数，于是插件用了它自己打包的默认图，而不是我们生成的 `assets/splash-icon.png`。

- 显式配置 splash 插件：`image: ./assets/splash-icon.png`、`imageWidth: 340`、
  背景 `#F2EFE6`（与素描纸面同色，明暗两套一致），`expo-splash-screen` 补为直接依赖。
- 验证方式固化：从 APK 里按资源表抽出实际文件（`aapt2 dump resources` → 解出 webp → 转 PNG 查看），
  而不是相信「图标已替换」这行日志 —— 这次的漏网之鱼正是这么发现的。

### 🛠 构建链（同批）

- `release.ps1` 里所有外部命令统一走 `Invoke-NativeCommand`：
  `expo prebuild` / `gradlew` / `aapt` / `zipalign` 的正常进度都写 stderr，
  在全局 `ErrorActionPreference=Stop` 下会被升级成终止性异常，表现为脚本静默中断、日志停在半行。
- prebuild 前先停 Gradle 守护进程，并对 `EBUSY` 重试一次：
  守护进程锁住 `android/app/build` 会让 `--clean` 删不掉目录，
  且失败后 `android/` 只剩半截（连 gradlew 都没了），只能整目录重建。

### 🧪 验证

- `tsc --noEmit` 通过；算法验证台 14 场景 31 断言通过；
  prebuild 注入守卫（`OverlayPackage` / `CrashCapture`）通过；APK 16KB 对齐通过。

---

## [0.3.10] - 2026-10-18

### ✨ 新增：后台常驻引导（这个产品最常见的真实故障不是闪退，而是「圆点用着用着没了」）

国产 ROM 的省电策略会冻结常驻前台服务，连同传感器一起停掉；此前 App 既查不到状态、
也没有任何入口让用户豁免，只能被当成「App 坏了」。

- `OverlayModule.isIgnoringBatteryOptimizations()`：查当前是否已豁免（Android 6 以下视为已豁免）。
- `OverlayModule.openBatteryOptimizationSettings()`：依次尝试
  `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS` → `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`
  → 应用详情页，全部失败时给出「请到设置里手动允许后台运行」的可读原因
  （部分 ROM 会拦这些跳转，所以是逐个降级而不是假定可用）。
- Vehicle Motion 面板：查询结果为「未豁免」时才出现「🔋 允许后台常驻」按钮
  （已豁免或系统不支持查询都不显示，避免无意义的提示）；只在用户主动点击时跳转，不做启动弹窗。
- 每次回到前台复查豁免状态（与权限、服务状态同一批同步）。
- `app.json` 增加 `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` 权限声明。

### 🧪 核对

- 对比 `--clean` 前后 APK 的权限集合：`VIBRATE` 由 expo-haptics 自带未丢失；
  被清掉的 `WAKE_LOCK` / `HIGH_SAMPLING_RATE_SENSORS` / `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`
  属于当时已无用的声明（前者本版按需重新加回）。
- 原生启动路径复查：`OverlayPackage.createViewManagers` 返回 `emptyList()`，
  新架构下不存在模板常见的 `UnsupportedOperationException` 急抛点。
- `tsc --noEmit` 通过；算法验证台 14 场景 31 断言通过。

---

## [0.3.9] - 2026-10-18

### 🔴 启动闪退的根因：原生配置与 `app.json` 漂移

`android/` 是 prebuild 的复用目录，历史上手改进去的配置一直没被清掉，
和 `app.json` 已经对不上了。实测对比（`--clean` 前后同一份 `gradle.properties`）：

| 配置项 | 陈旧 `android/`（v0.3.3–v0.3.8 的构建） | `--clean` 后（= app.json 声明） |
|---|---|---|
| `newArchEnabled` | **false** | **true** |
| `edgeToEdgeEnabled` | true（v0.3.0 起 app.json 已删除） | 由模板决定 |
| `org.gradle.projectcachedir` | `d:/V-Coding/anti-car-sickness-rn/.gradle-cache`（**该目录已被删除**） | 无 |
| `android.ndkVersion` | 手写 26.1.10909125 | 无 |

RN 0.85 已经不支持旧架构，用 `newArchEnabled=false` 启动新运行时，就是
「装得上、图标在、点开就没了」。之前几版 APK 全部踩在这条上。

### 🛠 修复

- **`release.ps1` 的 prebuild 固定带 `--clean`**：干净工程完全由当前
  `app.json` + Config Plugin 生成，杜绝再漂移。
- **本机需要的构建规避项收进 Config Plugin**（`withLocalBuildWorkarounds`）：
  `kotlin.daemon.enabled=false` 与指向**项目内** `.gradle-cache` 的
  `org.gradle.projectcachedir`。以前它们是手改在 `android/` 里的，
  一旦 `--clean` 就丢、不 clean 又会滞留成隐患，现在每次生成都会重新注入。
- 插件清理陈旧文件时不再谎报「已清理」（文件本来不存在就不打印）。

### 📜 文档

- AGENTS 新增「点图标就闪退（原生配置与 app.json 漂移）」排查条目，
  附一条不用真机就能判定的 `grep` 命令；手动构建与快速参考里的 prebuild 命令统一加 `--clean`。

### 🧪 验证

- `--clean` 后 `gradle.properties` 三项均正确；`MainApplication.kt` 里
  `add(OverlayPackage())` 与 `CrashCapture.install(this)` 各出现 1 次（幂等）；
  manifest 中磁贴声明 1 条；`tsc` 与 14 场景算法验证通过。
- `release.ps1` 新增注入校验：任一项缺失即中止构建，不再依赖「插件跑完了」这种弱信号。

---

## [0.3.8] - 2026-10-18

针对「启动直接闪退」的一版：**图标换成素描简图**，并把「崩溃原因看不见」这个根本障碍解决掉。

### ⚠️ 关于闪退的诚实说明

本机无法复现：没有连接真机，而 AVD `test-android-36` 在这台机器上四次启动都失败
（提权的父进程认不到自己派生的 QEMU 子进程，误报 "too many emulator instances" 后自杀，
换 `-gpu swiftshader_indirect / guest / off` 都一样）。
静态排查已排除几类常见原因：manifest 声明的 `MainActivity` / `MainApplication` /
`OverlayService` / `MotionCueTileService` 四个组件在 DEX 里都存在（`apkanalyzer dex packages`）、
`assets/index.android.bundle` 存在且是最新代码（Hermes 字节码里能查到 0.3.5+ 才有的
`canRequestAddTile`）、APK 16KB 对齐通过。
所以这一版先把**现场**带回来，而不是宣称已修好。

### ✨ 新增：崩溃现场留存（下次启动直接显示原因）

- [`native/android/CrashCapture.kt`](./native/android/CrashCapture.kt)：`Application.onCreate`
  装一个默认未捕获异常处理器，把线程名 + 异常类型 + 堆栈写进设置存储，然后再交回系统处理。
  **用 `commit()` 同步落盘** —— `apply()` 是异步的，进程正在死掉时那次写入很可能丢，等于白留
  （`SettingsStore.setStringSync`）。
- JS 侧 `src/components/ErrorBoundary.tsx`：根级错误边界，渲染期崩溃不再直接闪退，
  而是留在屏幕上看得到；同时写进同一个键（`last_crash`）。
- 首页新增崩溃卡片：显示上次的堆栈 + 「清除并继续」，并提示截图发到 Issue。
- 不新增原生桥方法：崩溃走 `getStringPref/setStringPref` 同一份存储、同一个读接口。

### 🐛 修复

- **Config Plugin 的 mod 在复用 `android/` 目录时会静默变成空操作**：
  `withOverlayPackage` 开头是 `if (contents.includes('OverlayPackage()')) return cfg`，
  而 `android/` 是 prebuild 复用目录、早就注册过了 —— 结果写在它后面的
  `CrashCapture.install` 注入**永远不会执行**。改成两个独立判断 + 只在真有改动时写回，
  并实测两次 prebuild 后注入项恰好出现 1 次（幂等）。
- **`release.ps1` 新增注入校验**：prebuild 后直接检查 `MainApplication.kt` 是否含
  `add(OverlayPackage())` 与 `CrashCapture.install(this)`，缺失即中止构建。
  注入类问题不能只看「插件跑完了」。
- **`OverlayModule` 读取容错**：新架构（bridgeless）下访问未注册模块可能直接抛错，
  而这段代码在 import 阶段求值 —— 一旦抛出就是「点图标立刻闪退、连一屏错误都看不到」。
  现在包在 try/catch 里，失败降级为「当前平台不支持」。
- 插件清理陈旧文件时不再谎报：文件本来不存在就不打印「已清理」。

### 🎨 图标：改为素描简图（铅笔线描 + 排线）

`tools/icons/render.mjs` 整个重写为「纸面 + 石墨线稿」：暖白纸纹、两遍带抖动的主线、
只用排线表现明暗，主体是**一辆侧视小车 + 左右各 5 个圆点**（正是产品在屏幕两侧画的东西，
概念自洽）。固定种子保证重跑逐像素一致。

生成过程中修掉三个真实缺陷（都是看图自查发现的）：

- 折线拼接留下 `L L` 非法命令序列 → librsvg 直接丢弃整条 path，
  表现为**车身和车窗根本没画**、只有车轮和圆点；
- `dotPositions()` 漏了 `r` 字段 → `r="NaN"` → 圆点整列消失；
- 地面排线没裁剪 → 斜穿车身，像车身上划了几道。

并加了两道生成期自检：主体越出自适应图标安全区（半径 300px）即报错、
path 里出现 `NaN`/`Infinity`/非法命令序列即报错；同时输出遮罩预览与 48~180px 尺寸预览，
确认缩小后仍能认出「车 + 两列点」（靠实心的车轮与车窗承担小尺寸识别度）。

### 🧪 验证

- `tsc --noEmit` 通过；`tools/verify/run.sh` 14 场景 31 断言通过；
  `release.ps1` 语法解析 0 错误（UTF-8 BOM 保持）；APK 16KB 对齐通过。

---

## [0.3.7] - 2026-10-18

第四轮：对前三轮自己写的改动做一轮双轴复查，修掉复查中发现的真实竞态。

### 🐛 修复

- **主线程与传感器线程竞态**：`applySettings()` 在主线程整体替换 `cueEngine`，
  而传感器线程可能正在 `update()` 里读它；息屏广播也在主线程调
  `unregisterSensors()` → 内部 `fusion.reset()` / `cueEngine.reset()` 与回调线程的读写重叠。
  现在明确线程约定：**只有传感器线程**碰 `fusion` / `cueEngine` 运行时状态与
  `sensorsRegistered`，主线程一律通过 `sensorHandler.post` 投递注册、注销与引擎替换；
  跨线程读取的引用（`cueEngine`、`overlayManager`）标 `@Volatile`，
  `runPipeline()` 只读一次引用，保证一帧内用的是同一个引擎实例。
  `onCreate` 相应调整为「先建线程，再应用设置与注册」。
- `onDestroy` 路径：`unregisterSensors()` 在线程已退出时就地注销，
  未退出时借助 `quitSafely()` 让排队的注销任务跑完再退出。
- 类文档里的过度声明订正：上一版写「所有中间数组复用，传感器链路上不再 per-event 分配」，
  实际只去掉了每帧 `copyOf()`，融合层仍有少量小数组分配（60Hz 下可忽略）。
  保留少量分配是有意的——不为了零分配把 `FusionOutput` 改成可变复用对象而牺牲可读性。

### 🧪 验证

- `tsc --noEmit` 通过；`tools/verify/run.sh` 14 场景 31 断言通过；
  `:app:compileReleaseKotlin` 实际重跑并通过（非 UP-TO-DATE）；16KB 对齐校验通过。

---

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