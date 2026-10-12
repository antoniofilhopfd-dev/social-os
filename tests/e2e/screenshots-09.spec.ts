import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { publications } from '@/db/schema';
import { world } from '../helpers/db';
import { BASE, uiLogin } from './helpers';
import { approvedContent } from './helpers-flow';
import { todayLocal } from '@/core/time';

// Só roda com SCREENSHOTS=1 (npm run screenshots:e2e). Gera prints reais do app em execução.
test.skip(!process.env.SCREENSHOTS, 'defina SCREENSHOTS=1 para gerar os prints');
test.describe.configure({ mode: 'serial' });

const OUT = 'screenshots/etapa-09';
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

for (const [size, width, height] of sizes) {
  test(`prints ${size}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const today = todayLocal();
    const mk = async (title: string, date: string, time: string | null) => {
      const { contentId, owner } = await approvedContent(`${title} (${size})`);
      const r = await (
        await owner.post(`/api/contents/${contentId}/publication`, {
          data: { date: '2099-12-01', time },
        })
      ).json();
      await owner.dispose();
      const w = world();
      try {
        await w.db
          .update(publications)
          .set({ scheduledDate: date })
          .where(eq(publications.id, r.id));
      } finally {
        await w.close();
      }
      return { contentId, id: r.id as string };
    };
    const late = await mk('Post de ontem atrasado', '2020-01-02', '09:00');
    await mk('Reels de hoje', today, '23:30');
    const next = await mk('Carrossel da próxima semana', '2099-12-20', '10:00');
    const done = await mk('Stories publicado', '2099-12-02', '08:00');

    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const page = await ctx.newPage();
    await uiLogin(page, 'dona.a@example.test');
    await page.goto('/publicacoes');
    await shot(page, '01-fila-de-publicacoes', size);
    await page.goto(`/publicacoes/${next.id}`);
    await shot(page, '02-pacote-de-publicacao', size);
    await page.getByRole('button', { name: 'Marcar como publicada' }).click();
    await page.getByLabel('Link da publicação (opcional)').fill('ftp://link-invalido');
    await page.getByRole('button', { name: 'Confirmar publicação' }).click();
    await page.getByText(/link http\(s\) válido/).waitFor();
    await shot(page, '03-registro-validacao-link', size);
    await page.goto(`/publicacoes/${done.id}`);
    await page.getByRole('button', { name: 'Marcar como publicada' }).click();
    await page
      .getByLabel('Link da publicação (opcional)')
      .fill('https://www.instagram.com/p/Cx9aBcDeFgH/');
    await page.getByRole('button', { name: 'Confirmar publicação' }).click();
    await page.locator('.badge', { hasText: 'Publicada' }).waitFor();
    await shot(page, '04-publicada-com-link', size);
    await page.goto(`/publicacoes/${late.id}`);
    await page.getByRole('button', { name: 'Registrar falha' }).first().click();
    await page.getByLabel('Motivo da falha *').fill('Rede indisponível no horário previsto.');
    await page.getByRole('button', { name: 'Registrar falha' }).last().click();
    await page.getByText('Falha registrada:').waitFor();
    await shot(page, '05-falha-registrada', size);
    await page.goto('/publicacoes?view=historico');
    await shot(page, '06-historico', size);
    await page.goto(`/conteudos/${next.contentId}?aba=publicacao`);
    await shot(page, '07-aba-publicacao-do-conteudo', size);
    await page.goto('/');
    await shot(page, '08-painel-com-publicacoes', size);
    await ctx.close();
  });
}
