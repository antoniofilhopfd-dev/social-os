import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { notifications } from '@/db/schema';
import { createClient } from '@/modules/clients/service';
import { createContent } from '@/modules/contents/service';
import {
  addChecklistItem,
  addComment,
  createProject,
  createTask,
  deleteChecklistItem,
  deleteProject,
  deleteTask,
  getProject,
  getTask,
  listProjects,
  listTaskAssignees,
  listTasks,
  setTaskStatus,
  updateChecklistItem,
  updateProject,
  updateTask,
} from '@/modules/tasks/service';
import { resetDatabase, world, type World } from '../helpers/db';

let w: World;
let A: string, B: string;
type Actor = Awaited<ReturnType<World['actor']>>;
let owner: Actor, ownerB: Actor, writer: Actor, viewer: Actor, scoped: Actor, ext: Actor;
let clientA1: string, clientA2: string, clientB1: string;
const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e) => (e as { code: string }).code,
  );

beforeAll(async () => {
  await resetDatabase();
  w = world();
  A = await w.org('Agência A');
  B = await w.org('Agência B');
  owner = await w.actor(A, 'owner');
  ownerB = await w.actor(B, 'owner');
  writer = await w.actor(A, 'writer');
  viewer = await w.actor(A, 'viewer');
  clientA1 = (await createClient(w.db, owner.ctx, { name: 'Cliente A1' })).id;
  clientA2 = (await createClient(w.db, owner.ctx, { name: 'Cliente A2' })).id;
  clientB1 = (await createClient(w.db, ownerB.ctx, { name: 'Cliente B1' })).id;
  scoped = await w.actor(A, 'social_media', { clientId: clientA1 });
  ext = await w.actor(A, 'client', { clientId: clientA1 });
});
afterAll(() => w.close());

describe('projetos', () => {
  it('cria, edita, valida datas e lista com progresso', async () => {
    const p = await createProject(w.db, owner.ctx, {
      clientId: clientA1,
      name: 'Lançamento verão',
      startDate: '2031-01-10',
      dueDate: '2031-02-10',
    });
    expect(await code(updateProject(w.db, owner.ctx, p.id, { dueDate: '2031-01-01' }))).toBe(
      'VALIDATION',
    );
    await updateProject(w.db, owner.ctx, p.id, { status: 'active', ownerUserId: writer.userId });
    const t1 = await createTask(w.db, owner.ctx, { projectId: p.id, title: 'Roteiro do vídeo' });
    await createTask(w.db, owner.ctx, { projectId: p.id, title: 'Arte do carrossel' });
    await setTaskStatus(w.db, owner.ctx, t1.id, 'done');
    const list = await listProjects(w.db, owner.ctx, { clientId: clientA1 });
    const row = list.find((x) => x.id === p.id)!;
    expect(row).toMatchObject({
      tasksDone: 1,
      tasksOpen: 1,
      status: 'active',
      ownerName: expect.any(String),
    });
    expect((await getProject(w.db, owner.ctx, p.id)).permissions.edit).toBe(true);
  });

  it('não exclui projeto com tarefas abertas', async () => {
    const p = await createProject(w.db, owner.ctx, {
      clientId: clientA1,
      name: 'Projeto a excluir',
    });
    const t = await createTask(w.db, owner.ctx, { projectId: p.id, title: 'Tarefa aberta' });
    expect(await code(deleteProject(w.db, owner.ctx, p.id))).toBe('CONFLICT');
    await setTaskStatus(w.db, owner.ctx, t.id, 'cancelled');
    await deleteProject(w.db, owner.ctx, p.id);
    expect(await code(getProject(w.db, owner.ctx, p.id))).toBe('NOT_FOUND');
  });

  it('isolamento: outra organização, escopo de cliente, externo e sem permissão', async () => {
    const p = await createProject(w.db, owner.ctx, { clientId: clientA2, name: 'Projeto do A2' });
    expect(await code(getProject(w.db, ownerB.ctx, p.id))).toBe('NOT_FOUND');
    expect(await code(getProject(w.db, scoped.ctx, p.id))).toBe('NOT_FOUND'); // escopo A1
    expect(await code(getProject(w.db, ext.ctx, p.id))).toBe('FORBIDDEN');
    expect(await code(listProjects(w.db, ext.ctx))).toBe('FORBIDDEN');
    expect(
      await code(createProject(w.db, viewer.ctx, { clientId: clientA1, name: 'Sem permissão' })),
    ).toBe('FORBIDDEN');
    expect(
      await code(createProject(w.db, ownerB.ctx, { clientId: clientA1, name: 'Cliente alheio' })),
    ).toBe('NOT_FOUND');
    expect(
      await code(createProject(w.db, scoped.ctx, { clientId: clientA2, name: 'Fora do escopo' })),
    ).toBe('NOT_FOUND');
    expect((await listProjects(w.db, scoped.ctx)).every((x) => x.clientId === clientA1)).toBe(true);
    expect(await code(updateProject(w.db, writer.ctx, p.id, { name: 'Renomeado' }))).toBe('ok');
    expect(await code(deleteProject(w.db, writer.ctx, p.id))).toBe('FORBIDDEN');
  });
});

describe('tarefas', () => {
  it('cria com vínculo a conteúdo, deriva o cliente e valida inconsistências', async () => {
    const c = await createContent(w.db, owner.ctx, {
      clientId: clientA1,
      title: 'Post do verão',
      format: 'static_post',
    } as never);
    const t = await createTask(w.db, owner.ctx, { contentId: c.id, title: 'Revisar legenda' });
    const got = await getTask(w.db, owner.ctx, t.id);
    expect(got.clientId).toBe(clientA1);
    expect(got.contentLabel).toContain('Post do verão');
    expect(
      await code(
        createTask(w.db, owner.ctx, {
          clientId: clientA2,
          contentId: c.id,
          title: 'Cliente divergente',
        }),
      ),
    ).toBe('VALIDATION');
    expect(
      await code(
        createTask(w.db, owner.ctx, { contentId: 'x'.repeat(26), title: 'Conteúdo inexistente' }),
      ),
    ).toBe('VALIDATION');
    const cB = await createContent(w.db, ownerB.ctx, {
      clientId: clientB1,
      title: 'Alheio',
      format: 'text',
    } as never);
    expect(
      await code(
        createTask(w.db, owner.ctx, { contentId: cB.id, title: 'Vínculo entre organizações' }),
      ),
    ).toBe('VALIDATION');
  });

  it('tarefa interna (sem cliente): só visível com permissão na organização inteira', async () => {
    const t = await createTask(w.db, owner.ctx, { title: 'Reunião de planejamento interno' });
    expect(await code(getTask(w.db, scoped.ctx, t.id))).toBe('NOT_FOUND');
    expect(await code(createTask(w.db, scoped.ctx, { title: 'Interna do escopado' }))).toBe(
      'FORBIDDEN',
    );
    expect((await getTask(w.db, writer.ctx, t.id)).id).toBe(t.id);
  });

  it('atribuição exige permissão, notifica e valida membro interno', async () => {
    const t = await createTask(w.db, owner.ctx, {
      clientId: clientA1,
      title: 'Tarefa com responsável',
      assigneeUserId: writer.userId,
    });
    const n = await w.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, writer.userId));
    expect(n.some((x) => x.type === 'task_assigned')).toBe(true);
    // redator (sem tasks:assign) não atribui a outra pessoa, mas pode assumir para si
    expect(await code(updateTask(w.db, writer.ctx, t.id, { assigneeUserId: owner.userId }))).toBe(
      'FORBIDDEN',
    );
    expect(
      await code(
        createTask(w.db, writer.ctx, {
          clientId: clientA1,
          title: 'Redator cria',
          assigneeUserId: owner.userId,
        }),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await code(
        createTask(w.db, owner.ctx, {
          clientId: clientA1,
          title: 'Responsável externo',
          assigneeUserId: ext.userId,
        }),
      ),
    ).toBe('VALIDATION');
    expect(
      await code(
        createTask(w.db, owner.ctx, {
          clientId: clientA1,
          title: 'Responsável de outra org',
          assigneeUserId: ownerB.userId,
        }),
      ),
    ).toBe('VALIDATION');
    expect((await listTaskAssignees(w.db, owner.ctx)).some((u) => u.id === writer.userId)).toBe(
      true,
    );
  });

  it('status: bloqueio exige motivo, concluir registra data, reabrir limpa; encerrada não é editável', async () => {
    const t = await createTask(w.db, owner.ctx, { clientId: clientA1, title: 'Fluxo de status' });
    expect(await code(setTaskStatus(w.db, owner.ctx, t.id, 'blocked'))).toBe('VALIDATION');
    await setTaskStatus(w.db, owner.ctx, t.id, 'blocked', 'Aguardando material do cliente');
    expect((await getTask(w.db, owner.ctx, t.id)).blockedReason).toContain('material');
    await setTaskStatus(w.db, owner.ctx, t.id, 'done');
    const done = await getTask(w.db, owner.ctx, t.id);
    expect(done.completedAt).not.toBeNull();
    expect(done.blockedReason).toBeNull();
    expect(await code(updateTask(w.db, owner.ctx, t.id, { title: 'Novo título' }))).toBe(
      'CONFLICT',
    );
    await setTaskStatus(w.db, owner.ctx, t.id, 'todo');
    expect((await getTask(w.db, owner.ctx, t.id)).completedAt).toBeNull();
    expect((await getTask(w.db, owner.ctx, t.id)).events.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['created', 'status_changed']),
    );
  });

  it('checklist e comentários', async () => {
    const t = await createTask(w.db, owner.ctx, {
      clientId: clientA1,
      title: 'Com checklist',
      assigneeUserId: writer.userId,
    });
    const i = await addChecklistItem(w.db, owner.ctx, t.id, 'Escrever');
    await addChecklistItem(w.db, owner.ctx, t.id, 'Revisar');
    await updateChecklistItem(w.db, owner.ctx, t.id, i.id, { done: true });
    let got = await getTask(w.db, owner.ctx, t.id);
    expect(got.checklist.map((c) => [c.text, c.done])).toEqual([
      ['Escrever', true],
      ['Revisar', false],
    ]);
    await deleteChecklistItem(w.db, owner.ctx, t.id, i.id);
    expect(await code(updateChecklistItem(w.db, owner.ctx, t.id, i.id, { done: false }))).toBe(
      'NOT_FOUND',
    );
    await addComment(w.db, owner.ctx, t.id, 'Pode priorizar?');
    got = await getTask(w.db, owner.ctx, t.id);
    expect(got.comments).toHaveLength(1);
    expect(got.checklist).toHaveLength(1);
    const n = await w.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, writer.userId));
    expect(n.some((x) => x.type === 'task_comment')).toBe(true);
    // item de outra tarefa não é alcançável pelo id da tarefa errada
    const other = await createTask(w.db, owner.ctx, { clientId: clientA1, title: 'Outra tarefa' });
    expect(
      await code(
        updateChecklistItem(w.db, owner.ctx, other.id, got.checklist[0]!.id, { done: true }),
      ),
    ).toBe('NOT_FOUND');
  });

  it('listagem: filtros, atrasadas, minhas, paginação e isolamento', async () => {
    const late = await createTask(w.db, owner.ctx, {
      clientId: clientA1,
      title: 'Atrasada de verdade',
      dueDate: '2020-01-01',
      assigneeUserId: scoped.userId,
    });
    const before = await listTasks(w.db, owner.ctx, { overdue: true });
    expect(before.items.some((x) => x.id === late.id && x.due === 'overdue')).toBe(true);
    expect(
      (await listTasks(w.db, scoped.ctx, { assignee: 'me' })).items.every(
        (x) => x.assigneeUserId === scoped.userId,
      ),
    ).toBe(true);
    expect((await listTasks(w.db, owner.ctx, { q: 'verdade' })).items).toHaveLength(1);
    expect(
      (await listTasks(w.db, owner.ctx, { assignee: 'none' })).items.every(
        (x) => x.assigneeUserId === null,
      ),
    ).toBe(true);
    const p1 = await listTasks(w.db, owner.ctx, { limit: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p1.nextBefore).not.toBeNull();
    const p2 = await listTasks(w.db, owner.ctx, { limit: 2, before: p1.nextBefore! });
    expect(p2.items.every((x) => !p1.items.some((y) => y.id === x.id))).toBe(true);
    // escopo e organização
    const mine = await listTasks(w.db, scoped.ctx, {});
    expect(mine.items.every((x) => x.clientId === clientA1)).toBe(true);
    expect((await listTasks(w.db, ownerB.ctx, {})).items).toHaveLength(0);
    expect(await code(listTasks(w.db, ext.ctx, {}))).toBe('FORBIDDEN');
    expect(await code(getTask(w.db, ownerB.ctx, late.id))).toBe('NOT_FOUND');
  });

  it('permissões: leitor vê mas não edita; excluir exige tasks:delete; excluída some', async () => {
    const t = await createTask(w.db, owner.ctx, {
      clientId: clientA1,
      title: 'Permissões da tarefa',
    });
    expect(await code(getTask(w.db, viewer.ctx, t.id))).toBe('ok');
    expect(await code(setTaskStatus(w.db, viewer.ctx, t.id, 'done'))).toBe('FORBIDDEN');
    expect(await code(deleteTask(w.db, writer.ctx, t.id))).toBe('FORBIDDEN');
    await deleteTask(w.db, owner.ctx, t.id);
    expect(await code(getTask(w.db, owner.ctx, t.id))).toBe('NOT_FOUND');
  });
});
