$ErrorActionPreference = "Stop"

$wifiIp = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.InterfaceAlias -eq "Wi-Fi" -and
    $_.IPAddress -notlike "127.*" -and
    $_.IPAddress -notlike "169.254.*"
  } |
  Select-Object -First 1 -ExpandProperty IPAddress

if (-not $wifiIp) {
  Write-Error "Could not find a Wi-Fi IPv4 address. Check that Wi-Fi is connected."
}

$env:REACT_NATIVE_PACKAGER_HOSTNAME = $wifiIp
Write-Host "Starting Expo LAN on Wi-Fi IP $wifiIp"
npx expo start --lan --clear
