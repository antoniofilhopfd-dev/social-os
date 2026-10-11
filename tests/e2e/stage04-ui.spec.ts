import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { BASE, fx, uiLogin } from './helpers';

test.describe.configure({ mode: 'serial' });

const OWNER = 'dona.a@example.test';
const EXTERNAL = 'cliente.a1@example.test';

async function fresh(browser: Browser, viewport = { width: 1280, height: 720 }) {
  const context = await browser.newContext({ baseURL: BASE, viewport });
  return { context, page: await context.newPage() };
}

async function openClient(page: Page, name: string, tab?: string) {
  await page.goto('/clientes');
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  if (tab) await page.getByRole('link', { name: tab }).click();
}

test('cliente: contatos, datas, marcas e perfis sociais pela interface', async ({ page }) => {
  await uiLogin(page, OWNER);
  await openClient(page, 'Cliente A2', 'Contatos');
  await expect(page.getByText('Nenhum contato cadastrado')).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Carla Contato');
  await page.getByLabel('E-mail', { exact: true }).fill('carla@cliente.test');
  await page.getByLabel('Contato principal').check();
  await page.getByRole('button', { name: 'Adicionar contato' }).click();
  await expect(page.getByRole('cell', { name: /Carla Contato/ })).toBeVisible();
  await expect(
    page.getByRole('cell', { name: /Carla Contato/ }).getByText('Principal', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('row', { name: /Carla Contato/ })
    .getByRole('button', { name: 'Remover' })
    .click();
  await page
    .getByRole('dialog', { name: 'Remover Carla Contato?' })
    .getByRole('button', { name: 'Remover', exact: true })
    .click();
  await expect(page.getByText('Nenhum contato cadastrado')).toBeVisible();

  await page.getByRole('link', { name: 'Datas importantes' }).click();
  await page.getByLabel('Descrição').fill('Lançamento da coleção');
  await page.getByLabel('Data', { exact: true }).fill('2031-09-15');
  await page.getByRole('button', { name: 'Adicionar data' }).click();
  await expect(page.getByRole('cell', { name: /15\/09\/2031/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: /Lançamento da coleção/ })).toBeVisible();

  await page.getByRole('link', { name: 'Marcas e perfis' }).click();
  await expect(page.getByText('cadastrados manualmente')).toBeVisible();
  await page.getByLabel('Nova marca').fill('Marca UI');
  await page.getByRole('button', { name: 'Adicionar marca' }).click();
  await expect(page.getByRole('heading', { name: 'Marca UI' })).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar perfil social' }).click();
  await page.getByLabel('Rede social').selectOption('tiktok');
  await page.getByLabel('Nome do perfil').fill('Perfil UI');
  await page.getByLabel('Identificador (@)').fill('@Marca_UI');
  await page.getByRole('button', { name: 'Salvar perfil' }).click();
  await expect(page.getByRole('cell', { name: /@marca_ui/ })).toBeVisible();
  await expect(page.getByText('Publicação manual · não conectado')).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar perfil social' }).click();
  await page.getByLabel('Rede social').selectOption('tiktok');
  await page.getByLabel('Nome do perfil').fill('Duplicado');
  await page.getByLabel('Identificador (@)').fill('marca_ui');
  await page.getByRole('button', { name: 'Salvar perfil' }).click();
  await expect(page.locator('.alert-danger')).toContainText('já está cadastrado');
});

test('solicitação: campos obrigatórios por tipo, criação, duplicidade e triagem', async ({
  page,
}) => {
  await uiLogin(page, OWNER);
  await page.goto('/solicitacoes/nova');
  await page.getByLabel('Cliente *').selectOption({ label: 'Cliente A1' });
  await page.getByLabel('Tipo *').selectOption({ label: 'Criação de conteúdo (post)' });
  await page.getByLabel('Título *').fill('Campanha Dia dos Namorados');
  await page.getByLabel('Descrição *').fill('Criar posts para a campanha de Dia dos Namorados.');
  await page.getByRole('button', { name: 'Enviar solicitação' }).click();
  await expect(page.getByText('Rede social é obrigatório para este tipo.')).toBeVisible();
  await expect(page.getByText('Formato é obrigatório para este tipo.')).toBeVisible();
  await expect(page).toHaveURL(/\/solicitacoes\/nova/);

  await page.getByLabel('Rede social *').selectOption('instagram');
  await page.getByLabel('Formato *').fill('Carrossel');
  await page.getByLabel('Objetivo *').fill('Gerar vendas na semana');
  await page.getByLabel('Data desejada *').fill('2031-06-05');
  await page.getByRole('button', { name: 'Enviar solicitação' }).click();
  await expect(
    page.getByRole('heading', { name: /Campanha Dia dos Namorados/, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Nova', { exact: true }).first()).toBeVisible();

  // duplicidade
  await page.goto('/solicitacoes/nova');
  await page.getByLabel('Cliente *').selectOption({ label: 'Cliente A1' });
  await page.getByLabel('Tipo *').selectOption({ label: 'Ajuste em conteúdo existente' });
  await page.getByLabel('Título *').fill('campanha dia dos namorados!');
  await page.getByLabel('Descrição *').fill('Outro pedido muito parecido com o anterior.');
  await page.getByRole('button', { name: 'Enviar solicitação' }).click();
  await expect(page.getByText('Possível duplicidade.')).toBeVisible();
  await expect(page.getByText(/Campanha Dia dos Namorados/)).toBeVisible();
  await page.getByRole('button', { name: 'Criar mesmo assim' }).click();
  await expect(page.getByText(/foi criada mesmo havendo uma parecida/)).toBeVisible();

  // triagem: não aceita sem responsável
  await page.getByLabel('Mudar situação para').selectOption({ label: 'Em triagem' });
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByText('Em triagem', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Mudar situação para').selectOption({ label: 'Aceita' });
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.locator('.alert-danger')).toContainText('incompleta');
  await expect(page.locator('.alert-danger')).toContainText('responsável');
  await page.getByLabel('Responsável', { exact: true }).selectOption({ label: 'dona a' });
  await page.getByLabel('Prazo estimado de entrega').fill('2031-06-01');
  await page.getByRole('button', { name: 'Salvar atribuição' }).click();
  await expect(page.getByText('Responsável/prazo atualizado')).toBeVisible();
  await page.getByLabel('Mudar situação para').selectOption({ label: 'Aceita' });
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByText('Aceita', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Situação alterada').first()).toBeVisible();
});

test('pedido de informações: cliente externo cria, equipe pergunta, cliente responde e volta à triagem; notas internas ficam ocultas', async ({
  page,
  browser,
}) => {
  const ext = await fresh(browser);
  await uiLogin(ext.page, EXTERNAL);
  await ext.page.goto('/solicitacoes/nova');
  await expect(ext.page.getByLabel('Cliente *').locator('option')).toHaveText(['Cliente A1']); // só o próprio cliente
  await ext.page.getByLabel('Tipo *').selectOption({ label: 'Outro' });
  await ext.page.getByLabel('Título *').fill('Pedido do cliente sobre horários');
  await ext.page
    .getByLabel('Descrição *')
    .fill('Precisamos alterar o horário de funcionamento nas redes.');
  await ext.page.getByRole('button', { name: 'Enviar solicitação' }).click();
  await expect(
    ext.page.getByRole('heading', { name: /Pedido do cliente sobre horários/, level: 1 }),
  ).toBeVisible();
  const url = ext.page.url();
  // externo não vê a triagem
  await expect(ext.page.getByRole('heading', { name: 'Triagem' })).toHaveCount(0);

  await uiLogin(page, OWNER);
  await page.goto(url);
  await page.getByLabel('Novo comentário').fill('Cliente costuma atrasar respostas');
  await page.getByLabel(/Nota interna/).check();
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('Nota interna', { exact: true })).toBeVisible();
  await page.getByLabel('Mudar situação para').selectOption({ label: 'Em triagem' });
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await page.getByLabel('Mudar situação para').selectOption({ label: 'Aguardando informações' });
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.locator('.alert-danger')).toContainText('mensagem');
  await page.getByLabel(/Quais informações faltam/).fill('Qual o novo horário de funcionamento?');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByText('Informações solicitadas')).toBeVisible();

  await ext.page.reload();
  await expect(ext.page.getByText('Qual o novo horário de funcionamento?')).toBeVisible();
  await expect(ext.page.getByText('atrasar respostas')).toHaveCount(0); // nota interna invisível
  await ext.page
    .getByLabel('Responder ao pedido de informações')
    .fill('Das 9h às 18h, de segunda a sábado.');
  await ext.page.getByRole('button', { name: 'Enviar' }).click();
  await expect(ext.page.getByText('Informações enviadas')).toBeVisible();
  await expect(ext.page.getByText('Em triagem', { exact: true }).first()).toBeVisible();

  const bell = ext.page.locator('header').getByRole('link', { name: /^Notificações/ });
  await expect(bell).toHaveAttribute('aria-label', /não lidas/);
  await ext.context.close();
});

test('lista de solicitações: filtros, busca por número e visão do cliente externo', async ({
  page,
  browser,
}) => {
  await uiLogin(page, OWNER);
  await page.goto('/solicitacoes');
  await expect(page.getByRole('heading', { name: 'Solicitações', level: 1 })).toBeVisible();
  await page.getByLabel('Situação').selectOption('accepted');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await page.waitForURL(/status=accepted/);
  await expect(page.getByRole('link', { name: /namorados!/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pedido do cliente sobre horários' })).toHaveCount(0);
  await page.getByLabel('Situação').selectOption('');
  await page.getByLabel('Buscar', { exact: true }).fill('horários');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await page.waitForURL(/q=hor/);
  await expect(page.getByRole('link', { name: 'Pedido do cliente sobre horários' })).toBeVisible();
  await page.getByLabel('Buscar', { exact: true }).fill('zzzz-inexistente');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await page.waitForURL(/zzzz/);
  await expect(page.getByText('Nenhuma solicitação encontrada')).toBeVisible();
  await page.goto('/solicitacoes?status=invalido&overdue=1');
  await expect(page.getByRole('heading', { name: 'Solicitações', level: 1 })).toBeVisible();

  const ext = await fresh(browser);
  await uiLogin(ext.page, EXTERNAL);
  await ext.page.goto('/solicitacoes');
  await expect(
    ext.page.getByRole('link', { name: 'Pedido do cliente sobre horários' }),
  ).toBeVisible();
  await expect(ext.page.getByRole('link', { name: 'Fixture solicitação do A2' })).toHaveCount(0);
  await expect(ext.page.getByLabel('Responsável')).toHaveCount(0);
  await ext.page.goto(`/solicitacoes/${fx().requestA2}`);
  await expect(ext.page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await ext.context.close();
});

test('tipos de solicitação: configurar campos obrigatórios afeta o formulário', async ({
  page,
}) => {
  await uiLogin(page, OWNER);
  await page.goto('/configuracoes/solicitacoes');
  const form = page.getByRole('form', { name: 'Tipo Outro' });
  await form.getByLabel('Público').check();
  await form.getByRole('button', { name: 'Salvar tipo' }).click();
  await expect(page.getByText('Tipo salvo.')).toBeVisible();
  await page.goto('/solicitacoes/nova');
  await page.getByLabel('Tipo *').selectOption({ label: 'Outro' });
  await expect(page.getByLabel('Público *')).toBeVisible();
  await page.goto('/configuracoes/solicitacoes');
  const again = page.getByRole('form', { name: 'Tipo Outro' });
  await again.getByLabel('Público').uncheck();
  await again.getByRole('button', { name: 'Salvar tipo' }).click();
  await expect(page.getByText('Tipo salvo.')).toBeVisible();
  const novo = page.getByRole('form', { name: 'Novo tipo' });
  await novo.getByLabel('Nome').fill('Tipo criado na interface');
  await novo.getByLabel('Referências').check();
  await novo.getByRole('button', { name: 'Criar tipo' }).click();
  await expect(page.getByRole('form', { name: 'Tipo Tipo criado na interface' })).toBeVisible();
});

test('redator não gerencia tipos nem edita cliente; consulta A1 não cria solicitação', async ({
  page,
  browser,
}) => {
  await uiLogin(page, 'redator.a@example.test');
  await page.goto('/configuracoes/solicitacoes');
  await expect(page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible();
  await openClient(page, 'Cliente A1');
  await expect(page.getByRole('button', { name: 'Salvar alterações' })).toHaveCount(0);
  await expect(page.getByLabel('Observações internas')).toHaveCount(0);

  const scoped = await fresh(browser);
  await uiLogin(scoped.page, 'consulta.a1@example.test');
  await scoped.page.goto('/solicitacoes/nova');
  await expect(scoped.page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible();
  await scoped.context.close();
});

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'celular', width: 390, height: 844 },
];
for (const vp of viewports) {
  test(`acessibilidade e responsividade das telas novas em ${vp.name} (${vp.width}px)`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const f = fx();
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await uiLogin(page, OWNER);
    const paths = [
      '/solicitacoes',
      '/solicitacoes/nova',
      `/solicitacoes/${f.requestA1}`,
      '/clientes',
      `/clientes/${f.clientA1}?aba=geral`,
      `/clientes/${f.clientA1}?aba=contatos`,
      `/clientes/${f.clientA1}?aba=datas`,
      `/clientes/${f.clientA1}?aba=marcas`,
      `/clientes/${f.clientA1}?aba=historico`,
      '/configuracoes/solicitacoes',
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
