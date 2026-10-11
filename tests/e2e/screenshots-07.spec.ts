import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { BASE, apiLogin, fx, uiLogin } from './helpers';

// Só roda com SCREENSHOTS=1 (npm run screenshots:e2e). Gera prints reais do app em execução.
test.skip(!process.env.SCREENSHOTS, 'defina SCREENSHOTS=1 para gerar os prints');
test.describe.configure({ mode: 'serial' });

const OUT = 'screenshots/etapa-07';
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
    const f = fx();
    const api = await apiLogin('dona.a@example.test');
    const team = (await (await api.get('/api/tasks/assignees')).json()).items as {
      id: string;
      name: string;
    }[];
    const p = await (
      await api.post('/api/projects', {
        data: {
          clientId: f.clientA1,
          name: `Lançamento da coleção (${size})`,
          status: 'active',
          startDate: '2026-10-01',
          dueDate: '2026-12-15',
          description: 'Entregas de social media para o lançamento.',
        },
      })
    ).json();
    const mk = async (title: string, extra: Record<string, unknown> = {}) =>
      (
        await (
          await api.post('/api/tasks', {
            data: { projectId: p.id, title, assigneeUserId: team[0]!.id, ...extra },
          })
        ).json()
      ).id as string;
    const t1 = await mk('Roteirizar vídeo de revelação', {
      dueDate: '2026-10-05',
      priority: 'high',
    });
    const t2 = await mk('Aprovar paleta com o cliente', { dueDate: '2026-12-01' });
    await mk('Produzir carrossel de bastidores', {
      dueDate: '2026-10-30',
      priority: 'urgent',
    });
    const t4 = await mk('Fotografar coleção', { priority: 'low' });
    await api.post(`/api/tasks/${t1}/status`, { data: { to: 'in_progress' } });
    await api.post(`/api/tasks/${t2}/status`, {
      data: { to: 'blocked', reason: 'Cliente ainda não enviou as referências' },
    });
    await api.post(`/api/tasks/${t4}/status`, { data: { to: 'done' } });
    for (const text of ['Definir gancho', 'Escrever roteiro', 'Revisar com a coordenação'])
      await api.post(`/api/tasks/${t1}/checklist`, { data: { text } });
    await api.post(`/api/tasks/${t1}/comments`, {
      data: { body: 'Vamos priorizar este vídeo para a semana do lançamento.' },
    });
    await api.dispose();

    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
    const page = await ctx.newPage();
    await uiLogin(page, 'dona.a@example.test');
    await page.goto('/tarefas');
    await shot(page, '01-minhas-tarefas', size);
    await page.goto('/tarefas?view=lista');
    await shot(page, '02-lista-de-tarefas', size);
    await page.goto('/tarefas?view=kanban');
    await shot(page, '03-kanban-de-tarefas', size);
    await page.goto(`/tarefas/${t1}`);
    await shot(page, '04-tarefa-detalhe', size);
    await page.goto(`/tarefas/${t2}`);
    await shot(page, '05-tarefa-bloqueada', size);
    await page.goto('/tarefas/nova');
    await page.getByRole('button', { name: 'Criar tarefa' }).click();
    await shot(page, '06-nova-tarefa-validacao', size);
    await page.goto('/tarefas?view=lista&q=zzzz');
    await shot(page, '07-tarefas-vazio', size);
    await page.goto('/projetos');
    await shot(page, '08-projetos', size);
    await page.goto(`/projetos/${p.id}`);
    await shot(page, '09-projeto-detalhe', size);
    await page.goto('/');
    await shot(page, '10-dashboard-com-tarefas', size);
    await ctx.close();
  });
}
