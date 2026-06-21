# 生成极简清新风格的图标
Add-Type -AssemblyName System.Drawing

function New-AppIcon {
    param(
        [int]$Size,
        [string]$Path
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $bgColor = [System.Drawing.Color]::FromArgb(255, 99, 102, 241)

    $brush = New-Object System.Drawing.SolidBrush($bgColor)
    $g.FillRectangle($brush, 0, 0, $Size, $Size)
    $brush.Dispose()

    $scale = $Size / 1024.0

    $carBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

    $carWidth = [int](480 * $scale)
    $carHeight = [int](240 * $scale)
    $carX = [int](($Size - $carWidth) / 2)
    $carY = [int](($Size - $carHeight) / 2 - 30 * $scale)

    $carPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $carPath.AddRectangle((New-Object System.Drawing.Rectangle($carX, $carY + $carHeight * 0.3, $carWidth, $carHeight * 0.7)))
    $carPath.AddRectangle((New-Object System.Drawing.Rectangle($carX + $carWidth * 0.15, $carY, $carWidth * 0.7, $carHeight * 0.4)))
    $g.FillPath($carBrush, $carPath)

    $wheelSize = [int](80 * $scale)
    $wheelY = $carY + $carHeight + [int](20 * $scale) - $wheelSize / 2
    $wheel1X = $carX + [int]($carWidth * 0.18) - $wheelSize / 2
    $wheel2X = $carX + [int]($carWidth * 0.82) - $wheelSize / 2

    $wheelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 99, 102, 241))
    $g.FillEllipse($wheelBrush, $wheel1X, $wheelY, $wheelSize, $wheelSize)
    $g.FillEllipse($wheelBrush, $wheel2X, $wheelY, $wheelSize, $wheelSize)
    $wheelBrush.Dispose()

    $windowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 99, 102, 241))
    $windowX = $carX + [int]($carWidth * 0.2)
    $windowY = $carY + [int](10 * $scale)
    $windowW = [int]($carWidth * 0.6)
    $windowH = [int]($carHeight * 0.35)
    $g.FillRectangle($windowBrush, $windowX, $windowY, $windowW, $windowH)
    $windowBrush.Dispose()

    $dotSize = [int](60 * $scale)
    $dotColor = [System.Drawing.Color]::FromArgb(180, 255, 255, 255)
    $dotBrush = New-Object System.Drawing.SolidBrush($dotColor)

    $dotYTop = [int](150 * $scale)
    for ($i = 0; $i -lt 5; $i++) {
        $dotX = [int](200 * $scale) + $i * [int](155 * $scale)
        $g.FillEllipse($dotBrush, $dotX, $dotYTop, $dotSize, $dotSize)
    }

    $dotYBottom = [int]($Size - 150 * $scale - $dotSize)
    for ($i = 0; $i -lt 5; $i++) {
        $dotX = [int](200 * $scale) + $i * [int](155 * $scale)
        $g.FillEllipse($dotBrush, $dotX, $dotYBottom, $dotSize, $dotSize)
    }
    $dotBrush.Dispose()

    $carBrush.Dispose()
    $g.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

function New-AdaptiveIconBackground {
    param(
        [int]$Size,
        [string]$Path
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)

    $bgColor = [System.Drawing.Color]::FromArgb(255, 238, 242, 255)
    $brush = New-Object System.Drawing.SolidBrush($bgColor)
    $g.FillRectangle($brush, 0, 0, $Size, $Size)
    $brush.Dispose()

    $g.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

function New-AdaptiveIconForeground {
    param(
        [int]$Size,
        [string]$Path
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    $bgColor = [System.Drawing.Color]::FromArgb(255, 238, 242, 255)
    $brush = New-Object System.Drawing.SolidBrush($bgColor)
    $g.FillRectangle($brush, 0, 0, $Size, $Size)
    $brush.Dispose()

    $scale = $Size / 432.0

    $carBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 99, 102, 241))

    $carWidth = [int](240 * $scale)
    $carHeight = [int](120 * $scale)
    $carX = [int](($Size - $carWidth) / 2)
    $carY = [int](($Size - $carHeight) / 2 - 10 * $scale)

    $carPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $carPath.AddRectangle((New-Object System.Drawing.Rectangle($carX, $carY + $carHeight * 0.3, $carWidth, $carHeight * 0.7)))
    $carPath.AddRectangle((New-Object System.Drawing.Rectangle($carX + $carWidth * 0.15, $carY, $carWidth * 0.7, $carHeight * 0.4)))
    $g.FillPath($carBrush, $carPath)

    $wheelSize = [int](40 * $scale)
    $wheelY = $carY + $carHeight + [int](10 * $scale) - $wheelSize / 2
    $wheel1X = $carX + [int]($carWidth * 0.18) - $wheelSize / 2
    $wheel2X = $carX + [int]($carWidth * 0.82) - $wheelSize / 2

    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 238, 242, 255))
    $g.FillEllipse($bgBrush, $wheel1X, $wheelY, $wheelSize, $wheelSize)
    $g.FillEllipse($bgBrush, $wheel2X, $wheelY, $wheelSize, $wheelSize)
    $bgBrush.Dispose()

    $wheelCenterSize = [int](24 * $scale)
    $centerBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 99, 102, 241))
    $g.FillEllipse($centerBrush, $wheel1X + ($wheelSize - $wheelCenterSize) / 2, $wheelY + ($wheelSize - $wheelCenterSize) / 2, $wheelCenterSize, $wheelCenterSize)
    $g.FillEllipse($centerBrush, $wheel2X + ($wheelSize - $wheelCenterSize) / 2, $wheelY + ($wheelSize - $wheelCenterSize) / 2, $wheelCenterSize, $wheelCenterSize)
    $centerBrush.Dispose()

    $carBrush.Dispose()
    $g.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

function New-MonochromeIcon {
    param(
        [int]$Size,
        [string]$Path
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)
    $g.FillRectangle($brush, 0, 0, $Size, $Size)
    $brush.Dispose()

    $scale = $Size / 432.0

    $carBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

    $carWidth = [int](240 * $scale)
    $carHeight = [int](120 * $scale)
    $carX = [int](($Size - $carWidth) / 2)
    $carY = [int](($Size - $carHeight) / 2 - 10 * $scale)

    $carPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $carPath.AddRectangle((New-Object System.Drawing.Rectangle($carX, $carY + $carHeight * 0.3, $carWidth, $carHeight * 0.7)))
    $carPath.AddRectangle((New-Object System.Drawing.Rectangle($carX + $carWidth * 0.15, $carY, $carWidth * 0.7, $carHeight * 0.4)))
    $g.FillPath($carBrush, $carPath)

    $carBrush.Dispose()
    $g.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

$assetsDir = Join-Path $PSScriptRoot "assets"

Write-Host "生成 icon.png (1024x1024)..."
New-AppIcon -Size 1024 -Path "$assetsDir\icon.png"

Write-Host "生成 android-icon-background.png (432x432)..."
New-AdaptiveIconBackground -Size 432 -Path "$assetsDir\android-icon-background.png"

Write-Host "生成 android-icon-foreground.png (432x432)..."
New-AdaptiveIconForeground -Size 432 -Path "$assetsDir\android-icon-foreground.png"

Write-Host "生成 android-icon-monochrome.png (432x432)..."
New-MonochromeIcon -Size 432 -Path "$assetsDir\android-icon-monochrome.png"

Write-Host "生成 favicon.png (48x48)..."
New-AppIcon -Size 48 -Path "$assetsDir\favicon.png"

Write-Host "所有图标生成完成！"
Get-ChildItem $assetsDir -Filter "*.png" | ForEach-Object { Write-Host "$($_.Name): $([math]::Round($_.Length / 1KB, 1)) KB" }