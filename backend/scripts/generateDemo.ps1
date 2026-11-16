$regBody = @{
    name = "Demo Broker"
    email = "demobroker_" + (Get-Random -Minimum 1000 -Maximum 9999) + "@leadnivash.com"
    password = "Password@1234"
    phone = "+919876543210"
    agency = @{ name = "Prime Realtors"; city = "Panipat" }
    consent = @{ termsAccepted = $true; privacyVersion = "1.0" }
} | ConvertTo-Json

$reg = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/auth/register" -Method Post -Body $regBody -ContentType "application/json"
$token = $reg.data.accessToken
$h = @{ Authorization = "Bearer $token" }

$propBody = @{
    title = "Luxury 4 BHK Kothi in Model Town"
    type = "Kothi"
    purpose = "Sale"
    priceDemandPaise = 2500000000
    size = @{ value = 350; unit = "gaj" }
    locality = "Model Town"
    city = "Panipat"
    description = "Prime location corner property facing 40ft wide road, marble flooring, modular kitchen, and modern architecture."
    owner = @{ name = "Shri R.K. Bansal"; phone = "+919896001122" }
} | ConvertTo-Json

$prop = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/properties" -Method Post -Body $propBody -ContentType "application/json" -Headers $h
$propId = $prop.data._id

$share = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/properties/$propId/share" -Method Post -Headers $h
Write-Host "FLYER_URL: $($share.data.shareUrl)"

