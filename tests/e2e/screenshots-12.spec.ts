import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { BASE, apiLogin, fx, uiLogin } from './helpers';
import { okMessage, startFakeAnthropic } from '../helpers/fake-anthropic';

// Só roda com SCREENSHOTS=1 (npm run screenshots:e2e). Gera prints reais do app em execução.
test.skip(!process.env.SCREENSHOTS, 'defina SCREENSHOTS=1 para gerar os prints');
test.describe.configure({ mode: 'serial' });

const OUT = 'screenshots/etapa-12';
const sizes = [
  ['desktop-1440', 1440, 900],
  ['tablet-768', 768, 1024],
  ['celular-390', 390, 844],
] as const;
let srv: Awaited<ReturnType<typeof startFakeAnthropic>>;
test.beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  // Servidor local no lugar do serviço de IA, só para capturar as telas (as respostas abaixo são do teste, não do produto).
  srv = await startFakeAnthropic(
    () => ({
      body: okMessage({
        options: [
          'Nosso pão de fermentação natural chegou! Crocante por fora, macio por dentro. Venha provar hoje.',
          'Novidade na vitrine: pão de fermentação natural, feito devagar para ter mais sabor. Garanta o seu!',
        ],
        notes: ['Confirmar horário de funcionamento e preço antes de publicar'],
      }),
    }),
    3199,
  );
});
test.afterAll(async () => srv.close());

async function shot(page: Page, name: string, size: string) {
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUT}/${name}-${size}.png`, fullPage: true });
}

for (const [size, width, height] of sizes) {
  test(`prints ${size}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const f = fx();
    const api = await apiLogin('dona.a@example.test');
    await api.delete('/api/integrations/ai');
    const c = await (
      await api.post('/api/contents', {
        data: {
          clientId: f.clientA1,
          title: `Pão de fermentação natural (${size})`,
          format: 'static_post',
          brief: 'Divulgar o novo pão de fermentação natural da padaria.',
        },
      })
    ).json();
    await api.put(`/api/contents/${c.id}/editor/draft`, {
      data: {
        baseRevision: 0,
        body: {
          caption: 'Pão novo na padaria.',
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
    });
    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const page = await ctx.newPage();
    await uiLogin(page, 'dona.a@example.test');
    await page.goto('/configuracoes/integracoes');
    await shot(page, '01-integracoes-nao-configurado', size);
    await page.goto(`/conteudos/${c.id}?aba=editor`);
    await page.getByText('Nenhum assistente de IA está configurado').scrollIntoViewIfNeeded();
    await shot(page, '02-editor-sem-assistente', size);
    await page.goto('/configuracoes/integracoes');
    await page.getByLabel('Chave de API').fill('curta');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await page
      .getByText(/chave parece inválida/i)
      .first()
      .waitFor();
    await shot(page, '03-integracoes-validacao', size);
    await page.getByLabel('Chave de API').fill('sk-ant-api03-exemplo-de-chave-para-captura-1234');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await page.getByText('Configuração salva.').waitFor();
    await page.getByRole('button', { name: 'Testar conexão' }).click();
    await page.getByText('Conexão validada com sucesso.').waitFor();
    await shot(page, '04-integracoes-conectado', size);
    await page.goto(`/conteudos/${c.id}?aba=editor`);
    await page.getByRole('button', { name: 'Sugerir legendas' }).click();
    await page.getByTestId('ai-result').waitFor();
    await page.getByTestId('ai-result').scrollIntoViewIfNeeded();
    await shot(page, '05-editor-sugestoes-da-ia', size);
    await page.getByRole('button', { name: 'Usar opção 1 em Legenda' }).click();
    await page.getByTestId('save-state').getByText('Salvo').waitFor({ timeout: 10_000 });
    await shot(page, '06-editor-sugestao-aplicada', size);
    await ctx.close();
    await api.delete('/api/integrations/ai');
    await api.dispose();
  });
}
