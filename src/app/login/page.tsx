'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from '../ui.module.css';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/';
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
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className={styles.card}>
      <h1>Bakery Ops</h1>
      <form onSubmit={submit}>
        <div className={styles.field}>
          <label htmlFor="pw">Пароль</label>
          <input
            id="pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>
        {error && <div className={styles.error}>{error}</div>}
        <button className={styles.btn} disabled={busy || password.length === 0}>
          {busy ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
