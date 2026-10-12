import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { hotp } from '@/core/totp';
import { world } from '../helpers/db';
import { BASE, PASSWORD, fx, uiLogin } from './helpers';

// Só roda com SCREENSHOTS=1 (npm run screenshots:e2e). Gera prints reais do app em execução.
test.skip(!process.env.SCREENSHOTS, 'defina SCREENSHOTS=1 para gerar os prints');
test.describe.configure({ mode: 'serial' });

const OUT = 'screenshots/etapa-11';
const sizes = [
  ['desktop-1440', 1440, 900],
  ['tablet-768', 768, 1024],
  ['celular-390', 390, 844],
] as const;
test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

async function shot(page: Page, name: string, size: string) {
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUT}/${name}-${size}.png`, fullPage: true });
}
const step = (o = 0) => Math.floor(Date.now() / 30000) + o;

for (const [size, width, height] of sizes) {
  test(`prints ${size}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const email = `seguranca-${size}@example.test`;
    const w = world();
    try {
      const userId = await w.user({ email, password: PASSWORD, name: 'Marina Souza' });
      await w.member({ orgId: fx().A, userId, role: 'writer' });
    } finally {
      await w.close();
    }
    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const page = await ctx.newPage();
    await uiLogin(page, email);
    await page.goto('/seguranca');
    await shot(page, '01-seguranca-2fa-desativado', size);
    await page.getByRole('button', { name: 'Configurar 2FA' }).click();
    await page.getByTestId('totp-secret').waitFor();
    await shot(page, '02-configurar-2fa-chave', size);
    await page.getByLabel('Código de 6 dígitos mostrado no app').fill('123456');
    await page.getByRole('button', { name: 'Ativar 2FA' }).click();
    await page.getByText('Código inválido.').first().waitFor();
    await shot(page, '03-configurar-2fa-codigo-invalido', size);
    const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '');
    await page.getByLabel('Código de 6 dígitos mostrado no app').fill(hotp(secret, step()));
    await page.getByRole('button', { name: 'Ativar 2FA' }).click();
    await page.getByTestId('recovery-codes').waitFor();
    await shot(page, '04-codigos-de-recuperacao', size);
    await page.getByRole('button', { name: 'Já guardei os códigos' }).click();
    await shot(page, '05-seguranca-2fa-ativo', size);

    const c2 = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const p2 = await c2.newPage();
    await p2.goto('/login');
    await p2.getByLabel('E-mail').fill(email);
    await p2.getByLabel('Senha').fill(PASSWORD);
    await p2.getByRole('button', { name: 'Entrar' }).click();
    await p2.getByLabel('Código de verificação').waitFor();
    await shot(p2, '06-login-pede-codigo', size);
    await p2.getByLabel('Código de verificação').fill('000000');
    await p2.getByRole('button', { name: 'Entrar' }).click();
    await p2.getByText('Código inválido ou expirado.').waitFor();
    await shot(p2, '07-login-codigo-invalido', size);
    await c2.close();
    await ctx.close();

    const adm = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const ap = await adm.newPage();
    await uiLogin(ap, 'dona.a@example.test');
    await ap.goto(`/equipe?q=${encodeURIComponent(email)}`);
    await shot(ap, '08-equipe-remover-2fa', size);
    await adm.close();
  });
}
