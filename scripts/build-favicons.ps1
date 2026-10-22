Add-Type -AssemblyName System.Drawing

function Render-FaviconPng {
    param(
        [int]$size,
        [string]$outputPath
    )

    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # Scale and center
    # Original SVG viewBox is 32x32, bounding box roughly [3.5, 4] to [29, 26.5]
    # We apply scale factor of 1.18 so the icon fills the canvas boldly (agrandado!)
    $scale = ($size / 32.0) * 1.18
    $offsetX = ($size - (32.0 * $scale)) / 2.0
    $offsetY = (($size - (32.0 * $scale)) / 2.0) + (0.5 * ($size / 32.0))

    # Helper coordinate transformer
    function tx($x) { return $offsetX + ($x * $scale) }
    function ty($y) { return $offsetY + ($y * $scale) }

    # 1. Contrast Shadow (Deep graphite/emerald for razor-sharp visibility on light & dark tabs)
    $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 4, 21, 18))
    $shadowWidth = [Math]::Max(1.8, 3.2 * ($size / 32.0))
    $shadowPen = New-Object System.Drawing.Pen($shadowBrush, $shadowWidth)
    $shadowPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $shadowPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $shadowPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    $sOffY = 0.8 * ($size / 32.0)

    # Chimney shadow
    $g.FillRectangle($shadowBrush, (tx 7.0), ((ty 5.5) + $sOffY), (3.2 * $scale), (7.4 * $scale))
    # Pillars shadow
    $g.DrawLine($shadowPen, (tx 6.0), ((ty 17.5) + $sOffY), (tx 6.0), ((ty 26.5) + $sOffY))
    $g.DrawLine($shadowPen, (tx 24.5), ((ty 17.5) + $sOffY), (tx 24.5), ((ty 26.5) + $sOffY))
    # Roof shadow
    $g.DrawLine($shadowPen, (tx 3.5), ((ty 17.5) + $sOffY), (tx 15.0), ((ty 7.5) + $sOffY))
    $g.DrawLine($shadowPen, (tx 15.0), ((ty 7.5) + $sOffY), (tx 26.5), ((ty 17.5) + $sOffY))
    # Arrow shadow
    $g.DrawLine($shadowPen, (tx 10.5), ((ty 15.5) + $sOffY), (tx 15.0), ((ty 21.0) + $sOffY))
    $g.DrawLine($shadowPen, (tx 15.0), ((ty 21.0) + $sOffY), (tx 24.2), ((ty 9.2) + $sOffY))
    $arrowShadowPts = @(
        (New-Object System.Drawing.PointF((tx 29.5), ((ty 3.6) + $sOffY))),
        (New-Object System.Drawing.PointF((tx 20.8), ((ty 6.4) + $sOffY))),
        (New-Object System.Drawing.PointF((tx 26.2), ((ty 14.5) + $sOffY)))
    )
    $g.FillPolygon($shadowBrush, $arrowShadowPts)

    # 2. House Structure (Silver / Chrome metallic with smooth gradient)
    $houseWidth = [Math]::Max(1.4, 2.6 * ($size / 32.0))
    $silverPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 248, 250, 252), $houseWidth)
    $silverPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $silverPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $silverPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    # Chimney
    $chimneyBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 226, 232, 240))
    $g.FillRectangle($chimneyBrush, (tx 7.4), (ty 6.0), (2.4 * $scale), (6.5 * $scale))

    # Pillars
    $g.DrawLine($silverPen, (tx 6.0), (ty 17.5), (tx 6.0), (ty 26.5))
    $g.DrawLine($silverPen, (tx 24.5), (ty 17.5), (tx 24.5), (ty 26.5))

    # Roof
    $g.DrawLine($silverPen, (tx 3.5), (ty 17.5), (tx 15.0), (ty 7.5))
    $g.DrawLine($silverPen, (tx 15.0), (ty 7.5), (tx 26.5), (ty 17.5))

    # 3. Emerald Growth Arrow (Vibrant Emerald Joya #10B981 / #34D399)
    $arrowWidth = [Math]::Max(1.8, 3.4 * ($size / 32.0))
    $arrowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 16, 185, 129), $arrowWidth)
    $arrowPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $arrowPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $arrowPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    $g.DrawLine($arrowPen, (tx 10.5), (ty 15.5), (tx 15.0), (ty 21.0))
    $g.DrawLine($arrowPen, (tx 15.0), (ty 21.0), (tx 24.2), (ty 9.2))

    $arrowHeadBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.PointF((tx 21.0), (ty 4.0))),
        (New-Object System.Drawing.PointF((tx 29.0), (ty 14.0))),
        [System.Drawing.Color]::FromArgb(255, 52, 211, 153),
        [System.Drawing.Color]::FromArgb(255, 5, 150, 105)
    )
    $arrowPts = @(
        (New-Object System.Drawing.PointF((tx 29.0), (ty 4.0))),
        (New-Object System.Drawing.PointF((tx 21.5), (ty 6.8))),
        (New-Object System.Drawing.PointF((tx 26.2), (ty 13.8)))
    )
    $g.FillPolygon($arrowHeadBrush, $arrowPts)

    $g.Dispose()
    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created $outputPath ($size x $size)"
}

# Generate PNGs
$sizes = @(16, 32, 48, 64, 180, 512)
$tmpDir = Join-Path $PSScriptRoot "favicons_tmp"
if (-not (Test-Path $tmpDir)) { New-Item -ItemType Directory -Path $tmpDir | Out-Null }

foreach ($s in $sizes) {
    $out = Join-Path $tmpDir "fav_$s.png"
    Render-FaviconPng -size $s -outputPath $out
}
