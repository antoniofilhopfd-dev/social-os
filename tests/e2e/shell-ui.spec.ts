import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser } from '@playwright/test';
import { BASE, fx, seedNotification, uiLogin } from './helpers';

test.describe.configure({ mode: 'serial' });

const OWNER = 'dona.a@example.test';

async function fresh(browser: Browser, viewport = { width: 1280, height: 720 }) {
  const context = await browser.newContext({ baseURL: BASE, viewport });
  return { context, page: await context.newPage() };
}

test.describe('layout e navegação', () => {
  test('desktop: sidebar visível, sem botão de menu e item ativo marcado', async ({ page }) => {
    await uiLogin(page, OWNER);
    await expect(page.locator('aside.sidebar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeHidden();
    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav.getByRole('link', { name: 'Início' })).toHaveAttribute('aria-current', 'page');
    await page.goto('/notificacoes/preferencias');
    await expect(nav.getByRole('link', { name: 'Preferências de notificação' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: /^Notificações/ })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('celular: gaveta abre, navega, fecha ao navegar e com Esc', async ({ browser }) => {
    const { context, page } = await fresh(browser, { width: 390, height: 844 });
    await uiLogin(page, OWNER);
    await expect(page.locator('aside.sidebar')).toBeHidden();
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await drawer.getByRole('link', { name: 'Clientes' }).click();
    await expect(page).toHaveURL(/\/clientes$/);
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Clientes', level: 1 })).toBeVisible();
    await context.close();
  });

  test('redator vê no menu apenas o que pode', async ({ page }) => {
    await uiLogin(page, 'redator.a@example.test');
    const nav = page.getByRole('navigation', { name: 'Principal' });
    for (const l of ['Início', 'Clientes', 'Minhas sessões'])
      await expect(nav.getByRole('link', { name: l })).toBeVisible();
    for (const l of ['Equipe', 'Funções', 'Auditoria'])
      await expect(nav.getByRole('link', { name: l })).toHaveCount(0);
  });
});

test.describe('dashboard', () => {
  test('dono vê resumo, pendências reais, atividade e atalhos', async ({ page }) => {
    await uiLogin(page, OWNER);
    await expect(page.getByRole('heading', { name: 'Precisa de atenção' })).toBeVisible();
    await expect(page.getByText('Convite aguardando aceite: Pendente A')).toBeVisible();
    await expect(page.getByText('Convites pendentes', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Atividade recente/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Convidar pessoa' })).toBeVisible();
    await expect(
      page.getByText('aparecerão aqui quando esses módulos forem liberados'),
    ).toBeVisible();
  });

  test('filtros por período e cliente alteram o resultado', async ({ page }) => {
    await uiLogin(page, OWNER);
    await page.getByLabel('Período da atividade').selectOption('7');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(page).toHaveURL(/dias=7/);
    await expect(
      page.getByRole('heading', { name: 'Atividade recente (últimos 7 dias)' }),
    ).toBeVisible();
    await page.getByLabel('Cliente', { exact: true }).selectOption({ label: 'Cliente A1' });
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(page).toHaveURL(/cliente=/);
    // o convite pendente não é de nenhum cliente, então some com o filtro
    await expect(page.getByText('Convite aguardando aceite: Pendente A')).toHaveCount(0);
  });

  test('redator não vê pendências de equipe, atividade nem contadores administrativos', async ({
    page,
  }) => {
    await uiLogin(page, 'redator.a@example.test');
    await expect(page.getByRole('heading', { name: /Olá, redator/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Atividade recente/ })).toHaveCount(0);
    await expect(page.getByText('Convites pendentes')).toHaveCount(0);
    await expect(page.getByText('Convite aguardando aceite')).toHaveCount(0); // pendências de equipe não aparecem para o redator
  });

  test('parâmetros de filtro adulterados são ignorados com segurança', async ({ page }) => {
    await uiLogin(page, OWNER);
    const { clientB1 } = fx();
    await page.goto(`/?dias=abc&cliente=${clientB1}`);
    await expect(
      page.getByRole('heading', { name: 'Atividade recente (últimos 30 dias)' }),
    ).toBeVisible();
    await expect(page.getByLabel('Cliente', { exact: true })).toHaveValue('');
    await page.goto("/?dias=7&cliente='%20OR%201=1");
    await expect(page.getByRole('heading', { name: 'Precisa de atenção' })).toBeVisible();
  });
});

test.describe('busca global', () => {
  test('atalho "/" abre a busca; encontra clientes e leva à lista filtrada', async ({ page }) => {
    await uiLogin(page, OWNER);
    await page.waitForLoadState('networkidle'); // espera a hidratação (o atalho depende dela)
    await page.keyboard.press('/');
    const dialog = page.getByRole('dialog', { name: 'Busca' });
    await expect(dialog).toBeVisible();
    await page.getByLabel('Buscar clientes, conteúdos, solicitações e pessoas').fill('Cliente A');
    await expect(dialog.getByRole('link', { name: 'Cliente A1', exact: true })).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Cliente A2', exact: true })).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Cliente B1', exact: true })).toHaveCount(0);
    await dialog.getByRole('link', { name: 'Cliente A1', exact: true }).click();
    await expect(page).toHaveURL(/\/clientes\?q=Cliente%20A1/);
    await expect(page.getByText('Filtrando por “Cliente A1”')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Cliente A1' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Cliente A2' })).toHaveCount(0);
  });

  test('encontra pessoas; termo curto não busca; sem resultado informa; "/" em campo de texto não abre', async ({
    page,
  }) => {
    await uiLogin(page, OWNER);
    await page.getByRole('button', { name: /Buscar/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Busca' });
    const input = page.getByLabel('Buscar clientes, conteúdos, solicitações e pessoas');
    await input.fill('a');
    await expect(dialog.getByText('Buscando')).toHaveCount(0);
    await input.fill('redator.a');
    await dialog.getByRole('link', { name: /redator a/ }).click();
    await expect(page).toHaveURL(/\/equipe\?q=redator\.a%40example\.test/);
    await expect(page.getByRole('cell', { name: /redator.a@example.test/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: /dona.a@example.test/ })).toHaveCount(0);

    await page.getByRole('button', { name: /Buscar/ }).click();
    await input.fill('zzzzqq');
    await expect(dialog.getByText('Nada encontrado para “zzzzqq”.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.goto('/clientes');
    await page.getByLabel('Novo cliente').click();
    await page.keyboard.type('a/b');
    await expect(page.getByLabel('Novo cliente')).toHaveValue('a/b');
    await expect(dialog).toBeHidden();
  });

  test('usuário com escopo no A1 só encontra o A1 e não vê pessoas', async ({ page }) => {
    await uiLogin(page, 'consulta.a1@example.test');
    await page.waitForLoadState('networkidle'); // espera a hidratação (o atalho depende dela)
    await page.keyboard.press('/');
    const dialog = page.getByRole('dialog', { name: 'Busca' });
    await page.getByLabel('Buscar clientes, conteúdos, solicitações e pessoas').fill('Cliente A');
    await expect(dialog.getByRole('link', { name: 'Cliente A1', exact: true })).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Cliente A2', exact: true })).toHaveCount(0);
    await expect(dialog.getByText('Pessoas', { exact: true })).toHaveCount(0);
  });
});

test.describe('notificações', () => {
  test('sino com contador, marcar uma e todas como lidas, filtro de não lidas', async ({
    page,
  }) => {
    const { A } = fx();
    await seedNotification(OWNER, 'Aviso E2E 1', A);
    await seedNotification(OWNER, 'Aviso E2E 2', A);
    await uiLogin(page, OWNER);
    const bell = page.locator('header').getByRole('link', { name: /^Notificações/ });
    await expect(bell).toHaveAttribute('aria-label', /\d+ não lidas/);
    await page.goto('/notificacoes');
    await expect(page.getByText('Aviso E2E 1')).toBeVisible();
    const marks = page.getByRole('button', { name: 'Marcar como lida' });
    const before = await marks.count();
    expect(before).toBeGreaterThanOrEqual(2);
    await marks.first().click();
    await expect(marks).toHaveCount(before - 1);
    await page.getByRole('button', { name: 'Marcar todas como lidas' }).click();
    await expect(marks).toHaveCount(0);
    await expect(bell).toHaveAttribute('aria-label', 'Notificações');
    await page.getByRole('link', { name: /^Não lidas/ }).click();
    await expect(page.getByText('Nenhuma notificação não lida')).toBeVisible();
  });

  test('preferências persistem após recarregar', async ({ page }) => {
    await uiLogin(page, OWNER);
    await page.goto('/notificacoes/preferencias');
    const box = page.getByLabel(/Convite aceito/);
    await expect(box).toBeChecked();
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/notifications/preferences') && r.request().method() === 'PUT',
      ),
      box.uncheck(),
    ]);
    await expect(page.getByRole('status').filter({ hasText: 'Preferência salva.' })).toBeAttached();
    await page.reload();
    await expect(page.getByLabel(/Convite aceito/)).not.toBeChecked();
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/notifications/preferences') && r.request().method() === 'PUT',
      ),
      page.getByLabel(/Convite aceito/).check(),
    ]);
    await page.reload();
    await expect(page.getByLabel(/Convite aceito/)).toBeChecked();
  });
});

test.describe('troca de organização', () => {
  test('pessoa em duas organizações alterna e o contexto muda de verdade', async ({ page }) => {
    await uiLogin(page, 'multi.org@example.test');
    const nav = page.getByRole('navigation', { name: 'Principal' });
    const select = page.getByLabel('Organização ativa');
    await expect(select).toContainText('Agência A');
    await expect(select).toContainText('Agência B');
    await expect(nav.getByRole('link', { name: 'Equipe' })).toHaveCount(0); // redatora na A
    await page.goto('/clientes');
    await expect(page.getByRole('cell', { name: 'Cliente A1' })).toBeVisible();

    await select.selectOption({ label: 'Agência B' });
    await expect(nav.getByRole('link', { name: 'Equipe' })).toBeVisible(); // proprietária na B
    await page.goto('/clientes');
    await expect(page.getByRole('cell', { name: 'Cliente B1' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Cliente A1' })).toHaveCount(0);

    await page.reload();
    await expect(page.getByLabel('Organização ativa')).toHaveValue(fx().B);
  });

  test('quem pertence a uma só organização não vê seletor', async ({ page }) => {
    await uiLogin(page, OWNER);
    await expect(page.getByLabel('Organização ativa')).toHaveCount(0);
  });
});

test.describe('acessibilidade dos overlays', () => {
  test('busca aberta (desktop) e gaveta aberta (celular) sem violações axe', async ({
    page,
    browser,
  }) => {
    await uiLogin(page, OWNER);
    await page.waitForLoadState('networkidle'); // espera a hidratação (o atalho depende dela)
    await page.keyboard.press('/');
    await page.getByLabel('Buscar clientes, conteúdos, solicitações e pessoas').fill('Cliente');
    await expect(
      page
        .getByRole('dialog', { name: 'Busca' })
        .getByRole('link', { name: 'Cliente A1', exact: true }),
    ).toBeVisible();
    const r1 = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(r1.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    const { context, page: m } = await fresh(browser, { width: 390, height: 844 });
    await uiLogin(m, OWNER);
    await m.getByRole('button', { name: 'Abrir menu' }).click();
    await expect(m.getByRole('dialog', { name: 'Menu' })).toBeVisible();
    const r2 = await new AxeBuilder({ page: m })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(r2.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await context.close();
  });
});
