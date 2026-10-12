import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { BASE, apiLogin, fx, uiLogin } from './helpers';
import { publishedContent } from './helpers-flow';

// Só roda com SCREENSHOTS=1 (npm run screenshots:e2e). Gera prints reais do app em execução.
test.skip(!process.env.SCREENSHOTS, 'defina SCREENSHOTS=1 para gerar os prints');
test.describe.configure({ mode: 'serial' });

const OUT = 'screenshots/etapa-10';
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
const day = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

for (const [size, width, height] of sizes) {
  test(`prints ${size}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const f = fx();
    const posts: { title: string; m: Record<string, number> | null }[] = [
      {
        title: 'Reels de bastidores',
        m: {
          reach: 8400,
          impressions: 11200,
          likes: 610,
          comments: 74,
          shares: 58,
          saves: 120,
          videoViews: 6300,
        },
      },
      {
        title: 'Carrossel de dicas',
        m: {
          reach: 3200,
          impressions: 4100,
          likes: 240,
          comments: 18,
          shares: 22,
          saves: 96,
          clicks: 140,
        },
      },
      {
        title: 'Post institucional',
        m: { reach: 1500, impressions: 1700, likes: 62, comments: 3 },
      },
      { title: 'Stories de enquete', m: null },
    ];
    let first = '';
    const api = await apiLogin('dona.a@example.test');
    for (const p of posts) {
      const r = await publishedContent(`${p.title} (${size})`);
      await r.owner.dispose();
      if (!first) first = r.publicationId;
      if (p.m)
        await api.post(`/api/publications/${r.publicationId}/metrics`, {
          data: { capturedOn: day(0), ...p.m },
        });
    }
    const prof = await (await api.get(`/api/clients/${f.clientA1}/brands`)).json();
    const profileId = (prof.brands ?? prof.items ?? [])[0]?.profiles?.[0]?.id ?? f.profileA;
    await api.post('/api/profile-snapshots', {
      data: { socialProfileId: profileId, capturedOn: day(20), followers: 12400 },
    });
    await api.post('/api/profile-snapshots', {
      data: { socialProfileId: profileId, capturedOn: day(1), followers: 12915 },
    });
    await api.dispose();

    const range = `from=${day(30)}&to=${day(0)}`;
    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const page = await ctx.newPage();
    await uiLogin(page, 'dona.a@example.test');
    await page.goto(`/resultados?${range}`);
    await shot(page, '01-resultados-desempenho', size);
    await page.goto(`/resultados?${range}&aba=operacao`);
    await shot(page, '02-resultados-operacao', size);
    await page.goto(`/resultados?${range}&imprimir=1`);
    await shot(page, '03-versao-para-impressao', size);
    await page.goto(`/publicacoes/${first}`);
    await page.getByRole('button', { name: 'Salvar resultados' }).click();
    await page.getByText('Data inválida.').first().waitFor();
    await shot(page, '04-registro-de-resultados-validacao', size);
    await page.goto('/resultados/seguidores');
    await shot(page, '05-seguidores', size);
    await page.goto(`/resultados?from=2020-01-01&to=2020-01-31`);
    await shot(page, '06-resultados-sem-dados', size);
    await ctx.close();

    const cli = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const cp = await cli.newPage();
    await uiLogin(cp, 'cliente.a1@example.test');
    await cp.goto(`/resultados?${range}`);
    await shot(cp, '07-cliente-resultados', size);
    await cli.close();
  });
}
