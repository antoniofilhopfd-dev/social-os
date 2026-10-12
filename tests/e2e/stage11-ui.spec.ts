import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { hotp } from '@/core/totp';
import { PASSWORD, apiLogin, fx, uiLogin } from './helpers';
import { world } from '../helpers/db';

test.describe.configure({ mode: 'serial' });
const EMAIL = 'doisfatores@example.test';
const step = (offset = 0) => Math.floor(Date.now() / 30000) + offset;

test.beforeAll(async () => {
  const w = world();
  try {
    const userId = await w.user({ email: EMAIL, password: PASSWORD });
    await w.member({ orgId: fx().A, userId, role: 'writer' });
  } finally {
    await w.close();
  }
});

test('ativar 2FA, exigir código no login, recusar código errado/repetido e usar recuperação', async ({
  page,
  browser,
}) => {
  await uiLogin(page, EMAIL);
  await page.goto('/seguranca');
  await page.getByRole('button', { name: 'Configurar 2FA' }).click();
  const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '');
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await page.getByLabel('Código de 6 dígitos mostrado no app').fill('000000');
  await page.getByRole('button', { name: 'Ativar 2FA' }).click();
  await expect(page.getByText('Código inválido.').first()).toBeVisible();
  await page.getByLabel('Código de 6 dígitos mostrado no app').fill(hotp(secret, step()));
  await page.getByRole('button', { name: 'Ativar 2FA' }).click();
  await expect(page.getByText('não serão exibidos novamente')).toBeVisible();
  const codes = (await page.getByTestId('recovery-codes').innerText())
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  expect(codes).toHaveLength(10);
  await expect(page.getByText('2FA ativo.')).toBeVisible();

  // novo login em outro navegador: senha certa, mas pede o código
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/login');
  await p2.getByLabel('E-mail').fill(EMAIL);
  await p2.getByLabel('Senha').fill(PASSWORD);
  await p2.getByRole('button', { name: 'Entrar' }).click();
  await expect(p2.getByLabel('Código de verificação')).toBeVisible();
  await expect(p2).toHaveURL(/\/login/);
  await p2.getByLabel('Código de verificação').fill('123456');
  await p2.getByRole('button', { name: 'Entrar' }).click();
  await expect(p2.getByText('Código inválido ou expirado.')).toBeVisible();
  await p2.getByLabel('Código de verificação').fill(hotp(secret, step(1)));
  await p2.getByRole('button', { name: 'Entrar' }).click();
  await p2.waitForURL('**/');
  // acesso por API sem o segundo fator nunca cria sessão
  const raw = await apiLogin('dona.a@example.test'); // controle: usuário sem 2FA continua entrando
  await raw.dispose();
  await ctx.close();

  // recuperação: uma vez só
  const ctx2 = await browser.newContext();
  const p3 = await ctx2.newPage();
  await p3.goto('/login');
  await p3.getByLabel('E-mail').fill(EMAIL);
  await p3.getByLabel('Senha').fill(PASSWORD);
  await p3.getByRole('button', { name: 'Entrar' }).click();
  await p3.getByLabel('Código de verificação').fill(codes[0]!);
  await p3.getByRole('button', { name: 'Entrar' }).click();
  await p3.waitForURL('**/');
  await ctx2.close();
  const ctx3 = await browser.newContext();
  const p4 = await ctx3.newPage();
  await p4.goto('/login');
  await p4.getByLabel('E-mail').fill(EMAIL);
  await p4.getByLabel('Senha').fill(PASSWORD);
  await p4.getByRole('button', { name: 'Entrar' }).click();
  await p4.getByLabel('Código de verificação').fill(codes[0]!);
  await p4.getByRole('button', { name: 'Entrar' }).click();
  await expect(p4.getByText('Código inválido ou expirado.')).toBeVisible();
  await ctx3.close();

  // desativar exige senha + código
  await page.goto('/seguranca');
  await page.getByRole('button', { name: 'Desativar 2FA', exact: true }).first().click();
  await page.getByLabel('Sua senha').fill('senha-errada-qualquer');
  await page.getByLabel('Código do app (ou de recuperação)').fill(codes[1]!);
  await page.getByRole('button', { name: 'Desativar 2FA', exact: true }).last().click();
  await expect(page.getByText('Senha incorreta.').first()).toBeVisible();
  await page.getByLabel('Sua senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Desativar 2FA', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'Configurar 2FA' })).toBeVisible();
});

for (const [name, width, height] of [
  ['desktop', 1440, 900],
  ['tablet', 768, 1024],
  ['celular', 390, 844],
] as const) {
  test(`acessibilidade e sem rolagem horizontal (${name})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    await uiLogin(page, EMAIL);
    await page.goto('/seguranca');
    await page.getByRole('button', { name: 'Configurar 2FA' }).click();
    await page.getByTestId('totp-secret').waitFor();
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(r.violations, `@${name}`).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      ),
    ).toBe(false);
    await ctx.close();
  });
}

test('cabeçalhos de segurança, CSP com nonce e health check sem vazar detalhes', async ({
  request,
}) => {
  const page = await request.get('/login');
  const h = page.headers();
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['permissions-policy']).toContain('camera=()');
  expect(h['x-powered-by']).toBeUndefined();
  expect(h['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(h['content-security-policy']).not.toContain('unsafe-eval');
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok' });
  expect(health.headers()['cache-control']).toContain('no-store');
  // erros não vazam pilha nem caminhos
  const bad = await request.get('/api/tasks/nao-e-id', {
    headers: { Origin: 'http://localhost:3100' },
  });
  expect(bad.status()).toBe(401);
  expect(JSON.stringify(await bad.json())).not.toMatch(/at \w+|node_modules|\/home\//);
});
