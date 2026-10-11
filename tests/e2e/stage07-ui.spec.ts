import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fx, uiLogin } from './helpers';

test.describe.configure({ mode: 'serial' });
const OWNER = 'dona.a@example.test';

test('projeto e tarefa: criar, validar, checklist, comentário, bloquear, concluir', async ({
  page,
}) => {
  await uiLogin(page, OWNER);
  await page.goto('/projetos/novo');
  await page.getByLabel('Nome *').fill('ab');
  await page.getByRole('button', { name: 'Criar projeto' }).click();
  await expect(page.getByText(/mín. 3 caracteres/)).toBeVisible();
  await page.getByLabel('Nome *').fill('Campanha de inverno');
  await page.getByLabel('Cliente *').selectOption({ label: 'Cliente A1' });
  await page.getByLabel('Início').fill('2031-06-10');
  await page.getByLabel('Prazo').fill('2031-06-01');
  await page.getByRole('button', { name: 'Criar projeto' }).click();
  await expect(page.getByText('O prazo não pode ser anterior ao início.').first()).toBeVisible();
  await page.getByLabel('Prazo').fill('2031-07-01');
  await page.getByRole('button', { name: 'Criar projeto' }).click();
  await expect(page.getByRole('heading', { name: 'Campanha de inverno', level: 1 })).toBeVisible();
  await expect(page.getByText('Nenhuma tarefa neste projeto')).toBeVisible();

  await page.getByRole('link', { name: 'Nova tarefa' }).click();
  await page.getByLabel('Título *').fill('Gravar vídeo de abertura');
  await page.getByLabel('Prazo').fill('2031-06-20');
  await page.getByLabel('Prioridade').selectOption({ label: 'Alta' });
  await page.getByRole('button', { name: 'Criar tarefa' }).click();
  await expect(
    page.getByRole('heading', { name: 'Gravar vídeo de abertura', level: 1 }),
  ).toBeVisible();

  await page.getByLabel('Novo item do checklist').fill('Reservar estúdio');
  await page.getByRole('button', { name: 'Adicionar item' }).click();
  await expect(page.getByText('Reservar estúdio')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Reservar estúdio' }).check();
  await expect(page.getByText('(1/1)')).toBeVisible();

  await page.getByLabel('Novo comentário').fill('Priorizar para a semana que vem.');
  await page.getByRole('button', { name: 'Comentar' }).click();
  await expect(page.getByText('Priorizar para a semana que vem.')).toBeVisible();

  await page.getByLabel(/Mover “Gravar vídeo de abertura”/).selectOption({ label: 'Bloqueada' });
  await page.getByRole('button', { name: 'Bloquear' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /motivo/i })).toBeVisible();
  await page.getByLabel('Motivo do bloqueio *').fill('Aguardando liberação do estúdio');
  await page.getByRole('button', { name: 'Bloquear' }).click();
  await expect(page.getByText('Bloqueada: Aguardando liberação do estúdio')).toBeVisible();

  await page.getByLabel(/Mover “Gravar vídeo de abertura”/).selectOption({ label: 'Concluída' });
  await expect(page.locator('.badge', { hasText: 'Concluída' })).toBeVisible();
  await expect(page.getByText('Situação alterada: Bloqueada → Concluída')).toBeVisible();

  // visões e filtros
  await page.goto('/tarefas?view=lista');
  await expect(page.getByRole('link', { name: 'Tarefa Fixture do A1' })).toBeVisible();
});

test('minhas tarefas, kanban e exclusão', async ({ page }) => {
  await uiLogin(page, OWNER);
  await page.goto('/tarefas');
  await expect(page.getByRole('heading', { name: 'Tarefas', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tarefa Fixture do A1' })).toBeVisible();
  await page.goto('/tarefas?view=kanban');
  await expect(page.getByRole('region', { name: 'Quadro Kanban de tarefas' })).toBeVisible();
  await page.getByLabel(/Mover “Tarefa Fixture do A1”/).selectOption({ label: 'Em andamento' });
  await expect(
    page
      .locator('section.kcol', { hasText: 'Em andamento' })
      .getByRole('link', { name: 'Tarefa Fixture do A1' }),
  ).toBeVisible();
  await page.goto('/tarefas?view=lista&q=zzznaoexiste');
  await expect(page.getByText('Nenhuma tarefa encontrada')).toBeVisible();

  const f = fx();
  await page.goto(`/tarefas/${f.taskA}`);
  await page.getByRole('button', { name: 'Excluir tarefa' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir tarefa' }).click();
  await page.waitForURL(/\/tarefas$/);
  await page.goto(`/tarefas/${f.taskA}`);
  await expect(page.getByText(/não encontrad|404/i).first()).toBeVisible();
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
      '/tarefas?view=lista',
      '/tarefas?view=kanban',
      '/tarefas/nova',
      '/projetos',
    ]) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(r.violations, `${url} @${name}`).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        ),
        `${url} @${name}`,
      ).toBe(false);
    }
    await ctx.close();
  });
}
