Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  LeadNivesh Backend Health Diagnostic" -ForegroundColor Cyan
Write-Host "=========================================="

# 1. Check Public IP
Write-Host "`n[1/4] Checking Current Public IP..." -NoNewline
try {
    $ip = Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 5
    Write-Host " OK ($ip)" -ForegroundColor Green
} catch {
    Write-Host " FAILED ($($_.Exception.Message))" -ForegroundColor Red
}

# 2. Check Port 5000 Listener
Write-Host "[2/4] Checking Port 5000 Server Process..." -NoNewline
$listener = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue
if ($listener) {
    Write-Host " ACTIVE (PID: $($listener.OwningProcess))" -ForegroundColor Green
} else {
    Write-Host " NOT RUNNING (Start with: cd backend; npm run dev)" -ForegroundColor Yellow
}

# 3. Check /health Probe
Write-Host "[3/4] Testing http://localhost:5000/health..." -NoNewline
try {
    $health = Invoke-RestMethod -Uri "http://localhost:5000/health" -TimeoutSec 3
    if ($health.status -eq "ok") {
        Write-Host " HEALTHY (Uptime: $($health.uptime)s)" -ForegroundColor Green
    } else {
        Write-Host " UNEXPECTED RESPONSE ($($health | ConvertTo-Json -Compress))" -ForegroundColor Yellow
    }
} catch {
    Write-Host " UNREACHABLE" -ForegroundColor Red
}

# 4. Check /ready Probe (MongoDB Atlas connection)
Write-Host "[4/4] Testing http://localhost:5000/ready (MongoDB)..." -NoNewline
try {
    $ready = Invoke-RestMethod -Uri "http://localhost:5000/ready" -TimeoutSec 3
    if ($ready.database -eq "connected") {
        Write-Host " CONNECTED (Database: $($ready.database))" -ForegroundColor Green
    } else {
        Write-Host " DISCONNECTED" -ForegroundColor Red
    }
} catch {
    Write-Host " UNREACHABLE (Check if IP is whitelisted in Atlas)" -ForegroundColor Red
}

Write-Host "`n==========================================" -ForegroundColor Cyan
