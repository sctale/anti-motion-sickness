# 把 assets/ 里生成的素描图标转成各 dpi 的 mipmap。
#
# 这个脚本以前有两个静默失败点，都会让「图标没换」一路混到发布产物里：
#   1. ffmpeg 路径硬编码，本机没有就直接抛在管道里被吞掉；
#   2. 每条转换都 `2>$null | Out-Null` 且不检查退出码与产物，失败时旧文件原样留下，
#      日志照样打印 "All icons replaced!"。v0.3.11 的启动页占位图就是这么混过去的。
# 现在任何一步失败都立即以非零码退出，交给 release.ps1 中止发布。

$ErrorActionPreference = "Stop"

$assets = Join-Path $PSScriptRoot "assets"
$res = Join-Path $PSScriptRoot "android\app\src\main\res"

function Resolve-Ffmpeg {
    $pinned = "D:\bin\ffmpeg.exe"
    if (Test-Path $pinned) { return $pinned }
    $cmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

$ffmpeg = Resolve-Ffmpeg
if (-not $ffmpeg) {
    Write-Error "未找到 ffmpeg（试过 D:\bin\ffmpeg.exe 与 PATH）。图标无法生成，发布应中止。"
    exit 1
}

$sizes = @{
    "mdpi"    = 48
    "hdpi"    = 72
    "xhdpi"   = 96
    "xxhdpi"  = 144
    "xxxhdpi" = 192
}

$adaptiveSize = 432

# 源文件必须都在：少一个就会「转出一半图标」而看起来仍然像成功
$requiredSources = @(
    "icon.png",
    "android-icon-background.png",
    "android-icon-foreground.png",
    "android-icon-monochrome.png"
)
foreach ($name in $requiredSources) {
    $src = Join-Path $assets $name
    if (-not (Test-Path $src)) {
        Write-Error "缺少图标源文件 $src —— 先运行 node tools/icons/render.mjs"
        exit 1
    }
}

function Convert-Icon {
    param(
        [string]$Source,
        [string]$Target,
        [int]$Width,
        [int]$Height,
        [switch]$Gray
    )

    $vf = "scale=$($Width):$($Height)"
    if ($Gray) { $vf = "$vf,format=gray" }

    # 先删掉旧产物：万一 ffmpeg 失败，不会留下「上一版的文件还在」这种假成功
    if (Test-Path $Target) { Remove-Item $Target -Force }

    # ffmpeg 的正常进度全写在 stderr；在 ErrorActionPreference=Stop 下会被升级成
    # 终止性异常（这个坑在 release.ps1 里踩过，处理方式相同）：调用期间放宽，退出码另行判断。
    $prevPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $ffmpeg -y -i $Source -vf $vf -c:v libwebp -lossless 1 $Target 2>&1 | Out-Null
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevPreference
    }

    if ($code -ne 0) {
        Write-Error "ffmpeg 转换失败（退出码 $code）：$Source -> $Target"
        exit 1
    }
    if (-not (Test-Path $Target)) {
        Write-Error "ffmpeg 声称成功但没有产出文件：$Target"
        exit 1
    }
    if ((Get-Item $Target).Length -eq 0) {
        Write-Error "产出的图标文件是空的：$Target"
        exit 1
    }
}

$converted = 0
foreach ($dpi in $sizes.Keys) {
    $size = $sizes[$dpi]
    $targetDir = "$res\mipmap-$dpi"
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

    Write-Host "Processing $dpi ($size x $size)..."

    Convert-Icon -Source "$assets\icon.png" -Target "$targetDir\ic_launcher.webp" -Width $size -Height $size
    Convert-Icon -Source "$assets\icon.png" -Target "$targetDir\ic_launcher_round.webp" -Width $size -Height $size
    Convert-Icon -Source "$assets\android-icon-background.png" -Target "$targetDir\ic_launcher_background.webp" -Width $adaptiveSize -Height $adaptiveSize
    Convert-Icon -Source "$assets\android-icon-foreground.png" -Target "$targetDir\ic_launcher_foreground.webp" -Width $adaptiveSize -Height $adaptiveSize
    Convert-Icon -Source "$assets\android-icon-monochrome.png" -Target "$targetDir\ic_launcher_monochrome.webp" -Width $adaptiveSize -Height $adaptiveSize -Gray
    $converted += 5
}

Write-Host ""
Write-Host "All icons replaced! ($converted 个文件，ffmpeg: $ffmpeg)"
