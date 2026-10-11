import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { BASE, fx, seedNotification, uiLogin } from './helpers';

// Só roda com SCREENSHOTS=1 (npm run screenshots:e2e). Gera prints reais do app em execução.
test.skip(!process.env.SCREENSHOTS, 'defina SCREENSHOTS=1 para gerar os prints');
test.describe.configure({ mode: 'serial' });

const OUT = 'screenshots/etapa-03';
const sizes = [
  ['desktop-1440', 1440, 900],
  ['tablet-768', 768, 1024],
  ['celular-390', 390, 844],
] as const;

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

async function shot(page: Page, name: string, size: string, full = true) {
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUT}/${name}-${size}.png`, fullPage: full });
}

for (const [size, width, height] of sizes) {
  test(`prints ${size}`, async ({ browser }) => {
    test.setTimeout(150_000);
    const { A } = fx();
    await seedNotification('dona.a@example.test', `Aviso de exemplo (${size})`, A);
    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const page = await ctx.newPage();
    await uiLogin(page, 'dona.a@example.test');
    await shot(page, '01-dashboard', size);

    await page.getByLabel('Cliente', { exact: true }).selectOption({ label: 'Cliente A1' });
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await page.waitForURL(/cliente=/);
    await shot(page, '02-dashboard-filtrado-por-cliente', size);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /Buscar/ }).click();
    await page.getByLabel('Buscar clientes e pessoas').fill('Cliente A');
    await page
      .getByRole('dialog', { name: 'Busca' })
      .getByRole('link', { name: 'Cliente A1', exact: true })
      .waitFor();
    await shot(page, '03-busca-aberta', size, false);
    await page.keyboard.press('Escape');

    await page.goto('/notificacoes');
    await shot(page, '04-notificacoes', size);
    await page.goto('/notificacoes/preferencias');
    await shot(page, '05-preferencias-notificacao', size);
    await page.goto('/equipe');
    await shot(page, '06-equipe-no-novo-layout', size);

    if (width < 900) {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Abrir menu' }).click();
      await page.getByRole('dialog', { name: 'Menu' }).waitFor();
      await shot(page, '07-menu-gaveta-aberta', size, false);
    }
    await ctx.close();

    const m = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const mp = await m.newPage();
    await uiLogin(mp, 'multi.org@example.test');
    await mp.goto('/clientes');
    await shot(mp, '08-multi-organizacao-na-agencia-A', size);
    await mp.getByLabel('Organização ativa').selectOption({ label: 'Agência B' });
    await mp
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Equipe' })
      .or(mp.getByRole('button', { name: 'Abrir menu' }))
      .first()
      .waitFor();
    await mp.goto('/');
    await shot(mp, '09-multi-organizacao-na-agencia-B', size);
    await m.close();

    const r = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const rp = await r.newPage();
    await uiLogin(rp, 'redator.a@example.test');
    await shot(rp, '10-dashboard-do-redator', size);
    await r.close();
  });
}
