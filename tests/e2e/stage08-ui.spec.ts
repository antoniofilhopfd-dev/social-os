import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { apiLogin, fx, uiLogin } from './helpers';

test.describe.configure({ mode: 'serial' });
const OWNER = 'dona.a@example.test';
const CLIENT = 'cliente.a1@example.test';

async function prepare(title: string) {
  const f = fx();
  const api = await apiLogin(OWNER);
  const c = await (
    await api.post('/api/contents', {
      data: { clientId: f.clientA1, title, format: 'static_post' },
    })
  ).json();
  const body = {
    caption: `Legenda de ${title}`,
    hook: '',
    script: '',
    cta: 'Compre agora',
    hashtags: '#oferta',
    coverText: '',
    altText: '',
    productionNotes: 'NOTA-INTERNA-UI',
    publishNotes: '',
    references: '',
    slides: [],
    checklist: [],
  };
  await api.put(`/api/contents/${c.id}/editor/draft`, { data: { baseRevision: 0, body } });
  await api.post(`/api/contents/${c.id}/status`, { data: { to: 'in_production' } });
  await api.post(`/api/contents/${c.id}/status`, { data: { to: 'internal_review' } });
  await api.dispose();
  return c.id as string;
}

test('fluxo completo: equipe envia, cliente pede ajustes, equipe reenvia, cliente aprova', async ({
  browser,
}) => {
  const id = await prepare('Post de aprovação UI');
  const team = await browser.newContext();
  const tp = await team.newPage();
  await uiLogin(tp, OWNER);
  await tp.goto(`/conteudos/${id}?aba=aprovacao`);
  await tp.getByLabel('Mensagem ao cliente (opcional)').fill('Por favor, revise a legenda.');
  await tp.getByRole('button', { name: 'Enviar para aprovação do cliente' }).click();
  await expect(tp.getByText('aguardando a decisão do cliente')).toBeVisible();
  await expect(tp.getByRole('button', { name: 'Cancelar envio' })).toBeVisible();

  const cli = await browser.newContext();
  const cp = await cli.newPage();
  await uiLogin(cp, CLIENT);
  await cp.goto('/aprovacoes');
  await expect(cp.getByRole('heading', { name: 'Aguardando a sua decisão' })).toBeVisible();
  await cp.getByRole('link', { name: /Post de aprovação UI/ }).click();
  await expect(cp.getByTestId('approval-body')).toContainText('Legenda de Post de aprovação UI');
  await expect(cp.getByText('NOTA-INTERNA-UI')).toHaveCount(0);
  await expect(cp.getByText('Por favor, revise a legenda.')).toBeVisible();
  await cp.getByRole('button', { name: 'Solicitar ajustes' }).click();
  await expect(cp.getByRole('alert').filter({ hasText: /ajustes/i })).toBeVisible();
  await cp.getByLabel(/Comentário \(obrigatório/).fill('Trocar a chamada final.');
  await cp.getByRole('button', { name: 'Solicitar ajustes' }).click();
  await expect(cp.locator('.badge', { hasText: 'Ajustes solicitados' })).toBeVisible();
  await expect(cp.getByRole('button', { name: 'Aprovar' })).toHaveCount(0);

  // equipe vê o pedido, ajusta pelo editor e reenvia
  await tp.goto(`/conteudos/${id}?aba=aprovacao`);
  await expect(tp.getByText('Trocar a chamada final.')).toBeVisible();
  await tp.goto(`/conteudos/${id}?aba=editor`);
  await tp.getByRole('textbox', { name: 'Chamada para ação' }).fill('Garanta a sua hoje');
  await expect(tp.getByTestId('save-state')).toContainText('Salvo', { timeout: 10_000 });
  await tp.goto(`/conteudos/${id}?aba=aprovacao`);
  await tp.getByRole('button', { name: 'Enviar para aprovação do cliente' }).click();
  await expect(tp.getByText('Rodada 2').first()).toBeVisible();

  await cp.goto('/aprovacoes');
  await cp
    .getByRole('link', { name: /Post de aprovação UI/ })
    .first()
    .click();
  await expect(cp.getByTestId('approval-body')).toContainText('Garanta a sua hoje');
  await cp.getByLabel(/Comentário \(obrigatório/).fill('Ficou ótimo.');
  await cp.getByRole('button', { name: 'Aprovar', exact: true }).click();
  await expect(cp.locator('.badge', { hasText: 'Aprovado' })).toBeVisible();

  await tp.goto(`/conteudos/${id}?aba=aprovacao`);
  await expect(tp.getByText('Conteúdo aprovado pelo cliente')).toBeVisible();
  await tp.getByRole('button', { name: 'Reabrir para edição' }).click();
  await expect(tp.getByText('Substituída')).toBeVisible();
  await team.close();
  await cli.close();
});

test('painel do cliente mostra pendência e o editor interno fica bloqueado durante a aprovação', async ({
  browser,
}) => {
  const id = await prepare('Pendência no painel');
  const api = await apiLogin(OWNER);
  expect((await api.post(`/api/contents/${id}/approval`, { data: {} })).status()).toBe(200);
  expect(
    (
      await api.put(`/api/contents/${id}/editor/draft`, {
        data: {
          baseRevision: 1,
          body: {
            caption: 'x',
            hook: '',
            script: '',
            cta: '',
            hashtags: '',
            coverText: '',
            altText: '',
            productionNotes: '',
            publishNotes: '',
            references: '',
            slides: [],
            checklist: [],
          },
        },
      })
    ).status(),
  ).toBe(409);
  await api.dispose();
  const cli = await browser.newContext();
  const cp = await cli.newPage();
  await uiLogin(cp, CLIENT);
  await cp.goto('/');
  await expect(cp.getByText('Conteúdo para aprovar: Pendência no painel')).toBeVisible();
  await cli.close();
});

for (const [name, width, height] of [
  ['desktop', 1440, 900],
  ['tablet', 768, 1024],
  ['celular', 390, 844],
] as const) {
  test(`acessibilidade e sem rolagem horizontal (${name})`, async ({ browser }) => {
    const f = fx();
    for (const [user, urls] of [
      [CLIENT, ['/aprovacoes', `/aprovacoes/${f.approvalA}`]],
      [OWNER, ['/aprovacoes', `/conteudos/${f.contentExtA1}?aba=aprovacao`]],
    ] as const) {
      const ctx = await browser.newContext({ viewport: { width, height } });
      const page = await ctx.newPage();
      await uiLogin(page, user);
      for (const url of urls) {
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(r.violations, `${user} ${url} @${name}`).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          ),
          `${url} @${name}`,
        ).toBe(false);
      }
      await ctx.close();
    }
  });
}
