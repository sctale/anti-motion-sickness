# TapMood 项目规范

## Expo 版本

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

---

## Android 构建流程（标准流程）

每次修改代码后，按以下步骤构建 APK：

### 1. Prebuild（生成原生代码）

```powershell
cd d:\V-Coding\TapMood
npx expo prebuild --platform android
```

- 首次构建或修改了 Config Plugin（`plugins/` 目录）时必须执行
- 如果 `android/` 目录被锁定（EBUSY），先关闭占用进程再重试
- **不要使用 `--clean`**，除非明确需要完全重建（会触发 EBUSY 问题）
- 修改 `plugins/` 下任意 config plugin 后必须 prebuild 一次

### 2. 构建 Release APK

```powershell
cd d:\V-Coding\TapMood\android
.\gradlew assembleRelease
```

- **仅 JS 改动**（上次 build 后只改了 src/，且 prebuild 没动 native）：约 25 秒
- **Prebuild 增量后**（改了 app.json / plugins，未动 native）：约 30-60 秒
- **Prebuild `--clean` 后**（首次或大版本切换）：约 3-4 分钟（native 重编译）
- APK 输出路径：`android\app\build\outputs\apk\release\app-release.apk`
- **不需要手动处理 hermesc.exe**，标准流程会自动处理

### 3. 验证构建结果（强制步骤，**不可跳过**）

```powershell
# 1) 确认 APK 文件存在
Get-Item d:\V-Coding\TapMood\android\app\build\outputs\apk\release\app-release.apk

# 2) 读取 APK 包元数据，验证版本号正确
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\<version>\aapt.exe" dump badging d:\V-Coding\TapMood\android\app\build\outputs\apk\release\app-release.apk | Select-String "package"
```

**必须确认**：
- `versionName` 与 `app.json.expo.version` 一致
- `versionCode` 是 `major*10000 + minor*100 + patch` 派生值（例：0.3.12 → 312）
- 如果不对：**必须修复后重新构建**，不能直接发布

> 版本号由 [`plugins/withVersionSync.js`](plugins/withVersionSync.js) 自动从 `app.json.expo.version` 派生。详见下文"自动版本号同步"。

---

## 自动版本号同步

**单一数据源：`app.json.expo.version`**

`expo-build-properties` 在 expo 56 中**不支持** `versionName` / `versionCode` 字段（schema 与源码都没处理）。本项目通过自定义 config plugin 解决：

- `versionName` 由 **expo prebuild 模板**自动从 `app.json.expo.version` 读取
- `versionCode` 由 [`plugins/withVersionSync.js`](plugins/withVersionSync.js) 用 `withAppBuildGradle` 自动派生
  - 派生公式：`major * 10000 + minor * 100 + patch`
  - 例：`0.3.13` → `313`，`0.4.0` → `400`，`1.0.0` → `10000`

### Release 前版本号自检

只需确认 `app.json.expo.version` 已更新到目标版本。**不要手动改** `android/app/build.gradle`（被 .gitignore 排除），所有版本号都从 `app.json` 派生。

---

## 版本发布流程

每次发布新版本必须完成以下所有步骤。

### 1. 构建前检查清单

- [ ] `app.json` → `expo.version` 已更新
- [ ] `package.json` → `version` 与 `app.json` 一致
- [ ] `README.md` → "当前版本" 行已同步
- [ ] `CHANGELOG.md` → 顶部已添加新版本记录
- [ ] `android/app/src/main/res/values/strings.xml` 含小组件字符串（`widget_label` / `widget_description`）
- [ ] 无重复的 strings XML 文件（避免 `mergeReleaseResources` Duplicate resources）
- [ ] 跑了 `npx expo prebuild --platform android --no-install`（**必须**，否则 build.gradle 不会刷新版本号）
- [ ] `aapt dump badging` 已验证 APK 元数据正确（`versionName` 与 `expo.version` 一致、`versionCode` 是 `major*10000 + minor*100 + patch`）

### 2. 版本号规则

- 新功能 → 次版本号 +1（0.3.0 → 0.4.0）
- Bug 修复 → 修订号 +1（0.3.0 → 0.3.1）
- 破坏性更新 → 主版本号 +1

### 3. Git 提交

```powershell
cd d:\V-Coding\TapMood
git add <相关文件>
git commit -m "feat/fix/docs: 中文描述"
```

- commit message 格式：`feat:` / `fix:` / `docs:` + 中文描述
- **不要 `git add .`**，逐个添加文件避免误提交
- PowerShell 不支持 HEREDOC，commit message 写一行

### 4. 推送到 GitHub

```powershell
git push origin main
```

`android/` 目录在 `.gitignore` 中被排除（`/android`），因此 build.gradle 修改不会进版本控制——**这正是为什么必须用 config plugin 而不是手动改 build.gradle**。

### 5. 创建 GitHub Release

**推荐：通过 Trae GitHub MCP 工具创建**（不需任何 token）。

如果 MCP 工具未配置或不可用，使用 `gh` CLI（需 OAuth 登录）：

```powershell
# 一次性 OAuth 登录（推荐）
& "C:\Program Files\GitHub CLI\gh.exe" auth login --hostname github.com --git-protocol https --web

# 创建 release 并上传 APK
& "C:\Program Files\GitHub CLI\gh.exe" release create v<版本号> `
  "d:\V-Coding\TapMood\android\app\build\outputs\apk\release\app-release.apk#TapMood-v<版本号>.apk" `
  --repo sctale/TapMood `
  --title "v<版本号>" `
  --notes "<release notes>"
```

- 使用 `& "C:\Program Files\GitHub CLI\gh.exe"` 而非 `gh`（系统 PATH 中的 gh 可能指向错误脚本）
- APK **必须**上传到 Release（用 `#别名` 语法指定下载显示名）

### 6. 覆盖已发布 release 的 APK（修正版本号后）

如果已发版但 APK 版本号错误，用 `gh release upload --clobber` 覆盖（**不要再发新 tag**）：

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" release upload v<版本号> `
  d:\V-Coding\TapMood\android\app\build\outputs\apk\release\app-release.apk#TapMood-v<版本号>.apk `
  --repo sctale/TapMood --clobber
```

---

## GitHub 工具链（按推荐度排序）

### 1. Trae GitHub MCP 工具（推荐，0 token）

Trae IDE 已内置 GitHub MCP Server，**无需任何 token 即可使用**：

- `list_commits` / `get_file_contents` / `search_*` — 读操作
- `create_or_update_file` / `push_files` — 推代码（可替代 `git push`）
- `create_branch` / `create_pull_request` / `merge_pull_request` — PR 流程
- `create_issue` / `update_issue` / `add_issue_comment` — Issue 管理

**限制**：当前 MCP Server **不暴露** `create_release` 和 `upload_release_asset`，所以创建/覆盖 Release 仍需走 `gh` CLI。

### 2. `gh` CLI OAuth 登录（推荐，0 token）

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" auth login --hostname github.com --git-protocol https --web
```

- 浏览器 OAuth 一次，本机 `gh` 永久有权限
- 之后 `gh release create` / `gh release upload` / `git push` 都不需要 token
- 撤销：`gh auth logout`

### 3. GitHub PAT（不推荐，仅紧急情况）

```powershell
# 设置临时环境变量（不进 PowerShell 历史）
$env:GH_TOKEN = "ghp_xxx"
& "C:\Program Files\GitHub CLI\gh.exe" release create ...
```

> ⚠️ 不要把 PAT 直接粘到聊天框——会进对话历史，难以清理。优先走 MCP 或 `gh auth login`。

---

## 小组件开发规范

### 文件位置
- Config Plugin：`plugins/withAndroidWidget.js`
- 本项目自定义 config plugin：`plugins/withVersionSync.js`
- JS 侧接口：`src/widgets/MoodWidget.android.tsx`
- Deep Link 处理：`App.tsx` 中的 `handleUrl`

### Android 12+ 小组件标准
- 必须同时设置 `targetCellWidth/Height`（Android 12+）和 `minWidth/Height`（兼容旧版）
- 尺寸公式（5x4 网格）：`(73n - 16) x (118m - 16)` dp
- 使用 `previewLayout` 替代 `previewImage`（Android 12+ 选择器实时预览）
- 使用 `@android:dimen/system_app_widget_background_radius` 系统标准圆角（通过 `drawable-v31` 目录）
- `appwidget-provider` 必须设置 `android:label`（选择器显示名称）
- `minHeight`/`minResizeHeight` 设为 40dp 以确保三星等设备能缩到1行

### 三星 One UI 适配
- 三星网格可能是 5x5 而非 5x4，1行高度约 80-90dp
- `minResizeHeight` 必须足够小（40dp），否则无法缩到1行
- `resizeMode` 必须包含 `vertical`，否则无法垂直调整

---

## 常见问题

### EBUSY: resource busy or locked
- 原因：Gradle daemon 或其他进程占用 `android/` 目录
- 解决：关闭占用进程，或直接运行 `npx expo prebuild --platform android`（不加 `--clean`）

### APK 版本号不对
- 原因：忘了用 [`plugins/withVersionSync.js`](plugins/withVersionSync.js)，或 `app.json.expo.version` 没改
- 解决：改 `app.json.expo.version` → 重新 `npx expo prebuild` → 重新 `gradlew assembleRelease` → 验证 `aapt dump badging` → 用 `gh release upload --clobber` 覆盖

### hermesc.exe 缺失
- 之前遇到过 Windows Defender 删除 hermesc.exe 的问题
- 当前版本的标准构建流程不再需要手动处理
- 如果构建报错提示 hermesc 缺失，从 npm 下载对应版本手动放置

### PowerShell 不支持 HEREDOC
- 不要使用 `$(cat <<'EOF' ... EOF)` 语法
- 使用简单的单行 commit message，或用 `-m` 参数直接写

### gh release notes 含 emoji 导致 PowerShell glob 失败
- 现象：`gh release create ... --notes "..."` 里出现 `🌱` `✨` `🌧️` 等字符时报 `no matches found`
- 原因：PowerShell 把 emoji 解释为 glob 模式
- 解决：把 notes 写入文件，用 `--notes-file <path>` 代替 `--notes`：
  ```powershell
  @"
  ## v0.3.13
  包含 emoji 🌱 的 notes
  "@ | Out-File -Encoding utf8 release_notes.md
  gh release create v0.3.13 ... --notes-file release_notes.md
  ```

### `Alert.prompt` 仅 iOS 支持
- 现象：Android 设备上"替换"确认输入框不显示或报错
- 原因：`Alert.prompt` 是 iOS-only API，Android 直接被忽略
- 解决：用自定义 `Modal + TextInput` 替代（参考 `SettingsScreen.tsx` 中 `confirmReplaceVisible` 实现）

### 数据备份格式（JSON）
- **JSON 导出/导入**：含 `mood_records` + `notificationSettings` + 元数据（version/exportedAt/count），适合跨设备完整恢复
- 导入后会 `cancelAllScheduledNotificationsAsync` 并 reschedule（如果备份含通知设置）

### gh CLI 路径
- 正确路径：`C:\Program Files\GitHub CLI\gh.exe`
- 系统PATH中的 `gh` 可能指向错误的脚本

### PowerShell 执行策略阻断 npx / npm
- 现象：`PSSecurityException` 或脚本无法运行
- 解决：用 `powershell -ExecutionPolicy Bypass -Command "..."` 包装

### npx 传 npm 参数失败
- 不要用 `npx ... -- --npm-flag=...`
- 直接用 `npm install --xxx` 替代

---

## 快速参考（最常用命令速查）

```powershell
# ===== 日常开发 =====
# 启动 dev server
npx expo start

# ===== Prebuild =====
# 增量 prebuild（多数情况）
npx expo prebuild --platform android --no-install

# 完全重建（慎用，会清 cxx 缓存触发 native 重编译）
npx expo prebuild --platform android --no-install --clean

# ===== Build =====
# 构建 Release APK
cd android; .\gradlew assembleRelease

# 构建后必须验证版本号
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\34.0.0\aapt.exe" dump badging app\build\outputs\apk\release\app-release.apk | Select-String "package"

# ===== Git =====
git add <files>
git commit -m "feat/fix/docs: 中文描述"
git push origin main

# ===== GitHub Release =====
# 一次性登录（永久有效）
& "C:\Program Files\GitHub CLI\gh.exe" auth login --hostname github.com --git-protocol https --web

# 创建 release（用 --notes-file 避免 emoji glob 问题）
gh release create v<版本号> "android\app\build\outputs\apk\release\app-release.apk#TapMood-v<版本号>.apk" --repo sctale/TapMood --title "v<版本号>" --notes-file release_notes.md

# 覆盖已发布 release 的 APK（修正版本号后）
gh release upload v<版本号> android\app\build\outputs\apk\release\app-release.apk#TapMood-v<版本号>.apk --repo sctale/TapMood --clobber
```
