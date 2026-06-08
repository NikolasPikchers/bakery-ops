'use client';

import { useState } from 'react';
import styles from './ui.module.css';

export function Logo() {
  const [broken, setBroken] = useState(false);
  if (broken) return <span className={styles.logoText}>nikas<br />cafe</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={styles.logoImg} src="/nikas-cafe-logo.png" alt="Nikas Cafe" onError={() => setBroken(true)} />
  );
}
