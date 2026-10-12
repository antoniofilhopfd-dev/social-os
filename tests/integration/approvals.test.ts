import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { approvals, contents, notifications } from '@/db/schema';
import { LocalStorageDriver } from '@/integrations/storage/local';
import { createClient } from '@/modules/clients/service';
import { changeContentStatus, createContent } from '@/modules/contents/service';
import { saveDraft } from '@/modules/editor/service';
import { normalizeBody } from '@/modules/editor/rules';
import { linkAsset, uploadAsset } from '@/modules/library/service';
import {
  addApprovalComment,
  cancelApproval,
  decide,
  getApproval,
  listApprovals,
  listContentApprovals,
  readApprovalAsset,
  reopenApproved,
  submitForApproval,
} from '@/modules/approvals/service';
import { resetDatabase, world, type World } from '../helpers/db';

let w: World;
let dir: string;
let storage: LocalStorageDriver;
let A: string, B: string;
type Actor = Awaited<ReturnType<World['actor']>>;
let owner: Actor, ownerB: Actor, writer: Actor, viewer: Actor;
let client1: Actor, client2: Actor, approver: Actor, scopedInternal: Actor;
let clientA1: string, clientA2: string;
const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e) => (e as { code: string }).code,
  );
const png = (seed: string) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(seed.padEnd(40, '.')),
  ]);

async function ready(
  title: string,
  clientId = clientA1,
  body: Record<string, unknown> = { caption: 'Legenda pronta' },
) {
  const c = await createContent(w.db, owner.ctx, {
    clientId,
    title,
    format: 'static_post',
  } as never);
  await saveDraft(w.db, owner.ctx, c.id, 0, normalizeBody(body));
  await changeContentStatus(w.db, owner.ctx, c.id, 'in_production');
  await changeContentStatus(w.db, owner.ctx, c.id, 'internal_review');
  return c.id;
}
const status = async (id: string) =>
  (await w.db.select().from(contents).where(eq(contents.id, id)))[0]!.status;

beforeAll(async () => {
  await resetDatabase();
  dir = await mkdtemp(path.join(os.tmpdir(), 'socialos-appr-'));
  storage = new LocalStorageDriver(dir);
  w = world();
  A = await w.org('Agência A');
  B = await w.org('Agência B');
  owner = await w.actor(A, 'owner');
  ownerB = await w.actor(B, 'owner');
  writer = await w.actor(A, 'writer');
  viewer = await w.actor(A, 'viewer');
  clientA1 = (await createClient(w.db, owner.ctx, { name: 'Cliente A1' })).id;
  clientA2 = (await createClient(w.db, owner.ctx, { name: 'Cliente A2' })).id;
  client1 = await w.actor(A, 'client', { clientId: clientA1 });
  client2 = await w.actor(A, 'client', { clientId: clientA2 });
  approver = await w.actor(A, 'external_approver', { clientId: clientA1 });
  scopedInternal = await w.actor(A, 'social_media', { clientId: clientA1 });
});
afterAll(async () => {
  await w.close();
  await rm(dir, { recursive: true, force: true });
});

describe('envio para aprovação', () => {
  it('congela versão e arquivos, muda a situação, notifica aprovadores e bloqueia a edição', async () => {
    const id = await ready('Post para aprovar');
    const asset = await uploadAsset(
      w.db,
      storage,
      owner.ctx,
      { clientId: clientA1, file: { name: 'arte.png', data: png('arte') } } as never,
      { maxBytes: 1e6 },
    );
    await linkAsset(w.db, owner.ctx, id, asset.id, 'cover');
    const { id: apId } = await submitForApproval(w.db, owner.ctx, id, 'Segue para sua análise');
    expect(await status(id)).toBe('awaiting_client');
    const ap = await getApproval(w.db, owner.ctx, apId);
    expect(ap).toMatchObject({
      status: 'pending',
      round: 1,
      versionNumber: 1,
      message: 'Segue para sua análise',
    });
    expect(ap.assets.map((a) => a.name)).toEqual(['arte.png']);
    const n = await w.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, client1.userId));
    expect(n.some((x) => x.type === 'approval_requested')).toBe(true);
    // edição bloqueada enquanto aguarda
    expect(await code(saveDraft(w.db, owner.ctx, id, 1, normalizeBody({ caption: 'mudou' })))).toBe(
      'CONFLICT',
    );
    // segundo envio é recusado
    expect(await code(submitForApproval(w.db, owner.ctx, id))).toBe('CONFLICT');
  });

  it('valida: texto vazio, sem aprovador, situação inadequada, permissão e isolamento', async () => {
    const empty = await ready('Sem texto', clientA1, { productionNotes: 'só interno' });
    expect(await code(submitForApproval(w.db, owner.ctx, empty))).toBe('VALIDATION');
    const noApprover = await createClient(w.db, owner.ctx, { name: 'Cliente sem aprovador' });
    const c2 = await ready('Sem aprovador', noApprover.id);
    expect(await code(submitForApproval(w.db, owner.ctx, c2))).toBe('VALIDATION');
    const draft = await createContent(w.db, owner.ctx, {
      clientId: clientA1,
      title: 'Ainda rascunho',
      format: 'text',
    } as never);
    expect(await code(submitForApproval(w.db, owner.ctx, draft.id))).toBe('CONFLICT');
    const ok = await ready('Permissões do envio');
    expect(await code(submitForApproval(w.db, writer.ctx, ok))).toBe('FORBIDDEN'); // writer sem contents:approve
    expect(await code(submitForApproval(w.db, viewer.ctx, ok))).toBe('FORBIDDEN');
    expect(await code(submitForApproval(w.db, client1.ctx, ok))).toBe('NOT_FOUND'); // cliente nem enxerga
    expect(await code(submitForApproval(w.db, ownerB.ctx, ok))).toBe('NOT_FOUND');
  });
});

describe('decisão do cliente', () => {
  it('aprovar muda para aprovado, registra decisor e notifica a equipe; decisão é única', async () => {
    const id = await ready('Para aprovar de fato');
    const { id: apId } = await submitForApproval(w.db, owner.ctx, id);
    expect(await code(decide(w.db, owner.ctx, apId, 'approved'))).toBe('FORBIDDEN'); // equipe não decide pelo cliente
    expect(await code(decide(w.db, client2.ctx, apId, 'approved'))).toBe('NOT_FOUND'); // outro cliente
    expect(await code(decide(w.db, ownerB.ctx, apId, 'approved'))).toBe('NOT_FOUND');
    await decide(w.db, client1.ctx, apId, 'approved', 'Perfeito!');
    expect(await status(id)).toBe('approved');
    const ap = await getApproval(w.db, owner.ctx, apId);
    expect(ap).toMatchObject({ status: 'approved', decisionComment: 'Perfeito!' });
    expect(ap.decidedByName).toBeTruthy();
    expect(await code(decide(w.db, client1.ctx, apId, 'changes_requested', 'tarde demais'))).toBe(
      'CONFLICT',
    );
    const n = await w.db.select().from(notifications).where(eq(notifications.userId, owner.userId));
    expect(n.some((x) => x.type === 'approval_decided')).toBe(true);
  });

  it('dois cliques simultâneos: só uma decisão vale', async () => {
    const id = await ready('Corrida de decisões');
    const { id: apId } = await submitForApproval(w.db, owner.ctx, id);
    const res = await Promise.allSettled([
      decide(w.db, client1.ctx, apId, 'approved'),
      decide(w.db, approver.ctx, apId, 'changes_requested', 'Ajustar o texto'),
    ]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [row] = await w.db.select().from(approvals).where(eq(approvals.id, apId));
    expect(['approved', 'changes_requested']).toContain(row!.status);
    expect(await status(id)).toBe(row!.status);
  });

  it('ajustes exigem comentário; nova rodada depois de ajustar; histórico preserva rodadas', async () => {
    const id = await ready('Com ajustes');
    const { id: r1 } = await submitForApproval(w.db, owner.ctx, id);
    expect(await code(decide(w.db, client1.ctx, r1, 'changes_requested'))).toBe('VALIDATION');
    expect(await code(decide(w.db, client1.ctx, r1, 'changes_requested', ' '))).toBe('VALIDATION');
    await decide(w.db, client1.ctx, r1, 'changes_requested', 'Trocar o gancho');
    expect(await status(id)).toBe('changes_requested');
    // com ajustes pedidos o editor volta a aceitar edição
    await saveDraft(w.db, owner.ctx, id, 1, normalizeBody({ caption: 'Novo gancho aplicado' }));
    const { id: r2 } = await submitForApproval(w.db, owner.ctx, id, 'Ajuste feito');
    const ap2 = await getApproval(w.db, client1.ctx, r2);
    expect(ap2.round).toBe(2);
    expect(ap2.versionNumber).toBe(2);
    expect(ap2.rounds.map((r) => [r.round, r.status])).toEqual([
      [2, 'pending'],
      [1, 'changes_requested'],
    ]);
    // a versão da rodada 1 permanece intacta
    expect((await getApproval(w.db, client1.ctx, r1)).body.caption).toBe('Legenda pronta');
    expect(ap2.body.caption).toBe('Novo gancho aplicado');
  });

  it('cancelar devolve à revisão interna; reabrir aprovado substitui a aprovação', async () => {
    const id = await ready('Cancelar e reabrir');
    const { id: r1 } = await submitForApproval(w.db, owner.ctx, id);
    expect(await code(cancelApproval(w.db, client1.ctx, r1))).toBe('FORBIDDEN');
    await cancelApproval(w.db, owner.ctx, r1);
    expect(await status(id)).toBe('internal_review');
    expect(await code(decide(w.db, client1.ctx, r1, 'approved'))).toBe('NOT_FOUND'); // cancelada some para o cliente
    const { id: r2 } = await submitForApproval(w.db, owner.ctx, id);
    await decide(w.db, client1.ctx, r2, 'approved');
    expect(await code(reopenApproved(w.db, writer.ctx, id))).toBe('FORBIDDEN');
    await reopenApproved(w.db, owner.ctx, id);
    expect(await status(id)).toBe('in_production');
    expect((await listContentApprovals(w.db, owner.ctx, id)).find((a) => a.id === r2)!.status).toBe(
      'superseded',
    );
    expect(await code(reopenApproved(w.db, owner.ctx, id))).toBe('CONFLICT');
  });
});

describe('o que o cliente enxerga', () => {
  it('só campos voltados ao cliente, sem notas internas; arquivos só os congelados', async () => {
    const id = await ready('Visão do cliente', clientA1, {
      caption: 'Legenda visível',
      productionNotes: 'NOTA-INTERNA-PRODUCAO',
      publishNotes: 'NOTA-INTERNA-PUBLICACAO',
      references: 'FONTE-INTERNA',
    });
    const a1 = await uploadAsset(
      w.db,
      storage,
      owner.ctx,
      { clientId: clientA1, file: { name: 'congelado.png', data: png('congelado') } } as never,
      { maxBytes: 1e6 },
    );
    const a2 = await uploadAsset(
      w.db,
      storage,
      owner.ctx,
      { clientId: clientA1, file: { name: 'interno.png', data: png('interno') } } as never,
      { maxBytes: 1e6 },
    );
    await linkAsset(w.db, owner.ctx, id, a1.id);
    const { id: apId } = await submitForApproval(w.db, owner.ctx, id);
    await linkAsset(w.db, owner.ctx, id, a2.id).catch(() => undefined); // vínculo posterior não entra na rodada
    const view = await getApproval(w.db, client1.ctx, apId);
    expect(JSON.stringify(view)).not.toMatch(/NOTA-INTERNA|FONTE-INTERNA/);
    expect(view.body.caption).toBe('Legenda visível');
    expect(view.assets.map((a) => a.name)).toEqual(['congelado.png']);
    expect((await readApprovalAsset(w.db, storage, client1.ctx, apId, a1.id)).mime).toBe(
      'image/png',
    );
    expect(await code(readApprovalAsset(w.db, storage, client1.ctx, apId, a2.id))).toBe(
      'NOT_FOUND',
    );
    expect(await code(readApprovalAsset(w.db, storage, client2.ctx, apId, a1.id))).toBe(
      'NOT_FOUND',
    );
    // a visão interna inclui as notas
    expect(JSON.stringify(await getApproval(w.db, owner.ctx, apId))).toContain(
      'NOTA-INTERNA-PRODUCAO',
    );
  });

  it('listagem respeita organização, cliente e escopo', async () => {
    const mine = await listApprovals(w.db, client1.ctx);
    expect(mine.items.length).toBeGreaterThan(0);
    expect(mine.items.every((i) => i.clientId === clientA1)).toBe(true);
    expect(mine.items.every((i) => i.status !== 'cancelled')).toBe(true);
    expect((await listApprovals(w.db, client2.ctx)).items).toHaveLength(0);
    expect((await listApprovals(w.db, ownerB.ctx)).items).toHaveLength(0);
    expect(
      (await listApprovals(w.db, scopedInternal.ctx)).items.every((i) => i.clientId === clientA1),
    ).toBe(true);
    const all = await listApprovals(w.db, owner.ctx, { limit: 2 });
    expect(all.items).toHaveLength(2);
    expect(all.nextBefore).not.toBeNull();
    const pend = await listApprovals(w.db, owner.ctx, { status: 'pending' });
    expect(pend.items.every((i) => i.status === 'pending')).toBe(true);
  });

  it('comentários nos dois sentidos, com notificação, e isolamento', async () => {
    const id = await ready('Conversa na aprovação');
    const { id: apId } = await submitForApproval(w.db, owner.ctx, id);
    await addApprovalComment(w.db, client1.ctx, apId, 'Pode trocar a cor da arte?');
    await addApprovalComment(w.db, owner.ctx, apId, 'Claro, ajustamos.');
    const ap = await getApproval(w.db, client1.ctx, apId);
    expect(ap.comments.map((c) => c.fromClient)).toEqual([true, false]);
    const n = await w.db.select().from(notifications).where(eq(notifications.userId, owner.userId));
    expect(n.some((x) => x.type === 'approval_comment')).toBe(true);
    expect(await code(addApprovalComment(w.db, client2.ctx, apId, 'intruso'))).toBe('NOT_FOUND');
    expect(await code(addApprovalComment(w.db, ownerB.ctx, apId, 'intruso'))).toBe('NOT_FOUND');
  });
});
