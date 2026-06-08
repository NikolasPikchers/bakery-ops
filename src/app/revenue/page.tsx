import { RevenueForms } from './RevenueForms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function RevenuePage() {
  return (
    <div style={{ padding: '24px 28px', maxWidth: 920 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 18, color: 'var(--ink)' }}>Выручка</h1>
      <RevenueForms />
    </div>
  );
}
