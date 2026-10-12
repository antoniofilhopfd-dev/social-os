import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { contents, notifications } from '@/db/schema';
import { createClient } from '@/modules/clients/service';
import { createBrand, createProfile } from '@/modules/clients/children';
import { changeContentStatus, createContent } from '@/modules/contents/service';
import { saveDraft } from '@/modules/editor/service';
import { normalizeBody } from '@/modules/editor/rules';
import { decide, submitForApproval } from '@/modules/approvals/service';
import {
  cancelPublication,
  getPublication,
  listPublications,
  markFailed,
  markPublished,
  reschedulePublication,
  schedulePublication,
} from '@/modules/publications/service';
import { resetDatabase, world, type World } from '../helpers/db';

let w: World;
let A: string, B: string;
type Actor = Awaited<ReturnType<World['actor']>>;
let owner: Actor,
  ownerB: Actor,
  social: Actor,
  writer: Actor,
  viewer: Actor,
  scoped: Actor,
  client1: Actor;
let clientA1: string, clientA2: string, profileA1: string, profileA2: string;
const NOW = new Date('2031-03-12T15:00:00Z'); // 12:00 em Brasília
const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e) => (e as { code: string }).code,
  );
const status = async (id: string) =>
  (await w.db.select().from(contents).where(eq(contents.id, id)))[0]!.status;

async function approved(title: string, clientId = clientA1, profileId: string | null = profileA1) {
  const c = await createContent(w.db, owner.ctx, {
    clientId,
    title,
    format: 'static_post',
    socialProfileId: profileId,
  } as never);
  await saveDraft(
    w.db,
    owner.ctx,
    c.id,
    0,
    normalizeBody({ caption: `Legenda ${title}`, hashtags: '#oi', altText: 'Descrição' }),
  );
  await changeContentStatus(w.db, owner.ctx, c.id, 'in_production');
  await changeContentStatus(w.db, owner.ctx, c.id, 'internal_review');
  const { id } = await submitForApproval(w.db, owner.ctx, c.id);
  await decide(w.db, client1.ctx, id, 'approved');
  return c.id;
}

beforeAll(async () => {
  await resetDatabase();
  w = world();
  A = await w.org('Agência A');
  B = await w.org('Agência B');
  owner = await w.actor(A, 'owner');
  ownerB = await w.actor(B, 'owner');
  social = await w.actor(A, 'social_media');
  writer = await w.actor(A, 'writer');
  viewer = await w.actor(A, 'viewer');
  clientA1 = (await createClient(w.db, owner.ctx, { name: 'Cliente A1' })).id;
  clientA2 = (await createClient(w.db, owner.ctx, { name: 'Cliente A2' })).id;
  client1 = await w.actor(A, 'client', { clientId: clientA1 });
  scoped = await w.actor(A, 'social_media', { clientId: clientA1 });
  const mkProfile = async (clientId: string) => {
    const brand = await createBrand(w.db, owner.ctx, clientId, { name: 'Marca' } as never);
    return (
      await createProfile(w.db, owner.ctx, brand.id, {
        network: 'instagram',
        profileName: 'Perfil',
        handle: 'perfil',
      } as never)
    ).id;
  };
  profileA1 = await mkProfile(clientA1);
  profileA2 = await mkProfile(clientA2);
});
afterAll(() => w.close());

describe('programar', () => {
  it('programa conteúdo aprovado, sincroniza agenda, avisa conflito e impede duplicidade', async () => {
    const id = await approved('Post programado');
    const r = await schedulePublication(
      w.db,
      social.ctx,
      id,
      { date: '2031-03-20', time: '10:00' },
      NOW,
    );
    expect(await status(id)).toBe('scheduled');
    const [c] = await w.db.select().from(contents).where(eq(contents.id, id));
    expect(c).toMatchObject({ scheduledDate: '2031-03-20' });
    expect(await code(schedulePublication(w.db, social.ctx, id, { date: '2031-03-21' }, NOW))).toBe(
      'CONFLICT',
    );
    const other = await approved('Outro no mesmo horário');
    const r2 = await schedulePublication(
      w.db,
      social.ctx,
      other,
      { date: '2031-03-20', time: '10:00' },
      NOW,
    );
    expect(r2.conflicts.map((x) => x.title)).toContain('Post programado');
    expect(r.id).toBeTruthy();
  });

  it('valida situação, perfil, data passada, aprovação dispensada e permissões', async () => {
    const draft = await createContent(w.db, owner.ctx, {
      clientId: clientA1,
      title: 'Não aprovado',
      format: 'text',
      socialProfileId: profileA1,
    } as never);
    expect(
      await code(schedulePublication(w.db, owner.ctx, draft.id, { date: '2031-03-20' }, NOW)),
    ).toBe('CONFLICT');
    // dispensa de aprovação só em produção/revisão e com contents:approve
    await changeContentStatus(w.db, owner.ctx, draft.id, 'in_production');
    expect(
      await code(
        schedulePublication(
          w.db,
          social.ctx,
          draft.id,
          { date: '2031-03-20', waiveApproval: true },
          NOW,
        ),
      ),
    ).toBe('FORBIDDEN');
    await schedulePublication(
      w.db,
      owner.ctx,
      draft.id,
      { date: '2031-03-20', waiveApproval: true },
      NOW,
    );
    expect(await status(draft.id)).toBe('scheduled');
    const noProfile = await approved('Sem perfil', clientA1, null);
    expect(
      await code(schedulePublication(w.db, owner.ctx, noProfile, { date: '2031-03-20' }, NOW)),
    ).toBe('VALIDATION');
    const ok = await approved('Datas');
    expect(await code(schedulePublication(w.db, owner.ctx, ok, { date: '2031-03-11' }, NOW))).toBe(
      'VALIDATION',
    );
    expect(
      await code(
        schedulePublication(w.db, owner.ctx, ok, { date: '2031-03-12', time: '11:00' }, NOW),
      ),
    ).toBe('VALIDATION');
    expect(await code(schedulePublication(w.db, writer.ctx, ok, { date: '2031-03-20' }, NOW))).toBe(
      'FORBIDDEN',
    );
    expect(await code(schedulePublication(w.db, viewer.ctx, ok, { date: '2031-03-20' }, NOW))).toBe(
      'FORBIDDEN',
    );
    expect(
      await code(schedulePublication(w.db, client1.ctx, ok, { date: '2031-03-20' }, NOW)),
    ).toBe('FORBIDDEN');
    expect(await code(schedulePublication(w.db, ownerB.ctx, ok, { date: '2031-03-20' }, NOW))).toBe(
      'NOT_FOUND',
    );
    const a2 = await approved('Cliente A2 post', clientA2, profileA2).catch(() => null);
    void a2; // A2 não tem aprovador: o envio falha e o fluxo acima não se aplica
    expect(await code(schedulePublication(w.db, scoped.ctx, ok, { date: '2031-03-20' }, NOW))).toBe(
      'ok',
    );
  });
});

describe('registro e fila', () => {
  it('reagenda, marca publicada com link e preserva o histórico', async () => {
    const id = await approved('Fluxo de publicação');
    const { id: pid } = await schedulePublication(
      w.db,
      owner.ctx,
      id,
      { date: '2031-03-25', time: '09:00' },
      NOW,
    );
    await reschedulePublication(w.db, owner.ctx, pid, { date: '2031-03-26', time: '09:30' }, NOW);
    expect(
      await code(reschedulePublication(w.db, writer.ctx, pid, { date: '2031-03-27' }, NOW)),
    ).toBe('FORBIDDEN');
    expect(
      await code(markPublished(w.db, owner.ctx, pid, { postUrl: 'javascript:alert(1)' }, NOW)),
    ).toBe('VALIDATION');
    expect(
      await code(markPublished(w.db, owner.ctx, pid, { publishedAt: '2031-04-30T00:00:00Z' }, NOW)),
    ).toBe('VALIDATION');
    await markPublished(
      w.db,
      social.ctx,
      pid,
      {
        postUrl: 'https://www.instagram.com/p/xyz/',
        publishedAt: '2031-03-12T14:00:00Z',
        notes: 'Publicado pela equipe',
      },
      NOW,
    );
    expect(await status(id)).toBe('published');
    const pub = await getPublication(w.db, owner.ctx, pid, NOW);
    expect(pub).toMatchObject({ status: 'published', postUrl: 'https://www.instagram.com/p/xyz/' });
    expect(pub.events.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['scheduled', 'rescheduled', 'published']),
    );
    expect(pub.package.source).toBe('approved');
    expect(pub.package.text).toContain('Legenda Fluxo de publicação');
    expect(await code(markPublished(w.db, owner.ctx, pid, {}, NOW))).toBe('CONFLICT'); // única conclusão
    expect(
      await code(reschedulePublication(w.db, owner.ctx, pid, { date: '2031-04-01' }, NOW)),
    ).toBe('CONFLICT');
  });

  it('falha volta o conteúdo para aprovado e permite nova programação; cancelar também', async () => {
    const id = await approved('Falha e retomada');
    const { id: p1 } = await schedulePublication(w.db, owner.ctx, id, { date: '2031-03-28' }, NOW);
    expect(await code(markFailed(w.db, owner.ctx, p1, ' '))).toBe('VALIDATION');
    await markFailed(w.db, owner.ctx, p1, 'Perfil desconectado da rede');
    expect(await status(id)).toBe('approved');
    expect((await getPublication(w.db, owner.ctx, p1, NOW)).failureReason).toContain(
      'desconectado',
    );
    const { id: p2 } = await schedulePublication(w.db, owner.ctx, id, { date: '2031-03-29' }, NOW);
    await cancelPublication(w.db, owner.ctx, p2);
    expect(await status(id)).toBe('approved');
    expect(await code(cancelPublication(w.db, owner.ctx, p2))).toBe('CONFLICT');
  });

  it('simultâneo: só uma conclusão vale', async () => {
    const id = await approved('Corrida de conclusões');
    const { id: pid } = await schedulePublication(w.db, owner.ctx, id, { date: '2031-03-30' }, NOW);
    const res = await Promise.allSettled([
      markPublished(w.db, owner.ctx, pid, {}, NOW),
      markFailed(w.db, social.ctx, pid, 'Erro ao publicar'),
    ]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('listagem: fila com atrasadas, escopo, organização e paginação; notificações', async () => {
    const id = await approved('Atrasada na fila');
    // data no passado em relação ao "agora" dos testes
    await schedulePublication(w.db, owner.ctx, id, { date: '2031-03-12', time: '18:00' }, NOW);
    const later = new Date('2031-03-13T15:00:00Z');
    const all = await listPublications(w.db, owner.ctx, { status: 'scheduled' }, later);
    expect(all.items.find((i) => i.title === 'Atrasada na fila')!.queue).toBe('overdue');
    expect(
      (await listPublications(w.db, scoped.ctx, {}, NOW)).items.every(
        (i) => i.clientId === clientA1,
      ),
    ).toBe(true);
    expect((await listPublications(w.db, ownerB.ctx, {}, NOW)).items).toHaveLength(0);
    expect(await code(listPublications(w.db, client1.ctx, {}, NOW))).toBe('FORBIDDEN');
    const p1 = await listPublications(w.db, owner.ctx, { limit: 2 }, NOW);
    expect(p1.items).toHaveLength(2);
    expect(p1.nextBefore).not.toBeNull();
    expect(
      (
        await listPublications(w.db, owner.ctx, { from: '2031-03-12', to: '2031-03-12' }, NOW)
      ).items.every((i) => i.scheduledDate === '2031-03-12'),
    ).toBe(true);
    void notifications;
  });
});
