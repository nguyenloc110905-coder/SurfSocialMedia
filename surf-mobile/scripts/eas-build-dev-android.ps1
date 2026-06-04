$ErrorActionPreference = "Stop"

$mobileRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repoRoot = (Resolve-Path (Join-Path $mobileRoot "..")).Path
$tempRoot = Join-Path $repoRoot ".eas-tmp"
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

$env:TEMP = $tempRoot
$env:TMP = $tempRoot

$sdkCandidates = @(
  $env:ANDROID_HOME,
  $env:ANDROID_SDK_ROOT
)

if ($env:ANDROID_AVD_HOME) {
  $sdkCandidates += Join-Path (Split-Path $env:ANDROID_AVD_HOME -Parent) "Sdk"
}

$sdkCandidates += Join-Path $env:LOCALAPPDATA "Android\Sdk"

$androidSdkRoot = $sdkCandidates |
  Where-Object {
    $_ -and
    (Test-Path (Join-Path $_ "platform-tools\adb.exe")) -and
    (Test-Path (Join-Path $_ "emulator\emulator.exe"))
  } |
  Select-Object -First 1

if ($androidSdkRoot) {
  $env:ANDROID_HOME = $androidSdkRoot
  $env:ANDROID_SDK_ROOT = $androidSdkRoot
  $env:PATH = @(
    (Join-Path $androidSdkRoot "platform-tools"),
    (Join-Path $androidSdkRoot "emulator"),
    $env:PATH
  ) -join [IO.Path]::PathSeparator
  Write-Host "Using Android SDK: $androidSdkRoot"
} else {
  Write-Warning "Android SDK was not detected; EAS will fall back to its default SDK lookup."
}

Set-Location $mobileRoot

$easCmd = Join-Path $mobileRoot "node_modules\.bin\eas.cmd"
if (!(Test-Path $easCmd)) {
  throw "Không tìm thấy eas.cmd trong node_modules. Chạy npm install trong surf-mobile trước."
}

Write-Host "Using EAS temp: $tempRoot"
& $easCmd build --profile development --platform android
if ($LASTEXITCODE -ne 0) {
  throw "EAS build failed with exit code $LASTEXITCODE"
}
