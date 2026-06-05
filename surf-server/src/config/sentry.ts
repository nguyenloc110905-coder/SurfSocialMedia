async function initSentry() {
  const dsn = process.env.SENTRY_DSN || '';
  if (!dsn) return;

  try {
    const sentryPackage = '@sentry/node';
    const profilingPackage = '@sentry/profiling-node';
    const Sentry = await import(sentryPackage);
    const { nodeProfilingIntegration } = await import(profilingPackage);

    Sentry.init({
      dsn,
      integrations: [nodeProfilingIntegration()],
      tracesSampleRate: 1.0,
      profilesSampleRate: 1.0,
    });
  } catch (error) {
    console.warn('[Sentry] Optional Sentry packages are not installed; skipping Sentry init.');
  }
}

void initSentry();
