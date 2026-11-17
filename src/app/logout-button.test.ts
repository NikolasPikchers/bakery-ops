import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ signOut: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

import { AppShell } from './AppShell';
import { StaffPage } from './staff/_chrome';

type ShellProps = ComponentProps<typeof AppShell>;
type StaffProps = ComponentProps<typeof StaffPage>;

const text = (html: string) => html.replace(/<[^>]+>/g, ' ');
const shell = (authed: boolean) => renderToStaticMarkup(createElement(AppShell, { authed } as ShellProps, 'страница'));
const staff = (showOwnerLink: boolean) =>
  renderToStaticMarkup(createElement(StaffPage, { tab: 'revenue', title: 'Выручка', month: '2026-11', showOwnerLink } as StaffProps, 'x'));

describe('кнопка «Выйти»', () => {
  it('есть в шапке владельца', () => {
    const html = shell(true);
    expect(text(html)).toContain('Выйти');
    expect(html).toContain('<form');
  });

  it('нет на странице входа (оболочка без сессии)', () => {
    expect(text(shell(false))).not.toContain('Выйти');
  });

  it('есть у сотрудника на его страницах', () => {
    const html = staff(false);
    expect(text(html)).toContain('Выйти');
    expect(text(html)).not.toContain('к учёту');
  });

  it('у владельца на страницах сотрудника — и «к учёту», и «Выйти»', () => {
    const html = staff(true);
    expect(text(html)).toContain('к учёту');
    expect(text(html)).toContain('Выйти');
  });
});
