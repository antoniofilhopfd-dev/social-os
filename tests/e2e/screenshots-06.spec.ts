import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { BASE, apiLogin, fx, uiLogin } from './helpers';
import { makePng } from './png';

// Só roda com SCREENSHOTS=1 (npm run screenshots:e2e). Gera prints reais do app em execução.
test.skip(!process.env.SCREENSHOTS, 'defina SCREENSHOTS=1 para gerar os prints');
test.describe.configure({ mode: 'serial' });

const OUT = 'screenshots/etapa-06';
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

const FILES: [string, number, number, [number, number, number]][] = [
  ['capa-lancamento.png', 1080, 1080, [36, 59, 128]],
  ['bastidores-equipe.png', 1200, 800, [117, 87, 217]],
  ['banner-promocao.png', 1600, 600, [23, 37, 84]],
  ['foto-produto-01.png', 900, 1200, [15, 107, 62]],
];

for (const [size, width, height] of sizes) {
  test(`prints ${size}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const f = fx();
    const api = await apiLogin('dona.a@example.test');
    const c = await (
      await api.post('/api/contents', {
        data: {
          clientId: f.clientA1,
          brandId: f.brandA,
          socialProfileId: f.profileA,
          title: `Reels de lançamento (${size})`,
          format: 'reels',
          scheduledDate: '2031-04-15',
        },
      })
    ).json();
    const body = (caption: string) => ({
      caption,
      hook: 'Você já viu o bastidor do lançamento?',
      script: 'Cena 1: equipe montando o estande.\nCena 2: revelação do produto.',
      cta: 'Comente “quero” para receber o catálogo.',
      hashtags: '#lancamento #novidade #bastidores',
      coverText: 'Lançamento',
      altText: 'Equipe montando o estande do evento',
      productionNotes: 'Vertical 9:16, 20 a 30 segundos, legendas em destaque.',
      publishNotes: 'Publicar às 10h, marcar o parceiro.',
      references: '',
      slides: [],
      checklist: [],
    });
    let rev = 0;
    const put = async (caption: string) => {
      const r = await (
        await api.put(`/api/contents/${c.id}/editor/draft`, {
          data: { baseRevision: rev, body: body(caption) },
        })
      ).json();
      rev = r.revision;
    };
    await put('Chegou o dia! Conheça nossa novidade.');
    await api.post(`/api/contents/${c.id}/editor/versions`, { data: { note: 'Primeira ideia' } });
    await put('Chegou o dia! Conheça a nova linha e veja como foi fazer cada detalhe.');
    await api.post(`/api/contents/${c.id}/editor/versions`, { data: { note: 'Texto ampliado' } });
    await put('Chegou o dia! Conheça a nova linha e veja os bastidores de cada detalhe. 🎬');

    for (const [name, w, h, rgb] of FILES) {
      await api.post('/api/assets', {
        multipart: {
          clientId: f.clientA1,
          tags: 'lançamento, evento',
          file: { name, mimeType: 'image/png', buffer: makePng(w / 4, h / 4, rgb) },
        },
      });
    }
    await api.dispose();

    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const page = await ctx.newPage();
    await uiLogin(page, 'dona.a@example.test');
    await page.goto(`/conteudos/${c.id}?aba=editor`);
    await shot(page, '01-editor-conteudo', size);
    await page.getByLabel('Versão A').selectOption('1');
    await page.getByLabel('Versão B').selectOption('2');
    await page.getByRole('button', { name: 'Comparar' }).click();
    await page.getByTestId('diff').waitFor();
    await shot(page, '02-editor-comparacao-de-versoes', size);
    await page.getByLabel('Legenda', { exact: true }).fill('x'.repeat(2300));
    await page.getByTestId('save-state').getByText('Salvo').waitFor({ timeout: 10_000 });
    await shot(page, '03-editor-alerta-limite-da-rede', size);
    await page
      .getByLabel('Legenda', { exact: true })
      .fill('Chegou o dia! Conheça a nova linha. 🎬');

    await page.goto(`/biblioteca?clientId=${f.clientA1}`);
    await shot(page, '04-biblioteca-grade', size);
    await page.setInputFiles('#up-files', [
      {
        name: 'arquivo-recusado.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'),
      },
    ]);
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await page.getByText(/arquivo-recusado\.svg:/).waitFor();
    await shot(page, '05-biblioteca-upload-recusado', size);
    await page.goto(`/biblioteca?clientId=${f.clientA2}`);
    await shot(page, '06-biblioteca-vazia', size);
    await page.goto(`/biblioteca?clientId=${f.clientA1}`);
    await page
      .getByRole('link', { name: /capa-lancamento/ })
      .first()
      .click();
    await shot(page, '07-arquivo-detalhe', size);
    await ctx.close();
  });
}
