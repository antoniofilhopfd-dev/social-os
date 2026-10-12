import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { aiUsage, auditLogs, contentVersions, integrationConnections } from '@/db/schema';
import { createClient, updateClient } from '@/modules/clients/service';
import { changeContentStatus, createContent } from '@/modules/contents/service';
import { getEditor, saveDraft, saveVersion } from '@/modules/editor/service';
import { normalizeBody } from '@/modules/editor/rules';
import { suggest, LIMITS } from '@/modules/ai/service';
import {
  aiAvailableFor,
  getAiConnection,
  removeAiConnection,
  saveAiConnection,
  testAiConnection,
} from '@/modules/integrations/service';
import { okMessage, startFakeAnthropic } from '../helpers/fake-anthropic';
import { resetDatabase, world, type World } from '../helpers/db';

let w: World;
let A: string, B: string;
type Actor = Awaited<ReturnType<World['actor']>>;
let owner: Actor, ownerB: Actor, manager: Actor, writer: Actor, viewer: Actor, client1: Actor;
let clientA1: string;
let srv: Awaited<ReturnType<typeof startFakeAnthropic>>;
const KEY = 'sk-ant-api03-chave-de-teste-super-secreta-ABCD';
const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e) => (e as { code: string }).code,
  );

beforeAll(async () => {
  await resetDatabase();
  srv = await startFakeAnthropic(() => ({
    body: okMessage({
      options: ['Legenda sugerida 1', 'Legenda sugerida 2'],
      notes: ['Confirmar preço'],
    }),
  }));
  process.env.ANTHROPIC_BASE_URL = srv.url;
  w = world();
  A = await w.org('Agência A');
  B = await w.org('Agência B');
  owner = await w.actor(A, 'owner');
  ownerB = await w.actor(B, 'owner');
  manager = await w.actor(A, 'manager');
  writer = await w.actor(A, 'writer');
  viewer = await w.actor(A, 'viewer');
  clientA1 = (await createClient(w.db, owner.ctx, { name: 'Cliente A1' })).id;
  await createClient(w.db, owner.ctx, { name: 'Cliente A2 SEGREDO-DO-OUTRO-CLIENTE' });
  await updateClient(w.db, owner.ctx, clientA1, {
    toneOfVoice: 'Tom acolhedor e direto',
    forbiddenTopics: 'política',
  } as never);
  client1 = await w.actor(A, 'client', { clientId: clientA1 });
});
afterAll(async () => {
  delete process.env.ANTHROPIC_BASE_URL;
  await srv.close();
  await w.close();
});

async function content(title: string, clientId = clientA1) {
  const c = await createContent(w.db, owner.ctx, {
    clientId,
    title,
    format: 'static_post',
    brief: 'Briefing visível à IA',
  } as never);
  await saveDraft(
    w.db,
    owner.ctx,
    c.id,
    0,
    normalizeBody({
      caption: 'Texto atual',
      productionNotes: 'NOTA-INTERNA-PRODUCAO',
      publishNotes: 'NOTA-INTERNA-PUBLICACAO',
      references: 'FONTE-INTERNA',
    }),
  );
  return c.id;
}

describe('conexão com a IA', () => {
  it('sem conexão, nada é gerado e o assistente não é oferecido', async () => {
    expect(await aiAvailableFor(w.db, A)).toBe(false);
    const id = await content('Sem conexão');
    expect(await code(suggest(w.db, owner.ctx, id, { task: 'caption' }))).toBe('CONFLICT');
    expect(srv.calls).toHaveLength(0);
    expect((await getAiConnection(w.db, owner.ctx)).configured).toBe(false);
  });

  it('chave é guardada cifrada, nunca devolvida; só administradores configuram; auditoria sem a chave', async () => {
    expect(
      await code(saveAiConnection(w.db, manager.ctx, { apiKey: KEY, model: 'claude-sonnet-5-5' })),
    ).toBe('FORBIDDEN');
    expect(
      await code(saveAiConnection(w.db, writer.ctx, { apiKey: KEY, model: 'claude-sonnet-5-5' })),
    ).toBe('FORBIDDEN');
    expect(
      await code(
        saveAiConnection(w.db, owner.ctx, { apiKey: 'curta', model: 'claude-sonnet-5-5' }),
      ),
    ).toBe('VALIDATION');
    expect(await code(saveAiConnection(w.db, owner.ctx, { model: 'claude-sonnet-5-5' }))).toBe(
      'VALIDATION',
    ); // primeira vez exige chave
    expect(
      await code(saveAiConnection(w.db, owner.ctx, { apiKey: KEY, model: 'modelo-inexistente' })),
    ).toBe('VALIDATION');
    await saveAiConnection(w.db, owner.ctx, { apiKey: KEY, model: 'claude-haiku-5-5' });
    const [row] = await w.db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.organizationId, A));
    expect(row!.secretEnc).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain('chave-de-teste');
    expect(row!.secretHint).toBe('…ABCD');
    const view = await getAiConnection(w.db, owner.ctx);
    expect(JSON.stringify(view)).not.toContain('chave-de-teste');
    expect(view).toMatchObject({
      configured: true,
      secretHint: '…ABCD',
      model: 'claude-haiku-5-5',
      canManage: true,
    });
    // trocar só o modelo mantém a chave
    await saveAiConnection(w.db, owner.ctx, { model: 'claude-sonnet-5-5' });
    expect((await getAiConnection(w.db, owner.ctx)).secretHint).toBe('…ABCD');
    const logs = JSON.stringify(
      await w.db.select().from(auditLogs).where(eq(auditLogs.organizationId, A)),
    );
    expect(logs).toContain('integration.created');
    expect(logs).not.toContain('chave-de-teste');
    // outra organização não vê nem usa
    expect((await getAiConnection(w.db, ownerB.ctx)).configured).toBe(false);
    expect(await aiAvailableFor(w.db, B)).toBe(false);
    expect(await aiAvailableFor(w.db, A)).toBe(true);
    // equipe sem integrations:view não consulta o estado detalhado
    expect(await code(getAiConnection(w.db, writer.ctx))).toBe('FORBIDDEN');
  });

  it('teste de conexão chama o serviço com a chave e registra o resultado; erro vira status', async () => {
    const before = srv.calls.length;
    await testAiConnection(w.db, owner.ctx);
    expect(srv.calls.length).toBe(before + 1);
    expect(srv.calls.at(-1)!.headers['x-api-key']).toBe(KEY);
    expect((await getAiConnection(w.db, owner.ctx)).lastCheckedAt).not.toBeNull();
    const bad = await startFakeAnthropic(() => ({ status: 401, body: { error: {} } }));
    process.env.ANTHROPIC_BASE_URL = bad.url;
    expect(await code(testAiConnection(w.db, owner.ctx))).toBe('UPSTREAM');
    expect(await getAiConnection(w.db, owner.ctx)).toMatchObject({
      status: 'error',
      lastError: expect.stringContaining('recusada'),
    });
    await bad.close();
    process.env.ANTHROPIC_BASE_URL = srv.url;
    await testAiConnection(w.db, owner.ctx);
    expect((await getAiConnection(w.db, owner.ctx)).status).toBe('active');
  });
});

describe('sugestões de IA', () => {
  it('devolve opções para revisão, registra uso e envia só contexto autorizado', async () => {
    const id = await content('Post com IA');
    srv.calls.length = 0;
    const r = await suggest(w.db, writer.ctx, id, { task: 'caption', instruction: 'mais curto' });
    expect(r.options).toEqual(['Legenda sugerida 1', 'Legenda sugerida 2']);
    expect(r.notes).toEqual(['Confirmar preço']);
    const sent = JSON.stringify(srv.calls[0]!.body);
    expect(sent).toContain('Briefing visível à IA');
    expect(sent).toContain('Tom acolhedor e direto');
    expect(sent).toContain('Texto atual');
    // nada interno nem de outro cliente
    expect(sent).not.toMatch(/NOTA-INTERNA|FONTE-INTERNA|SEGREDO-DO-OUTRO-CLIENTE/);
    expect(sent).not.toContain(KEY);
    const [u] = await w.db.select().from(aiUsage).where(eq(aiUsage.contentId, id));
    expect(u).toMatchObject({
      task: 'caption',
      status: 'ok',
      inputTokens: 321,
      outputTokens: 87,
      userId: writer.userId,
    });
    // o texto gerado/enviado não vai para a auditoria
    const logs = JSON.stringify(
      await w.db.select().from(auditLogs).where(eq(auditLogs.action, 'ai.generated')),
    );
    expect(logs).toContain('caption');
    expect(logs).not.toContain('Legenda sugerida');
    expect(logs).not.toContain('Texto atual');
    // nada foi salvo no rascunho
    expect((await getEditor(w.db, owner.ctx, id)).draft.body.caption).toBe('Texto atual');
  });

  it('permissões, isolamento, situação do conteúdo e tarefa inválida', async () => {
    const id = await content('Permissões da IA');
    expect(await code(suggest(w.db, viewer.ctx, id, { task: 'caption' }))).toBe('FORBIDDEN');
    expect(await code(suggest(w.db, client1.ctx, id, { task: 'caption' }))).toBe('NOT_FOUND'); // rascunho invisível ao cliente
    expect(await code(suggest(w.db, ownerB.ctx, id, { task: 'caption' }))).toBe('NOT_FOUND');
    expect(await code(suggest(w.db, owner.ctx, id, { task: 'reels_script' as never }))).toBe(
      'VALIDATION',
    );
    await changeContentStatus(w.db, owner.ctx, id, 'in_production');
    await w.db
      .update((await import('@/db/schema')).contents)
      .set({ status: 'approved' })
      .where(eq((await import('@/db/schema')).contents.id, id));
    expect(await code(suggest(w.db, owner.ctx, id, { task: 'caption' }))).toBe('CONFLICT');
  });

  it('erro do serviço não grava nada e conta no limite; limites por pessoa e por hora', async () => {
    const id = await content('Limites');
    const bad = await startFakeAnthropic(() => ({ status: 500, body: {} }));
    process.env.ANTHROPIC_BASE_URL = bad.url;
    expect(await code(suggest(w.db, owner.ctx, id, { task: 'hashtags' }))).toBe('UPSTREAM');
    const errs = await w.db.select().from(aiUsage).where(eq(aiUsage.status, 'error'));
    expect(errs.length).toBeGreaterThan(0);
    await bad.close();
    process.env.ANTHROPIC_BASE_URL = srv.url;
    const t0 = new Date();
    const results: string[] = [];
    for (let i = 0; i < LIMITS.perUserHour + 2; i++)
      results.push(await code(suggest(w.db, manager.ctx, id, { task: 'cta' }, { now: t0 })));
    expect(results.filter((r) => r === 'ok')).toHaveLength(LIMITS.perUserHour);
    expect(results.at(-1)).toBe('RATE_LIMITED');
  });

  it('versão marcada como assistida por IA; remover a conexão desliga o assistente', async () => {
    const id = await content('Versão assistida');
    const v = await saveVersion(w.db, owner.ctx, id, 'Com ajuda da IA', { aiAssisted: true });
    const [row] = await w.db.select().from(contentVersions).where(eq(contentVersions.id, v.id));
    expect(row!.source).toBe('ai_assisted');
    await removeAiConnection(w.db, owner.ctx);
    expect(await aiAvailableFor(w.db, A)).toBe(false);
    expect(await code(suggest(w.db, owner.ctx, id, { task: 'caption' }))).toBe('CONFLICT');
  });
});
