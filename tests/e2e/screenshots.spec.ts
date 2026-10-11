import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { BASE, apiLogin, fx, uiLogin } from './helpers';

// Só roda com SCREENSHOTS=1 (npm run screenshots:e2e). Gera prints reais do app em execução.
test.skip(!process.env.SCREENSHOTS, 'defina SCREENSHOTS=1 para gerar os prints');
test.describe.configure({ mode: 'serial' });

const OUT = 'screenshots/etapa-05';
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
    test.setTimeout(240_000);
    const f = fx();
    // Dados de exemplo: um conteúdo conflitante, um atrasado e uma solicitação aceita para converter
    const api = await apiLogin('dona.a@example.test');
    const base = {
      clientId: f.clientA1,
      brandId: f.brandA,
      socialProfileId: f.profileA,
      pillarId: f.pillarA,
    };
    await api.post('/api/contents', {
      data: {
        ...base,
        title: `Conteúdo conflitante (${size})`,
        format: 'carousel',
        scheduledDate: '2031-03-12',
        scheduledTime: '10:00',
      },
    });
    await api.post('/api/contents', {
      data: {
        clientId: f.clientA1,
        title: `Post atrasado (${size})`,
        format: 'static_post',
        scheduledDate: '2026-09-01',
      },
    });
    await api.post('/api/contents', {
      data: { clientId: f.clientA2, title: `Sem data definida (${size})`, format: 'text' },
    });
    const req = await (
      await api.post('/api/requests', {
        data: {
          clientId: f.clientA1,
          typeId: f.typeA,
          title: `Pedido aceito (${size})`,
          description: 'Criar post sobre o novo produto',
          network: 'instagram',
          brandId: f.brandA,
          desiredDate: '2031-07-08',
        },
      })
    ).json();
    await api.post(`/api/requests/${req.id}/status`, { data: { to: 'in_triage' } });
    const as = (await (await api.get('/api/requests/assignees')).json()).assignees;
    await api.post(`/api/requests/${req.id}/assign`, { data: { assigneeUserId: as[0].id } });
    await api.post(`/api/requests/${req.id}/status`, { data: { to: 'accepted' } });
    await api.dispose();

    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const page = await ctx.newPage();
    await uiLogin(page, 'dona.a@example.test');
    await page.goto('/conteudos?view=calendario&mes=2031-03');
    await shot(page, '01-calendario-mensal', size);
    await page.goto('/conteudos?view=semana&dia=2031-03-12');
    await shot(page, '02-semana', size);
    await page.goto('/conteudos?view=agenda&mes=2031-03');
    await shot(page, '03-agenda', size);
    await page.goto('/conteudos?view=lista');
    await shot(page, '04-lista', size);
    await page.goto('/conteudos?view=kanban');
    await shot(page, '05-kanban', size);
    await page.goto(`/conteudos/${f.contentA1}`);
    await shot(page, '06-conteudo-detalhe', size);
    await page.goto(`/conteudos/${f.contentA1}?aba=historico`);
    await shot(page, '07-conteudo-historico', size);
    await page.goto('/conteudos/novo?data=2031-05-10');
    await shot(page, '08-novo-conteudo', size);
    await page.goto(`/solicitacoes/${req.id}`);
    await shot(page, '09-solicitacao-converter-em-conteudo', size);
    await page.goto('/configuracoes/pilares');
    await shot(page, '10-pilares-editoriais', size);
    await page.goto(`/clientes/${f.clientA1}?aba=campanhas`);
    await shot(page, '11-cliente-campanhas', size);
    await page.goto('/');
    await shot(page, '12-dashboard-com-conteudos', size);
    await ctx.close();

    const e = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const ep = await e.newPage();
    await uiLogin(ep, 'cliente.a1@example.test');
    await ep.goto('/conteudos?view=lista');
    await shot(ep, '13-cliente-externo-so-o-enviado', size);
    await e.close();
  });
}
