$ErrorActionPreference = "Stop"

Write-Host "1. Testing /health..."
$h = Invoke-RestMethod -Uri "http://localhost:5000/health" -Method Get
Write-Host "   Health status: $($h.status), Uptime: $($h.uptime)s"

Write-Host "`n2. Testing /ready..."
$r = Invoke-RestMethod -Uri "http://localhost:5000/ready" -Method Get
Write-Host "   Ready status: $($r.status), DB: $($r.database)"

Write-Host "`n3. Testing /api/v1/auth/register..."
$rand = Get-Random -Minimum 1000 -Maximum 9999
$email = "testbroker_$rand@leadnivash.com"
$regBody = @{
    name = "Panipat Broker"
    email = $email
    password = "Password@1234"
    phone = "+919876543210"
    agency = @{
        name = "Prime Realtors"
        city = "Panipat"
    }
    consent = @{
        termsAccepted = $true
        privacyVersion = "1.0"
    }
} | ConvertTo-Json

$regResp = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/auth/register" -Method Post -Body $regBody -ContentType "application/json"
$token = $regResp.data.accessToken
Write-Host "   Registered user: $($regResp.data.user.email), AccessToken: OK"

$headers = @{
    Authorization = "Bearer $token"
}

Write-Host "`n4. Testing /api/v1/properties POST..."
$propBody = @{
    title = "200 Gaj Plot in Sector 12"
    type = "Plot"
    purpose = "Sale"
    priceDemandPaise = 650000000
    size = @{
        value = 200
        unit = "gaj"
    }
    locality = "Sector 12"
    city = "Panipat"
    owner = @{
        name = "Suresh Gupta"
        phone = "+919812345678"
    }
} | ConvertTo-Json

$propResp = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/properties" -Method Post -Body $propBody -ContentType "application/json" -Headers $headers
$propId = $propResp.data._id
Write-Host "   Created Property ID: $propId, Title: $($propResp.data.title)"

Write-Host "`n5. Testing /api/v1/buyers POST..."
$buyerBody = @{
    name = "Rajesh Sharma"
    phone = "+919896011223"
    types = @("Plot")
    purpose = "Sale"
    budget = @{
        minPaise = 500000000
        maxPaise = 700000000
    }
    localities = @("Sector 12")
} | ConvertTo-Json

$buyerResp = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/buyers" -Method Post -Body $buyerBody -ContentType "application/json" -Headers $headers
$buyerId = $buyerResp.data._id
Write-Host "   Created Buyer ID: $buyerId, Name: $($buyerResp.data.name)"

Write-Host "`n6. Testing /api/v1/properties/$propId/matches..."
$matchesResp = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/properties/$propId/matches" -Method Get -Headers $headers
Write-Host "   Matching buyers found: $($matchesResp.data.matches.Count)"

Write-Host "`n7. Testing /api/v1/dashboard & /api/v1/dashboard/today..."
$dashResp = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/dashboard" -Method Get -Headers $headers
Write-Host "   /dashboard: Active Properties=$($dashResp.data.activePropertiesCount), Active Buyers=$($dashResp.data.activeBuyersCount)"
$dashTodayResp = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/dashboard/today" -Method Get -Headers $headers
Write-Host "   /dashboard/today: Status OK=$($dashTodayResp.success)"

Write-Host "`n8. Testing /api/v1/public/contact (Landing Page Inquiry)..."
$contactBody = @{
    name = "Harish Kumar"
    phone = "9876543210"
    message = "Looking for commercial shop in Panipat"
} | ConvertTo-Json

$contactResp = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/public/contact" -Method Post -Body $contactBody -ContentType "application/json"
Write-Host "   Public contact lead: $($contactResp.message)"

Write-Host "`n=========================================="
Write-Host "  ALL LIVE BACKEND CHECKS PASSED 100%!  "
Write-Host "=========================================="
