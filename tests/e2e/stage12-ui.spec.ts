import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { apiLogin, fx, uiLogin } from './helpers';
import { okMessage, startFakeAnthropic } from '../helpers/fake-anthropic';

test.describe.configure({ mode: 'serial' });
const OWNER = 'dona.a@example.test';
const KEY = 'sk-ant-api03-chave-e2e-super-secreta-WXYZ';
let srv: Awaited<ReturnType<typeof startFakeAnthropic>> | undefined;
let mode: 'ok' | 'unauthorized' = 'ok';

test.beforeAll(async () => {
  // Observa o que o app envia à IA. Porta fixa, a mesma de ANTHROPIC_BASE_URL no playwright.config.ts.
  const calls = [] as unknown[];
  void calls;
  const s = await startFakeAnthropic(
    () =>
      mode === 'unauthorized'
        ? { status: 401, body: { error: {} } }
        : {
            body: okMessage({
              options: ['Legenda sugerida pela IA: venha conhecer!', 'Outra opção de legenda'],
              notes: ['Confirmar horário de funcionamento'],
            }),
          },
    3199,
  );
  srv = s;
});
test.afterAll(async () => {
  await srv?.close();
});

test('administrador configura, testa e remove a conexão; a chave nunca reaparece', async ({
  page,
}) => {
  await uiLogin(page, OWNER);
  await page.goto('/configuracoes/integracoes');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Integrações', level: 1 })).toBeVisible();
  await expect(page.getByText('Não configurado')).toBeVisible();
  await expect(page.getByText('Nenhuma rede está conectada.')).toBeVisible();
  await expect(page.getByText('Pendente — depende da plataforma').first()).toBeVisible();

  await page.getByLabel('Chave de API').fill('curta');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText(/chave parece inválida/i).first()).toBeVisible();
  await page.getByLabel('Chave de API').fill(KEY);
  await page.getByLabel('Modelo').selectOption('claude-haiku-5-5');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Configuração salva.')).toBeVisible();
  await expect(page.getByText('…WXYZ')).toBeVisible();
  expect(await page.content()).not.toContain('chave-e2e-super-secreta');

  mode = 'unauthorized';
  await page.getByRole('button', { name: 'Testar conexão' }).click();
  await expect(page.getByText(/chave da IA foi recusada/)).toBeVisible();
  await expect(page.locator('.badge', { hasText: 'Com erro' })).toBeVisible();
  mode = 'ok';
  await page.getByRole('button', { name: 'Testar conexão' }).click();
  await expect(page.getByText('Conexão validada com sucesso.')).toBeVisible();
  await expect(page.locator('.badge', { hasText: 'Conectado' })).toBeVisible();
  // a API nunca devolve a chave
  const api = await apiLogin(OWNER);
  const j = JSON.stringify(await (await api.get('/api/integrations/ai')).json());
  expect(j).not.toContain('chave-e2e');
  expect(j).toContain('…WXYZ');
  await api.dispose();
});

test('editor: sugestões com selo de IA, aplicação manual, nada salvo sozinho e contexto sem notas internas', async ({
  page,
}) => {
  const f = fx();
  const api = await apiLogin(OWNER);
  const c = await (
    await api.post('/api/contents', {
      data: {
        clientId: f.clientA1,
        title: 'Post com assistente',
        format: 'static_post',
        brief: 'Divulgar a novidade da semana',
      },
    })
  ).json();
  await api.put(`/api/contents/${c.id}/editor/draft`, {
    data: {
      baseRevision: 0,
      body: {
        caption: 'Texto inicial',
        hook: '',
        script: '',
        cta: '',
        hashtags: '',
        coverText: '',
        altText: '',
        productionNotes: 'NOTA-INTERNA-E2E',
        publishNotes: '',
        references: '',
        slides: [],
        checklist: [],
      },
    },
  });
  await api.dispose();
  srv!.calls.length = 0;
  await uiLogin(page, OWNER);
  await page.goto(`/conteudos/${c.id}?aba=editor`);
  await page.getByRole('button', { name: 'Sugerir legendas' }).click();
  const result = page.getByTestId('ai-result');
  await expect(result).toContainText('Gerado por IA — revise antes de usar');
  await expect(result).toContainText('Legenda sugerida pela IA');
  await expect(result).toContainText('Confirmar horário de funcionamento');
  // nada foi aplicado ainda
  await expect(page.getByLabel('Legenda', { exact: true })).toHaveValue('Texto inicial');
  expect(JSON.stringify(srv!.calls[0]!.body)).toContain('Divulgar a novidade da semana');
  expect(JSON.stringify(srv!.calls[0]!.body)).not.toContain('NOTA-INTERNA-E2E');
  expect(srv!.calls[0]!.headers['x-api-key']).toBe(KEY);
  await page.getByRole('button', { name: 'Usar opção 1 em Legenda' }).click();
  await expect(page.getByLabel('Legenda', { exact: true })).toHaveValue(/Legenda sugerida pela IA/);
  await expect(page.getByTestId('save-state')).toContainText('Salvo', { timeout: 10_000 });
  await page.getByLabel('Nota da versão').fill('Com sugestão da IA');
  await page.getByRole('button', { name: 'Salvar versão' }).click();
  await expect(page.locator('strong', { hasText: 'Versão 1' })).toBeVisible();
  // erro do serviço aparece sem travar o editor
  mode = 'unauthorized';
  await page.getByRole('button', { name: 'Sugerir hashtags' }).click();
  await expect(page.getByText(/chave da IA foi recusada/).first()).toBeVisible();
  mode = 'ok';
});

test('quem não administra vê o assistente mas não a configuração; outra organização e cliente externo ficam de fora', async ({
  page,
}) => {
  const f = fx();
  const writer = await apiLogin('redator.a@example.test');
  expect(
    (
      await writer.put('/api/integrations/ai', { data: { apiKey: KEY, model: 'claude-haiku-5-5' } })
    ).status(),
  ).toBe(403);
  expect((await writer.get('/api/integrations/ai')).status()).toBe(403);
  expect((await writer.delete('/api/integrations/ai')).status()).toBe(403);
  await writer.dispose();
  const b = await apiLogin('dono.b@example.test');
  expect((await (await b.get('/api/integrations/ai')).json()).configured).toBe(false);
  expect(
    (
      await b.post(`/api/contents/${f.contentA1}/ai-suggestions`, { data: { task: 'caption' } })
    ).status(),
  ).toBe(404);
  await b.dispose();
  const ext = await apiLogin('cliente.a1@example.test');
  expect(
    (
      await ext.post(`/api/contents/${f.contentExtA1}/ai-suggestions`, {
        data: { task: 'caption' },
      })
    ).status(),
  ).toBe(403);
  expect((await ext.get('/api/integrations/ai')).status()).toBe(403);
  await ext.dispose();
  const owner = await apiLogin(OWNER);
  expect(
    (
      await owner.post(`/api/contents/${f.contentA1}/ai-suggestions`, {
        data: { task: 'reels_script' },
      })
    ).status(),
  ).toBe(400);
  expect(
    (await owner.put('/api/integrations/ai', { data: { model: 'inexistente' } })).status(),
  ).toBe(400);
  await owner.dispose();
  // redator: página de integrações negada
  await uiLogin(page, 'redator.a@example.test');
  await page.goto('/configuracoes/integracoes');
  await expect(page.getByText(/permissão|acesso/i).first()).toBeVisible();
  await expect(page.getByLabel('Chave de API')).toHaveCount(0);
});

test('remover a conexão desliga o assistente no editor', async ({ page }) => {
  const f = fx();
  await uiLogin(page, OWNER);
  await page.goto('/configuracoes/integracoes');
  await page.getByRole('button', { name: 'Remover conexão' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remover conexão' }).click();
  await expect(page.getByText('Conexão removida.')).toBeVisible();
  await page.goto(`/conteudos/${f.contentA1}?aba=editor`);
  await expect(
    page.getByText('Nenhum assistente de IA está configurado nesta organização.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sugerir legendas' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Configurar em Integrações' })).toBeVisible();
});

for (const [name, width, height] of [
  ['desktop', 1440, 900],
  ['tablet', 768, 1024],
  ['celular', 390, 844],
] as const) {
  test(`acessibilidade e sem rolagem horizontal (${name})`, async ({ browser }) => {
    const f = fx();
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    await uiLogin(page, OWNER);
    for (const url of ['/configuracoes/integracoes', `/conteudos/${f.contentA1}?aba=editor`]) {
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
