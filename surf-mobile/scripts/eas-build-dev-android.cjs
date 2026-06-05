const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const mobileRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(mobileRoot, '..');
const tempRoot = path.join(path.dirname(repoRoot), '.eas-tmp-SurfSocialMedia');
fs.mkdirSync(tempRoot, { recursive: true });

function pathExists(candidate) {
  return !!candidate && fs.existsSync(candidate);
}

function resolveAndroidSdkRoot() {
  const avdHome = process.env.ANDROID_AVD_HOME;
  const sdkBesideAvdHome = avdHome ? path.join(path.dirname(avdHome), 'Sdk') : null;
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    sdkBesideAvdHome,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : null,
  ];

  return candidates.find(candidate =>
    pathExists(path.join(candidate ?? '', 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')) &&
    pathExists(path.join(candidate ?? '', 'emulator', process.platform === 'win32' ? 'emulator.exe' : 'emulator'))
  );
}

const easCmd = path.join(mobileRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'eas.cmd' : 'eas');
if (!fs.existsSync(easCmd)) {
  console.error('Khong tim thay eas trong node_modules. Hay chay npm install trong surf-mobile truoc.');
  process.exit(1);
}

console.log(`Using EAS temp: ${tempRoot}`);

const androidSdkRoot = resolveAndroidSdkRoot();
const androidPathEntries = androidSdkRoot
  ? [
      path.join(androidSdkRoot, 'platform-tools'),
      path.join(androidSdkRoot, 'emulator'),
    ]
  : [];

if (androidSdkRoot) {
  console.log(`Using Android SDK: ${androidSdkRoot}`);
} else {
  console.warn('Android SDK was not detected; EAS will fall back to its default SDK lookup.');
}

const easArgs = process.argv.length > 2
  ? process.argv.slice(2)
  : ['build', '--profile', 'development', '--platform', 'android'];

const result = spawnSync(easCmd, easArgs, {
  cwd: mobileRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    ...(androidSdkRoot ? { ANDROID_HOME: androidSdkRoot, ANDROID_SDK_ROOT: androidSdkRoot } : {}),
    PATH: [...androidPathEntries, process.env.PATH].filter(Boolean).join(path.delimiter),
    TEMP: tempRoot,
    TMP: tempRoot,
  },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
