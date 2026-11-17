export type NightlyJob = { name: string; run: () => Promise<unknown> };

/**
 * Ночные синхронизации (iiko, Т-Бизнес) — независимо друг от друга: сбой банка не мешает выручке.
 * Если какая-то упала — бросаем ошибку, чтобы планировщик повторил (обе задачи идемпотентны).
 */
export async function runNightlySync(jobs: NightlyJob[], log: (...args: unknown[]) => void = console.log): Promise<void> {
  const results = await Promise.allSettled(jobs.map((j) => j.run()));
  const failed: string[] = [];
  results.forEach((r, i) => {
    const name = jobs[i].name;
    if (r.status === 'fulfilled') log(`Scheduled ${name} sync:`, JSON.stringify(r.value));
    else failed.push(`${name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  });
  if (failed.length > 0) throw new Error(`Ночная синхронизация не прошла — ${failed.join('; ')}`);
}
