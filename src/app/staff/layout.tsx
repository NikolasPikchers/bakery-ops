import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = { title: 'Nikas Cafe · Сотрудникам' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
