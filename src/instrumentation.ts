export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Хост и разбор сертификата базы — в лог при старте: по ним видно, дошли ли настройки целыми.
  const { describeDatabaseConfig } = await import('@/lib/db/connection-options');
  console.log('Database config:', describeDatabaseConfig());

  if (process.env.IIKO_SCHEDULER_ENABLED !== '1') return;

  const state = globalThis as typeof globalThis & { __stopIikoScheduler?: () => void };
  if (state.__stopIikoScheduler) return;

  const [{ startIikoScheduler }, { runIikoSync, syncWindow, iikoAuthFromEnv }, { runTbankSync, tbankSyncWindow }, { runNightlySync }, { getPrisma }] =
    await Promise.all([
      import('@/lib/iiko/scheduler'),
      import('@/lib/iiko/sync'),
      import('@/lib/tbank/sync'),
      import('@/lib/nightly-sync'),
      import('@/lib/db/client'),
    ]);
  iikoAuthFromEnv();
  // 04:00 МСК: выручка из iiko и расходы из Т-Бизнеса (если задан токен банка).
  state.__stopIikoScheduler = startIikoScheduler(() =>
    runNightlySync([
      { name: 'iiko', run: () => runIikoSync(getPrisma(), syncWindow(new Date())) },
      ...(process.env.TBUSINESS_API_TOKEN ? [{ name: 'tbank', run: () => runTbankSync(getPrisma(), tbankSyncWindow(new Date())) }] : []),
    ]),
  );
}
