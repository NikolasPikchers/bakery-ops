export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Хост и разбор сертификата базы — в лог при старте: по ним видно, дошли ли настройки целыми.
  const { describeDatabaseConfig } = await import('@/lib/db/connection-options');
  console.log('Database config:', describeDatabaseConfig());

  // Новые таблицы (prisma migrate в проекте нет) — «если нет»; сбой не должен ронять старт.
  try {
    const [{ ensureDishSaleTable }, { getPrisma }] = await Promise.all([import('@/lib/db/ensure-schema'), import('@/lib/db/client')]);
    await ensureDishSaleTable(getPrisma());
  } catch (e) {
    console.error('DishSale schema:', e instanceof Error ? e.message : e);
  }

  if (process.env.IIKO_SCHEDULER_ENABLED !== '1') return;

  const state = globalThis as typeof globalThis & { __stopIikoScheduler?: () => void };
  if (state.__stopIikoScheduler) return;

  const [{ startIikoScheduler }, { runIikoSync, iikoCatchUpWindow, iikoAuthFromEnv }, { runTbankSync, tbankSyncWindow }, { runNightlySync }, { getPrisma }] =
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
      // С догрузкой: если iiko лежал, подтягиваем дни с последнего загруженного.
      { name: 'iiko', run: async () => runIikoSync(getPrisma(), await iikoCatchUpWindow(getPrisma(), new Date())) },
      ...(process.env.TBUSINESS_API_TOKEN ? [{ name: 'tbank', run: () => runTbankSync(getPrisma(), tbankSyncWindow(new Date())) }] : []),
    ]),
  );
}
