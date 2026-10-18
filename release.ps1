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
$ApkDest = Join-Path $ProjectRoot "anti-car-sickness-rn.apk"

# Android SDK 工具路径（aapt 按 build-tools 版本从高到低自动挑选，避免硬编码 34.0.0）
$AndroidSdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$Aapt = $null
if (Test-Path (Join-Path $AndroidSdk "build-tools")) {
    $Aapt = Get-ChildItem -Path (Join-Path $AndroidSdk "build-tools") -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName "aapt.exe") } |
        Sort-Object Name -Descending |
        Select-Object -First 1 -ExpandProperty FullName
    $Aapt = Join-Path $Aapt "aapt.exe"
}
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
$currentVersion = (Get-Content $AppJson -Raw | ConvertFrom-Json).expo.version
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

# ============== 步骤 3: Git 提交版本号变更 ==============
if ($BumpType -ne "none") {
    Write-Step "3/8 提交版本号变更"
    git -C $ProjectRoot add app.json package.json CHANGELOG.md 2>&1 | Out-Null
    $commitOutput = git -C $ProjectRoot commit -m "chore(release): 升级到 v$newVersion" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "commit 失败或无变更: $commitOutput"
    } else {
        Write-Success "已提交"
    }
}

# ============== 步骤 3.5: 前置检查（构建前拦住明显 break） ==============
if (-not $SkipChecks -and -not $UploadOnly -and -not $SkipBuild) {
    Write-Step "3.5/8 前置检查（tsc + 算法验证台）"

    Push-Location $ProjectRoot
    try {
        & npx tsc --noEmit
        if ($LASTEXITCODE -ne 0) { throw "TypeScript 类型检查失败" }
        Write-Success "tsc --noEmit 通过"

        # 算法验证台（纯 Kotlin，改过 native/android 后必须通过）
        if (Get-Command bash -ErrorAction SilentlyContinue) {
            & bash tools/verify/run.sh
            if ($LASTEXITCODE -ne 0) { throw "算法验证台断言失败" }
            Write-Success "tools/verify 全部断言通过"
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
        npx expo prebuild --platform android --no-install
        if ($LASTEXITCODE -ne 0) {
            throw "prebuild 失败"
        }
        Write-Success "prebuild 完成"

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
        & powershell -ExecutionPolicy Bypass -File $replaceIcons
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "图标替换失败，继续构建"
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
        .\gradlew assembleRelease
        if ($LASTEXITCODE -ne 0) {
            throw "构建失败"
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

if (Test-Path $Aapt) {
    $aaptOutput = & $Aapt dump badging $ApkDest 2>&1 | Select-String "package:"
    Write-Host $aaptOutput

    if ($aaptOutput -match "versionName='v?$newVersion'") {
        Write-Success "APK versionName = $newVersion ✓"
    } else {
        Write-Warn "APK versionName 与 app.json 不一致！请检查 android/app/build.gradle"
    }
} else {
    Write-Warn "未找到 aapt: $Aapt，跳过版本号验证"
}

# ============== 步骤 8: 推送到 GitHub Release ==============
Write-Step "8/8 推送到 GitHub Release"

$repo = Get-RepoOwner
$repoSlug = "$($repo.Owner)/$($repo.Repo)"

# 推送 git 变更
git -C $ProjectRoot push origin main 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Warn "git push 失败或无更新"
} else {
    Write-Success "git push 完成"
}

# 创建/获取 tag
$tagName = "v$newVersion"
git -C $ProjectRoot tag -a $tagName -m $tagName 2>&1 | Out-Null
git -C $ProjectRoot push origin $tagName 2>&1 | Out-Null
Write-Success "tag $tagName 已推送"

# release notes
if (-not $NotesFile) {
    $NotesFile = Join-Path $ProjectRoot "release_notes.md"
}
if (-not (Test-Path $NotesFile)) {
    $changelogPath = Join-Path $ProjectRoot "CHANGELOG.md"
    if (Test-Path $changelogPath) {
        $NotesFile = $changelogPath
    }
}

$uploadArgs = @(
    "release", "upload", $tagName,
    "`"$ApkDest`"#anti-motion-sickness-$tagName.apk",
    "--repo", $repoSlug,
    "--clobber"
)
& $Gh @uploadArgs 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) {
    Write-Warn "APK 上传失败，尝试创建 release..."

    $createArgs = @(
        "release", "create", $tagName,
        "`"$ApkDest`"#anti-motion-sickness-$tagName.apk",
        "--repo", $repoSlug,
        "--title", $tagName
    )
    if ($Draft) {
        $createArgs += "--draft"
    }
    if (Test-Path $NotesFile) {
        $createArgs += "--notes-file", "`"$NotesFile`""
    } else {
        $createArgs += "--notes", "v$newVersion 发布"
    }

    & $Gh @createArgs 2>&1 | ForEach-Object { Write-Host $_ }
}

if ($LASTEXITCODE -eq 0) {
    Write-Success "Release 完成！"
    Write-Host ""
    Write-Host "下载链接: https://github.com/$repoSlug/releases/tag/$tagName" -ForegroundColor Green
} else {
    Write-Err "Release 上传失败"
    exit 1
}

Write-Host ""
Write-Success "全部完成 ✓"
