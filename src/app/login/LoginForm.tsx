'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './login.module.css';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const rawCallback = params.get('callbackUrl') ?? '/';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await signIn('credentials', { password, redirect: false });
    setBusy(false);
    if (res?.error) {
      setError('Неверный пароль');
      return;
    }
    // Редиректим только в пределах своего origin (middleware кладёт абсолютный URL);
    // чужой/протокол-относительный callbackUrl отбрасываем — защита от open redirect.
    let dest = '/';
    try {
      const u = new URL(rawCallback, window.location.origin);
      if (u.origin === window.location.origin) dest = u.pathname + u.search;
    } catch {
      dest = '/';
    }
    router.push(dest);
    router.refresh();
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nikas-logo-white.png" alt="Nikas Cafe" />
        </div>
        <h1 className={styles.title}>Плюшкино</h1>
        <p className={styles.subtitle}>Учёт пекарни</p>
        <form className={styles.form} onSubmit={submit}>
          <div>
            <label className={styles.label} htmlFor="pw">
              Пароль
            </label>
            <input
              id="pw"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}
          <button className={styles.button} disabled={busy || password.length === 0}>
            {busy ? 'Вход…' : 'Войти'}
          </button>
        </form>
      </div>
    </main>
  );
}
