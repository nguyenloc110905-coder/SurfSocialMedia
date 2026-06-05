$ErrorActionPreference = "Stop"

$hostIp = $env:SURF_DEV_HOST_IP

if (-not $hostIp) {
  $defaultRoute = Get-NetRoute -DestinationPrefix "0.0.0.0/0" |
    Where-Object { $_.NextHop -and $_.NextHop -ne "0.0.0.0" } |
    Sort-Object RouteMetric, InterfaceMetric |
    Select-Object -First 1

  if ($defaultRoute) {
    $hostIp = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $defaultRoute.InterfaceIndex |
      Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*"
      } |
      Select-Object -First 1 -ExpandProperty IPAddress
  }
}

if (-not $hostIp) {
  $hostIp = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
      $_.IPAddress -notlike "127.*" -and
      $_.IPAddress -notlike "169.254.*"
    } |
    Select-Object -First 1 -ExpandProperty IPAddress
}

if (-not $hostIp) {
  Write-Error "Could not find a usable IPv4 address. Check that your network is connected."
}

$env:REACT_NATIVE_PACKAGER_HOSTNAME = $hostIp
$env:EXPO_PUBLIC_API_URL = "http://${hostIp}:4000"
Write-Host "Starting Expo dev client on host IP $hostIp"
Write-Host "Using API URL $env:EXPO_PUBLIC_API_URL"
npx expo start --dev-client --lan --clear
