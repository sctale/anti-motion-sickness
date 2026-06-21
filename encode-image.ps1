$ErrorActionPreference = "Continue"
$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("d:\V-Coding\anti-car-sickness-rn\Screenshot_20260531_134259_anti-car-sickness-rn.jpg"))
Write-Host "Image encoded, length: $($base64.Length)"