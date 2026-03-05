# ============================================================
#  Minton-Tennis Build & Deploy Script
#  Usage: .\deploy.ps1
#         .\deploy.ps1 -Message "change description"
# ============================================================

param (
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"
$startTime = Get-Date

Write-Host ""
Write-Host "============================================" -ForegroundColor DarkCyan
Write-Host "  Minton-Tennis Build & Deploy" -ForegroundColor White
if ($Message -ne "") {
    Write-Host "  Changes: $Message" -ForegroundColor Yellow
}
Write-Host "============================================" -ForegroundColor DarkCyan

# --------------------------------------------------
# Step 1: Build Worker (Vite)
# --------------------------------------------------
Write-Host ""
Write-Host "[1/3] Building Worker... (vite build)" -ForegroundColor Cyan

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "  BUILD FAILED" -ForegroundColor Red
    exit 1
}
Write-Host "  Build OK -> dist/_worker.js" -ForegroundColor Green

# --------------------------------------------------
# Step 2: Sync static files (public/static -> dist/static)
# --------------------------------------------------
Write-Host ""
Write-Host "[2/3] Syncing static files (public/ -> dist/)..." -ForegroundColor Cyan

# dist/static 없으면 생성
if (-not (Test-Path "dist\static")) {
    New-Item -ItemType Directory -Force -Path "dist\static" | Out-Null
}

# public/static/* -> dist/static/* 강제 복사
Copy-Item -Path "public\static\*" -Destination "dist\static\" -Recurse -Force

# 기타 public 루트 파일들 (sw.js, _routes.json 등) 도 복사
Get-ChildItem -Path "public\" -File | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination "dist\" -Force
}

# 복사된 파일 목록 출력
$files = Get-ChildItem -Path "dist\static\" | Select-Object -ExpandProperty Name
Write-Host "  Synced: $($files -join ', ')" -ForegroundColor Green

# --------------------------------------------------
# Step 3: Deploy to Cloudflare Pages
# --------------------------------------------------
Write-Host ""
Write-Host "[3/3] Deploying to Cloudflare Pages..." -ForegroundColor Cyan

npm run deploy

if ($LASTEXITCODE -ne 0) {
    Write-Host "  DEPLOY FAILED" -ForegroundColor Red
    exit 1
}
Write-Host "  Deploy OK!" -ForegroundColor Green

# --------------------------------------------------
# Summary
# --------------------------------------------------
$elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)

Write-Host ""
Write-Host "============================================" -ForegroundColor DarkGreen
Write-Host "  DONE! ($($elapsed) sec)" -ForegroundColor Green
Write-Host "  URL: https://minton-tennis.pages.dev" -ForegroundColor White
Write-Host "============================================" -ForegroundColor DarkGreen
Write-Host ""
