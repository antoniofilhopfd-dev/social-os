import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { BASE, uiLogin } from './helpers';

// Só roda com SCREENSHOTS=1 (npm run screenshots:e2e). Gera prints reais do app em execução.
test.skip(!process.env.SCREENSHOTS, 'defina SCREENSHOTS=1 para gerar os prints');
test.describe.configure({ mode: 'serial' });

const OUT = 'screenshots/etapa-02';
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
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const page = await ctx.newPage();

    await page.goto('/login');
    await shot(page, '01-login', size);
    await page.getByLabel('E-mail').fill('dona.a@example.test');
    await page.getByLabel('Senha').fill('senha-errada-123456');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.locator('.alert-danger').waitFor();
    await shot(page, '02-login-erro', size);

    await uiLogin(page, 'dona.a@example.test');
    await shot(page, '03-inicio', size);

    await page.goto('/equipe');
    await page.getByLabel('Nome', { exact: true }).fill(`Pessoa ${size}`);
    await page.getByLabel('E-mail', { exact: true }).fill(`pessoa.${size}@example.test`);
    await page.getByLabel('Função', { exact: true }).selectOption({ label: 'Redator' });
    await page.getByRole('button', { name: 'Gerar convite' }).click();
    await page.getByTestId('generated-link').waitFor();
    await shot(page, '04-equipe-convite-gerado', size);

    const invite = (await page.getByTestId('generated-link').textContent())!.trim();
    const guest = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const g = await guest.newPage();
    await g.goto(invite);
    await shot(g, '05-aceitar-convite', size);
    await g.goto('/convite/token-invalido-xxxxxxxxxxxxxxxxxxxxxxxx');
    await shot(g, '06-convite-invalido', size);
    await guest.close();

    await page.goto('/funcoes');
    await page.getByRole('button', { name: 'Gestor da operação', exact: true }).click();
    await shot(page, '07-funcoes-matriz', size);
    await page.goto('/clientes');
    await shot(page, '08-clientes', size);
    await page.goto('/auditoria');
    await shot(page, '09-auditoria', size);
    await page.goto('/minhas-sessoes');
    await shot(page, '10-minhas-sessoes', size);
    await ctx.close();

    const w = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const wp = await w.newPage();
    await uiLogin(wp, 'redator.a@example.test');
    await wp.goto('/equipe');
    await shot(wp, '11-acesso-negado-redator', size);
    await w.close();

    const s = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const sp = await s.newPage();
    await uiLogin(sp, 'consulta.a1@example.test');
    await sp.goto('/clientes');
    await shot(sp, '12-clientes-escopo-A1', size);
    await s.close();
  });
}
