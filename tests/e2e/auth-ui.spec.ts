import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { BASE, PASSWORD, apiLogin, fx, uiLogin } from './helpers';

test.describe.configure({ mode: 'serial' });

const OWNER = 'dona.a@example.test';
const NEW_PASSWORD = 'outra-senha-bem-longa-987';

async function newPage(browser: Browser) {
  const context = await browser.newContext({ baseURL: BASE });
  return { context, page: await context.newPage() };
}

test('login: erro genérico para credenciais erradas; sucesso leva ao início', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(OWNER);
  await page.getByLabel('Senha').fill('senha-completamente-errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('.alert-danger')).toHaveText('E-mail ou senha incorretos.');
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /Olá, dona/ })).toBeVisible();
});

test('rota interna sem sessão vai ao login e volta ao destino após entrar', async ({ page }) => {
  await page.goto('/auditoria');
  await expect(page).toHaveURL(/\/login\?next=%2Fauditoria/);
  await page.getByLabel('E-mail').fill(OWNER);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Auditoria' })).toBeVisible();
});

test('convite pela interface: gera link, pessoa cria conta, entra e tem acesso limitado', async ({
  page,
  browser,
}) => {
  await uiLogin(page, OWNER);
  await page.goto('/equipe');
  await page.getByLabel('Nome', { exact: true }).fill('Maria Convidada');
  await page.getByLabel('E-mail', { exact: true }).fill('maria.convidada@example.test');
  await page.getByLabel('Função', { exact: true }).selectOption({ label: 'Redator' });
  await page.getByRole('button', { name: 'Gerar convite' }).click();
  const link = (await page.getByTestId('generated-link').textContent())!.trim();
  expect(link).toMatch(/^http:\/\/localhost:3100\/convite\/.{40,}/);
  await expect(page.getByText('Convites pendentes')).toBeVisible();
  await expect(page.getByRole('cell', { name: /Maria Convidada/ })).toBeVisible();

  const guest = await newPage(browser);
  await guest.page.goto(link);
  await expect(guest.page.getByRole('heading', { name: 'Você foi convidado(a)' })).toBeVisible();
  await guest.page.getByLabel('Crie uma senha').fill('curta');
  await guest.page.getByLabel('Repita a senha').fill('curta');
  await guest.page.getByRole('button', { name: 'Criar conta e entrar' }).click();
  await expect(guest.page.locator('.alert-danger')).toContainText('pelo menos 12 caracteres');
  await guest.page.getByLabel('Crie uma senha').fill(PASSWORD);
  await guest.page.getByLabel('Repita a senha').fill(PASSWORD);
  await guest.page.getByRole('button', { name: 'Criar conta e entrar' }).click();
  await expect(guest.page.getByRole('heading', { name: 'Olá, Maria' })).toBeVisible();

  // Redator não vê Equipe/Auditoria no menu e recebe "Acesso negado" por URL direta.
  await expect(guest.page.getByRole('link', { name: 'Equipe' })).toHaveCount(0);
  await guest.page.goto('/equipe');
  await expect(guest.page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible();

  // O mesmo link não funciona uma segunda vez.
  const again = await newPage(browser);
  await again.page.goto(link);
  await expect(again.page.getByRole('heading', { name: 'Convite indisponível' })).toBeVisible();
  await Promise.all([guest.context.close(), again.context.close()]);

  await page.reload();
  await expect(
    page.getByRole('cell', { name: /maria.convidada@example.test/ }).first(),
  ).toBeVisible();
});

test('link de nova senha pela interface: redefine, derruba sessões e permite novo login', async ({
  page,
  browser,
}) => {
  const maria = await apiLogin('maria.convidada@example.test');
  expect((await maria.get('/api/clients')).status()).toBe(200);

  await uiLogin(page, OWNER);
  await page.goto('/equipe');
  const row = page.getByRole('row', { name: /maria.convidada@example.test/ });
  await row.getByRole('button', { name: 'Link de nova senha' }).click();
  const link = (await page.getByTestId('generated-link').textContent())!.trim();
  expect(link).toContain('/redefinir-senha/');

  const guest = await newPage(browser);
  await guest.page.goto(link);
  await guest.page.getByLabel('Nova senha').fill(NEW_PASSWORD);
  await guest.page.getByLabel('Repita a senha').fill(NEW_PASSWORD);
  await guest.page.getByRole('button', { name: 'Salvar senha' }).click();
  await expect(guest.page.getByText('Senha definida')).toBeVisible();
  await guest.page.goto(link);
  await expect(guest.page.getByRole('heading', { name: 'Link indisponível' })).toBeVisible();
  await guest.context.close();

  expect((await maria.get('/api/clients')).status()).toBe(401); // sessão antiga derrubada
  const fresh = await apiLogin('maria.convidada@example.test', NEW_PASSWORD);
  expect((await fresh.get('/api/clients')).status()).toBe(200);
  await Promise.all([maria.dispose(), fresh.dispose()]);
});

test('clientes pela interface: criar, configurar, ver histórico e excluir com confirmação', async ({
  page,
}) => {
  await uiLogin(page, OWNER);
  await page.goto('/clientes');
  await page.getByLabel('Novo cliente').fill('Cliente UI');
  await page.getByRole('button', { name: 'Adicionar e configurar' }).click();
  await expect(page.getByRole('heading', { name: 'Cliente UI', level: 1 })).toBeVisible();

  await page.getByLabel('Tom de voz', { exact: true }).fill('Descontraído e direto');
  await page.getByLabel('SLA de primeira resposta (horas)').fill('12');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('Alterações salvas.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Tom de voz', { exact: true })).toHaveValue('Descontraído e direto');
  await expect(page.getByLabel('SLA de primeira resposta (horas)')).toHaveValue('12');

  await page.getByRole('link', { name: 'Histórico' }).click();
  await expect(page.getByText('Dados alterados')).toBeVisible();
  await expect(page.getByText(/Tom de voz.*Descontraído e direto/)).toBeVisible();

  await page.goto('/clientes');
  await page.getByLabel('Novo cliente').fill('Cliente UI');
  await page.getByRole('button', { name: 'Adicionar e configurar' }).click();
  await expect(page.locator('.alert-danger')).toContainText('Já existe um cliente com este nome');

  await page.getByRole('link', { name: 'Cliente UI' }).click();
  await page.getByRole('button', { name: 'Excluir cliente' }).click();
  const dialog = page.getByRole('dialog', { name: 'Excluir Cliente UI?' });
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('heading', { name: 'Cliente UI', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Excluir cliente' }).click();
  await dialog.getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(page).toHaveURL(/\/clientes$/);
  await expect(page.getByRole('link', { name: 'Cliente UI' })).toHaveCount(0);
});

test('funções pela interface: matriz de permissões, criação e persistência; função do sistema é somente leitura', async ({
  page,
}) => {
  await uiLogin(page, OWNER);
  await page.goto('/funcoes');
  await page.getByRole('button', { name: 'Redator', exact: true }).click();
  await expect(page.getByText('Função do sistema: não pode ser editada')).toBeVisible();
  await expect(page.getByLabel('Visualizar em Conteúdos')).toBeChecked();
  await expect(page.getByLabel('Visualizar em Conteúdos')).toBeDisabled();

  await page.getByRole('button', { name: '+ Nova função' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Revisor UI');
  await page.getByLabel('Visualizar em Conteúdos').check();
  await page.getByLabel('Aprovar em Conteúdos').check();
  await page.getByRole('button', { name: 'Criar função' }).click();
  await expect(page.getByText('Função salva.')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Revisor UI', exact: true }).click();
  await expect(page.getByLabel('Aprovar em Conteúdos')).toBeChecked();
  await expect(page.getByLabel('Excluir em Conteúdos')).not.toBeChecked();
  await page.getByRole('button', { name: 'Excluir função' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Revisor UI', exact: true })).toHaveCount(0);
});

test('minhas sessões: lista a atual e encerra as outras', async ({ page, browser }) => {
  const other = await newPage(browser);
  await uiLogin(other.page, OWNER);
  await uiLogin(page, OWNER);
  await page.goto('/minhas-sessoes');
  await expect(page.getByText('Esta sessão')).toBeVisible();
  await page.getByRole('button', { name: 'Encerrar todas as outras sessões' }).click();
  await expect(page.getByText(/sessão\(ões\) encerrada\(s\)/)).toBeVisible();
  await other.page.goto('/clientes');
  await expect(other.page).toHaveURL(/\/login/);
  await other.context.close();
});

test('auditoria: mostra eventos da organização, com filtro, e nunca segredos', async ({ page }) => {
  await uiLogin(page, OWNER);
  await page.goto('/auditoria');
  await expect(page.getByRole('cell', { name: 'Login', exact: true }).first()).toBeVisible();
  await page.getByLabel('Tipo de evento').selectOption('invitation.created');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page.getByRole('cell', { name: 'Convite criado' }).first()).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/argon2|convite\/[A-Za-z0-9_-]{30,}/);
});

test('redator: itens de administração ausentes do menu e URL direta mostra acesso negado', async ({
  page,
}) => {
  await uiLogin(page, 'redator.a@example.test');
  const nav = page.getByRole('navigation', { name: 'Principal' });
  await expect(nav.getByRole('link', { name: 'Clientes' })).toBeVisible();
  for (const l of ['Equipe', 'Funções', 'Auditoria'])
    await expect(nav.getByRole('link', { name: l })).toHaveCount(0);
  for (const p of ['/equipe', '/funcoes', '/auditoria']) {
    await page.goto(p);
    await expect(page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible();
  }
});

test('cliente com escopo no A1 só vê o próprio cliente na interface', async ({ page }) => {
  await uiLogin(page, 'consulta.a1@example.test');
  await page.goto('/clientes');
  await expect(page.getByRole('cell', { name: 'Cliente A1' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Cliente A2' })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'Cliente B1' })).toHaveCount(0);
  void fx;
});

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'celular', width: 390, height: 844 },
];
const pages = [
  '/login',
  '/',
  '/equipe',
  '/funcoes',
  '/clientes',
  '/auditoria',
  '/minhas-sessoes',
  '/notificacoes',
  '/notificacoes/preferencias',
  '/convite/token-invalido-xxxxxxxxxxxxxxxxxxxxxxxx',
];

for (const vp of viewports) {
  test(`acessibilidade (axe) e sem rolagem horizontal em ${vp.name} (${vp.width}px)`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await uiLogin(page, OWNER);
    for (const p of pages) {
      let target: Page = page;
      let ctx;
      if (p === '/login' || p.startsWith('/convite')) {
        ctx = await browser.newContext({
          baseURL: BASE,
          viewport: { width: vp.width, height: vp.height },
        });
        target = await ctx.newPage();
      }
      await target.goto(p);
      await target.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page: target })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.help} [${v.nodes[0]?.html.slice(0, 80)}]`),
        `${p} @ ${vp.name}`,
      ).toEqual([]);
      const overflow = await target.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `rolagem horizontal em ${p} @ ${vp.name}`).toBeLessThanOrEqual(0);
      await ctx?.close();
    }
  });
}
