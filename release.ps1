# 一键发布脚本：prebuild -> 替换图标 -> 构建 Release APK -> 验证 -> 上传 GitHub Release
# 用法：
#   .\release.ps1                       完整流程（默认 patch bump 0.2.0 -> 0.2.1）
#   .\release.ps1 -BumpType minor       升级次版本号（0.2.0 -> 0.3.0）
#   .\release.ps1 -BumpType major       升级主版本号（0.2.0 -> 1.0.0）
#   .\release.ps1 -BumpType none        不升级版本号
#   .\release.ps1 -SkipPrebuild         跳过 prebuild
#   .\release.ps1 -SkipBuild            跳过构建（只做 release 上传）
#   .\release.ps1 -UploadOnly           只上传已存在的 APK
#   .\release.ps1 -Draft                创建为 draft release
#   .\release.ps1 -NotesFile <path>     自定义 release notes 文件

[CmdletBinding()]
param(
    [ValidateSet("none", "patch", "minor", "major")]
    [string]$BumpType = "patch",

    [switch]$SkipPrebuild,
    [switch]$SkipBuild,
    [switch]$SkipChecks,
    [switch]$UploadOnly,
    [switch]$Draft,
    [string]$NotesFile
)

$ErrorActionPreference = "Stop"

# ============== 路径配置 ==============
$ProjectRoot = $PSScriptRoot
$AppJson = Join-Path $ProjectRoot "app.json"
$PackageJson = Join-Path $ProjectRoot "package.json"
$ApkSource = Join-Path $ProjectRoot "android\app\build\outputs\apk\release\app-release.apk"
# 产物文件名在解析出版本号后确定（带版本，与 README 的下载说明一致）
$ApkDest = $null

# Android SDK 工具路径（按 build-tools 版本从高到低挑，避免硬编码 34.0.0）
$AndroidSdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$BuildTools = $null
if (Test-Path (Join-Path $AndroidSdk "build-tools")) {
    $BuildTools = Get-ChildItem -Path (Join-Path $AndroidSdk "build-tools") -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName "aapt.exe") } |
        Sort-Object { try { [Version]$_.Name } catch { [Version]"0.0.0" } } -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}
$Aapt = if ($BuildTools) { Join-Path $BuildTools "aapt.exe" } else { $null }
$Zipalign = if ($BuildTools) { Join-Path $BuildTools "zipalign.exe" } else { $null }
$Adb = Join-Path $AndroidSdk "platform-tools\adb.exe"

# gh CLI 完整路径
$Gh = "C:\Program Files\GitHub CLI\gh.exe"

# ============== 工具函数 ==============
# Windows PowerShell 5.1 的 Set-Content -Encoding UTF8 会写入 BOM，
# BOM 会让 Expo 读取 app.json / package.json 时报 JSON 解析错误，因此统一用无 BOM 写回。
function Write-Utf8NoBom {
    param(
        [string]$Path,
        [string]$Content
    )
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "===== $Message =====" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Message)
    Write-Host "[ERR] $Message" -ForegroundColor Red
}

<#
  安全执行外部命令。

  PowerShell 5.1 在 $ErrorActionPreference='Stop' 下把 `cmd 2>&1` 捕获到的 stderr
  当成错误记录，并升级为**终止性异常** —— git push / tag 的正常进度输出全走 stderr，
  于是「命令其实成功了、脚本却当场中止」，v0.3.3 就是在 push 那一行停掉、
  后面的 tag 与 Release 上传没跑。这里临时把首选项降为 Continue，
  统一用 $LASTEXITCODE 判断成败。
#>
function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory)][scriptblock]$Command,
        [switch]$AllowFailure
    )

    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $output = $null
    $exit = $null
    try {
        $output = & $Command 2>&1
        $exit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }

    $text = ($output | Out-String).Trim()
    if ($exit -ne 0 -and -not $AllowFailure) {
        throw "命令失败 (exit $exit): $($Command.ToString())`n$text"
    }

    return [pscustomobject]@{ ExitCode = $exit; Output = $text }
}

<#
  停掉 Gradle 守护进程。

  优先用工程自带的 gradlew --stop；但 --clean 失败过一次之后 android/ 会被删成半截、
  gradlew 都不在了，这时只能按命令行精确匹配 GradleDaemon 进程来停
  （只停命令行里带 GradleDaemon 的 java，不动其它 Java 程序）。
#>
function Stop-GradleDaemonsIfNeeded {
    $gradlewBat = Join-Path (Join-Path $ProjectRoot "android") "gradlew.bat"
    if (Test-Path $gradlewBat) {
        $stop = Invoke-NativeCommand -AllowFailure { & $gradlewBat --stop }
        if ($stop.ExitCode -eq 0) {
            Write-Host "  已停止 Gradle 守护进程（gradlew --stop）"
            return
        }
    }

    $killed = 0
    try {
        $javaProcs = Get-CimInstance Win32_Process -Filter "Name='java.exe'" -ErrorAction SilentlyContinue
        foreach ($proc in $javaProcs) {
            if ("$($proc.CommandLine)" -match 'GradleDaemon') {
                Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
                $killed++
            }
        }
    } catch {
        Write-Warn "检查 Gradle 守护进程失败：$_"
    }
    if ($killed -gt 0) {
        Write-Host "  已强制停止 $killed 个 Gradle 守护进程"
        Start-Sleep -Seconds 3
    }
}

<#
  从 CHANGELOG.md 里取出当前版本那一节，作为 Release 正文。
  以前是先找根目录的 release_notes.md（该文件被 .gitignore 忽略、内容常年是旧版本），
  结果 v0.3.3/v0.3.4 的 Release 正文写的都是 v0.2.2 的说明。
#>
function Get-ChangelogSection {
    param(
        [string]$Path,
        [string]$Version
    )

    if (-not (Test-Path $Path)) { return $null }
    $raw = Get-Content $Path -Raw -Encoding UTF8
    $escaped = [regex]::Escape($Version)
    $match = [regex]::Match($raw, "(?ms)^\s*## \[$escaped\].*?(?=^\s*## \[|\z)")
    if (-not $match.Success) { return $null }
    return $match.Value.Trim()
}

function Get-RepoOwner {
    $remoteUrl = git -C $ProjectRoot config --get remote.origin.url
    if ($remoteUrl -match "github\.com[:/](.+?)/(.+?)(?:\.git)?$") {
        return @{ Owner = $Matches[1]; Repo = $Matches[2] }
    }
    throw "无法解析 remote URL: $remoteUrl"
}

function Update-Version {
    param(
        [string]$Path,
        [string]$OldVersion,
        [string]$NewVersion,
        [string]$JsonKey = "version"
    )

    $content = Get-Content $Path -Raw -Encoding UTF8
    $newContent = $content -replace [regex]::Escape("`"$JsonKey`": `"$OldVersion`""), "`"$JsonKey`": `"$NewVersion`""
    Write-Utf8NoBom -Path $Path -Content $newContent
}

function Update-VersionCode {
    param(
        [string]$Path,
        [int]$NewCode
    )

    $content = Get-Content $Path -Raw -Encoding UTF8
    $newContent = [regex]::Replace($content, '("versionCode"\s*:\s*)\d+', "`${1}$NewCode")
    if ($newContent -eq $content) {
        Write-Warn "app.json 中未找到 versionCode 字段，未更新"
        return
    }
    Write-Utf8NoBom -Path $Path -Content $newContent
}

function Get-ParsedVersion {
    param([string]$Version)
    $parts = $Version.Split('.')
    return @{
        Major = [int]$parts[0]
        Minor = [int]$parts[1]
        Patch = [int]$parts[2]
    }
}

function Format-Version {
    param([hashtable]$V)
    return "$($V.Major).$($V.Minor).$($V.Patch)"
}

function Get-DerivedVersionCode {
    param([string]$Version)
    $v = Get-ParsedVersion $Version
    return $v.Major * 10000 + $v.Minor * 100 + $v.Patch
}

# ============== 步骤 1: 检查环境 ==============
Write-Step "1/8 检查环境"


# node 与 npx 必须来自同一个目录：npm 自带的 npx.cmd 先找自己 %~dp0 下的 node.exe，
# 找不到就退回 PATH。PATH 里若有一个同名但只剩 node_modules 的目录抢在前面，
# npx 就会以「"node" 不是内部或外部命令 / Cannot find module ... npm-prefix.js」失败，
# 看起来像 node 没装，实际直接把 prebuild 那步打断（v0.3.12 首次发布就断在这里）。
# 这里不要求排查具体是哪一层遮蔽：只把 node.exe 所在目录提到 PATH 最前，
# 已用「复制一份 npx.cmd 到没有 node.exe 的目录并置于 PATH 首位」复现并验证过。
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Err "未找到 node，请安装 Node.js 并确认它在 PATH 中"
    exit 1
}
$npxCmd = Get-Command npx -ErrorAction SilentlyContinue
if (-not $npxCmd) {
    Write-Err "未找到 npx（随 Node.js 一起安装）"
    exit 1
}
$nodeDir = Split-Path $nodeCmd.Source -Parent
$npxDir = Split-Path $npxCmd.Source -Parent
if (-not (Test-Path (Join-Path $npxDir "node.exe"))) {
    Write-Warn "npx 所在目录（$npxDir）里没有 node.exe，已把 node 目录（$nodeDir）提到 PATH 最前"
    $env:PATH = "$nodeDir;$env:PATH"
}

if (-not (Test-Path $AppJson)) {
    Write-Err "未找到 app.json，请在项目根目录运行"
    exit 1
}

if (-not (Test-Path $Gh)) {
    Write-Warn "未找到 gh CLI: $Gh"
    Write-Warn "请从 https://cli.github.com/ 安装"
}

# 检查 git 状态
$gitStatus = git -C $ProjectRoot status --short
if ($gitStatus -and -not $UploadOnly) {
    Write-Warn "git 工作区不干净："
    git -C $ProjectRoot status --short | Select-Object -First 5 | ForEach-Object { Write-Host "  $_" }
    $answer = Read-Host "继续？(y/N)"
    if ($answer -ne "y" -and $answer -ne "Y") {
        Write-Err "已取消"
        exit 1
    }
}

# ============== 步骤 2: 升级版本号 ==============
$currentVersion = (Get-Content $AppJson -Raw -Encoding UTF8 | ConvertFrom-Json).expo.version
$newVersion = $currentVersion

if ($BumpType -ne "none") {
    Write-Step "2/8 升级版本号 ($BumpType)"

    $v = Get-ParsedVersion $currentVersion
    switch ($BumpType) {
        "major" { $v.Major++; $v.Minor = 0; $v.Patch = 0 }
        "minor" { $v.Minor++; $v.Patch = 0 }
        "patch" { $v.Patch++ }
    }
    $newVersion = Format-Version $v
    $newVersionCode = Get-DerivedVersionCode $newVersion

    Write-Host "  $currentVersion -> $newVersion  (versionCode = $newVersionCode)"

    Update-Version -Path $AppJson -OldVersion $currentVersion -NewVersion $newVersion -JsonKey "version"
    Update-VersionCode -Path $AppJson -NewCode $newVersionCode
    Update-Version -Path $PackageJson -OldVersion $currentVersion -NewVersion $newVersion

    # 同步到 CHANGELOG
    $changelogPath = Join-Path $ProjectRoot "CHANGELOG.md"
    if (Test-Path $changelogPath) {
        $cl = Get-Content $changelogPath -Raw -Encoding UTF8
        $today = Get-Date -Format "yyyy-MM-dd"
        $newEntry = @"

## [$newVersion] - $today

- 待补充

"@
        $cl = $cl -replace "(?s)(# 更新日志[^\n]*\n+)", "`$1$newEntry"
        Write-Utf8NoBom -Path $changelogPath -Content $cl
        Write-Success "CHANGELOG.md 已添加 [$newVersion] 占位条目"
    }

    Write-Success "版本号升级: $currentVersion -> $newVersion"
} else {
    Write-Step "2/8 跳过版本号升级（当前 $currentVersion）"
}

# 产物与资产名：anti-motion-sickness-vX.Y.Z.apk（与 README/AGENTS 的下载说明一致）
$ApkDest = Join-Path $ProjectRoot "anti-motion-sickness-v$newVersion.apk"
$legacyApk = Join-Path $ProjectRoot "anti-car-sickness-rn.apk"
Write-Host "  产物: $((Split-Path $ApkDest -Leaf))"

# ============== 步骤 3: Git 提交版本号变更 ==============
if ($BumpType -ne "none") {
    Write-Step "3/8 提交版本号变更"
    Invoke-NativeCommand { git -C $ProjectRoot add app.json package.json CHANGELOG.md } | Out-Null
    $commit = Invoke-NativeCommand -AllowFailure { git -C $ProjectRoot commit -m "chore(release): 升级到 v$newVersion" }
    if ($commit.ExitCode -ne 0) {
        Write-Warn "commit 失败或无变更: $($commit.Output)"
    } else {
        Write-Success "已提交"
    }
}

# ============== 步骤 3.5: 前置检查（构建前拦住明显 break） ==============
if (-not $SkipChecks -and -not $UploadOnly -and -not $SkipBuild) {
    Write-Step "3.5/8 前置检查（tsc + 算法验证台）"

    Push-Location $ProjectRoot
    try {
        # 两道检查都必须走 Invoke-NativeCommand：全局 ErrorActionPreference=Stop 下，
        # npx / kotlinc 写到 stderr 的正常输出会被升级成终止性异常，
        # 表现为「脚本刚打印第一行就死掉」（实测踩过，且失败点正是这道本该保命的门）。
        $tsc = Invoke-NativeCommand -AllowFailure { & npx tsc --noEmit }
        if ($tsc.ExitCode -ne 0) {
            Write-Err "TypeScript 类型检查失败：`n$($tsc.Output)"
            exit 1
        }
        Write-Success "tsc --noEmit 通过"

        # 算法验证台（纯 Kotlin，改过 native/android 后必须通过）
        if (Get-Command bash -ErrorAction SilentlyContinue) {
            $verify = Invoke-NativeCommand -AllowFailure { & bash tools/verify/run.sh }
            if ($verify.ExitCode -ne 0) {
                Write-Err "算法验证台断言失败：`n$($verify.Output)"
                exit 1
            }
            $passed = ($verify.Output -split "`n" | Where-Object { $_ -match '断言通过' } | Select-Object -First 1)
            Write-Success $(if ($passed) { "tools/verify：$($passed.Trim())" } else { "tools/verify 全部断言通过" })
        } else {
            Write-Warn "未找到 bash，跳过算法验证台"
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Step "3.5/8 跳过前置检查"
}

# ============== 步骤 4: Prebuild ==============
if (-not $SkipPrebuild -and -not $UploadOnly) {
    Write-Step "4/8 Prebuild 生成原生代码"
    Push-Location $ProjectRoot
    try {
        # Gradle 守护进程会锁住 android/app/build 下的中间产物，导致 --clean 删不掉
        # android/ 目录（EBUSY: resource busy or locked）—— 实测踩过，而且失败后
        # android/ 会被删成半截，只能重新生成。所以 prebuild 前先停守护进程。
        Stop-GradleDaemonsIfNeeded

        # 必须 --clean：不 clean 时 android/ 会被复用，历史手改的配置长期滞留、
        # 与 app.json 悄悄漂移。实测踩过：gradle.properties 里 newArchEnabled 停在 false，
        # RN 0.85 以旧架构启动新运行时 → 点图标直接闪退。
        # 原生源码与配置项现在全部由 Config Plugin 重新注入，clean 是安全的。
        $prebuild = Invoke-NativeCommand -AllowFailure { & npx expo prebuild --platform android --no-install --clean }
        if ($prebuild.ExitCode -ne 0 -and $prebuild.Output -match 'EBUSY') {
            Write-Warn "prebuild 遇到 EBUSY（android/ 被占用），停守护进程后重试一次"
            Stop-GradleDaemonsIfNeeded
            Start-Sleep -Seconds 5
            $prebuild = Invoke-NativeCommand -AllowFailure { & npx expo prebuild --platform android --no-install --clean }
        }
        if ($prebuild.ExitCode -ne 0) {
            Write-Err "prebuild 失败：`n$($prebuild.Output)"
            exit 1
        }
        Write-Success "prebuild 完成（--clean，原生配置与 app.json 一致）"

        # 桌面显示名：Expo 56 的 prebuild 会在所有 Config Plugin **之后**用模板重写
        # res/values/strings.xml，所以插件里改 app_name 会被覆盖（实测：插件写入成功、文件仍是工程 slug）。
        # 真源仍然是 app.json 的 android.applicationName，这里只是在 prebuild 后补一刀。
        $appName = (Get-Content $AppJson -Raw -Encoding UTF8 | ConvertFrom-Json).expo.android.applicationName
        if ($appName) {
            $stringsPath = Join-Path $ProjectRoot "android\app\src\main\res\values\strings.xml"
            if (-not (Test-Path $stringsPath)) {
                Write-Err "prebuild 后找不到 strings.xml，无法设置桌面显示名：$stringsPath"
                exit 1
            }
            $stringsRaw = Get-Content $stringsPath -Raw -Encoding UTF8
            $appNode = [regex]::Match($stringsRaw, '<string name="app_name">.*?</string>')
            if (-not $appNode.Success) {
                Write-Err "strings.xml 里没有 app_name 节点，拒绝静默跳过"
                exit 1
            }
            $stringsNew = $stringsRaw.Replace($appNode.Value, "<string name=`"app_name`">$appName</string>")
            Write-Utf8NoBom -Path $stringsPath -Content $stringsNew
            Write-Success "桌面显示名写入 strings.xml：$appName"
        }

        # 陈旧原生源码守卫：Config Plugin 会按清单清理上一次注入、本次已删除的 .kt。
        # 如果仍有「不在 native/android 里、也不是模板文件」的 .kt 残留，说明注入链有问题，
        # 继续构建只会在 Kotlin 编译期报 unresolved reference。
        $javaDir = Get-ChildItem -Path (Join-Path $ProjectRoot "android\app\src\main\java") -Directory -Recurse |
            Where-Object { Test-Path (Join-Path $_.FullName "OverlayService.kt") } |
            Select-Object -First 1 -ExpandProperty FullName
        if ($javaDir) {
            $expected = @((Get-ChildItem (Join-Path $ProjectRoot "native\android") -Filter *.kt).Name) +
                @("MainActivity.kt", "MainApplication.kt")
            $extra = (Get-ChildItem $javaDir -Filter *.kt).Name | Where-Object { $expected -notcontains $_ }
            if ($extra) {
                throw ("prebuild 后仍存在陈旧原生文件: $($extra -join ', ')（应由 plugins/withOverlayModule.js 清理）")
            }
            Write-Success "原生源码注入完整，无陈旧文件残留"

            # mod 在「复用 android/ 目录」时容易变成空操作（历史上就踩过：
            # OverlayPackage 已注册 → 提前 return → 崩溃留存注入没执行）。
            # 所以注入结果必须实测，不能只看插件跑完了。
            $app = Get-Content (Join-Path $javaDir "MainApplication.kt") -Raw -Encoding UTF8
            foreach ($needle in @("add(OverlayPackage())", "CrashCapture.install(this)")) {
                if ($app -notmatch [regex]::Escape($needle)) {
                    throw "MainApplication.kt 缺少注入项：$needle（Config Plugin 未生效，构建中止）"
                }
            }
            Write-Success "MainApplication 注入项已校验（OverlayPackage / CrashCapture）"
        } else {
            Write-Warn "未在原生产工程中找到 OverlayService.kt，Config Plugin 可能未生效"
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Step "4/8 跳过 prebuild"
}

# ============== 步骤 5: 替换图标 ==============
if (-not $UploadOnly) {
    Write-Step "5/8 替换应用图标"
    $replaceIcons = Join-Path $ProjectRoot "replace_icons.ps1"
    if (Test-Path $replaceIcons) {
        $icons = Invoke-NativeCommand -AllowFailure { & powershell -ExecutionPolicy Bypass -File $replaceIcons }
        if ($icons.ExitCode -ne 0) {
            Write-Warn "图标替换失败，继续构建：$($icons.Output)"
        } else {
            Write-Success "图标已替换"
        }
    } else {
        Write-Warn "未找到 replace_icons.ps1，跳过"
    }
} else {
    Write-Step "5/8 跳过图标替换"
}

# ============== 步骤 6: 构建 Release APK ==============
if (-not $SkipBuild -and -not $UploadOnly) {
    Write-Step "6/8 构建 Release APK"
    $androidDir = Join-Path $ProjectRoot "android"
    if (-not (Test-Path $androidDir)) {
        Write-Err "android 目录不存在，请先 prebuild"
        exit 1
    }

    Push-Location $androidDir
    try {
        # gradle 的正常进度与告警全走 stderr，裸调用在 Stop 策略下会当场中止脚本
        $build = Invoke-NativeCommand -AllowFailure { & .\gradlew assembleRelease }
        if ($build.ExitCode -ne 0) {
            Write-Err "构建失败："
            ($build.Output -split "`n" | Select-Object -Last 40) | ForEach-Object { Write-Host $_ }
            exit 1
        }
        Write-Success "构建完成"
    } finally {
        Pop-Location
    }
} else {
    Write-Step "6/8 跳过构建"
}

# ============== 步骤 7: 验证 APK 版本号 ==============
Write-Step "7/8 验证 APK"

if (-not (Test-Path $ApkSource)) {
    Write-Err "APK 不存在: $ApkSource"
    Write-Err "请先构建 APK，或检查 -SkipBuild/-UploadOnly 参数"
    exit 1
}

Copy-Item $ApkSource $ApkDest -Force
Write-Success "已复制到: $ApkDest"
if (Test-Path $legacyApk) {
    Write-Warn "旧版无版本号产物仍存在：$((Split-Path $legacyApk -Leaf))（可自行删除，现在一律输出带版本号的包名）"
}

if ($Aapt -and (Test-Path $Aapt)) {
    $badging = Invoke-NativeCommand -AllowFailure { & $Aapt dump badging $ApkDest }
    $aaptOutput = $badging.Output -split "`n" | Select-String "package:"
    Write-Host $aaptOutput

    if ($aaptOutput -match "versionName='v?$newVersion'") {
        Write-Success "APK versionName = $newVersion ✓"
    } else {
        Write-Warn "APK versionName 与 app.json 不一致！请检查 android/app/build.gradle"
    }
} else {
    Write-Warn "未找到 aapt（SDK: $AndroidSdk），跳过版本号验证"
}

    # 桌面名字要在产物里核对：v0.3.16 曾「改了 app.json 却仍是工程 slug」，
    # 说明 prebuild 之后还有一手，光看配置不够。
    $wantLabel = (Get-Content $AppJson -Raw -Encoding UTF8 | ConvertFrom-Json).expo.android.applicationName
    if ($wantLabel) {
        $labelLine = ($badging.Output -join "`n")
        if ($labelLine -match "application-label:'$([regex]::Escape($wantLabel))'") {
            Write-Success "APK application-label = $wantLabel ✓"
        } else {
            $actual = [regex]::Match($labelLine, "application-label:'([^']*)'").Groups[1].Value
            Write-Err "APK 桌面名字不对：期望「$wantLabel」，实际「$actual」（发布中止）"
            exit 1
        }
    }

# 16KB 页对齐校验：Android 15+ 的 16KB 设备装不上未对齐的 APK。
# 之前 README/AGENTS 只是「声称已配置」，这里改成对产物做实测。
if ($Zipalign -and (Test-Path $Zipalign)) {
    $align = Invoke-NativeCommand -AllowFailure { & $Zipalign -c -P 16 -v 4 $ApkDest }
    $alignOut = $align.Output -split "`n"
    if ($align.ExitCode -eq 0) {
        Write-Success "APK 内全部 .so 已 16KB 页对齐 ✓"
    } else {
        $unaligned = $alignOut | Select-String -Pattern "lib/.*\.so" | Select-Object -First 8
        Write-Err "APK 存在未 16KB 对齐的 so 库，Android 15+ 16KB 设备将无法安装（发布中止）："
        $unaligned | ForEach-Object { Write-Host "  $_" }
        exit 1
    }
} else {
    Write-Warn "未找到 zipalign，跳过 16KB 对齐校验（build-tools 需 ≥ 34）"
}

# ============== 步骤 8: 推送到 GitHub Release ==============
Write-Step "8/8 推送到 GitHub Release"

$repo = Get-RepoOwner
$repoSlug = "$($repo.Owner)/$($repo.Repo)"

# 推送 git 变更（git 的进度输出走 stderr，必须用 Invoke-NativeCommand，
# 否则「push 实际成功但脚本当场中止」，tag 与 Release 就不会执行）
$push = Invoke-NativeCommand -AllowFailure { git -C $ProjectRoot push origin main }
if ($push.ExitCode -ne 0) {
    Write-Warn "git push 失败或无更新：$($push.Output)"
} else {
    Write-Success "git push 完成"
}

if (-not (Test-Path $Gh)) {
    Write-Err "未找到 gh CLI: $Gh，无法创建 Release。请先安装或登录：`n  `"$Gh`" auth login"
    exit 1
}

# 创建 / 推送 tag
$tagName = "v$newVersion"

$existingTag = Invoke-NativeCommand -AllowFailure { git -C $ProjectRoot rev-parse -q --verify "refs/tags/$tagName" }
if ($existingTag.ExitCode -eq 0 -and $existingTag.Output) {
    Write-Warn "本地已存在 tag $tagName，跳过创建（需要覆盖请手动 git tag -f + push -f）"
} else {
    Invoke-NativeCommand { git -C $ProjectRoot tag -a $tagName -m $tagName } | Out-Null
    Write-Success "tag $tagName 已创建"
}

$pushTag = Invoke-NativeCommand -AllowFailure { git -C $ProjectRoot push origin $tagName }
if ($pushTag.ExitCode -ne 0) {
    Write-Err "tag 推送失败：$($pushTag.Output)"
    exit 1
}
Write-Success "tag $tagName 已推送"

# Release 正文：显式 -NotesFile > CHANGELOG 当前版本小节 > 兜底一句话
# （不再回落到根目录 release_notes.md —— 它被 gitignore 忽略、内容常年是旧版本）
$notesPath = $NotesFile
if ($notesPath -and -not (Test-Path $notesPath)) {
    Write-Err "指定的 -NotesFile 不存在: $notesPath"
    exit 1
}
if (-not $notesPath) {
    $section = Get-ChangelogSection -Path (Join-Path $ProjectRoot "CHANGELOG.md") -Version $newVersion
    if ($section) {
        $notesPath = Join-Path $env:TEMP "anti-motion-sickness-$tagName-notes.md"
        Write-Utf8NoBom -Path $notesPath -Content $section
        Write-Success "Release 正文取自 CHANGELOG.md 的 [$newVersion] 小节"
    } else {
        Write-Warn "CHANGELOG.md 没有 [$newVersion] 小节，Release 正文使用兜底文案"
    }
}

# 先保证 Release 存在，再上传资产：原来的「upload 失败就 create」会把 create 的
# 输出当成上传结果，出问题时看不出到底是哪一步失败。
$releaseView = Invoke-NativeCommand -AllowFailure { & $Gh release view $tagName --repo $repoSlug }
if ($releaseView.ExitCode -ne 0) {
    $createArgs = @(
        "release", "create", $tagName,
        "--repo", $repoSlug,
        "--title", $tagName
    )
    if ($notesPath) {
        $createArgs += @("--notes-file", $notesPath)
    } else {
        $createArgs += @("--notes", "v$newVersion（详见 CHANGELOG.md）")
    }
    if ($Draft) {
        $createArgs += "--draft"
    }
    $create = Invoke-NativeCommand -AllowFailure { & $Gh @createArgs }
    if ($create.ExitCode -ne 0) {
        Write-Err "创建 Release 失败：$($create.Output)"
        exit 1
    }
    Write-Success "Release $tagName 已创建"
} else {
    Write-Success "Release $tagName 已存在"
    # 已存在的 Release 也要刷新正文：否则补写了 CHANGELOG 小节，
    # 重新跑发布时 GitHub 上还挂着上一次的说明
    if ($notesPath) {
        $edit = Invoke-NativeCommand -AllowFailure {
            & $Gh release edit $tagName --repo $repoSlug --notes-file $notesPath
        }
        if ($edit.ExitCode -ne 0) {
            Write-Warn "Release 正文更新失败：$($edit.Output)"
        } else {
            Write-Success "Release 正文已按 CHANGELOG 更新"
        }
    }
    Write-Success "上传覆盖 APK"
}

# 资产名直接由文件名决定（不再用 path#label 语法：在 PowerShell 传参下不生效，
# 结果 GitHub 上的资产一直叫 anti-car-sickness-rn.apk，和文档承诺的名字不一致）
$upload = Invoke-NativeCommand -AllowFailure { & $Gh release upload $tagName $ApkDest --repo $repoSlug --clobber }
if ($upload.ExitCode -ne 0) {
    Write-Err "APK 上传失败：$($upload.Output)"
    exit 1
}
Write-Success "APK 已上传"

Write-Host ""
Write-Host "下载链接: https://github.com/$repoSlug/releases/tag/$tagName" -ForegroundColor Green
Write-Host ""
Write-Success "全部完成 ✓"

