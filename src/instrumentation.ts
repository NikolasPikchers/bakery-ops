export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.IIKO_SCHEDULER_ENABLED !== '1') return;

  const state = globalThis as typeof globalThis & { __stopIikoScheduler?: () => void };
  if (state.__stopIikoScheduler) return;

  const [{ startIikoScheduler }, { runIikoSync, syncWindow, iikoAuthFromEnv }, { getPrisma }] = await Promise.all([
    import('@/lib/iiko/scheduler'),
    import('@/lib/iiko/sync'),
    import('@/lib/db/client'),
  ]);
  iikoAuthFromEnv();
  state.__stopIikoScheduler = startIikoScheduler(async () => {
    const summary = await runIikoSync(getPrisma(), syncWindow(new Date()));
    console.log('Scheduled iiko sync:', JSON.stringify(summary));
  });
}
