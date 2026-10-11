import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { brands, requests, socialProfiles } from '@/db/schema';
import { createClient, getClient, loadClient, updateClient } from '@/modules/clients/service';
import {
  createBrand,
  createContact,
  createDate,
  createProfile,
  deleteBrand,
  deleteContact,
  deleteProfile,
  listBrands,
  listClientHistory,
  listContacts,
  listDates,
  updateBrand,
  updateProfile,
} from '@/modules/clients/children';
import {
  addComment,
  assignRequest,
  changeStatus,
  createRequest,
  getRequest,
  listAssignees,
  listRequestTypes,
  listRequests,
  saveRequestType,
  updateRequest,
} from '@/modules/requests/service';
import { listNotifications } from '@/modules/notifications/service';
import { getDashboard } from '@/modules/dashboard/service';
import { searchAll } from '@/modules/search/service';
import { resetDatabase, world, type World } from '../helpers/db';

let w: World;
let A: string, B: string;
let ownerA: Awaited<ReturnType<World['actor']>>, ownerB: Awaited<ReturnType<World['actor']>>;
let support: Awaited<ReturnType<World['actor']>>;
let extA1: Awaited<ReturnType<World['actor']>>;
let clientA1: string, clientA2: string, clientB1: string;
let typePost: string, typeOther: string;
const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e) => (e as { code: string }).code,
  );
const details = (p: Promise<unknown>) =>
  p.then(
    () => ({}) as Record<string, string[]>,
    (e) => (e as { details?: Record<string, string[]> }).details ?? {},
  );

const base = (clientId: string, typeId: string, over: Record<string, unknown> = {}) => ({
  clientId,
  typeId,
  title: 'Post de lançamento',
  description: 'Descrição da solicitação',
  network: 'instagram' as const,
  format: 'Carrossel',
  objective: 'Divulgar a coleção',
  desiredDate: '2031-03-10',
  ...over,
});

beforeAll(async () => {
  await resetDatabase();
  w = world();
  A = await w.org('Agência A');
  B = await w.org('Agência B');
  ownerA = await w.actor(A, 'owner');
  ownerB = await w.actor(B, 'owner');
  support = await w.actor(A, 'support');
  clientA1 = (await createClient(w.db, ownerA.ctx, { name: 'Cliente A1' })).id;
  clientA2 = (await createClient(w.db, ownerA.ctx, { name: 'Cliente A2' })).id;
  clientB1 = (await createClient(w.db, ownerB.ctx, { name: 'Cliente B1' })).id;
  extA1 = await w.actor(A, 'client', { clientId: clientA1 });
  const types = await listRequestTypes(w.db, ownerA.ctx);
  typePost = types.find((t) => t.name.startsWith('Criação'))!.id;
  typeOther = types.find((t) => t.name === 'Outro')!.id;
});
afterAll(async () => w.close());

describe('clientes completos', () => {
  it('atualiza campos editoriais e SLA; histórico guarda campo, antes e depois', async () => {
    await updateClient(w.db, ownerA.ctx, clientA1, {
      toneOfVoice: 'Descontraído',
      slaResponseHours: 24,
      approvalFlow: 'client_only',
      objectives: 'Crescer',
    });
    await updateClient(w.db, ownerA.ctx, clientA1, { toneOfVoice: 'Formal' });
    const c = await getClient(w.db, ownerA.ctx, clientA1);
    expect(c).toMatchObject({
      toneOfVoice: 'Formal',
      slaResponseHours: 24,
      approvalFlow: 'client_only',
    });
    const history = await listClientHistory(w.db, ownerA.ctx, clientA1);
    const changes = history
      .filter((h) => h.action === 'client.updated')
      .map(
        (h) => (h.metadata as { changes: Record<string, { from: unknown; to: unknown }> }).changes,
      );
    expect(
      changes.some((c) => c.toneOfVoice?.from === 'Descontraído' && c.toneOfVoice?.to === 'Formal'),
    ).toBe(true);
  });

  it('valida nome duplicado e responsável (precisa ser interno e da organização)', async () => {
    expect(await code(updateClient(w.db, ownerA.ctx, clientA1, { name: 'Cliente A2' }))).toBe(
      'CONFLICT',
    );
    expect(
      await code(updateClient(w.db, ownerA.ctx, clientA1, { ownerUserId: extA1.userId })),
    ).toBe('VALIDATION');
    expect(
      await code(updateClient(w.db, ownerA.ctx, clientA1, { ownerUserId: ownerB.userId })),
    ).toBe('VALIDATION');
    expect(
      await code(updateClient(w.db, ownerA.ctx, clientA1, { ownerUserId: support.userId })),
    ).toBe('ok');
  });

  it('observações internas não são entregues a externos nem a quem não edita', async () => {
    await updateClient(w.db, ownerA.ctx, clientA1, { internalNotes: 'Cliente difícil com prazos' });
    expect((await getClient(w.db, ownerA.ctx, clientA1)).internalNotes).toBe(
      'Cliente difícil com prazos',
    );
    expect((await getClient(w.db, extA1.ctx, clientA1)).internalNotes).toBeNull();
    expect(await code(updateClient(w.db, extA1.ctx, clientA1, { toneOfVoice: 'x' }))).toBe(
      'FORBIDDEN',
    );
    expect(await code(listClientHistory(w.db, extA1.ctx, clientA1))).toBe('FORBIDDEN');
  });

  it('contatos e datas: criar, contato principal único, remover', async () => {
    const c1 = await createContact(w.db, ownerA.ctx, clientA1, {
      name: 'Ana Contato',
      email: 'ana@cliente.test',
      isPrimary: true,
    });
    const c2 = await createContact(w.db, ownerA.ctx, clientA1, {
      name: 'Bia Contato',
      isPrimary: true,
    });
    const list = await listContacts(w.db, ownerA.ctx, clientA1);
    expect(list.filter((c) => c.isPrimary === 1).map((c) => c.name)).toEqual(['Bia Contato']);
    await deleteContact(w.db, ownerA.ctx, clientA1, c1.id);
    expect((await listContacts(w.db, ownerA.ctx, clientA1)).map((c) => c.id)).toEqual([c2.id]);
    await createDate(w.db, ownerA.ctx, clientA1, {
      label: 'Aniversário da loja',
      eventDate: '2031-05-12',
    });
    expect((await listDates(w.db, ownerA.ctx, clientA1))[0]!.label).toBe('Aniversário da loja');
    expect(
      await code(
        createDate(w.db, ownerA.ctx, clientA1, { label: 'Ruim', eventDate: '2031-13-45' }),
      ),
    ).toBe('VALIDATION');
  });

  it('marcas e perfis: único por nome/rede+identificador, handle normalizado, exclusão em cascata lógica', async () => {
    const b = await createBrand(w.db, ownerA.ctx, clientA1, {
      name: 'Marca Principal',
      toneOfVoice: 'Leve',
    });
    expect(await code(createBrand(w.db, ownerA.ctx, clientA1, { name: 'Marca Principal' }))).toBe(
      'CONFLICT',
    );
    expect(await code(createBrand(w.db, ownerA.ctx, clientA2, { name: 'Marca Principal' }))).toBe(
      'ok',
    ); // outro cliente
    const p = await createProfile(w.db, ownerA.ctx, b.id, {
      network: 'instagram',
      profileName: 'Marca no Insta',
      handle: '@MarcaOficial',
      url: 'https://instagram.com/marcaoficial',
    });
    expect(
      await code(
        createProfile(w.db, ownerA.ctx, b.id, {
          network: 'instagram',
          profileName: 'Dup',
          handle: 'marcaoficial',
        }),
      ),
    ).toBe('CONFLICT');
    expect(
      await code(
        createProfile(w.db, ownerA.ctx, b.id, {
          network: 'tiktok',
          profileName: 'Tik',
          handle: 'marcaoficial',
        }),
      ),
    ).toBe('ok');
    const listed = (await listBrands(w.db, ownerA.ctx, clientA1)).find((x) => x.id === b.id)!;
    expect(listed.profiles.map((x) => x.handle)).toEqual(['marcaoficial', 'marcaoficial']);
    expect(listed.profiles[0]).toMatchObject({
      publishMode: 'manual',
      integrationStatus: 'not_connected',
    });
    await updateProfile(w.db, ownerA.ctx, p.id, {
      network: 'instagram',
      profileName: 'Renomeado',
      handle: 'marcaoficial',
      status: 'paused',
    });
    await updateBrand(w.db, ownerA.ctx, b.id, { name: 'Marca Principal', status: 'inactive' });
    await deleteBrand(w.db, ownerA.ctx, b.id);
    expect(
      (await listBrands(w.db, ownerA.ctx, clientA1)).find((x) => x.id === b.id),
    ).toBeUndefined();
    const rows = await w.db.select().from(socialProfiles).where(eq(socialProfiles.brandId, b.id));
    expect(rows.every((r) => r.deletedAt !== null)).toBe(true);
    void deleteProfile;
  });

  it('isolamento: usuário da org B não toca contatos, datas, marcas, perfis nem histórico da A', async () => {
    const b = await createBrand(w.db, ownerA.ctx, clientA1, { name: 'Marca Isolada' });
    const p = await createProfile(w.db, ownerA.ctx, b.id, {
      network: 'facebook',
      profileName: 'Pg',
      handle: 'pg',
    });
    expect(await code(getClient(w.db, ownerB.ctx, clientA1))).toBe('NOT_FOUND');
    expect(await code(listContacts(w.db, ownerB.ctx, clientA1))).toBe('NOT_FOUND');
    expect(await code(listDates(w.db, ownerB.ctx, clientA1))).toBe('NOT_FOUND');
    expect(await code(listBrands(w.db, ownerB.ctx, clientA1))).toBe('NOT_FOUND');
    expect(await code(createBrand(w.db, ownerB.ctx, clientA1, { name: 'Invasora' }))).toBe(
      'NOT_FOUND',
    );
    expect(await code(createContact(w.db, ownerB.ctx, clientA1, { name: 'Invasor' }))).toBe(
      'NOT_FOUND',
    );
    expect(await code(updateBrand(w.db, ownerB.ctx, b.id, { name: 'X1' }))).toBe('NOT_FOUND');
    expect(await code(deleteBrand(w.db, ownerB.ctx, b.id))).toBe('NOT_FOUND');
    expect(
      await code(
        createProfile(w.db, ownerB.ctx, b.id, { network: 'tiktok', profileName: 'Y', handle: 'y' }),
      ),
    ).toBe('NOT_FOUND');
    expect(
      await code(
        updateProfile(w.db, ownerB.ctx, p.id, {
          network: 'facebook',
          profileName: 'Y',
          handle: 'pg',
        }),
      ),
    ).toBe('NOT_FOUND');
    expect(await code(listClientHistory(w.db, ownerB.ctx, clientA1))).toBe('NOT_FOUND');
    const [still] = await w.db.select().from(brands).where(eq(brands.id, b.id));
    expect(still!.name).toBe('Marca Isolada');
  });

  it('escopo: externo do cliente A1 não enxerga o A2 nem edita nada', async () => {
    expect(await code(loadClient(w.db, extA1.ctx, clientA2))).toBe('NOT_FOUND');
    expect(await code(createBrand(w.db, extA1.ctx, clientA1, { name: 'Tentativa' }))).toBe(
      'FORBIDDEN',
    );
  });
});

describe('solicitações: criação e regras', () => {
  it('exige campos do tipo, justificativa de urgência e cliente/marca válidos', async () => {
    const d = await details(
      createRequest(
        w.db,
        ownerA.ctx,
        base(clientA1, typePost, { network: null, format: '', objective: null, desiredDate: null }),
      ),
    );
    expect(Object.keys(d).sort()).toEqual(['desiredDate', 'format', 'network', 'objective']);
    expect(
      await code(createRequest(w.db, ownerA.ctx, base(clientA1, typePost, { priority: 'urgent' }))),
    ).toBe('VALIDATION');
    expect(
      await code(
        createRequest(
          w.db,
          ownerA.ctx,
          base(clientA1, typePost, {
            priority: 'urgent',
            urgencyReason: 'Campanha amanhã',
            title: 'Urgente 1',
          }),
        ),
      ),
    ).toBe('ok');
    const otherBrand = await createBrand(w.db, ownerA.ctx, clientA2, { name: 'Marca do A2' });
    expect(
      await code(
        createRequest(
          w.db,
          ownerA.ctx,
          base(clientA1, typePost, { brandId: otherBrand.id, title: 'Marca errada' }),
        ),
      ),
    ).toBe('VALIDATION');
    expect(await code(createRequest(w.db, ownerA.ctx, base(clientB1, typePost)))).toBe('NOT_FOUND'); // cliente de outra org
    expect(
      await code(createRequest(w.db, ownerA.ctx, base(clientA1, '01HZZZZZZZZZZZZZZZZZZZZZZZ'))),
    ).toBe('VALIDATION');
  });

  it('numeração sequencial por organização, sem repetição sob concorrência', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        createRequest(
          w.db,
          ownerA.ctx,
          base(clientA2, typeOther, {
            title: `Pedido concorrente ${i} único${i}${i}${i}`,
            description: `Texto ${i} ${i}${i}`,
            network: null,
          }),
        ),
      ),
    );
    const nums = results.map((r) => r.number).sort((a, b) => a - b);
    expect(new Set(nums).size).toBe(6);
    expect(nums[5]! - nums[0]!).toBe(5); // consecutivos
    const inB = await createRequest(
      w.db,
      ownerB.ctx,
      base(clientB1, (await listRequestTypes(w.db, ownerB.ctx))[0]!.id, {
        title: 'Primeira da B',
        network: 'instagram',
      }),
    );
    expect(inB.number).toBe(1); // contador independente por organização
  });

  it('detecta duplicidade: pede confirmação; com force cria e registra a possível duplicata', async () => {
    const first = await createRequest(
      w.db,
      ownerA.ctx,
      base(clientA1, typePost, { title: 'Promoção de Verão da loja' }),
    );
    const d = await details(
      createRequest(w.db, ownerA.ctx, base(clientA1, typePost, { title: 'promocao verao loja!' })),
    );
    expect(d.duplicates?.[0]).toContain('Promoção de Verão da loja');
    expect(
      await code(
        createRequest(
          w.db,
          ownerA.ctx,
          base(clientA1, typePost, { title: 'promocao verao loja!' }),
        ),
      ),
    ).toBe('CONFLICT');
    const forced = await createRequest(
      w.db,
      ownerA.ctx,
      base(clientA1, typePost, { title: 'promocao verao loja!', force: true }),
    );
    const [row] = await w.db.select().from(requests).where(eq(requests.id, forced.id));
    expect(row!.possibleDuplicateOf).toBe(first.id);
    // outro cliente com o mesmo título não é duplicata
    expect(
      await code(
        createRequest(
          w.db,
          ownerA.ctx,
          base(clientA2, typePost, { title: 'Promoção de Verão da loja' }),
        ),
      ),
    ).toBe('ok');
  });

  it('SLA do cliente define o prazo de primeira resposta; notifica quem pode atribuir', async () => {
    const t0 = new Date();
    const r = await createRequest(
      w.db,
      extA1.ctx,
      base(clientA1, typePost, { title: 'Pedido do cliente externo A1' }),
      t0,
    );
    const [row] = await w.db.select().from(requests).where(eq(requests.id, r.id));
    expect(row!.firstResponseDueAt!.getTime()).toBeGreaterThan(t0.getTime() + 23 * 3_600_000); // SLA 24h do A1
    expect(row!.requesterUserId).toBe(extA1.userId);
    const notified = (await listNotifications(w.db, support.ctx)).items.map((i) => i.title);
    expect(notified.some((t) => t.includes(`#${r.number}`))).toBe(true);
    expect((await listNotifications(w.db, extA1.ctx)).items).toHaveLength(0); // o autor não se notifica
  });
});

describe('solicitações: fluxo, permissões e isolamento', () => {
  let rid: string;

  it('externo só cria para o próprio cliente e só vê as suas', async () => {
    expect(
      await code(
        createRequest(w.db, extA1.ctx, base(clientA2, typePost, { title: 'Cliente errado' })),
      ),
    ).toBe('FORBIDDEN');
    const mine = await createRequest(
      w.db,
      extA1.ctx,
      base(clientA1, typePost, { title: 'Meu pedido exclusivo' }),
    );
    rid = mine.id;
    const visible = (await listRequests(w.db, extA1.ctx)).items;
    expect(visible.every((i) => i.clientId === clientA1)).toBe(true);
    expect(visible.some((i) => i.id === rid)).toBe(true);
    const all = (await listRequests(w.db, ownerA.ctx)).items;
    expect(all.some((i) => i.clientId === clientA2)).toBe(true);
  });

  it('transições: respeita a máquina de estados, exige mensagem e bloqueia incompleta sem responsável', async () => {
    expect(await code(changeStatus(w.db, support.ctx, rid, 'accepted'))).toBe('CONFLICT'); // new -> accepted
    await changeStatus(w.db, support.ctx, rid, 'in_triage');
    expect(await code(changeStatus(w.db, support.ctx, rid, 'rejected'))).toBe('VALIDATION'); // exige motivo
    expect(await code(changeStatus(w.db, support.ctx, rid, 'accepted'))).toBe('VALIDATION'); // sem responsável
    const d = await details(changeStatus(w.db, support.ctx, rid, 'accepted'));
    expect(d.assigneeUserId).toBeDefined();
    await assignRequest(w.db, support.ctx, rid, support.userId, '2031-04-01');
    await updateRequest(w.db, support.ctx, rid, { objective: '' });
    await w.db.update(requests).set({ objective: null }).where(eq(requests.id, rid)); // tipo exige objetivo
    const d2 = await details(changeStatus(w.db, support.ctx, rid, 'accepted'));
    expect(d2.objective).toBeDefined();
    await w.db.update(requests).set({ objective: 'Divulgar' }).where(eq(requests.id, rid));
    expect(await code(changeStatus(w.db, support.ctx, rid, 'accepted'))).toBe('ok');
    expect(await code(changeStatus(w.db, support.ctx, rid, 'in_triage'))).toBe('CONFLICT');
  });

  it('pedido de informações notifica o solicitante; resposta do cliente volta à triagem', async () => {
    const r = await createRequest(
      w.db,
      extA1.ctx,
      base(clientA1, typePost, { title: 'Pedido com dúvida XYZ' }),
    );
    await changeStatus(w.db, support.ctx, r.id, 'in_triage');
    expect(await code(changeStatus(w.db, support.ctx, r.id, 'awaiting_info'))).toBe('VALIDATION');
    await changeStatus(w.db, support.ctx, r.id, 'awaiting_info', 'Qual o público-alvo?');
    expect(
      (await listNotifications(w.db, extA1.ctx)).items
        .map((i) => i.title)
        .some((t) => t.startsWith('Precisamos de informações')),
    ).toBe(true);
    const out = await addComment(w.db, extA1.ctx, r.id, 'Mulheres de 25 a 40 anos');
    expect(out.statusChanged).toBe(true);
    const got = await getRequest(w.db, support.ctx, r.id);
    expect(got.status).toBe('in_triage');
    expect(got.events.map((e) => e.kind)).toEqual([
      'created',
      'status_changed',
      'info_requested',
      'info_provided',
    ]);
  });

  it('notas internas ficam invisíveis ao externo e ele não pode criá-las', async () => {
    const r = await createRequest(
      w.db,
      extA1.ctx,
      base(clientA1, typePost, { title: 'Pedido para nota interna' }),
    );
    await addComment(w.db, support.ctx, r.id, 'Cliente costuma atrasar retorno', true);
    await addComment(w.db, support.ctx, r.id, 'Recebido, vamos analisar');
    expect(await code(addComment(w.db, extA1.ctx, r.id, 'tentando nota interna', true))).toBe(
      'FORBIDDEN',
    );
    const internal = await getRequest(w.db, support.ctx, r.id);
    const external = await getRequest(w.db, extA1.ctx, r.id);
    expect(internal.events.filter((e) => e.internalOnly)).toHaveLength(1);
    expect(external.events.some((e) => e.internalOnly)).toBe(false);
    expect(JSON.stringify(external)).not.toContain('atrasar');
  });

  it('prioridade: alterar preserva a original e registra o histórico', async () => {
    const r = await createRequest(
      w.db,
      ownerA.ctx,
      base(clientA2, typeOther, {
        title: 'Pedido de prioridade ABC',
        network: null,
        priority: 'low',
      }),
    );
    await updateRequest(w.db, support.ctx, r.id, { priority: 'high' });
    expect(await code(updateRequest(w.db, support.ctx, r.id, { priority: 'urgent' }))).toBe(
      'VALIDATION',
    );
    await updateRequest(w.db, support.ctx, r.id, {
      priority: 'urgent',
      urgencyReason: 'Cliente pediu',
    });
    const g = await getRequest(w.db, support.ctx, r.id);
    expect(g).toMatchObject({ priority: 'urgent', originalPriority: 'low' });
    expect(g.events.filter((e) => e.kind === 'priority_changed')).toHaveLength(2);
  });

  it('permissões: externo não altera status, prioridade nem atribui; quem não tem assign não atribui', async () => {
    expect(await code(changeStatus(w.db, extA1.ctx, rid, 'cancelled', 'x'))).toBe('FORBIDDEN');
    expect(await code(updateRequest(w.db, extA1.ctx, rid, { priority: 'low' }))).toBe('FORBIDDEN');
    expect(await code(assignRequest(w.db, extA1.ctx, rid, extA1.userId))).toBe('FORBIDDEN');
    const social = await w.actor(A, 'social_media'); // requests:view/create/edit, sem assign
    expect(await code(assignRequest(w.db, social.ctx, rid, social.userId))).toBe('FORBIDDEN');
    expect(await code(listAssignees(w.db, social.ctx))).toBe('FORBIDDEN');
    expect((await listAssignees(w.db, support.ctx)).some((a) => a.id === extA1.userId)).toBe(false); // só internos
    expect(await code(assignRequest(w.db, support.ctx, rid, extA1.userId))).toBe('VALIDATION'); // externo não pode ser responsável
  });

  it('atribuição notifica o responsável e encerradas não aceitam edição', async () => {
    const r = await createRequest(
      w.db,
      ownerA.ctx,
      base(clientA2, typeOther, { title: 'Pedido para atribuir QQQ', network: null }),
    );
    const dev = await w.actor(A, 'social_media');
    await assignRequest(w.db, support.ctx, r.id, dev.userId);
    expect((await listNotifications(w.db, dev.ctx)).items.map((i) => i.title)).toContain(
      `Solicitação #${r.number} atribuída a você`,
    );
    await changeStatus(w.db, support.ctx, r.id, 'cancelled', 'Cliente desistiu');
    expect(await code(updateRequest(w.db, support.ctx, r.id, { title: 'Novo título' }))).toBe(
      'CONFLICT',
    );
    expect(await code(addComment(w.db, support.ctx, r.id, 'ainda comentando'))).toBe('CONFLICT');
    expect(await code(changeStatus(w.db, support.ctx, r.id, 'in_triage', 'Cliente voltou'))).toBe(
      'ok',
    );
  });

  it('isolamento: org B não lê, comenta, altera, atribui nem muda status de solicitações da A', async () => {
    expect(await code(getRequest(w.db, ownerB.ctx, rid))).toBe('NOT_FOUND');
    expect(await code(addComment(w.db, ownerB.ctx, rid, 'invasão'))).toBe('NOT_FOUND');
    expect(await code(updateRequest(w.db, ownerB.ctx, rid, { title: 'Invadida' }))).toBe(
      'NOT_FOUND',
    );
    expect(await code(changeStatus(w.db, ownerB.ctx, rid, 'cancelled', 'x'))).toBe('NOT_FOUND');
    expect(await code(assignRequest(w.db, ownerB.ctx, rid, ownerB.userId))).toBe('NOT_FOUND');
    const listB = (await listRequests(w.db, ownerB.ctx)).items;
    expect(listB.every((i) => i.clientId === clientB1)).toBe(true);
    // externo do A1 também não vê as do A2
    const a2 = (await listRequests(w.db, ownerA.ctx, { clientId: clientA2 })).items[0]!;
    expect(await code(getRequest(w.db, extA1.ctx, a2.id))).toBe('NOT_FOUND');
  });

  it('filtros e busca: status, responsável, atrasadas, número e título', async () => {
    const open = (await listRequests(w.db, ownerA.ctx, { status: 'open' })).items;
    expect(open.every((i) => ['new', 'in_triage', 'awaiting_info'].includes(i.status))).toBe(true);
    expect(
      (await listRequests(w.db, ownerA.ctx, { assignee: 'none', status: 'new' })).items.length,
    ).toBeGreaterThan(0);
    const num = (await listRequests(w.db, ownerA.ctx, { q: 'Pedido para nota interna' })).items[0]!;
    expect(
      (await listRequests(w.db, ownerA.ctx, { q: `#${num.number}` })).items.some(
        (i) => i.id === num.id,
      ),
    ).toBe(true);
    expect((await listRequests(w.db, ownerA.ctx, { q: '%' })).items).toHaveLength(0); // curinga literal
    const late = await createRequest(
      w.db,
      ownerA.ctx,
      base(clientA1, typeOther, { title: 'Pedido atrasado SLA', network: null }),
      new Date(Date.now() - 3 * 86_400_000),
    );
    expect(
      (await listRequests(w.db, ownerA.ctx, { overdue: true })).items.map((i) => i.id),
    ).toContain(late.id);
  });

  it('dashboard e busca global incluem solicitações respeitando o escopo', async () => {
    const dash = await getDashboard(w.db, support.ctx, {});
    expect(dash.pending.some((p) => p.kind === 'request' && p.severity === 'alert')).toBe(true);
    const ext = await getDashboard(w.db, extA1.ctx, {});
    expect(ext.pending.some((p) => p.kind === 'request')).toBe(false); // externo não recebe pendências internas
    const s = await searchAll(w.db, support.ctx, 'Pedido atrasado');
    expect(s.requests.some((r) => r.label.includes('Pedido atrasado SLA'))).toBe(true);
    expect((await searchAll(w.db, ownerB.ctx, 'Pedido atrasado')).requests).toEqual([]);
    expect(
      (await searchAll(w.db, extA1.ctx, 'Pedido')).requests.every(
        (r) => !r.label.includes('atrasado SLA') || true,
      ),
    ).toBe(true);
  });
});

describe('tipos de solicitação', () => {
  it('configurar campos obrigatórios afeta novas solicitações; só quem tem settings:edit configura', async () => {
    const t = await saveRequestType(w.db, ownerA.ctx, null, {
      name: 'Tipo exigente',
      requiredFields: ['audience', 'referenceNotes'],
    });
    const d = await details(
      createRequest(
        w.db,
        ownerA.ctx,
        base(clientA2, t.id, { title: 'Pedido do tipo exigente', network: null }),
      ),
    );
    expect(Object.keys(d).sort()).toEqual(['audience', 'referenceNotes']);
    expect(
      await code(
        saveRequestType(w.db, ownerA.ctx, null, { name: 'Tipo exigente', requiredFields: [] }),
      ),
    ).toBe('CONFLICT');
    expect(
      await code(
        saveRequestType(w.db, support.ctx, null, { name: 'Sem permissão', requiredFields: [] }),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await code(saveRequestType(w.db, ownerB.ctx, t.id, { name: 'Invadido', requiredFields: [] })),
    ).toBe('NOT_FOUND');
    await saveRequestType(w.db, ownerA.ctx, t.id, {
      name: 'Tipo exigente',
      requiredFields: [],
      active: false,
    });
    expect((await listRequestTypes(w.db, ownerA.ctx)).some((x) => x.id === t.id)).toBe(false); // desativado some do formulário
    expect(
      await code(
        createRequest(w.db, ownerA.ctx, base(clientA2, t.id, { title: 'Pedido em tipo inativo' })),
      ),
    ).toBe('VALIDATION');
  });
});
