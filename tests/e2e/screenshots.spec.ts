import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { BASE, fx, uiLogin } from './helpers';

// Só roda com SCREENSHOTS=1 (npm run screenshots:e2e). Gera prints reais do app em execução.
test.skip(!process.env.SCREENSHOTS, 'defina SCREENSHOTS=1 para gerar os prints');
test.describe.configure({ mode: 'serial' });

const OUT = 'screenshots/etapa-04';
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
    test.setTimeout(180_000);
    const f = fx();
    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const page = await ctx.newPage();
    await uiLogin(page, 'dona.a@example.test');
    await shot(page, '01-dashboard-com-solicitacoes', size);
    await page.goto('/clientes');
    await shot(page, '02-clientes-lista', size);
    for (const [aba, nome] of [
      ['geral', '03-cliente-dados-e-diretrizes'],
      ['contatos', '04-cliente-contatos'],
      ['datas', '05-cliente-datas'],
      ['marcas', '06-cliente-marcas-e-perfis'],
      ['historico', '07-cliente-historico'],
    ] as [string, string][]) {
      await page.goto(`/clientes/${f.clientA1}?aba=${aba}`);
      await shot(page, nome, size);
    }
    await page.goto('/solicitacoes');
    await shot(page, '08-solicitacoes-lista', size);
    await page.goto(`/solicitacoes/${f.requestA1}`);
    await shot(page, '09-solicitacao-detalhe-e-triagem', size);

    await page.goto('/solicitacoes/nova');
    await page.getByLabel('Cliente *').selectOption({ label: 'Cliente A1' });
    await page.getByLabel('Tipo *').selectOption({ label: 'Criação de conteúdo (post)' });
    await page.getByLabel('Título *').fill('Pedido de exemplo');
    await page
      .getByLabel('Descrição *')
      .fill('Exemplo de solicitação com campos obrigatórios ausentes.');
    await page.getByRole('button', { name: 'Enviar solicitação' }).click();
    await page.getByText('Rede social é obrigatório para este tipo.').waitFor();
    await shot(page, '10-nova-solicitacao-campos-obrigatorios', size);

    await page.goto('/solicitacoes/nova');
    await page.getByLabel('Cliente *').selectOption({ label: 'Cliente A1' });
    await page.getByLabel('Tipo *').selectOption({ label: 'Outro' });
    await page.getByLabel('Título *').fill('fixture solicitacao do a1');
    await page.getByLabel('Descrição *').fill('Texto parecido com uma solicitação existente.');
    await page.getByRole('button', { name: 'Enviar solicitação' }).click();
    await page.getByText('Possível duplicidade.').waitFor();
    await shot(page, '11-aviso-de-duplicidade', size);

    await page.goto('/configuracoes/solicitacoes');
    await shot(page, '12-tipos-de-solicitacao', size);
    await ctx.close();

    const e = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const ep = await e.newPage();
    await uiLogin(ep, 'cliente.a1@example.test');
    await ep.goto('/solicitacoes');
    await shot(ep, '13-cliente-externo-lista', size);
    await ep.goto(`/solicitacoes/${f.requestExtA1}`);
    await shot(ep, '14-cliente-externo-detalhe-sem-triagem', size);
    await e.close();
  });
}
