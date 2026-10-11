import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { contents, requestEvents, requests } from '@/db/schema';
import { createClient } from '@/modules/clients/service';
import { createBrand, createProfile } from '@/modules/clients/children';
import {
  createCampaign,
  deleteCampaign,
  listCampaigns,
  updateCampaign,
} from '@/modules/contents/campaigns';
import {
  changeContentStatus,
  convertRequestToContent,
  createContent,
  deleteContent,
  duplicateContent,
  findConflicts,
  getContent,
  listContentHistory,
  listContents,
  listPillars,
  savePillar,
  updateContent,
} from '@/modules/contents/service';
import {
  campaignSchema,
  contentFiltersSchema,
  createContentSchema,
  updateContentSchema,
} from '@/modules/contents/schema';
import {
  changeStatus,
  assignRequest,
  createRequest,
  listRequestTypes,
} from '@/modules/requests/service';
import { listNotifications } from '@/modules/notifications/service';
import { getDashboard } from '@/modules/dashboard/service';
import { searchAll } from '@/modules/search/service';
import { isoDate, monthRange } from '@/modules/contents/rules';
import { resetDatabase, world, type World } from '../helpers/db';

let w: World;
let A: string, B: string;
let owner: Awaited<ReturnType<World['actor']>>, ownerB: Awaited<ReturnType<World['actor']>>;
let writer: Awaited<ReturnType<World['actor']>>,
  designer: Awaited<ReturnType<World['actor']>>,
  social: Awaited<ReturnType<World['actor']>>;
let scoped: Awaited<ReturnType<World['actor']>>, ext: Awaited<ReturnType<World['actor']>>;
let clientA1: string, clientA2: string, clientB1: string;
let brandA1: string, profileA1: string, profileA2: string, brandA2: string;
let pillar: string;
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
const mk = (over: Record<string, unknown> = {}) => ({
  clientId: clientA1,
  title: 'Conteúdo de teste',
  format: 'carousel' as const,
  ...over,
});

beforeAll(async () => {
  await resetDatabase();
  w = world();
  A = await w.org('Agência A');
  B = await w.org('Agência B');
  owner = await w.actor(A, 'owner');
  ownerB = await w.actor(B, 'owner');
  writer = await w.actor(A, 'writer');
  designer = await w.actor(A, 'designer');
  social = await w.actor(A, 'social_media');
  clientA1 = (await createClient(w.db, owner.ctx, { name: 'Cliente A1' })).id;
  clientA2 = (await createClient(w.db, owner.ctx, { name: 'Cliente A2' })).id;
  clientB1 = (await createClient(w.db, ownerB.ctx, { name: 'Cliente B1' })).id;
  scoped = await w.actor(A, 'social_media', { clientId: clientA1 });
  ext = await w.actor(A, 'client', { clientId: clientA1 });
  brandA1 = (await createBrand(w.db, owner.ctx, clientA1, { name: 'Marca A1' })).id;
  brandA2 = (await createBrand(w.db, owner.ctx, clientA2, { name: 'Marca A2' })).id;
  profileA1 = (
    await createProfile(w.db, owner.ctx, brandA1, {
      network: 'instagram',
      profileName: 'Insta A1',
      handle: 'insta_a1',
    })
  ).id;
  profileA2 = (
    await createProfile(w.db, owner.ctx, brandA2, {
      network: 'tiktok',
      profileName: 'Tik A2',
      handle: 'tik_a2',
    })
  ).id;
  pillar = (await savePillar(w.db, owner.ctx, null, { name: 'Educativo', color: 'blue' })).id;
});
afterAll(async () => w.close());

describe('criação e referências', () => {
  it('cria com número sequencial, auditoria e perfil define a marca', async () => {
    const c = await createContent(
      w.db,
      owner.ctx,
      mk({
        socialProfileId: profileA1,
        pillarId: pillar,
        scheduledDate: '2031-05-10',
        scheduledTime: '18:30',
      }),
    );
    const got = await getContent(w.db, owner.ctx, c.id);
    expect(got).toMatchObject({
      number: c.number,
      brandId: brandA1,
      network: 'instagram',
      status: 'draft',
      scheduledTime: '18:30',
      pillarName: 'Educativo',
    });
    const hist = await listContentHistory(w.db, owner.ctx, c.id);
    expect(hist.map((h) => h.action)).toContain('content.created');
  });

  it('valida marca, perfil, pilar, campanha e responsável', async () => {
    expect(
      (await details(createContent(w.db, owner.ctx, mk({ brandId: brandA2 })))).brandId,
    ).toBeDefined();
    expect(
      (await details(createContent(w.db, owner.ctx, mk({ socialProfileId: profileA2 }))))
        .socialProfileId,
    ).toBeDefined();
    expect(
      (
        await details(
          createContent(w.db, owner.ctx, mk({ brandId: brandA1, socialProfileId: profileA2 })),
        )
      ).socialProfileId,
    ).toBeDefined();
    const inactive = (
      await savePillar(w.db, owner.ctx, null, { name: 'Inativo', color: 'gray', active: false })
    ).id;
    expect(
      (await details(createContent(w.db, owner.ctx, mk({ pillarId: inactive })))).pillarId,
    ).toBeDefined();
    const campA2 = (await createCampaign(w.db, owner.ctx, clientA2, { name: 'Campanha do A2' })).id;
    expect(
      (await details(createContent(w.db, owner.ctx, mk({ campaignId: campA2 })))).campaignId,
    ).toBeDefined();
    expect(
      (await details(createContent(w.db, owner.ctx, mk({ assigneeUserId: ext.userId }))))
        .assigneeUserId,
    ).toBeDefined();
    expect(await code(createContent(w.db, owner.ctx, mk({ scheduledTime: '10:00' })))).toBe(
      'VALIDATION',
    ); // horário sem data
    expect(await code(createContent(w.db, owner.ctx, mk({ clientId: clientB1 })))).toBe(
      'NOT_FOUND',
    );
  });

  it('numeração consecutiva sem repetição sob concorrência; contador independente por organização', async () => {
    const r = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        createContent(w.db, owner.ctx, mk({ title: `Concorrente ${i} abc` })),
      ),
    );
    const nums = r.map((x) => x.number).sort((a, b) => a - b);
    expect(new Set(nums).size).toBe(6);
    expect(nums[5]! - nums[0]!).toBe(5);
    expect(
      (
        await createContent(w.db, ownerB.ctx, {
          clientId: clientB1,
          title: 'Primeiro da B',
          format: 'reels',
        })
      ).number,
    ).toBe(1);
  });

  it('esquemas de entrada rejeitam datas, horários, formatos e filtros inválidos', () => {
    const base = { clientId: clientA1, title: 'Valido aqui', format: 'carousel' };
    expect(createContentSchema.safeParse(base).success).toBe(true);
    for (const bad of [
      { scheduledDate: '2031-02-30' },
      { scheduledDate: "2031-01-01' OR 1=1" },
      { scheduledTime: '25:00' },
      { format: 'gif' },
      { title: 'ab' },
    ]) {
      expect(createContentSchema.safeParse({ ...base, ...bad }).success, JSON.stringify(bad)).toBe(
        false,
      );
    }
    expect(updateContentSchema.safeParse({ campo_desconhecido: 1 }).success).toBe(false);
    expect(contentFiltersSchema.safeParse({ mes: '2031-13' }).success).toBe(false);
    expect(
      contentFiltersSchema.safeParse({ view: 'kanban', mes: '2031-03', status: 'open' }).success,
    ).toBe(true);
    expect(
      campaignSchema.safeParse({ name: 'Camp', startDate: '2031-05-10', endDate: '2031-05-01' })
        .success,
    ).toBe(false);
  });
});

describe('permissões e escopo', () => {
  it('redator cria e edita, mas não atribui a outros nem exclui; pode assumir para si', async () => {
    const c = await createContent(w.db, writer.ctx, mk({ title: 'Do redator' }));
    expect(
      await code(updateContent(w.db, writer.ctx, c.id, { assigneeUserId: social.userId })),
    ).toBe('FORBIDDEN');
    expect(
      await code(updateContent(w.db, writer.ctx, c.id, { assigneeUserId: writer.userId })),
    ).toBe('ok');
    expect(await code(updateContent(w.db, writer.ctx, c.id, { assigneeUserId: null }))).toBe(
      'FORBIDDEN',
    ); // desatribuir também exige assign
    expect(await code(deleteContent(w.db, writer.ctx, c.id))).toBe('FORBIDDEN');
    expect(await code(deleteContent(w.db, owner.ctx, c.id))).toBe('ok');
  });

  it('designer edita mas não cria; consulta não escreve', async () => {
    const c = await createContent(w.db, owner.ctx, mk({ title: 'Para o designer' }));
    expect(await code(createContent(w.db, designer.ctx, mk()))).toBe('FORBIDDEN');
    expect(
      await code(updateContent(w.db, designer.ctx, c.id, { brief: 'Peça em andamento' })),
    ).toBe('ok');
    const viewer = await w.actor(A, 'viewer');
    expect(await code(updateContent(w.db, viewer.ctx, c.id, { brief: 'x' }))).toBe('FORBIDDEN');
    expect(await code(duplicateContent(w.db, viewer.ctx, c.id))).toBe('FORBIDDEN');
  });

  it('com escopo no A1: só vê e cria no A1', async () => {
    const mine = await createContent(w.db, scoped.ctx, mk({ title: 'Do escopo A1' }));
    expect(
      await code(
        createContent(w.db, scoped.ctx, mk({ clientId: clientA2, title: 'Fora do escopo' })),
      ),
    ).toBe('FORBIDDEN');
    const a2 = await createContent(
      w.db,
      owner.ctx,
      mk({ clientId: clientA2, title: 'Conteúdo do A2' }),
    );
    expect((await listContents(w.db, scoped.ctx)).items.every((i) => i.clientId === clientA1)).toBe(
      true,
    );
    expect(await code(getContent(w.db, scoped.ctx, a2.id))).toBe('NOT_FOUND');
    expect(await code(updateContent(w.db, scoped.ctx, a2.id, { brief: 'x' }))).toBe('NOT_FOUND');
    expect(await code(getContent(w.db, scoped.ctx, mine.id))).toBe('ok');
  });

  it('externo só vê o que já foi enviado ao cliente e nunca edita', async () => {
    const c = await createContent(w.db, owner.ctx, mk({ title: 'Interno em produção' }));
    expect((await listContents(w.db, ext.ctx)).items).toHaveLength(0);
    expect(await code(getContent(w.db, ext.ctx, c.id))).toBe('NOT_FOUND');
    expect(await searchAll(w.db, ext.ctx, 'Interno em produção').then((r) => r.contents)).toEqual(
      [],
    );
    await w.db.update(contents).set({ status: 'awaiting_client' }).where(eq(contents.id, c.id)); // simula o envio da Etapa 08
    expect((await listContents(w.db, ext.ctx)).items.map((i) => i.id)).toEqual([c.id]);
    const seen = await getContent(w.db, ext.ctx, c.id);
    expect(seen.permissions.edit).toBe(false);
    expect(seen.conflicts).toEqual([]);
    expect(await code(updateContent(w.db, ext.ctx, c.id, { title: 'Alterado pelo cliente' }))).toBe(
      'FORBIDDEN',
    );
    expect(await code(changeContentStatus(w.db, ext.ctx, c.id, 'cancelled', 'x'))).toBe(
      'FORBIDDEN',
    );
    expect(await code(listContentHistory(w.db, ext.ctx, c.id))).toBe('FORBIDDEN');
    expect(await code(createContent(w.db, ext.ctx, mk()))).toBe('FORBIDDEN');
  });
});

describe('estados', () => {
  it('fluxo manual válido; estados reservados e transições inválidas são recusados', async () => {
    const c = await createContent(w.db, owner.ctx, mk({ title: 'Fluxo de estados' }));
    expect(await code(changeContentStatus(w.db, owner.ctx, c.id, 'internal_review'))).toBe(
      'CONFLICT',
    ); // pula etapa
    for (const to of [
      'approved',
      'awaiting_client',
      'scheduled',
      'published',
      'changes_requested',
    ] as const) {
      expect(await code(changeContentStatus(w.db, owner.ctx, c.id, to)), to).toBe('CONFLICT');
    }
    expect(await code(changeContentStatus(w.db, owner.ctx, c.id, 'in_production'))).toBe('ok');
    expect(await code(changeContentStatus(w.db, owner.ctx, c.id, 'internal_review'))).toBe('ok');
    expect(await code(changeContentStatus(w.db, owner.ctx, c.id, 'cancelled'))).toBe('VALIDATION'); // exige motivo
    expect(
      await code(changeContentStatus(w.db, owner.ctx, c.id, 'cancelled', 'Cliente desistiu')),
    ).toBe('ok');
    expect(await code(changeContentStatus(w.db, owner.ctx, c.id, 'draft'))).toBe('ok'); // reabrir
    const hist = await listContentHistory(w.db, owner.ctx, c.id);
    expect(hist.filter((h) => h.action === 'content.status_changed')).toHaveLength(4);
  });

  it('publicado é imutável; no fluxo do cliente não pode ser excluído; arquivado não edita', async () => {
    const c = await createContent(w.db, owner.ctx, mk({ title: 'Já publicado' }));
    await w.db.update(contents).set({ status: 'published' }).where(eq(contents.id, c.id));
    expect(await code(changeContentStatus(w.db, owner.ctx, c.id, 'draft'))).toBe('CONFLICT');
    expect(await code(changeContentStatus(w.db, owner.ctx, c.id, 'cancelled', 'x'))).toBe(
      'CONFLICT',
    );
    expect(await code(updateContent(w.db, owner.ctx, c.id, { title: 'Novo título' }))).toBe(
      'CONFLICT',
    );
    expect(await code(deleteContent(w.db, owner.ctx, c.id))).toBe('CONFLICT');
    const d = await createContent(w.db, owner.ctx, mk({ title: 'Para arquivar' }));
    await changeContentStatus(w.db, owner.ctx, d.id, 'archived');
    expect(await code(updateContent(w.db, owner.ctx, d.id, { title: 'Alterado' }))).toBe(
      'CONFLICT',
    );
    expect((await listContents(w.db, owner.ctx, { q: 'Para arquivar' })).items).toHaveLength(0); // arquivados ficam fora por padrão
    expect(
      (await listContents(w.db, owner.ctx, { q: 'Para arquivar', includeArchived: true })).items,
    ).toHaveLength(1);
  });
});

describe('edição, duplicação, conflitos', () => {
  it('atualiza com histórico de campos; remover a data limpa o horário; atribuição notifica', async () => {
    const c = await createContent(
      w.db,
      owner.ctx,
      mk({ title: 'Editável', scheduledDate: '2031-06-01', scheduledTime: '09:00' }),
    );
    await updateContent(w.db, owner.ctx, c.id, {
      theme: 'Natal',
      priority: 'high',
      assigneeUserId: social.userId,
    });
    expect((await listNotifications(w.db, social.ctx)).items.map((i) => i.title)).toContain(
      `Conteúdo #${c.number} atribuído a você`,
    );
    await updateContent(w.db, owner.ctx, c.id, { scheduledDate: null });
    const got = await getContent(w.db, owner.ctx, c.id);
    expect(got).toMatchObject({
      scheduledDate: null,
      scheduledTime: null,
      theme: 'Natal',
      priority: 'high',
    });
    const hist = await listContentHistory(w.db, owner.ctx, c.id);
    const changes = hist
      .filter((h) => h.action === 'content.updated')
      .map((h) => (h.metadata as { changes: Record<string, unknown> }).changes);
    expect(changes.some((x) => 'theme' in x && 'priority' in x)).toBe(true);
    expect(await code(updateContent(w.db, owner.ctx, c.id, { scheduledTime: '10:00' }))).toBe(
      'VALIDATION',
    );
  });

  it('duplicar copia os dados, limpa data/responsável/solicitação e volta a rascunho', async () => {
    const src = await createContent(
      w.db,
      owner.ctx,
      mk({
        title: 'Original',
        theme: 'Tema X',
        brief: 'Roteiro',
        socialProfileId: profileA1,
        scheduledDate: '2031-07-01',
        assigneeUserId: social.userId,
      }),
    );
    await changeContentStatus(w.db, owner.ctx, src.id, 'in_production');
    const dup = await duplicateContent(w.db, owner.ctx, src.id);
    const got = await getContent(w.db, owner.ctx, dup.id);
    expect(got).toMatchObject({
      title: 'Original (cópia)',
      theme: 'Tema X',
      brief: 'Roteiro',
      status: 'draft',
      scheduledDate: null,
      assigneeUserId: null,
      socialProfileId: profileA1,
    });
    expect(dup.number).toBeGreaterThan(src.number);
    expect((await getContent(w.db, owner.ctx, src.id)).status).toBe('in_production'); // origem intacta
  });

  it('alerta conflito de agenda no mesmo perfil/dia; horários diferentes e cancelados não conflitam', async () => {
    const a = await createContent(
      w.db,
      owner.ctx,
      mk({
        title: 'Conflito A',
        socialProfileId: profileA1,
        scheduledDate: '2031-08-15',
        scheduledTime: '10:00',
      }),
    );
    const b = await createContent(
      w.db,
      owner.ctx,
      mk({
        title: 'Conflito B',
        socialProfileId: profileA1,
        scheduledDate: '2031-08-15',
        scheduledTime: '10:00',
      }),
    );
    expect(b.conflicts.map((x) => x.id)).toEqual([a.id]);
    expect((await getContent(w.db, owner.ctx, a.id)).conflicts.map((x) => x.id)).toEqual([b.id]);
    expect(
      (
        await createContent(
          w.db,
          owner.ctx,
          mk({
            title: 'Outro horário',
            socialProfileId: profileA1,
            scheduledDate: '2031-08-15',
            scheduledTime: '15:00',
          }),
        )
      ).conflicts,
    ).toHaveLength(0);
    expect(
      (
        await createContent(
          w.db,
          owner.ctx,
          mk({
            title: 'Outro dia',
            socialProfileId: profileA1,
            scheduledDate: '2031-08-16',
            scheduledTime: '10:00',
          }),
        )
      ).conflicts,
    ).toHaveLength(0);
    await changeContentStatus(w.db, owner.ctx, a.id, 'cancelled', 'Duplicado');
    expect(await findConflicts(w.db, owner.ctx, profileA1, '2031-08-15', '10:00', b.id)).toEqual(
      [],
    );
  });
});

describe('as visões usam os mesmos registros', () => {
  it('filtros, busca, faixa de datas e atrasados', async () => {
    const o = owner.ctx;
    const camp = (
      await createCampaign(w.db, o, clientA1, {
        name: 'Campanha Verão',
        startDate: '2031-12-01',
        endDate: '2032-02-28',
      })
    ).id;
    const a = await createContent(
      w.db,
      o,
      mk({
        title: 'Reels de verão',
        format: 'reels',
        socialProfileId: profileA1,
        pillarId: pillar,
        campaignId: camp,
        scheduledDate: '2031-09-10',
        assigneeUserId: social.userId,
      }),
    );
    await createContent(
      w.db,
      o,
      mk({ title: 'Texto institucional', format: 'text', scheduledDate: '2031-09-20' }),
    );
    await createContent(w.db, o, mk({ title: 'Sem data definida', format: 'text' }));
    const ids = async (f: Parameters<typeof listContents>[2]) =>
      (await listContents(w.db, o, f)).items.map((i) => i.id);
    expect(await ids({ format: 'reels', q: 'verão' })).toEqual([a.id]);
    expect(await ids({ network: 'instagram', pillarId: pillar, campaignId: camp })).toContain(a.id);
    expect(await ids({ assignee: 'none', q: 'Sem data' })).toHaveLength(1);
    expect(await ids({ assignee: social.userId, q: 'Reels de verão' })).toEqual([a.id]);
    expect(await ids({ q: `#${a.number}` })).toContain(a.id);
    expect(await ids({ q: '%' })).toEqual([]);
    expect(await ids({ status: 'open', q: 'Sem data' })).toHaveLength(1);
    const month = await listContents(w.db, o, { ...monthRange('2031-09') });
    expect(
      month.items.every(
        (i) => i.scheduledDate! >= '2031-08-31' && i.scheduledDate! <= '2031-10-04',
      ),
    ).toBe(true);
    expect(month.items.map((i) => i.title)).toEqual(
      expect.arrayContaining(['Reels de verão', 'Texto institucional']),
    );
    expect(month.items.map((i) => i.title)).not.toContain('Sem data definida');
    const all = new Set(await ids({ limit: 500 }));
    for (const i of month.items) expect(all.has(i.id)).toBe(true); // calendário ⊆ lista: mesmas linhas
    const un = await listContents(w.db, o, { unscheduledOnly: true, limit: 500 });
    expect(un.items.every((i) => i.scheduledDate === null)).toBe(true);
  });

  it('atrasados: data passada e ainda abertos', async () => {
    const past = isoDate(new Date(Date.now() - 5 * 86_400_000));
    const late = await createContent(
      w.db,
      owner.ctx,
      mk({ title: 'Atrasado de verdade', scheduledDate: past }),
    );
    const ok = await createContent(
      w.db,
      owner.ctx,
      mk({ title: 'Publicado no passado', scheduledDate: past }),
    );
    await w.db.update(contents).set({ status: 'published' }).where(eq(contents.id, ok.id));
    const ids = (await listContents(w.db, owner.ctx, { overdue: true })).items.map((i) => i.id);
    expect(ids).toContain(late.id);
    expect(ids).not.toContain(ok.id);
    expect(
      (await listContents(w.db, owner.ctx, { q: 'Atrasado de verdade' })).items[0]!.schedule,
    ).toBe('overdue');
  });

  it('dashboard e busca global incluem conteúdos (internos), com escopo', async () => {
    const dash = await getDashboard(w.db, owner.ctx, {});
    expect(
      dash.pending.some(
        (p) => p.kind === 'content' && p.severity === 'alert' && p.title.includes('atrasado'),
      ),
    ).toBe(true);
    expect((await searchAll(w.db, owner.ctx, 'Atrasado de verdade')).contents).toHaveLength(1);
    expect((await searchAll(w.db, ownerB.ctx, 'Atrasado de verdade')).contents).toEqual([]);
    expect((await getDashboard(w.db, ext.ctx, {})).pending.some((p) => p.kind === 'content')).toBe(
      false,
    );
  });
});

describe('isolamento entre organizações', () => {
  it('org B não lê, edita, muda estado, duplica, exclui nem lista conteúdo da A', async () => {
    const c = await createContent(w.db, owner.ctx, mk({ title: 'Segredo da A' }));
    expect(await code(getContent(w.db, ownerB.ctx, c.id))).toBe('NOT_FOUND');
    expect(await code(updateContent(w.db, ownerB.ctx, c.id, { title: 'Invadido' }))).toBe(
      'NOT_FOUND',
    );
    expect(await code(changeContentStatus(w.db, ownerB.ctx, c.id, 'in_production'))).toBe(
      'NOT_FOUND',
    );
    expect(await code(duplicateContent(w.db, ownerB.ctx, c.id))).toBe('NOT_FOUND');
    expect(await code(deleteContent(w.db, ownerB.ctx, c.id))).toBe('NOT_FOUND');
    expect(await code(listContentHistory(w.db, ownerB.ctx, c.id))).toBe('NOT_FOUND');
    expect(
      (await listContents(w.db, ownerB.ctx, { limit: 500 })).items.every(
        (i) => i.clientId === clientB1,
      ),
    ).toBe(true);
    expect((await getContent(w.db, owner.ctx, c.id)).title).toBe('Segredo da A');
    const [camp] = await listCampaigns(w.db, owner.ctx, clientA1);
    expect(await code(updateCampaign(w.db, ownerB.ctx, camp!.id, { name: 'Invadida' }))).toBe(
      'NOT_FOUND',
    );
    expect(await code(deleteCampaign(w.db, ownerB.ctx, camp!.id))).toBe('NOT_FOUND');
    expect(await code(listCampaigns(w.db, ownerB.ctx, clientA1))).toBe('NOT_FOUND');
    expect((await listPillars(w.db, ownerB.ctx)).some((p) => p.name === 'Educativo')).toBe(false);
  });
});

describe('pilares', () => {
  it('só quem tem settings:edit cria; nome único; desativado deixa de ser selecionável', async () => {
    expect(
      await code(savePillar(w.db, writer.ctx, null, { name: 'Não pode', color: 'blue' })),
    ).toBe('FORBIDDEN');
    expect(
      await code(savePillar(w.db, owner.ctx, null, { name: 'Educativo', color: 'green' })),
    ).toBe('CONFLICT');
    expect(
      await code(savePillar(w.db, ownerB.ctx, pillar, { name: 'Invadido', color: 'red' })),
    ).toBe('NOT_FOUND');
    expect((await listPillars(w.db, owner.ctx)).some((p) => p.name === 'Inativo')).toBe(false);
    expect(
      (await listPillars(w.db, owner.ctx, { includeInactive: true })).some(
        (p) => p.name === 'Inativo',
      ),
    ).toBe(true);
  });
});

describe('conversão de solicitação em conteúdo', () => {
  it('só solicitações aceitas; copia dados, vincula e não converte duas vezes', async () => {
    const types = await listRequestTypes(w.db, owner.ctx);
    const typeId = types.find((t) => t.name.startsWith('Criação'))!.id;
    const r = await createRequest(w.db, owner.ctx, {
      clientId: clientA1,
      typeId,
      title: 'Carrossel Black Friday',
      description: 'Criar carrossel de ofertas',
      brandId: brandA1,
      network: 'instagram',
      format: 'Carrossel',
      objective: 'Vender',
      desiredDate: '2031-11-20',
      referenceNotes: 'https://ref.example',
    });
    expect(await code(convertRequestToContent(w.db, owner.ctx, r.id))).toBe('CONFLICT'); // ainda nova
    await changeStatus(w.db, owner.ctx, r.id, 'in_triage');
    await assignRequest(w.db, owner.ctx, r.id, social.userId);
    await changeStatus(w.db, owner.ctx, r.id, 'accepted');
    const viewer2 = await w.actor(A, 'viewer');
    expect(await code(convertRequestToContent(w.db, viewer2.ctx, r.id))).toBe('FORBIDDEN'); // vê a solicitação, mas não edita nem cria conteúdo
    expect(await code(convertRequestToContent(w.db, designer.ctx, r.id))).toBe('NOT_FOUND'); // nem enxerga solicitações
    const made = await convertRequestToContent(w.db, owner.ctx, r.id);
    const got = await getContent(w.db, owner.ctx, made.id);
    expect(got).toMatchObject({
      title: 'Carrossel Black Friday',
      format: 'carousel',
      brandId: brandA1,
      socialProfileId: profileA1,
      scheduledDate: '2031-11-20',
      assigneeUserId: social.userId,
      requestId: r.id,
      status: 'draft',
    });
    expect(got.brief).toContain('Criar carrossel de ofertas');
    expect(got.brief).toContain('https://ref.example');
    const [row] = await w.db.select().from(requests).where(eq(requests.id, r.id));
    expect(row).toMatchObject({ convertedToType: 'content', convertedToId: made.id });
    const events = await w.db.select().from(requestEvents).where(eq(requestEvents.requestId, r.id));
    expect(events.some((e) => e.body?.includes(`conteúdo #${made.number}`))).toBe(true);
    expect(await code(convertRequestToContent(w.db, owner.ctx, r.id))).toBe('CONFLICT');
    expect(await code(convertRequestToContent(w.db, ownerB.ctx, r.id))).toBe('NOT_FOUND');
  });
});
