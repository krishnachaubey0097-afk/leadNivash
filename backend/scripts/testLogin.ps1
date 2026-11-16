$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host " Testing LeadNivesh Broker Login Endpoint "
Write-Host "=========================================="

$body = @{
    email = "broker@leadnivesh.com"
    password = "Broker@123456"
} | ConvertTo-Json

Write-Host "`nSending POST http://localhost:5000/api/v1/auth/login..."
$resp = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/auth/login" -Method Post -Body $body -ContentType "application/json"

Write-Host "`n✅ LOGIN SUCCESSFUL!"
Write-Host "------------------------------------------"
Write-Host "User ID    : $($resp.data.user._id)"
Write-Host "Name       : $($resp.data.user.name)"
Write-Host "Email      : $($resp.data.user.email)"
Write-Host "Role       : $($resp.data.user.role)"
Write-Host "Agency     : $($resp.data.user.agency.name)"
Write-Host "Access Token: $($resp.data.accessToken.Substring(0, 35))..."
Write-Host "------------------------------------------"
