$ffmpeg = "D:\bin\ffmpeg.exe"
$assets = Join-Path $PSScriptRoot "assets"
$res = Join-Path $PSScriptRoot "android\app\src\main\res"

$sizes = @{
    "mdpi" = 48
    "hdpi" = 72
    "xhdpi" = 96
    "xxhdpi" = 144
    "xxxhdpi" = 192
}

$adaptiveSize = 432

foreach ($dpi in $sizes.Keys) {
    $size = $sizes[$dpi]
    $targetDir = "$res\mipmap-$dpi"

    Write-Host "Processing $dpi ($size x $size)..."

    & $ffmpeg -y -i "$assets\icon.png" -vf "scale=$size`:$size" -c:v libwebp -lossless 1 "$targetDir\ic_launcher.webp" 2>$null | Out-Null

    & $ffmpeg -y -i "$assets\icon.png" -vf "scale=$size`:$size" -c:v libwebp -lossless 1 "$targetDir\ic_launcher_round.webp" 2>$null | Out-Null

    & $ffmpeg -y -i "$assets\android-icon-background.png" -vf "scale=$adaptiveSize`:$adaptiveSize" -c:v libwebp -lossless 1 "$targetDir\ic_launcher_background.webp" 2>$null | Out-Null

    & $ffmpeg -y -i "$assets\android-icon-foreground.png" -vf "scale=$adaptiveSize`:$adaptiveSize" -c:v libwebp -lossless 1 "$targetDir\ic_launcher_foreground.webp" 2>$null | Out-Null

    & $ffmpeg -y -i "$assets\android-icon-monochrome.png" -vf "scale=$adaptiveSize`:$adaptiveSize,format=gray" -c:v libwebp -lossless 1 "$targetDir\ic_launcher_monochrome.webp" 2>$null | Out-Null
}

Write-Host ""
Write-Host "All icons replaced!"