const DAY_MS = 86_400_000;
const RETRY_MS = 300_000;

/** 01:00 UTC = 04:00 Moscow, independently of the host's local timezone. */
export function nextIikoSyncAt(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(1, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setTime(next.getTime() + DAY_MS);
  return next;
}

/** One daily job in a persistent Node server; temporary outages get three retries. */
export function startIikoScheduler(run: () => Promise<unknown>, onError: (error: unknown) => void = (error) => console.error('Scheduled iiko sync failed:', error)): () => void {
  let stopped = false;
  let retries = 0;
  let timer: ReturnType<typeof setTimeout>;

  function schedule(at: Date) {
    if (stopped) return;
    timer = setTimeout(() => { void execute(); }, Math.max(0, at.getTime() - Date.now()));
    timer.unref?.();
  }

  async function execute() {
    try {
      await run();
      retries = 0;
      schedule(nextIikoSyncAt(new Date()));
    } catch (error) {
      onError(error);
      retries += 1;
      schedule(retries <= 3 ? new Date(Date.now() + RETRY_MS) : nextIikoSyncAt(new Date()));
      if (retries > 3) retries = 0;
    }
  }

  schedule(nextIikoSyncAt(new Date()));
  return () => { stopped = true; clearTimeout(timer); };
}
