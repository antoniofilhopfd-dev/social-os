import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { publications } from '@/db/schema';
import { createClient } from '@/modules/clients/service';
import { createBrand, createProfile } from '@/modules/clients/children';
import { changeContentStatus, createContent } from '@/modules/contents/service';
import { saveDraft } from '@/modules/editor/service';
import { normalizeBody } from '@/modules/editor/rules';
import { decide, submitForApproval } from '@/modules/approvals/service';
import { markPublished, schedulePublication } from '@/modules/publications/service';
import { createTask, setTaskStatus } from '@/modules/tasks/service';
import {
  deleteMetricEntry,
  deleteSnapshot,
  exportPerformanceCsv,
  listPublicationMetrics,
  listSnapshots,
  operationsReport,
  performanceReport,
  recordFollowers,
  recordMetrics,
  updateMetricEntry,
} from '@/modules/metrics/service';
import { todayLocal } from '@/core/time';
import { resetDatabase, world, type World } from '../helpers/db';

let w: World;
let A: string, B: string;
type Actor = Awaited<ReturnType<World['actor']>>;
let owner: Actor,
  ownerB: Actor,
  social: Actor,
  analyst: Actor,
  viewer: Actor,
  scoped: Actor,
  client1: Actor,
  client2: Actor;
let clientA1: string, clientA2: string, profile1: string, profile2: string;
const NOW = new Date('2031-03-12T15:00:00Z');
const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e) => (e as { code: string }).code,
  );

async function published(
  title: string,
  clientId: string,
  profileId: string,
  format = 'static_post',
  at = '2031-03-10T13:00:00Z',
) {
  const c = await createContent(w.db, owner.ctx, {
    clientId,
    title,
    format,
    socialProfileId: profileId,
  } as never);
  await saveDraft(w.db, owner.ctx, c.id, 0, normalizeBody({ caption: `Legenda ${title}` }));
  await changeContentStatus(w.db, owner.ctx, c.id, 'in_production');
  await schedulePublication(
    w.db,
    owner.ctx,
    c.id,
    { date: '2031-03-20', waiveApproval: true },
    NOW,
  );
  const [pub] = await w.db.select().from(publications).where(eq(publications.contentId, c.id));
  await markPublished(
    w.db,
    owner.ctx,
    pub!.id,
    { publishedAt: at },
    new Date('2031-03-12T15:00:00Z'),
  );
  return pub!.id;
}

beforeAll(async () => {
  await resetDatabase();
  w = world();
  A = await w.org('Agência A');
  B = await w.org('Agência B');
  owner = await w.actor(A, 'owner');
  ownerB = await w.actor(B, 'owner');
  social = await w.actor(A, 'social_media');
  analyst = await w.actor(A, 'analyst');
  viewer = await w.actor(A, 'viewer');
  clientA1 = (await createClient(w.db, owner.ctx, { name: 'Cliente A1' })).id;
  clientA2 = (await createClient(w.db, owner.ctx, { name: 'Cliente A2' })).id;
  scoped = await w.actor(A, 'analyst', { clientId: clientA1 });
  client1 = await w.actor(A, 'client', { clientId: clientA1 });
  client2 = await w.actor(A, 'client', { clientId: clientA2 });
  const mk = async (clientId: string) => {
    const brand = await createBrand(w.db, owner.ctx, clientId, { name: 'Marca' } as never);
    return (
      await createProfile(w.db, owner.ctx, brand.id, {
        network: 'instagram',
        profileName: 'Perfil',
        handle: `perfil${clientId.slice(-4)}`,
      } as never)
    ).id;
  };
  profile1 = await mk(clientA1);
  profile2 = await mk(clientA2);
  void submitForApproval;
  void decide;
});
afterAll(() => w.close());

describe('registro de métricas', () => {
  it('registra, calcula, valida e restringe', async () => {
    const pub = await published('Post medido', clientA1, profile1);
    expect(
      await code(recordMetrics(w.db, social.ctx, pub, { capturedOn: '2031-03-12' }, NOW)),
    ).toBe('VALIDATION'); // nada informado
    expect(
      await code(
        recordMetrics(
          w.db,
          social.ctx,
          pub,
          { capturedOn: '2031-03-12', reach: 100, impressions: 50 },
          NOW,
        ),
      ),
    ).toBe('VALIDATION');
    expect(
      await code(
        recordMetrics(w.db, social.ctx, pub, { capturedOn: '2031-03-13', reach: 100 }, NOW),
      ),
    ).toBe('VALIDATION'); // futuro
    expect(
      await code(
        recordMetrics(w.db, social.ctx, pub, { capturedOn: '2031-03-01', reach: 100 }, NOW),
      ),
    ).toBe('VALIDATION'); // antes de publicar
    await recordMetrics(
      w.db,
      social.ctx,
      pub,
      { capturedOn: '2031-03-11', reach: 500, likes: 20 },
      NOW,
    );
    await recordMetrics(
      w.db,
      social.ctx,
      pub,
      {
        capturedOn: '2031-03-12',
        reach: 1000,
        impressions: 1500,
        likes: 40,
        comments: 8,
        shares: 2,
        saves: 10,
        clicks: 30,
      },
      NOW,
    );
    const list = await listPublicationMetrics(w.db, social.ctx, pub);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      capturedOn: '2031-03-12',
      interactions: 60,
      engagementRate: 6,
    });
    // permissões
    expect(
      await code(recordMetrics(w.db, viewer.ctx, pub, { capturedOn: '2031-03-12', reach: 1 }, NOW)),
    ).toBe('FORBIDDEN');
    expect(
      await code(
        recordMetrics(w.db, client1.ctx, pub, { capturedOn: '2031-03-12', reach: 1 }, NOW),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await code(recordMetrics(w.db, ownerB.ctx, pub, { capturedOn: '2031-03-12', reach: 1 }, NOW)),
    ).toBe('NOT_FOUND');
    expect(await code(listPublicationMetrics(w.db, ownerB.ctx, pub))).toBe('NOT_FOUND');
    // só publicadas
    const c = await createContent(w.db, owner.ctx, {
      clientId: clientA1,
      title: 'Ainda não publicado',
      format: 'text',
      socialProfileId: profile1,
    } as never);
    await changeContentStatus(w.db, owner.ctx, c.id, 'in_production');
    await schedulePublication(
      w.db,
      owner.ctx,
      c.id,
      { date: '2031-03-25', waiveApproval: true },
      NOW,
    );
    const [np] = await w.db.select().from(publications).where(eq(publications.contentId, c.id));
    expect(
      await code(
        recordMetrics(w.db, social.ctx, np!.id, { capturedOn: '2031-03-12', reach: 1 }, NOW),
      ),
    ).toBe('CONFLICT');
  });

  it('edição e exclusão exigem metrics:edit; dados excluídos saem dos relatórios', async () => {
    const pub = await published('Post editável', clientA1, profile1);
    const { id } = await recordMetrics(
      w.db,
      analyst.ctx,
      pub,
      { capturedOn: '2031-03-12', reach: 100, likes: 5 },
      NOW,
    );
    expect(await code(updateMetricEntry(w.db, social.ctx, id, { reach: 200 }, NOW))).toBe(
      'FORBIDDEN',
    ); // social_media não tem metrics:edit
    await updateMetricEntry(w.db, analyst.ctx, id, { reach: 200 }, NOW);
    expect((await listPublicationMetrics(w.db, analyst.ctx, pub))[0]!.reach).toBe(200);
    expect(
      await code(updateMetricEntry(w.db, analyst.ctx, id, { reach: null, likes: null }, NOW)),
    ).toBe('VALIDATION');
    expect(await code(updateMetricEntry(w.db, ownerB.ctx, id, { reach: 1 }, NOW))).toBe(
      'NOT_FOUND',
    );
    await deleteMetricEntry(w.db, analyst.ctx, id);
    expect(await listPublicationMetrics(w.db, analyst.ctx, pub)).toHaveLength(0);
  });
});

describe('seguidores', () => {
  it('um registro por perfil e dia; crescimento no período; escopo', async () => {
    await recordFollowers(
      w.db,
      analyst.ctx,
      { socialProfileId: profile1, capturedOn: '2031-03-01', followers: 1000 },
      NOW,
    );
    await recordFollowers(
      w.db,
      analyst.ctx,
      { socialProfileId: profile1, capturedOn: '2031-03-11', followers: 1180 },
      NOW,
    );
    expect(
      await code(
        recordFollowers(
          w.db,
          analyst.ctx,
          { socialProfileId: profile1, capturedOn: '2031-03-11', followers: 1 },
          NOW,
        ),
      ),
    ).toBe('CONFLICT');
    expect(
      await code(
        recordFollowers(
          w.db,
          analyst.ctx,
          { socialProfileId: profile1, capturedOn: '2031-04-01', followers: 1 },
          NOW,
        ),
      ),
    ).toBe('VALIDATION');
    expect(
      await code(
        recordFollowers(
          w.db,
          scoped.ctx,
          { socialProfileId: profile2, capturedOn: '2031-03-01', followers: 5 },
          NOW,
        ),
      ),
    ).toBe('NOT_FOUND');
    expect(
      await code(
        recordFollowers(
          w.db,
          ownerB.ctx,
          { socialProfileId: profile1, capturedOn: '2031-03-05', followers: 5 },
          NOW,
        ),
      ),
    ).toBe('NOT_FOUND');
    expect(
      await code(
        recordFollowers(
          w.db,
          viewer.ctx,
          { socialProfileId: profile1, capturedOn: '2031-03-05', followers: 5 },
          NOW,
        ),
      ),
    ).toBe('FORBIDDEN');
    const r = await performanceReport(w.db, owner.ctx, {
      from: '2031-03-01',
      to: '2031-03-31',
      clientId: clientA1,
    });
    expect(r.followers[0]).toMatchObject({ start: 1000, end: 1180, growth: 180 });
    const snaps = await listSnapshots(w.db, analyst.ctx, profile1);
    await deleteSnapshot(w.db, analyst.ctx, snaps[0]!.id);
    // depois de excluído, o dia pode ser registrado de novo
    await recordFollowers(
      w.db,
      analyst.ctx,
      { socialProfileId: profile1, capturedOn: snaps[0]!.capturedOn, followers: 1190 },
      NOW,
    );
  });
});

describe('relatório de desempenho', () => {
  it('soma só o informado, agrupa, ranqueia e respeita período/escopo/organização', async () => {
    const a = await published('Reels forte', clientA1, profile1, 'reels', '2031-03-05T13:00:00Z');
    const b = await published(
      'Post fraco',
      clientA1,
      profile1,
      'static_post',
      '2031-03-06T13:00:00Z',
    );
    await published('Sem métricas ainda', clientA1, profile1, 'carousel', '2031-03-07T13:00:00Z');
    await published('Fora do período', clientA1, profile1, 'text', '2031-02-01T13:00:00Z');
    const other = await published(
      'Post do A2',
      clientA2,
      profile2,
      'static_post',
      '2031-03-08T13:00:00Z',
    );
    await recordMetrics(
      w.db,
      analyst.ctx,
      a,
      {
        capturedOn: '2031-03-12',
        reach: 2000,
        likes: 150,
        comments: 30,
        saves: 20,
        videoViews: 900,
      },
      NOW,
    );
    await recordMetrics(
      w.db,
      analyst.ctx,
      b,
      { capturedOn: '2031-03-12', reach: 500, likes: 5 },
      NOW,
    );
    await recordMetrics(
      w.db,
      analyst.ctx,
      other,
      { capturedOn: '2031-03-12', reach: 99999, likes: 1 },
      NOW,
    );
    const f = { from: '2031-03-01', to: '2031-03-31', clientId: clientA1 };
    const r = await performanceReport(w.db, owner.ctx, f);
    expect(r.totals).toMatchObject({
      posts: 5,
      postsWithMetrics: 3,
      reach: 3500,
      interactions: 265,
      videoViews: 900,
    });
    expect(r.totals.engagementRate).toBe(7.6); // 265 / 3500
    expect(r.posts.find((p) => p.title === 'Sem métricas ainda')!.metrics).toBeNull();
    expect(r.posts.some((p) => p.title === 'Fora do período')).toBe(false);
    expect(r.top[0]!.title).toBe('Reels forte');
    expect(r.byFormat.find((g) => g.key === 'reels')).toMatchObject({ posts: 1, reach: 2000 });
    // sem filtro de cliente: soma os dois clientes; escopado só enxerga o A1
    const all = await performanceReport(w.db, owner.ctx, { from: '2031-03-01', to: '2031-03-31' });
    expect(all.totals.reach).toBe(3500 + 99999);
    const mine = await performanceReport(w.db, scoped.ctx, {
      from: '2031-03-01',
      to: '2031-03-31',
    });
    expect(mine.totals.reach).toBe(3500);
    expect(mine.posts.every((p) => p.clientId === clientA1)).toBe(true);
    // cliente externo vê só o próprio cliente
    expect(
      (await performanceReport(w.db, client1.ctx, { from: '2031-03-01', to: '2031-03-31' })).totals
        .reach,
    ).toBe(3500);
    expect(
      (await performanceReport(w.db, client2.ctx, { from: '2031-03-01', to: '2031-03-31' })).totals
        .reach,
    ).toBe(99999);
    expect(
      (await performanceReport(w.db, ownerB.ctx, { from: '2031-03-01', to: '2031-03-31' })).totals
        .posts,
    ).toBe(0);
    // validações do período
    expect(
      await code(performanceReport(w.db, owner.ctx, { from: '2031-04-01', to: '2031-03-01' })),
    ).toBe('VALIDATION');
    expect(
      await code(performanceReport(w.db, owner.ctx, { from: '2029-01-01', to: '2031-03-01' })),
    ).toBe('VALIDATION');
  });

  it('exportação: só com metrics:export, interno, auditada e sem injeção de fórmulas', async () => {
    const f = { from: '2031-03-01', to: '2031-03-31', clientId: clientA1 };
    expect(await code(exportPerformanceCsv(w.db, viewer.ctx, f))).toBe('FORBIDDEN');
    expect(await code(exportPerformanceCsv(w.db, client1.ctx, f))).toBe('FORBIDDEN');
    expect(await code(exportPerformanceCsv(w.db, social.ctx, f))).toBe('FORBIDDEN');
    const csv = await exportPerformanceCsv(w.db, analyst.ctx, f);
    expect(csv.startsWith('﻿Cliente;Rede;Perfil;')).toBe(true);
    expect(csv).toContain('Reels forte');
    expect(csv).not.toContain('Post do A2');
    expect(
      await code(
        exportPerformanceCsv(w.db, scoped.ctx, {
          from: '2031-03-01',
          to: '2031-03-31',
          clientId: clientA2,
        }),
      ),
    ).toBe('ok'); // escopo vazio → CSV só com cabeçalho
  });
});

describe('relatório operacional', () => {
  it('conta produção, aprovações, publicações e tarefas reais; externos não acessam', async () => {
    await createTask(w.db, owner.ctx, {
      clientId: clientA1,
      title: 'Tarefa do período',
      dueDate: '2000-01-01',
    });
    const t = await createTask(w.db, owner.ctx, { clientId: clientA1, title: 'Tarefa concluída' });
    await setTaskStatus(w.db, owner.ctx, t.id, 'done');
    const now = new Date();
    const day = todayLocal(now);
    const r = await operationsReport(
      w.db,
      owner.ctx,
      { from: day, to: day, clientId: clientA1 },
      now,
    );
    expect(r.tasks).toMatchObject({ created: 2, completed: 1, overdueOpen: 1 });
    expect(r.contents.created).toBeGreaterThan(0);
    const mar = await operationsReport(
      w.db,
      owner.ctx,
      { from: '2031-03-01', to: '2031-03-31' },
      NOW,
    );
    expect(mar.publications.published).toBeGreaterThan(0);
    expect(mar.publications.onTimeRate).toBe(100);
    expect(await code(operationsReport(w.db, client1.ctx, { from: day, to: day }, now))).toBe(
      'FORBIDDEN',
    );
    expect(
      (await operationsReport(w.db, ownerB.ctx, { from: day, to: day }, now)).contents.created,
    ).toBe(0);
  });
});
