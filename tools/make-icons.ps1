# icons/icon.svg ile aynı çizimi PNG olarak üretir (Windows, System.Drawing).
# Kullanım: powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\icons'

function New-Icon([int]$size, [string]$file, [bool]$rounded, [double]$content) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)
  $s = $size / 512.0
  $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.ColorTranslator]::FromHtml('#d4925f')), ([System.Drawing.ColorTranslator]::FromHtml('#a95f33')), 45.0
  if ($rounded) {
    $r = 112 * $s; $d = 2 * $r
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddArc(0, 0, $d, $d, 180, 90); $p.AddArc($size - $d, 0, $d, $d, 270, 90)
    $p.AddArc($size - $d, $size - $d, $d, $d, 0, 90); $p.AddArc(0, $size - $d, $d, $d, 90, 90); $p.CloseFigure()
    $g.FillPath($brush, $p)
  } else { $g.FillRectangle($brush, $rect) }
  # İçerik ölçeği (maskable için güvenli alan)
  $g.TranslateTransform($size / 2, $size / 2); $g.ScaleTransform($s * $content, $s * $content); $g.TranslateTransform(-256, -280)
  $cream = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#fffaf3'))
  $cream2 = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#f4e6d4'))
  $brown = [System.Drawing.ColorTranslator]::FromHtml('#5a3520')
  $left = New-Object System.Drawing.Drawing2D.GraphicsPath
  $left.AddBezier(256, 168, 210, 143, 160, 138, 116, 148); $left.AddLine(116, 148, 116, 340)
  $left.AddBezier(116, 340, 160, 330, 210, 335, 256, 360); $left.CloseFigure()
  $right = New-Object System.Drawing.Drawing2D.GraphicsPath
  $right.AddBezier(256, 168, 302, 143, 352, 138, 396, 148); $right.AddLine(396, 148, 396, 340)
  $right.AddBezier(396, 340, 352, 330, 302, 335, 256, 360); $right.CloseFigure()
  $g.FillPath($cream, $left); $g.FillPath($cream2, $right)
  $line = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#d9a77d')), 9
  $line.StartCap = 'Round'; $line.EndCap = 'Round'
  foreach ($y in 200, 236, 272) { $g.DrawBezier($line, 150, $y, 180, ($y - 6), 210, ($y - 2), 232, ($y + 8)) }
  foreach ($y in 208, 244) { $g.DrawBezier($line, 280, $y, 302, ($y - 10), 332, ($y - 14), 362, ($y - 8)) }
  $shelf = New-Object System.Drawing.Drawing2D.GraphicsPath
  $shelf.AddArc(100, 350, 24, 24, 90, 180); $shelf.AddArc(388, 350, 24, 24, 270, 180); $shelf.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush $brown), $shelf)
  $leg = New-Object System.Drawing.Pen $brown, 20
  $leg.StartCap = 'Round'; $leg.EndCap = 'Round'
  $g.DrawLine($leg, 182, 376, 154, 430); $g.DrawLine($leg, 330, 376, 358, 430)
  $g.Dispose()
  $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "olusturuldu: $file"
}

New-Icon 192 'icon-192.png' $true 1.0
New-Icon 512 'icon-512.png' $true 1.0
New-Icon 512 'icon-maskable-512.png' $false 0.78
New-Icon 180 'apple-touch-icon.png' $false 0.9
New-Icon 32 'favicon-32.png' $true 1.0
