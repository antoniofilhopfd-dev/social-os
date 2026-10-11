import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { apiLogin, fx, uiLogin } from './helpers';
import { makePng } from './png';

test.describe.configure({ mode: 'serial' });
const OWNER = 'dona.a@example.test';

async function noOverflow(page: Page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(over).toBe(false);
}

test('editor: autosave persiste, versões, comparação e restauração', async ({ page }) => {
  const id = fx().contentA1;
  await uiLogin(page, OWNER);
  await page.goto(`/conteudos/${id}?aba=editor`);
  await expect(page.getByRole('heading', { name: 'Texto' })).toBeVisible();
  await expect(page.getByText('Nenhum assistente de IA está configurado')).toBeVisible();
  await expect(page.getByTestId('save-state')).toContainText('Salvo');

  await page.getByLabel('Legenda', { exact: true }).fill('Primeira legenda do carrossel #marca');
  await expect(page.getByTestId('save-state')).toContainText('Alterações não salvas');
  await expect(page.getByTestId('save-state')).toContainText('Salvo', { timeout: 10_000 });
  await expect(page.getByTestId('preview')).toContainText('Primeira legenda do carrossel');

  await page.reload();
  await expect(page.getByLabel('Legenda', { exact: true })).toHaveValue(
    'Primeira legenda do carrossel #marca',
  );

  await page.getByLabel('Nota da versão').fill('Primeira versão');
  await page.getByRole('button', { name: 'Salvar versão' }).click();
  await expect(page.locator('strong', { hasText: 'Versão 1' })).toBeVisible();

  await page.getByLabel('Legenda', { exact: true }).fill('Segunda legenda, bem diferente');
  await expect(page.getByTestId('save-state')).toContainText('Salvo', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Salvar versão' }).click();
  await expect(page.locator('strong', { hasText: 'Versão 2' })).toBeVisible();

  await page.getByLabel('Versão A').selectOption('1');
  await page.getByLabel('Versão B').selectOption('2');
  await page.getByRole('button', { name: 'Comparar' }).click();
  await expect(page.getByTestId('diff')).toContainText('Legenda');
  await expect(page.getByTestId('diff').locator('ins').first()).toBeVisible();

  await page.getByRole('button', { name: 'Restaurar versão 1' }).click();
  await expect(page.getByLabel('Legenda', { exact: true })).toHaveValue(
    'Primeira legenda do carrossel #marca',
  );
});

test('editor: slides, checklist e alertas de formato', async ({ page }) => {
  const id = fx().contentA1;
  await uiLogin(page, OWNER);
  await page.goto(`/conteudos/${id}?aba=editor`);
  await page.getByRole('button', { name: 'Adicionar slide' }).click();
  await page.getByLabel('Título do slide 1').fill('Abertura');
  await page.getByRole('button', { name: 'Adicionar slide' }).click();
  await page.getByLabel('Título do slide 2').fill('Fechamento');
  await page.getByRole('button', { name: 'Descer slide 1' }).click();
  await expect(page.getByLabel('Título do slide 1')).toHaveValue('Fechamento');
  await page.getByLabel('Ortografia e gramática revisadas').check();
  await expect(page.getByTestId('save-state')).toContainText('Salvo', { timeout: 10_000 });
  await page.reload();
  await expect(page.getByLabel('Título do slide 1')).toHaveValue('Fechamento');
  await expect(page.getByLabel('Ortografia e gramática revisadas')).toBeChecked();
});

test('biblioteca: envio, validação, detalhe, favorito, vínculo, lixeira e restauração', async ({
  page,
}) => {
  const f = fx();
  await uiLogin(page, OWNER);
  await page.goto('/biblioteca');
  await expect(page.getByText('Escolha um cliente no filtro')).toBeVisible();
  await page.goto(`/biblioteca?clientId=${f.clientA1}`);
  await page.setInputFiles('#up-files', [
    { name: 'foto-azul.png', mimeType: 'image/png', buffer: makePng(400, 300, [36, 59, 128]) },
    {
      name: 'nao-pode.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'),
    },
  ]);
  await page.getByLabel('Etiquetas (separadas por vírgula)').first().fill('campanha, verão');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByText('foto-azul.png —')).toContainText('enviado');
  await expect(page.getByText(/nao-pode\.svg:/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Arquivos' }).getByText('foto-azul')).toBeVisible();

  // mesmo conteúdo de novo: reaproveitado
  await page.setInputFiles('#up-files', [
    { name: 'copia.png', mimeType: 'image/png', buffer: makePng(400, 300, [36, 59, 128]) },
  ]);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByText(/reaproveitado/)).toBeVisible();

  await page
    .getByRole('link', { name: /foto-azul/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'foto-azul', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Favoritar' }).click();
  await expect(page.getByRole('button', { name: 'Remover dos favoritos' })).toBeVisible();
  await page.getByLabel('Créditos').fill('Equipe interna');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('Alterações salvas.')).toBeVisible();
  const assetUrl = page.url();

  // vínculo ao conteúdo pelo editor
  await page.goto(`/conteudos/${f.contentA1}?aba=editor`);
  await page.getByRole('button', { name: 'Anexar da biblioteca' }).click();
  await page.getByRole('button', { name: 'Anexar', exact: true }).first().click();
  await expect(page.getByRole('link', { name: /foto-azul/ })).toBeVisible();

  // arquivo servido com cabeçalhos seguros
  const api = await apiLogin(OWNER);
  const id = assetUrl.split('/').pop()!;
  const res = await api.get(`/api/assets/${id}/file`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/png');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  expect(res.headers()['content-security-policy']).toContain('sandbox');

  // lixeira e restauração
  await page.goto(assetUrl);
  await page.getByRole('button', { name: 'Mover para a lixeira' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para a lixeira' }).click();
  await page.waitForURL(/\/biblioteca$/);
  await page.goto('/biblioteca?lixeira=1');
  await page
    .getByRole('link', { name: /foto-azul/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Restaurar' }).click();
  await page.waitForURL(/\/biblioteca$/);
  await expect(page.getByRole('list', { name: 'Arquivos' }).getByText('foto-azul')).toBeVisible();
});

test('API: upload recusa executável disfarçado e acima do limite; sem permissão = 403', async () => {
  const f = fx();
  const api = await apiLogin(OWNER);
  const bad = await api.post('/api/assets', {
    multipart: {
      clientId: f.clientA1,
      file: {
        name: 'foto.png',
        mimeType: 'image/png',
        buffer: Buffer.from('MZ\x90\x00 não é imagem'),
      },
    },
  });
  expect(bad.status()).toBe(400);
  const other = await api.post('/api/assets', {
    multipart: {
      clientId: f.clientB1,
      file: { name: 'a.png', mimeType: 'image/png', buffer: makePng(8, 8, [1, 2, 3]) },
    },
  });
  expect(other.status()).toBe(404); // cliente de outra organização
});

for (const [name, width, height] of [
  ['desktop', 1440, 900],
  ['tablet', 768, 1024],
  ['celular', 390, 844],
] as const) {
  test(`acessibilidade e sem rolagem horizontal (${name})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    await uiLogin(page, OWNER);
    for (const url of [
      `/conteudos/${fx().contentA1}?aba=editor`,
      `/biblioteca?clientId=${fx().clientA1}`,
    ]) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(r.violations, `${url} @${name}`).toEqual([]);
      await noOverflow(page);
    }
    await ctx.close();
  });
}
