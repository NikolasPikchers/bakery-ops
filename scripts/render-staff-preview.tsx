// Превью вкладок сотрудников без входа и без БД: рендер на фикстурах в статический HTML.
// Запуск: npx tsx scripts/render-staff-preview.tsx [папка]   (по умолчанию .preview/staff)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { RevenueView } from '../src/app/staff/_views';
import { staffRevenueRows } from '../src/lib/staff/view-model';

const out = process.argv[2] ?? '.preview/staff';
const css = readFileSync('src/app/globals.css', 'utf8');
const page = (title: string, body: string) =>
  `<!doctype html><html lang="ru"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${title}</title>` +
  `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap">` +
  `<style>${css}\n:root{--font-manrope:'Manrope'}</style></head><body>${body}</body></html>`;

// Реальная выручка Плюшкино 1–9 сентября 2026: [дата, кондитерка, пироги+прочее].
const REVENUE: [string, number, number][] = [
  ['2026-09-01', 132929, 45114],
  ['2026-09-02', 13696, 25627],
  ['2026-09-03', 21563, 31978],
  ['2026-09-04', 22500, 31343],
  ['2026-09-05', 30768, 30637],
  ['2026-09-06', 14273, 31028],
  ['2026-09-07', 8969, 29703],
  ['2026-09-08', 28762, 36284],
  ['2026-09-09', 31729, 36467],
];
const days = REVENUE.map(([date, confectionery, other]) => ({ date, confectionery, other, total: confectionery + other }));
const rows = staffRevenueRows(days);

mkdirSync(out, { recursive: true });
const revenue = renderToStaticMarkup(<RevenueView month="2026-09" rows={rows} showOwnerLink={false} />);
const monthTotal = Math.round(days.reduce((s, d) => s + d.total, 0)).toLocaleString('ru-RU');
if (revenue.includes(monthTotal)) throw new Error(`итог месяца ${monthTotal} попал на вкладку «Выручка»`);
if (revenue.includes('к учёту')) throw new Error('ссылка владельца видна сотруднику');
writeFileSync(path.join(out, 'revenue.html'), page('Выручка', revenue));
writeFileSync(path.join(out, 'revenue-owner.html'), page('Выручка (владелец)', renderToStaticMarkup(<RevenueView month="2026-09" rows={rows} showOwnerLink />)));
writeFileSync(path.join(out, 'revenue-empty.html'), page('Выручка (пусто)', renderToStaticMarkup(<RevenueView month="2026-10" rows={[]} showOwnerLink={false} />)));
console.log(`Готово: ${out}/revenue.html, revenue-owner.html, revenue-empty.html`);
