import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { auth } from '@/auth';
import { roleOf } from '@/lib/auth/roles';
import { AppShell } from './AppShell';
import './globals.css';

const manrope = localFont({ src: './fonts/Manrope-Variable.ttf', variable: '--font-manrope', weight: '200 800', display: 'swap' });

export const metadata: Metadata = {
  title: 'Nikas Cafe · Учёт пекарен',
  description: 'Дашборд: прибыль, выручка, расходы, остатки',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  return (
    <html lang="ru" className={manrope.variable}>
      <body>
        <AppShell authed={roleOf(session) === 'owner'}>{children}</AppShell>
      </body>
    </html>
  );
}
