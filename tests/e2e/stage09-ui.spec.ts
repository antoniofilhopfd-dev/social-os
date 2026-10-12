import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { uiLogin } from './helpers';
import { approvedContent } from './helpers-flow';

test.describe.configure({ mode: 'serial' });
const OWNER = 'dona.a@example.test';

test('programar, copiar pacote, registrar publicação com link e conferir histórico', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { contentId, owner } = await approvedContent('Post para publicar UI');
  await owner.dispose();
  await uiLogin(page, OWNER);
  await page.goto(`/conteudos/${contentId}?aba=publicacao`);
  await page.getByRole('button', { name: 'Programar' }).click();
  await expect(page.getByText('Data inválida.')).toBeVisible();
  await page.getByLabel('Data *').fill('2000-01-01');
  await page.getByRole('button', { name: 'Programar' }).click();
  await expect(
    page.getByText('A data de publicação não pode estar no passado.').first(),
  ).toBeVisible();
  await page.getByLabel('Data *').fill('2099-05-10');
  await page.getByLabel('Horário').fill('14:30');
  await page.getByRole('button', { name: 'Programar' }).click();
  await expect(page.getByText('Programada para 10/05/2099 às 14:30')).toBeVisible();
  await page.getByRole('link', { name: 'Abrir pacote de publicação' }).click();

  await expect(page.getByTestId('post-text')).toContainText('Legenda de Post para publicar UI');
  await expect(page.getByTestId('post-text')).toContainText('#social');
  await expect(page.getByText('Texto da versão aprovada pelo cliente.')).toBeVisible();
  await page.getByRole('button', { name: 'Copiar texto completo' }).click();
  await expect(page.getByText('Copiado!')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    'Legenda de Post para publicar UI',
  );

  await page.getByRole('button', { name: 'Reagendar' }).click();
  await page.getByLabel('Nova data *').fill('2099-05-12');
  await page.getByRole('button', { name: 'Salvar nova data' }).click();
  await expect(page.getByText('12/05/2099 às 14:30').first()).toBeVisible();

  await page.getByRole('button', { name: 'Registrar falha' }).first().click();
  await page.getByRole('button', { name: 'Registrar falha' }).last().click();
  await expect(page.getByText('Informe o motivo.').first()).toBeVisible();

  await page.getByRole('button', { name: 'Marcar como publicada' }).click();
  await page.getByLabel('Link da publicação (opcional)').fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Confirmar publicação' }).click();
  await expect(page.getByText(/link http\(s\) válido/)).toBeVisible();
  await page
    .getByLabel('Link da publicação (opcional)')
    .fill('https://www.instagram.com/p/AbC123/');
  await page.getByRole('button', { name: 'Confirmar publicação' }).click();
  await expect(page.locator('.badge', { hasText: 'Publicada' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'https://www.instagram.com/p/AbC123/' }),
  ).toHaveAttribute('rel', /noopener/);
  await expect(page.getByText('Marcada como publicada')).toBeVisible();

  await page.goto('/publicacoes?view=historico');
  await expect(page.getByRole('link', { name: /Post para publicar UI/ })).toBeVisible();
});

test('conteúdo não aprovado não é programável; dispensa de aprovação é explícita; fila mostra atraso', async ({
  page,
}) => {
  const f = (await import('./helpers')).fx();
  const api = await (await import('./helpers')).apiLogin(OWNER);
  const c = await (
    await api.post('/api/contents', {
      data: {
        clientId: f.clientA1,
        title: 'Sem aprovação UI',
        format: 'text',
        brandId: f.brandA,
        socialProfileId: f.profileA,
      },
    })
  ).json();
  await api.post(`/api/contents/${c.id}/status`, { data: { to: 'in_production' } });
  await api.dispose();
  await uiLogin(page, OWNER);
  await page.goto(`/conteudos/${c.id}?aba=publicacao`);
  await expect(page.getByLabel('Dispensar a aprovação do cliente')).toBeVisible();
  await page.getByLabel('Data *').fill('2099-06-01');
  await page.getByRole('button', { name: 'Programar' }).click();
  await expect(page.getByText(/Aprove o conteúdo ou dispense/)).toBeVisible();
  await page.getByLabel('Dispensar a aprovação do cliente').check();
  await page.getByRole('button', { name: 'Programar' }).click();
  await expect(page.getByText('Programada para 01/06/2099')).toBeVisible();
  await page.goto('/publicacoes');
  await expect(page.getByRole('heading', { name: /Próximas/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Sem aprovação UI/ })).toBeVisible();
});

for (const [name, width, height] of [
  ['desktop', 1440, 900],
  ['tablet', 768, 1024],
  ['celular', 390, 844],
] as const) {
  test(`acessibilidade e sem rolagem horizontal (${name})`, async ({ browser }) => {
    const { contentId, owner } = await approvedContent(`A11y publicação ${name}`);
    const r = await (
      await owner.post(`/api/contents/${contentId}/publication`, { data: { date: '2099-07-01' } })
    ).json();
    await owner.dispose();
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    await uiLogin(page, OWNER);
    for (const url of [
      '/publicacoes',
      '/publicacoes?view=historico',
      `/publicacoes/${r.id}`,
      `/conteudos/${contentId}?aba=publicacao`,
    ]) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      const a = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(a.violations, `${url} @${name}`).toEqual([]);
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
