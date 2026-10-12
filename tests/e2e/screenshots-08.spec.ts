import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { BASE, apiLogin, fx, uiLogin } from './helpers';
import { makePng } from './png';

// Só roda com SCREENSHOTS=1 (npm run screenshots:e2e). Gera prints reais do app em execução.
test.skip(!process.env.SCREENSHOTS, 'defina SCREENSHOTS=1 para gerar os prints');
test.describe.configure({ mode: 'serial' });

const OUT = 'screenshots/etapa-08';
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

async function prepare(size: string, title: string, rgb: [number, number, number]) {
  const f = fx();
  const api = await apiLogin('dona.a@example.test');
  const c = await (
    await api.post('/api/contents', {
      data: { clientId: f.clientA1, title: `${title} (${size})`, format: 'static_post' },
    })
  ).json();
  const body = {
    caption: 'Chegou a nova coleção! Venha conhecer os detalhes de cada peça e garanta a sua.',
    hook: 'Novidade na vitrine',
    script: '',
    cta: 'Visite a loja ou chame no direct.',
    hashtags: '#novacolecao #moda',
    coverText: 'Nova coleção',
    altText: 'Vitrine com peças da nova coleção',
    productionNotes: 'NOTA INTERNA: usar a segunda foto do ensaio.',
    publishNotes: '',
    references: '',
    slides: [],
    checklist: [],
  };
  await api.put(`/api/contents/${c.id}/editor/draft`, { data: { baseRevision: 0, body } });
  const up = await (
    await api.post('/api/assets', {
      multipart: {
        clientId: f.clientA1,
        file: { name: `arte-${title}.png`, mimeType: 'image/png', buffer: makePng(360, 360, rgb) },
      },
    })
  ).json();
  await api.post(`/api/contents/${c.id}/assets`, { data: { assetId: up.id, role: 'cover' } });
  await api.post(`/api/contents/${c.id}/status`, { data: { to: 'in_production' } });
  await api.post(`/api/contents/${c.id}/status`, { data: { to: 'internal_review' } });
  const ap = await (
    await api.post(`/api/contents/${c.id}/approval`, {
      data: { message: 'Olá! Segue a arte e a legenda para a sua aprovação.' },
    })
  ).json();
  await api.dispose();
  return { contentId: c.id as string, approvalId: ap.id as string };
}

for (const [size, width, height] of sizes) {
  test(`prints ${size}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const a = await prepare(size, 'Coleção de verão', [36, 59, 128]);
    const b = await prepare(size, 'Promoção de outubro', [117, 87, 217]);

    const cli = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const cp = await cli.newPage();
    await uiLogin(cp, 'cliente.a1@example.test');
    await shot(cp, '01-cliente-painel-com-pendencias', size);
    await cp.goto('/aprovacoes');
    await shot(cp, '02-cliente-lista-de-aprovacoes', size);
    await cp.goto(`/aprovacoes/${a.approvalId}`);
    await shot(cp, '03-cliente-conteudo-para-aprovar', size);
    await cp.getByRole('button', { name: 'Solicitar ajustes' }).click();
    await cp.getByRole('alert').first().waitFor();
    await shot(cp, '04-cliente-validacao-ajustes-sem-comentario', size);
    await cp
      .getByLabel(/Comentário \(obrigatório/)
      .fill('Podemos trocar o texto da capa por “Coleção Verão”?');
    await cp.getByRole('button', { name: 'Solicitar ajustes' }).click();
    await cp.locator('.badge', { hasText: 'Ajustes solicitados' }).waitFor();
    await shot(cp, '05-cliente-ajustes-solicitados', size);
    await cp.goto(`/aprovacoes/${b.approvalId}`);
    await cp.getByRole('button', { name: 'Aprovar', exact: true }).click();
    await cp.locator('.badge', { hasText: 'Aprovado' }).waitFor();
    await shot(cp, '06-cliente-aprovado', size);
    await cli.close();

    const team = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const tp = await team.newPage();
    await uiLogin(tp, 'dona.a@example.test');
    await tp.goto(`/conteudos/${a.contentId}?aba=aprovacao`);
    await shot(tp, '07-equipe-aba-aprovacao', size);
    await tp.goto('/aprovacoes');
    await shot(tp, '08-equipe-lista-de-aprovacoes', size);
    await tp.goto('/');
    await shot(tp, '09-equipe-painel-ajustes-pedidos', size);
    await team.close();
  });
}
