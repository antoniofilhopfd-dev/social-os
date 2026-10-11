import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser } from '@playwright/test';
import { BASE, apiLogin, fx, uiLogin } from './helpers';

test.describe.configure({ mode: 'serial' });

const OWNER = 'dona.a@example.test';

async function fresh(browser: Browser, viewport = { width: 1280, height: 720 }) {
  const context = await browser.newContext({ baseURL: BASE, viewport });
  return { context, page: await context.newPage() };
}

test('novo conteúdo: campos em cascata, criação e alerta de conflito de agenda', async ({
  page,
}) => {
  await uiLogin(page, OWNER);
  await page.goto('/conteudos/novo?data=2031-05-10');
  await expect(page.getByLabel('Data prevista')).toHaveValue('2031-05-10');
  await page.getByLabel('Cliente *').selectOption({ label: 'Cliente A1' });
  await expect(
    page.getByLabel('Marca').locator('option', { hasText: 'Marca Fixture A1' }),
  ).toHaveCount(1);
  await page.getByLabel('Marca').selectOption({ label: 'Marca Fixture A1' });
  await page.getByLabel('Perfil social').selectOption({ index: 1 });
  await page.getByLabel('Pilar de conteúdo').selectOption({ label: 'Pilar Fixture' });
  await page.getByLabel('Campanha').selectOption({ label: 'Campanha Fixture' });
  await page.getByLabel('Formato *').selectOption({ label: 'Reels' });
  await page.getByLabel('Título interno *').fill('Reels de maio UI');
  await page.getByLabel('Horário previsto').fill('15:00');
  await page.getByLabel('Objetivo editorial').fill('Aumentar alcance');
  await page.getByRole('button', { name: 'Criar conteúdo' }).click();
  await expect(page.getByRole('heading', { name: /Reels de maio UI/, level: 1 })).toBeVisible();
  await expect(page.getByText('Rascunho', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Conflito de agenda')).toHaveCount(0);

  // segundo conteúdo no mesmo perfil, dia e horário -> conflito
  await page.goto('/conteudos/novo?data=2031-05-10');
  await page.getByLabel('Cliente *').selectOption({ label: 'Cliente A1' });
  await expect(
    page.getByLabel('Marca').locator('option', { hasText: 'Marca Fixture A1' }),
  ).toHaveCount(1);
  await page.getByLabel('Perfil social').selectOption({ index: 1 });
  await page.getByLabel('Título interno *').fill('Segundo conteúdo conflitante');
  await page.getByLabel('Horário previsto').fill('15:00');
  await page.getByRole('button', { name: 'Criar conteúdo' }).click();
  await expect(
    page.getByRole('heading', { name: /Segundo conteúdo conflitante/, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Conflito de agenda')).toBeVisible();
  await expect(page.getByText(/Reels de maio UI/).first()).toBeVisible();

  // validação de formulário
  await page.goto('/conteudos/novo');
  await page.getByLabel('Título interno *').fill('ab');
  await page.getByLabel('Horário previsto').fill('10:00');
  await page.getByRole('button', { name: 'Criar conteúdo' }).click();
  await expect(page.getByText(/mín. 3 caracteres/)).toBeVisible();
});

test('calendário mensal, navegação, atalho de novo conteúdo e itens sem data', async ({ page }) => {
  const api = await apiLogin(OWNER);
  expect(
    (
      await api.post('/api/contents', {
        data: {
          clientId: fx().clientA1,
          title: 'Conteúdo sem data para o calendário',
          format: 'text',
        },
      })
    ).status(),
  ).toBe(200);
  await api.dispose();
  await uiLogin(page, OWNER);
  await page.goto('/conteudos?view=calendario&mes=2031-05');
  await expect(page.getByRole('table').locator('caption')).toHaveText(/maio de 2031/i);
  const cell = page.getByRole('cell', { name: /10\/05\/2031/ });
  await expect(cell.getByRole('link', { name: /Reels de maio UI/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Novo conteúdo em 10/05/2031' })).toHaveAttribute(
    'href',
    /data=2031-05-10/,
  );
  await page.getByRole('link', { name: 'Próximo →' }).click();
  await expect(page).toHaveURL(/mes=2031-06/);
  await expect(page.getByRole('table').locator('caption')).toHaveText(/junho de 2031/i);
  await expect(page.getByRole('link', { name: /Reels de maio UI/ })).toHaveCount(0);
  await page.getByRole('link', { name: '← Anterior' }).click();
  await expect(page).toHaveURL(/mes=2031-05/);

  await page.goto('/conteudos?view=calendario&mes=2031-03');
  await expect(
    page
      .getByRole('cell', { name: /12\/03\/2031/ })
      .getByRole('link', { name: /Fixture conteúdo do A1/ }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('cell', { name: /14\/03\/2031/ })
      .getByRole('link', { name: /Fixture conteúdo do A2/ }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: /Sem data definida/ })).toBeVisible(); // há conteúdos sem data (criados nos testes de API)
  await page.getByRole('link', { name: 'Hoje' }).click();
  await expect(page).toHaveURL(/mes=\d{4}-\d{2}/);
});

test('semana, agenda e lista mostram os mesmos registros', async ({ page }) => {
  await uiLogin(page, OWNER);
  await page.goto('/conteudos?view=semana&dia=2031-03-12');
  await expect(page.getByRole('link', { name: /Fixture conteúdo do A1/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Fixture conteúdo do A2/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Fixture conteúdo enviado ao cliente/ })).toHaveCount(
    0,
  ); // 20/03 fora da semana
  await page.getByRole('link', { name: 'Próximo →' }).click();
  await expect(page).toHaveURL(/dia=2031-03-19/);
  await expect(
    page.getByRole('link', { name: /Fixture conteúdo enviado ao cliente/ }),
  ).toBeVisible();

  await page.goto('/conteudos?view=agenda&mes=2031-03');
  await expect(page.getByRole('heading', { name: /12 de março/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Fixture conteúdo do A1/ })).toBeVisible();

  await page.goto('/conteudos?view=lista&q=Fixture');
  await expect(page.getByRole('link', { name: /Fixture conteúdo do A1/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Fixture conteúdo da B/ })).toHaveCount(0); // outra organização
  await expect(page.getByRole('link', { name: /Fixture conteúdo do A2/ })).toBeVisible();
});

test('filtros da lista: formato, situação, cliente, pilar e busca', async ({ page }) => {
  await uiLogin(page, OWNER);
  await page.goto('/conteudos?view=lista');
  await page.getByLabel('Formato', { exact: true }).selectOption('reels');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await page.waitForURL(/format=reels/);
  await expect(page.getByRole('link', { name: /Fixture conteúdo do A2/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Fixture conteúdo do A1/ })).toHaveCount(0);
  await page.getByLabel('Formato', { exact: true }).selectOption('');
  await page.getByLabel('Pilar').selectOption({ label: 'Pilar Fixture' });
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await page.waitForURL(/pillarId=/);
  await expect(page.getByRole('link', { name: /Fixture conteúdo do A1/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Fixture conteúdo do A2/ })).toHaveCount(0);
  await page.getByLabel('Pilar').selectOption('');
  await page.getByLabel('Buscar', { exact: true }).fill('zzzz-inexistente');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await page.waitForURL(/zzzz/);
  await expect(page.getByText('Nenhum conteúdo encontrado')).toBeVisible();
  await page.goto('/conteudos?view=lista&status=invalido&mes=2031-13'); // parâmetros inválidos não quebram a página
  await expect(page.getByRole('heading', { name: 'Conteúdos', level: 1 })).toBeVisible();
});

test('Kanban: mover por seleção, estados reservados e cancelamento com motivo', async ({
  page,
}) => {
  await uiLogin(page, OWNER);
  await page.goto('/conteudos?view=kanban&q=Reels de maio UI');
  const board = page.getByRole('region', { name: 'Quadro Kanban' });
  for (const col of [
    'Rascunho',
    'Em produção',
    'Em revisão interna',
    'Aguardando cliente',
    'Ajustes solicitados',
    'Aprovado',
    'Programado',
    'Publicado',
  ]) {
    await expect(board.getByRole('heading', { name: new RegExp(col) })).toBeVisible();
  }
  await expect(board.getByText(/Controlado pelo fluxo de aprovação/).first()).toBeVisible();
  const draft = board.getByRole('region', { name: /Rascunho/ });
  await expect(draft.getByRole('link', { name: /Reels de maio UI/ })).toBeVisible();
  await draft.getByLabel(/Mover “Reels de maio UI”/).selectOption({ label: 'Em produção' });
  await expect(
    board
      .getByRole('region', { name: /Em produção/ })
      .getByRole('link', { name: /Reels de maio UI/ }),
  ).toBeVisible();
  // só destinos permitidos
  const opts = await board
    .getByRole('region', { name: /Em produção/ })
    .getByLabel(/Mover “Reels de maio UI”/)
    .locator('option')
    .allTextContents();
  expect(opts).toEqual(['Mover para…', 'Em revisão interna', 'Rascunho', 'Cancelado']);
  // cancelar exige motivo
  await board
    .getByRole('region', { name: /Em produção/ })
    .getByLabel(/Mover “Reels de maio UI”/)
    .selectOption({ label: 'Cancelado' });
  await board.getByRole('button', { name: 'Cancelar conteúdo' }).click();
  await expect(board.getByText('O motivo é obrigatório.')).toBeVisible();
  await board.getByLabel('Motivo do cancelamento *').fill('Cliente desistiu da campanha');
  await board.getByRole('button', { name: 'Cancelar conteúdo' }).click();
  await expect(board.getByRole('link', { name: /Reels de maio UI/ })).toHaveCount(0); // sai do quadro padrão
  await page.goto('/conteudos?view=lista&q=Reels de maio UI&status=cancelled');
  await expect(page.getByRole('link', { name: /Reels de maio UI/ })).toBeVisible();
});

test('detalhe: editar, mudar situação, duplicar, histórico e excluir com confirmação', async ({
  page,
}) => {
  await uiLogin(page, OWNER);
  await page.goto('/conteudos?view=lista&q=Segundo conteúdo conflitante');
  await page.getByRole('link', { name: /Segundo conteúdo conflitante/ }).click();
  await page.getByLabel('Tema', { exact: true }).fill('Dia das Mães');
  await page.getByLabel('Prioridade').selectOption({ label: 'Alta' });
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('Alterações salvas.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Tema', { exact: true })).toHaveValue('Dia das Mães');

  await page.getByLabel('Mudar situação para').selectOption({ label: 'Em produção' });
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByText('Em produção', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByLabel('Mudar situação para').locator('option', { hasText: 'Aprovado' }),
  ).toHaveCount(0); // estado reservado não é oferecido

  await page.getByRole('link', { name: 'Histórico' }).click();
  await expect(page.getByText('Conteúdo criado')).toBeVisible();
  await expect(page.getByText('Situação alterada')).toBeVisible();
  await expect(page.getByText(/Tema.*Dia das Mães/)).toBeVisible();
  await page.getByRole('link', { name: 'Dados' }).click();

  await page.getByRole('button', { name: 'Duplicar conteúdo' }).click();
  await expect(
    page.getByRole('heading', { name: /Segundo conteúdo conflitante \(cópia\)/, level: 1 }),
  ).toBeVisible();
  await expect(page.getByLabel('Data prevista')).toHaveValue('');

  await page.getByRole('button', { name: 'Excluir conteúdo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Excluir este conteúdo?' });
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('heading', { name: /\(cópia\)/, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Excluir conteúdo' }).click();
  await dialog.getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(page).toHaveURL(/\/conteudos$/);
  await page.goto('/conteudos?view=lista&q=Segundo conteúdo conflitante (cópia)');
  await expect(page.getByText('Nenhum conteúdo encontrado')).toBeVisible();
});

test('converter solicitação aceita em conteúdo', async ({ page }) => {
  const f = fx();
  const api = await apiLogin(OWNER);
  const created = await (
    await api.post('/api/requests', {
      data: {
        clientId: f.clientA1,
        typeId: f.typeA,
        title: 'Pedido para virar conteúdo',
        description: 'Criar um post sobre o novo produto',
        brandId: f.brandA,
        network: 'instagram',
        format: 'Carrossel',
        desiredDate: '2031-07-08',
      },
    })
  ).json();
  expect(
    (await api.post(`/api/requests/${created.id}/status`, { data: { to: 'in_triage' } })).status(),
  ).toBe(200);
  const assignees = (await (await api.get('/api/requests/assignees')).json()).assignees;
  expect(
    (
      await api.post(`/api/requests/${created.id}/assign`, {
        data: { assigneeUserId: assignees[0].id },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await api.post(`/api/requests/${created.id}/status`, { data: { to: 'accepted' } })).status(),
  ).toBe(200);
  await api.dispose();

  await uiLogin(page, OWNER);
  await page.goto(`/solicitacoes/${created.id}`);
  await page.getByRole('button', { name: 'Converter em conteúdo' }).click();
  await expect(
    page.getByRole('heading', { name: /Pedido para virar conteúdo/, level: 1 }),
  ).toBeVisible();
  await expect(page.getByLabel('Data prevista')).toHaveValue('2031-07-08');
  await expect(page.getByLabel('Formato *')).toHaveValue('carousel');
  await expect(page.getByRole('textbox', { name: 'Briefing' })).toHaveValue(
    /Criar um post sobre o novo produto/,
  );
  await page.getByRole('link', { name: 'solicitação', exact: true }).click();
  await expect(page.getByText('Convertida em')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Converter em conteúdo' })).toHaveCount(0);
});

test('pilares e campanhas pela interface', async ({ page }) => {
  await uiLogin(page, OWNER);
  await page.goto('/configuracoes/pilares');
  const novo = page.getByRole('form', { name: 'Novo pilar' });
  await novo.getByLabel('Nome').fill('Pilar UI');
  await novo.getByLabel('Cor no calendário').selectOption({ label: 'Verde' });
  await novo.getByRole('button', { name: 'Criar pilar' }).click();
  await expect(page.getByText('Pilar salvo.')).toBeVisible();
  await expect(page.getByRole('form', { name: 'Pilar Pilar UI' })).toBeVisible();
  await novo.getByLabel('Nome').fill('Pilar UI');
  await novo.getByRole('button', { name: 'Criar pilar' }).click();
  await expect(page.locator('.alert-danger')).toContainText('Já existe um pilar com este nome');

  await page.goto(`/clientes/${fx().clientA2}?aba=campanhas`);
  await expect(page.getByText('Nenhuma campanha cadastrada')).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Campanha UI');
  await page.getByLabel('Início').fill('2031-09-10');
  await page.getByLabel('Fim').fill('2031-09-01');
  await page.getByRole('button', { name: 'Adicionar campanha' }).click();
  await expect(page.getByText('A data final deve ser igual ou posterior à inicial.')).toBeVisible();
  await page.getByLabel('Fim').fill('2031-09-30');
  await page.getByRole('button', { name: 'Adicionar campanha' }).click();
  await expect(page.getByRole('heading', { name: 'Campanha UI' })).toBeVisible();
});

test('cliente externo: só o conteúdo enviado, sem ações; redator sem acesso a pilares', async ({
  page,
  browser,
}) => {
  const ext = await fresh(browser);
  await uiLogin(ext.page, 'cliente.a1@example.test');
  await ext.page.goto('/conteudos?view=lista');
  await expect(
    ext.page.getByRole('link', { name: /Fixture conteúdo enviado ao cliente/ }),
  ).toBeVisible();
  await expect(ext.page.getByRole('link', { name: /Fixture conteúdo do A1/ })).toHaveCount(0);
  await expect(ext.page.getByRole('link', { name: 'Novo conteúdo' })).toHaveCount(0);
  await ext.page.getByRole('link', { name: /Fixture conteúdo enviado ao cliente/ }).click();
  await expect(ext.page.getByRole('button', { name: 'Salvar alterações' })).toHaveCount(0);
  await expect(ext.page.getByRole('button', { name: 'Excluir conteúdo' })).toHaveCount(0);
  await expect(ext.page.getByRole('link', { name: 'Histórico' })).toHaveCount(0);
  await ext.page.goto(`/conteudos/${fx().contentA1}`);
  await expect(ext.page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await ext.context.close();

  await uiLogin(page, 'redator.a@example.test');
  await page.goto('/configuracoes/pilares');
  await expect(page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible();
  await page.goto('/conteudos?view=kanban&q=Fixture');
  await expect(page.getByRole('link', { name: /Fixture conteúdo do A1/ })).toBeVisible();
});

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'celular', width: 390, height: 844 },
];
for (const vp of viewports) {
  test(`acessibilidade e responsividade das visões de conteúdo em ${vp.name} (${vp.width}px)`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const f = fx();
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await uiLogin(page, OWNER);
    const paths = [
      '/conteudos?view=calendario&mes=2031-03',
      '/conteudos?view=semana&dia=2031-03-12',
      '/conteudos?view=agenda&mes=2031-03',
      '/conteudos?view=lista',
      '/conteudos?view=kanban',
      `/conteudos/${f.contentA1}`,
      `/conteudos/${f.contentA1}?aba=historico`,
      '/conteudos/novo',
      '/configuracoes/pilares',
      `/clientes/${f.clientA1}?aba=campanhas`,
    ];
    for (const p of paths) {
      await page.goto(p);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.help} [${v.nodes[0]?.html.slice(0, 90)}]`),
        `${p} @ ${vp.name}`,
      ).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `rolagem horizontal em ${p} @ ${vp.name}`).toBeLessThanOrEqual(0);
    }
  });
}
