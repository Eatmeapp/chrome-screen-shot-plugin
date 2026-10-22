# Meet 自動截圖 — 一鍵安裝 / 更新腳本（Windows PowerShell）
#
# 用法（PowerShell）：
#   irm https://raw.githubusercontent.com/Eatmeapp/chrome-screen-shot-plugin/main/install.ps1 | iex
#
# 可用環境變數覆寫：$env:MAS_REPO、$env:MAS_BRANCH、$env:MAS_DIR
$ErrorActionPreference = 'Stop'

$Repo       = if ($env:MAS_REPO)   { $env:MAS_REPO }   else { 'Eatmeapp/chrome-screen-shot-plugin' }
$Branch     = if ($env:MAS_BRANCH) { $env:MAS_BRANCH } else { 'main' }
$InstallDir = if ($env:MAS_DIR)    { $env:MAS_DIR }    else { Join-Path $HOME 'ChromeExtensions\meet-auto-screenshot' }
$ExtDir     = Join-Path $InstallDir 'extension'

Write-Host "▶ Meet 自動截圖 — 安裝 / 更新" -ForegroundColor Cyan
Write-Host "  來源：https://github.com/$Repo ($Branch)"
Write-Host "  位置：$InstallDir`n"

New-Item -ItemType Directory -Force -Path (Split-Path $InstallDir) | Out-Null

if (Get-Command git -ErrorAction SilentlyContinue) {
  if (Test-Path (Join-Path $InstallDir '.git')) {
    git -C $InstallDir fetch --depth 1 origin $Branch --quiet
    git -C $InstallDir reset --hard "origin/$Branch" --quiet
    Write-Host "  ✔ 已更新到最新版本" -ForegroundColor Green
  } else {
    if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
    git clone --depth 1 --branch $Branch "https://github.com/$Repo.git" $InstallDir --quiet
    Write-Host "  ✔ 已下載程式碼（git）" -ForegroundColor Green
  }
} else {
  $Tmp = Join-Path ([IO.Path]::GetTempPath()) ("mas-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $Tmp | Out-Null
  $Zip = Join-Path $Tmp 'src.zip'
  Invoke-WebRequest -UseBasicParsing "https://github.com/$Repo/archive/refs/heads/$Branch.zip" -OutFile $Zip
  Expand-Archive -Path $Zip -DestinationPath $Tmp -Force
  $Src = Get-ChildItem -Directory $Tmp | Select-Object -First 1
  if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
  Move-Item $Src.FullName $InstallDir
  Remove-Item -Recurse -Force $Tmp
  Write-Host "  ✔ 已下載程式碼（zip）" -ForegroundColor Green
}

if (-not (Test-Path (Join-Path $ExtDir 'manifest.json'))) { throw "找不到 $ExtDir\manifest.json" }

Set-Clipboard -Value $ExtDir
Write-Host "  ✔ 外掛資料夾路徑已複製到剪貼簿" -ForegroundColor Green

$opened = $false
foreach ($exe in @('chrome.exe', 'msedge.exe', 'brave.exe')) {
  try { Start-Process $exe 'chrome://extensions/'; $opened = $true; break } catch {}
}
if ($opened) { Write-Host "  ✔ 已開啟 chrome://extensions" -ForegroundColor Green }
else { Write-Host "  ! 請手動在 Chrome 網址列輸入 chrome://extensions" -ForegroundColor Yellow }

Write-Host "`n▶ 最後一步（Chrome 安全限制，需手動點一次）" -ForegroundColor Cyan
Write-Host "  1. 在 chrome://extensions 右上角開啟「開發人員模式」"
Write-Host "  2. 第一次安裝：點「載入未封裝項目」，選擇（路徑已在剪貼簿，可直接貼上）："
Write-Host "       $ExtDir"
Write-Host "  3. 之後更新：重新執行這個腳本，再按外掛卡片上的「↻ 重新載入」`n"
