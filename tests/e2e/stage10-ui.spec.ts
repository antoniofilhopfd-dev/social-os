import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fx, uiLogin } from './helpers';
import { publishedContent } from './helpers-flow';

test.describe.configure({ mode: 'serial' });
const OWNER = 'dona.a@example.test';
const CLIENT = 'cliente.a1@example.test';
const today = () => new Date().toISOString().slice(0, 10);

test('registrar resultados, ver relatório, exportar e imprimir', async ({ page }) => {
  const { publicationId, owner } = await publishedContent('Reels de resultados UI');
  await owner.dispose();
  await uiLogin(page, OWNER);
  await page.goto(`/publicacoes/${publicationId}`);
  await expect(page.getByRole('heading', { name: 'Resultados da publicação' })).toBeVisible();
  await expect(page.getByText('Nenhum resultado registrado ainda.')).toBeVisible();
  await page.getByRole('button', { name: 'Salvar resultados' }).click();
  await expect(page.getByText('Data inválida.').first()).toBeVisible();
  await page.getByLabel('Data da coleta *').fill(today());
  await page.getByRole('button', { name: 'Salvar resultados' }).click();
  await expect(page.getByText('Informe ao menos uma métrica.').first()).toBeVisible();
  await page.getByLabel('Alcance').fill('1000');
  await page.getByLabel('Impressões').fill('500');
  await page.getByRole('button', { name: 'Salvar resultados' }).click();
  await expect(
    page.getByText('As impressões não podem ser menores que o alcance.').first(),
  ).toBeVisible();
  await page.getByLabel('Impressões').fill('1500');
  await page.getByLabel('Curtidas').fill('90');
  await page.getByLabel('Comentários').fill('10');
  await page.getByRole('button', { name: 'Salvar resultados' }).click();
  await expect(page.getByRole('cell', { name: '10%' })).toBeVisible();

  await page.goto(`/resultados?from=${today()}&to=${today()}`);
  await expect(page.getByRole('heading', { name: 'Resumo' })).toBeVisible();
  await expect(page.getByText('Reels de resultados UI').first()).toBeVisible();
  await expect(page.locator('.stat', { hasText: 'Taxa de engajamento' })).toContainText('%');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Exportar CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^resultados-.*\.csv$/);
  await page.getByRole('link', { name: 'Operação' }).click();
  await expect(page.getByRole('heading', { name: 'Aprovações do cliente' })).toBeVisible();
  await page.goto(`/resultados?from=${today()}&to=${today()}&imprimir=1`);
  await expect(page.getByText(/Período:/)).toBeVisible();
  await page.goto(`/resultados?from=2031-02-01&to=2031-01-01`);
  await expect(page.locator('.alert-danger')).toContainText('data inicial');
});

test('seguidores: registro, duplicidade e crescimento no relatório', async ({ page }) => {
  const f = fx();
  void f;
  await uiLogin(page, OWNER);
  await page.goto('/resultados/seguidores');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Data inválida.').first()).toBeVisible();
  const d = (n: number) => {
    const x = new Date();
    x.setUTCDate(x.getUTCDate() - n);
    return x.toISOString().slice(0, 10);
  };
  for (const [day, count] of [
    [d(5), '1000'],
    [d(1), '1090'],
  ] as const) {
    await page.getByLabel('Data *').fill(day);
    await page.getByLabel('Seguidores *').fill(count);
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(
      page.getByText(count === '1000' ? '1.000' : '1.090', { exact: true }),
    ).toBeVisible();
  }
  await page.getByLabel('Data *').fill(d(1));
  await page.getByLabel('Seguidores *').fill('5');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Já existe um registro de seguidores')).toBeVisible();
});

test('cliente externo vê só os próprios resultados, sem exportar nem operação', async ({
  page,
}) => {
  await uiLogin(page, CLIENT);
  await page.goto(`/resultados?from=${today()}&to=${today()}`);
  await expect(page.getByRole('heading', { name: 'Resultados', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Exportar CSV' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Operação' })).toHaveCount(0);
  await expect(page.getByText('Reels de resultados UI').first()).toBeVisible();
  await page.goto('/resultados?aba=operacao');
  await expect(page.getByRole('heading', { name: 'Produção' })).toHaveCount(0);
});

for (const [name, width, height] of [
  ['desktop', 1440, 900],
  ['tablet', 768, 1024],
  ['celular', 390, 844],
] as const) {
  test(`acessibilidade e sem rolagem horizontal (${name})`, async ({ browser }) => {
    const { publicationId, owner } = await publishedContent(`A11y resultados ${name}`);
    await owner.dispose();
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    await uiLogin(page, OWNER);
    const range = `from=${today()}&to=${today()}`;
    for (const url of [
      `/resultados?${range}`,
      `/resultados?${range}&aba=operacao`,
      '/resultados/seguidores',
      `/publicacoes/${publicationId}`,
    ]) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(r.violations, `${url} @${name}`).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        ),
        `${url} @${name}`,
      ).toBe(false);
    }
    await ctx.close();
  });
}
