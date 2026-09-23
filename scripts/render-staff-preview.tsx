// Превью вкладок сотрудников без входа и без БД: рендер на фикстурах в статический HTML.
// Запуск: npx tsx scripts/render-staff-preview.tsx [папка]   (по умолчанию .preview/staff)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { RevenueView, ShiftsView } from '../src/app/staff/_views';
import { staffRevenueRows, employeeCard } from '../src/lib/staff/view-model';
import { buildFot, type FotEmployee } from '../src/lib/db/fot-repo';
import { monthDays } from '../src/lib/finance/month';

const out = process.argv[2] ?? '.preview/staff';
const css = readFileSync('src/app/globals.css', 'utf8');
const page = (title: string, body: string) =>
  `<!doctype html><html lang="ru"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${title}</title>` +
  `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap">` +
  `<style>${css}\n:root{--font-manrope:'Manrope'}</style></head><body>${body}</body></html>`;
const fail = (msg: string) => {
  throw new Error(msg);
};

mkdirSync(out, { recursive: true });

// ── «Выручка»: реальная выручка Плюшкино 1–9 сентября 2026: [дата, кондитерка, пироги+прочее].
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
const revenue = renderToStaticMarkup(<RevenueView month="2026-09" rows={rows} showOwnerLink={false} />);
const revenueTotal = Math.round(days.reduce((s, d) => s + d.total, 0)).toLocaleString('ru-RU');
if (revenue.includes(revenueTotal)) fail(`итог месяца ${revenueTotal} попал на вкладку «Выручка»`);
if (revenue.includes('к учёту')) fail('ссылка владельца видна сотруднику');
writeFileSync(path.join(out, 'revenue.html'), page('Выручка', revenue));
writeFileSync(path.join(out, 'revenue-owner.html'), page('Выручка (владелец)', renderToStaticMarkup(<RevenueView month="2026-09" rows={rows} showOwnerLink />)));
writeFileSync(path.join(out, 'revenue-empty.html'), page('Выручка (пусто)', renderToStaticMarkup(<RevenueView month="2026-10" rows={[]} showOwnerLink={false} />)));

// ── «Смены и ЗП»: состав пекарни и реальная выручка 29.08–15.09.2026 (как в fot-repo.test.ts);
// 16–19.09 — синтетика для превью; 20.09 и позже выручки нет → «…» и «план».
const EMPLOYEES: FotEmployee[] = [
  { id: 'katya', name: 'Катя', group: 'bakery', role: 'baker', brigade: 'A', basePay: 2300, schedOffset: 0 },
  { id: 'evg', name: 'Евгения', group: 'bakery', role: 'baker', brigade: 'A', basePay: 2300, schedOffset: 0 },
  { id: 'natasha', name: 'Наташа', group: 'bakery', role: 'cashier', brigade: 'A', basePay: 2100, schedOffset: 0 },
  { id: 'alena', name: 'Алёна', group: 'bakery', role: 'baker', brigade: 'B', basePay: 2300, schedOffset: 0 },
  { id: 'valya', name: 'Валентина', group: 'bakery', role: 'baker', brigade: 'B', basePay: 2300, schedOffset: 0 },
  { id: 'kristina', name: 'Кристина', group: 'bakery', role: 'cashier', brigade: 'B', basePay: 2100, schedOffset: 0 },
  { id: 'lyuda', name: 'Людмила', group: 'bakery', role: 'kitchen', brigade: null, basePay: 1500, schedOffset: 0 },
];
const REV = new Map<string, { total: number; pies: number }>([
  ['2026-08-29', { total: 44856.5, pies: 22462.5 }],
  ['2026-08-30', { total: 49553.9, pies: 31092.9 }],
  ['2026-08-31', { total: 64994.3, pies: 31643.3 }],
  ['2026-09-01', { total: 178043.15, pies: 45114.15 }],
  ['2026-09-02', { total: 39323.4, pies: 25627.4 }],
  ['2026-09-03', { total: 53541.25, pies: 31978.25 }],
  ['2026-09-04', { total: 53843.35, pies: 31343.35 }],
  ['2026-09-05', { total: 61405.3, pies: 30637.3 }],
  ['2026-09-06', { total: 45301.45, pies: 31028.45 }],
  ['2026-09-07', { total: 38672.45, pies: 29703.45 }],
  ['2026-09-08', { total: 65046.15, pies: 36284.15 }],
  ['2026-09-09', { total: 68196.35, pies: 36467.35 }],
  ['2026-09-10', { total: 57385.9, pies: 30900.9 }],
  ['2026-09-11', { total: 71836.3, pies: 44985.3 }],
  ['2026-09-12', { total: 49026.75, pies: 24415.75 }],
  ['2026-09-13', { total: 55584.3, pies: 32845.3 }],
  ['2026-09-14', { total: 51178.9, pies: 33394.9 }],
  ['2026-09-15', { total: 60406.7, pies: 38406.7 }],
  ['2026-09-16', { total: 58000, pies: 31500 }],
  ['2026-09-17', { total: 62000, pies: 37000 }],
  ['2026-09-18', { total: 61500, pies: 36500 }],
  ['2026-09-19', { total: 52000, pies: 27000 }],
]);
const v = buildFot({ month: '2026-09', monthDays: monthDays('2026-09'), employees: EMPLOYEES, revenueByDate: REV, overrides: new Map() });
const ctx = { month: '2026-09', today: '2026-09-21', revenueDates: new Set(v.revenueDates) };
const cards = v.bakery.map((row) => employeeCard(row, ctx));
const first = (id: string) => cards.find((c) => c.id === id)?.payouts[0]?.amount;
if (first('evg') !== 21500) fail(`эталон Евгении: ждали 21 500, получили ${first('evg')}`);
if (first('alena') !== 23600) fail(`эталон Алёны: ждали 23 600, получили ${first('alena')}`);
const shifts = renderToStaticMarkup(<ShiftsView month="2026-09" cards={cards} showOwnerLink={false} />);
for (const total of [v.totals.bakeryTotal, v.totals.bakeryPay1, v.totals.bakeryPay2]) {
  const s = Math.round(total).toLocaleString('ru-RU');
  if (shifts.includes(s)) fail(`итог пекарни ${s} попал на вкладку «Смены и ЗП»`);
}
writeFileSync(path.join(out, 'shifts.html'), page('Смены и ЗП', shifts));
writeFileSync(path.join(out, 'shifts-owner.html'), page('Смены и ЗП (владелец)', renderToStaticMarkup(<ShiftsView month="2026-09" cards={cards} showOwnerLink />)));
console.log(`Готово: ${out}/revenue.html, revenue-owner.html, revenue-empty.html, shifts.html, shifts-owner.html`);
