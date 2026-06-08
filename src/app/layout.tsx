import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import { auth } from '@/auth';
import { AppShell } from './AppShell';
import './globals.css';

const manrope = Manrope({ variable: '--font-manrope', subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600', '700', '800'] });

export const metadata: Metadata = {
  title: 'Nikas Cafe · Учёт пекарен',
  description: 'Дашборд: прибыль, выручка, расходы, остатки',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  return (
    <html lang="ru" className={manrope.variable}>
      <body>
        <AppShell authed={!!session}>{children}</AppShell>
      </body>
    </html>
  );
}
