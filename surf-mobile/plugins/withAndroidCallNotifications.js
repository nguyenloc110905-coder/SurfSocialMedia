const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  withMainActivity,
} = require('@expo/config-plugins');

const CALL_CATEGORY = 'surf_incoming_call';
const ONGOING_CALL_CATEGORY = 'surf_ongoing_call';
const NOTIFICATION_FORWARDER_ACTIVITY = 'expo.modules.notifications.service.NotificationForwarderActivity';

function getMainActivity(manifest) {
  const application = manifest.application?.[0];
  const activities = application?.activity ?? [];
  return activities.find((activity) => {
    const filters = activity['intent-filter'] ?? [];
    return filters.some((filter) => {
      const actions = filter.action ?? [];
      const categories = filter.category ?? [];
      return (
        actions.some((action) => action.$?.['android:name'] === 'android.intent.action.MAIN') &&
        categories.some((category) => category.$?.['android:name'] === 'android.intent.category.LAUNCHER')
      );
    });
  });
}

function addKotlinImport(contents, importName) {
  const line = `import ${importName}`;
  if (contents.includes(line)) return contents;
  return contents.replace(/^(package\s+[^\n]+\n)/m, `$1\n${line}\n`);
}

function ensureManifestPermission(manifest, permissionName) {
  const permissions = manifest['uses-permission'] ?? [];
  const exists = permissions.some((permission) => permission.$?.['android:name'] === permissionName);
  if (!exists) {
    permissions.push({ $: { 'android:name': permissionName } });
  }
  manifest['uses-permission'] = permissions;
}

function ensureActivityMergePatch(application, activityName, attributes) {
  const activities = application.activity ?? [];
  let activity = activities.find((item) => item.$?.['android:name'] === activityName);
  if (!activity) {
    activity = { $: { 'android:name': activityName } };
    activities.push(activity);
  }

  activity.$ = {
    ...activity.$,
    ...attributes,
  };
  application.activity = activities;
}

function ensureNotificationForwarderManifestPatch(manifest) {
  manifest.$ = {
    ...manifest.$,
    'xmlns:tools': manifest.$?.['xmlns:tools'] ?? 'http://schemas.android.com/tools',
  };

  const application = manifest.application?.[0];
  if (!application) return;

  ensureActivityMergePatch(application, NOTIFICATION_FORWARDER_ACTIVITY, {
    'android:showWhenLocked': 'true',
    'android:turnScreenOn': 'true',
    'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
    'android:exported': 'false',
    'android:excludeFromRecents': 'true',
    'android:noHistory': 'true',
    'tools:node': 'merge',
  });
}

function patchKotlinMainActivity(contents) {
  const hasOnCreateCall = /super\.onCreate\((?:null|savedInstanceState)\)[\s\S]{0,160}applySurfCallWindowFlags\(\)/.test(contents);
  if (!hasOnCreateCall) {
    contents = contents.replace(
      /(super\.onCreate\((?:null|savedInstanceState)\)\s*)/,
      `$1\n    applySurfCallWindowFlags()\n`
    );
  }

  const hasHelper = contents.includes('private fun applySurfCallWindowFlags()');

  contents = addKotlinImport(contents, 'android.app.KeyguardManager');
  contents = addKotlinImport(contents, 'android.content.Context');
  contents = addKotlinImport(contents, 'android.content.Intent');
  contents = addKotlinImport(contents, 'android.os.Build');
  contents = addKotlinImport(contents, 'android.view.WindowManager');

  if (!contents.includes('override fun onNewIntent(intent: Intent)')) {
    const onNewIntent = `
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    applySurfCallWindowFlags()
  }
`;
    const lastBraceForIntent = contents.lastIndexOf('\n}');
    if (lastBraceForIntent !== -1) {
      contents = `${contents.slice(0, lastBraceForIntent)}${onNewIntent}${contents.slice(lastBraceForIntent)}`;
    }
  }

  if (hasHelper) return contents;

  const helper = `
  private fun applySurfCallWindowFlags() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
      keyguardManager?.requestDismissKeyguard(this, null)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }
`;

  const lastBrace = contents.lastIndexOf('\n}');
  if (lastBrace === -1) return contents;
  return `${contents.slice(0, lastBrace)}${helper}${contents.slice(lastBrace)}`;
}

function patchExpoNotificationsBuilder(projectRoot) {
  const builderPath = path.join(
    projectRoot,
    'node_modules',
    'expo-notifications',
    'android',
    'src',
    'main',
    'java',
    'expo',
    'modules',
    'notifications',
    'notifications',
    'presentation',
    'builders',
    'ExpoNotificationBuilder.kt'
  );

  if (!fs.existsSync(builderPath)) return;

  let contents = fs.readFileSync(builderPath, 'utf8');
  const hasCallNotificationPatch = contents.includes('Surf full-screen call notification');

  const target = `    builder.setContentIntent(
      createNotificationResponseIntent(
        context,
        notification,
        defaultAction
      )
    )
`;

  const replacement = `${target}
    // Surf full-screen call notification: let incoming calls wake the screen
    // and open the app's call UI, matching native messenger-style behavior.
    val isSurfCallNotification =
      notificationContent.categoryId == "${CALL_CATEGORY}" ||
        notificationContent.categoryId == "${ONGOING_CALL_CATEGORY}"

    if (isSurfCallNotification) {
      builder.setCategory(NotificationCompat.CATEGORY_CALL)
      builder.setPriority(NotificationCompat.PRIORITY_MAX)
      builder.setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      builder.setOngoing(true)
      builder.setAutoCancel(false)
      builder.setOnlyAlertOnce(true)
      builder.setTimeoutAfter(0L)
    }

    if (notificationContent.categoryId == "${CALL_CATEGORY}") {
      builder.setFullScreenIntent(
        createNotificationResponseIntent(
          context,
          notification,
          defaultAction
        ),
        true
      )
    }
`;

  if (!hasCallNotificationPatch) {
    if (contents.includes(target)) {
      contents = contents.replace(target, replacement);
    } else {
      const contentIntentPattern =
        /(\s+builder\.setContentIntent\(\s*createNotificationResponseIntent\(\s*context,\s*notification,\s*defaultAction\s*\)\s*\)\s*)/m;
      if (!contentIntentPattern.test(contents)) return;
      contents = contents.replace(contentIntentPattern, `$1${replacement.replace(target, '')}`);
    }
  }

  if (contents.includes('val isSurfCallNotification')) {
    contents = addKotlinImport(contents, 'android.app.Notification');
  }

  if (
    contents.includes('val isSurfCallNotification') &&
    !contents.includes('Surf persistent call notification flags')
  ) {
    const returnTarget = `    return builder.build()
`;
    const returnReplacement = `    val builtNotification = builder.build()

    // Surf persistent call notification flags: active/ringing calls should stay
    // visible until JS explicitly dismisses the matching call notification.
    if (isSurfCallNotification) {
      builtNotification.flags =
        builtNotification.flags or
          Notification.FLAG_ONGOING_EVENT or
          Notification.FLAG_NO_CLEAR
      if (notificationContent.categoryId == "${CALL_CATEGORY}") {
        builtNotification.flags = builtNotification.flags or Notification.FLAG_INSISTENT
      }
    }
    return builtNotification
`;
    if (contents.includes(returnTarget)) {
      contents = contents.replace(returnTarget, returnReplacement);
    } else {
      const returnPattern = /(\s+)return builder\.build\(\)\s*/m;
      if (returnPattern.test(contents)) {
        contents = contents.replace(
          returnPattern,
          `$1val builtNotification = builder.build()\n\n` +
            `$1// Surf persistent call notification flags: active/ringing calls should stay\n` +
            `$1// visible until JS explicitly dismisses the matching call notification.\n` +
            `$1if (isSurfCallNotification) {\n` +
            `$1  builtNotification.flags =\n` +
            `$1    builtNotification.flags or\n` +
            `$1      Notification.FLAG_ONGOING_EVENT or\n` +
            `$1      Notification.FLAG_NO_CLEAR\n` +
            `$1  if (notificationContent.categoryId == "${CALL_CATEGORY}") {\n` +
            `$1    builtNotification.flags = builtNotification.flags or Notification.FLAG_INSISTENT\n` +
            `$1  }\n` +
            `$1}\n` +
            `$1return builtNotification\n`
        );
      }
    }
  }

  fs.writeFileSync(builderPath, contents);
}

function patchNotificationForwarderActivity(projectRoot) {
  const forwarderPath = path.join(
    projectRoot,
    'node_modules',
    'expo-notifications',
    'android',
    'src',
    'main',
    'java',
    'expo',
    'modules',
    'notifications',
    'service',
    'NotificationForwarderActivity.kt'
  );

  if (!fs.existsSync(forwarderPath)) return;

  let contents = fs.readFileSync(forwarderPath, 'utf8');
  if (contents.includes('Surf call wake-lock bridge')) return;

  contents = addKotlinImport(contents, 'android.app.KeyguardManager');
  contents = addKotlinImport(contents, 'android.content.Context');
  contents = addKotlinImport(contents, 'android.os.Build');
  contents = addKotlinImport(contents, 'android.view.WindowManager');

  contents = contents.replace(
    /(super\.onCreate\(savedInstanceState\)\s*)/,
    `$1\n    applySurfCallWindowFlags()\n`
  );

  const helper = `
  // Surf call wake-lock bridge: full-screen call notifications enter this
  // translucent Expo activity first, so it also has to wake/show over lockscreen.
  private fun applySurfCallWindowFlags() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
      keyguardManager?.requestDismissKeyguard(this, null)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }
`;

  const lastBrace = contents.lastIndexOf('\n}');
  if (lastBrace === -1) return;
  contents = `${contents.slice(0, lastBrace)}${helper}${contents.slice(lastBrace)}`;
  fs.writeFileSync(forwarderPath, contents);
}

function withAndroidCallNotifications(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    ensureManifestPermission(manifest, 'android.permission.USE_FULL_SCREEN_INTENT');
    ensureManifestPermission(manifest, 'android.permission.WAKE_LOCK');
    ensureManifestPermission(manifest, 'android.permission.DISABLE_KEYGUARD');
    ensureNotificationForwarderManifestPatch(manifest);

    const activity = getMainActivity(manifest);
    if (activity?.$) {
      activity.$['android:launchMode'] = 'singleTask';
      activity.$['android:showWhenLocked'] = 'true';
      activity.$['android:turnScreenOn'] = 'true';
    }
    return config;
  });

  config = withMainActivity(config, (config) => {
    if (config.modResults.language === 'kt') {
      config.modResults.contents = patchKotlinMainActivity(config.modResults.contents);
    }
    return config;
  });

  return withDangerousMod(config, [
    'android',
    async (config) => {
      patchExpoNotificationsBuilder(config.modRequest.projectRoot);
      patchNotificationForwarderActivity(config.modRequest.projectRoot);
      return config;
    },
  ]);
}

module.exports = withAndroidCallNotifications;
