'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type State = { kind: 'busy' } | { kind: 'ok'; at: string } | { kind: 'error'; message: string };

const hhmm = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/**
 * При открытии дашборда подтягивает выручку Плюшкино из iiko за вчера и сегодня
 * и перерисовывает страницу. Ночной крон закрывает день; это — «онлайн» в течение дня.
 */
export function IikoAutoSync() {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<State>({ kind: 'busy' });

  useEffect(() => {
    if (started.current) return; // StrictMode в dev вызывает эффект дважды
    started.current = true;
    (async () => {
      try {
        const res = await fetch('/api/revenue/iiko-sync', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setState({ kind: 'ok', at: hhmm() });
        router.refresh();
      } catch (e) {
        setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, [router]);

  const text = state.kind === 'busy' ? 'iiko: обновляю…' : state.kind === 'ok' ? `iiko: ${state.at}` : 'iiko: нет связи';
  const color = state.kind === 'error' ? '#c0392b' : 'var(--muted)';
  return (
    <span title={state.kind === 'error' ? state.message : 'Выручка Плюшкино из iiko за вчера и сегодня'} style={{ fontSize: 12.5, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}
