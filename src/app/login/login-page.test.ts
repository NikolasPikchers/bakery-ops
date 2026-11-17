import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-auth/react', () => ({ signIn: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

import { LoginForm } from './LoginForm';

describe('страница входа', () => {
  const html = renderToStaticMarkup(createElement(LoginForm));

  it('заголовок — «Плюшкино», а не служебное «Bakery Ops»', () => {
    expect(html).toMatch(/<h1[^>]*>Плюшкино<\/h1>/);
    expect(html).not.toContain('Bakery Ops');
  });

  it('с логотипом, как в шапке дашборда', () => {
    expect(html).toContain('/nikas-logo-white.png');
  });

  it('поле пароля и кнопка «Войти» на месте', () => {
    expect(html).toContain('type="password"');
    expect(html).toContain('Войти');
  });
});
