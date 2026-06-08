import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import { auth, signOut } from '@/auth';
import { Logo } from './Logo';
import styles from './ui.module.css';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Bakery Ops',
  description: 'Учёт движения товара пекарни',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  return (
    <html lang="ru" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {session && (
          <nav className={styles.nav}>
            <Link href="/" aria-label="Nikas Cafe"><Logo /></Link>
            <Link href="/">Дашборд</Link>
            <Link href="/sheets">Листы</Link>
            <Link href="/finance">Финансы</Link>
            <Link href="/upload">Загрузить</Link>
            <span className={styles.spacer} />
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/login' });
              }}
            >
              <button className={`${styles.btn} ${styles.btnGhost}`}>Выйти</button>
            </form>
          </nav>
        )}
        {children}
      </body>
    </html>
  );
}
