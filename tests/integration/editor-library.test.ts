import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { assets, contentAssets, contents, organizations } from '@/db/schema';
import { LocalStorageDriver } from '@/integrations/storage/local';
import { createClient } from '@/modules/clients/service';
import { createBrand } from '@/modules/clients/children';
import { changeContentStatus, createContent } from '@/modules/contents/service';
import {
  compareVersions,
  createTemplate,
  deleteBlock,
  deleteTemplate,
  getEditor,
  getVersion,
  listBlocks,
  listTemplates,
  listVersions,
  restoreVersion,
  saveBlock,
  saveDraft,
  saveVersion,
} from '@/modules/editor/service';
import { normalizeBody } from '@/modules/editor/rules';
import {
  createFolder,
  deleteFolder,
  getAsset,
  linkAsset,
  listAssets,
  listContentAssets,
  listFolders,
  purgeAsset,
  purgeExpiredAssets,
  readAssetFile,
  restoreAsset,
  setFavorite,
  storageUsage,
  trashAsset,
  unlinkAsset,
  updateAsset,
  uploadAsset,
  uploadAssetVersion,
} from '@/modules/library/service';
import { resetDatabase, world, type World } from '../helpers/db';

let w: World;
let dir: string;
let storage: LocalStorageDriver;
let A: string, B: string;
let owner: Awaited<ReturnType<World['actor']>>,
  ownerB: Awaited<ReturnType<World['actor']>>,
  writer: Awaited<ReturnType<World['actor']>>;
let designer: Awaited<ReturnType<World['actor']>>,
  viewer: Awaited<ReturnType<World['actor']>>,
  scoped: Awaited<ReturnType<World['actor']>>,
  ext: Awaited<ReturnType<World['actor']>>;
let clientA1: string, clientA2: string, clientB1: string;
const MAX = 5 * 1024 * 1024;
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
const png = (seed: string) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(seed.padEnd(40, '.')),
  ]);
const mp4 = (seed: string) =>
  Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from('ftypisom'),
    Buffer.from(seed.padEnd(40, '.')),
  ]);
const upload = (
  ctx = owner.ctx,
  over: Record<string, unknown> = {},
  seed = Math.random().toString(36),
) =>
  uploadAsset(
    w.db,
    storage,
    ctx,
    { clientId: clientA1, file: { name: 'foto.png', data: png(seed) }, ...over } as never,
    { maxBytes: MAX },
  );
const mk = (clientId: string, title: string, over: Record<string, unknown> = {}) =>
  createContent(w.db, owner.ctx, { clientId, title, format: 'carousel', ...over } as never);

beforeAll(async () => {
  await resetDatabase();
  dir = await mkdtemp(path.join(os.tmpdir(), 'socialos-lib-'));
  storage = new LocalStorageDriver(dir);
  w = world();
  A = await w.org('Agência A');
  B = await w.org('Agência B');
  owner = await w.actor(A, 'owner');
  ownerB = await w.actor(B, 'owner');
  writer = await w.actor(A, 'writer');
  designer = await w.actor(A, 'designer');
  viewer = await w.actor(A, 'viewer');
  clientA1 = (await createClient(w.db, owner.ctx, { name: 'Cliente A1' })).id;
  clientA2 = (await createClient(w.db, owner.ctx, { name: 'Cliente A2' })).id;
  clientB1 = (await createClient(w.db, ownerB.ctx, { name: 'Cliente B1' })).id;
  scoped = await w.actor(A, 'designer', { clientId: clientA1 });
  ext = await w.actor(A, 'client', { clientId: clientA1 });
});
afterAll(async () => {
  await w.close();
  await rm(dir, { recursive: true, force: true });
});

describe('editor: rascunho e concorrência', () => {
  it('autosave com controle de revisão; revisão antiga é recusada', async () => {
    const c = await mk(clientA1, 'Editor rascunho');
    expect((await getEditor(w.db, owner.ctx, c.id)).draft.revision).toBe(0);
    const r1 = await saveDraft(w.db, owner.ctx, c.id, 0, normalizeBody({ caption: 'Primeira' }));
    expect(r1.revision).toBe(1);
    const r2 = await saveDraft(w.db, owner.ctx, c.id, 1, normalizeBody({ caption: 'Segunda' }));
    expect(r2.revision).toBe(2);
    expect(
      await code(saveDraft(w.db, owner.ctx, c.id, 1, normalizeBody({ caption: 'Sobrescrita' }))),
    ).toBe('CONFLICT');
    expect(await details(saveDraft(w.db, owner.ctx, c.id, 1, normalizeBody({})))).toMatchObject({
      revision: ['2'],
    });
    expect((await getEditor(w.db, owner.ctx, c.id)).draft.body.caption).toBe('Segunda');
    expect(await code(saveDraft(w.db, owner.ctx, c.id, 9, normalizeBody({})))).toBe('CONFLICT');
  });

  it('duas pessoas salvando ao mesmo tempo: só uma vence, nada é perdido em silêncio', async () => {
    const c = await mk(clientA1, 'Editor concorrência');
    await saveDraft(w.db, owner.ctx, c.id, 0, normalizeBody({ caption: 'base' }));
    const res = await Promise.allSettled([
      saveDraft(w.db, owner.ctx, c.id, 1, normalizeBody({ caption: 'da dona' })),
      saveDraft(w.db, designer.ctx, c.id, 1, normalizeBody({ caption: 'do designer' })),
    ]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(res.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await getEditor(w.db, owner.ctx, c.id)).draft.revision).toBe(2);
  });

  it('alertas por formato e limites da rede aparecem; "alterações não versionadas" é refletido', async () => {
    const c = await mk(clientA1, 'Editor alertas', { format: 'reels' });
    const e0 = await getEditor(w.db, owner.ctx, c.id);
    expect(e0.warnings.missing).toEqual(['Gancho inicial', 'Roteiro', 'Legenda']);
    await saveDraft(
      w.db,
      owner.ctx,
      c.id,
      0,
      normalizeBody({ hook: 'a', script: 'b', caption: 'c' }),
    );
    const e1 = await getEditor(w.db, owner.ctx, c.id);
    expect(e1.warnings.missing).toEqual([]);
    expect(e1.unsavedChanges).toBe(true);
    await saveVersion(w.db, owner.ctx, c.id, 'Primeira');
    expect((await getEditor(w.db, owner.ctx, c.id)).unsavedChanges).toBe(false);
  });
});

describe('editor: versões imutáveis, comparação e restauração', () => {
  it('numera, impede versão idêntica, compara e restaura sem alterar o histórico', async () => {
    const c = await mk(clientA1, 'Editor versões');
    expect(await code(saveVersion(w.db, owner.ctx, c.id))).toBe('CONFLICT'); // sem rascunho
    await saveDraft(w.db, owner.ctx, c.id, 0, normalizeBody({ caption: 'Compre agora a coleção' }));
    const v1 = await saveVersion(w.db, owner.ctx, c.id, 'Primeira versão');
    expect(v1.number).toBe(1);
    expect(await code(saveVersion(w.db, owner.ctx, c.id))).toBe('CONFLICT'); // sem alterações
    await saveDraft(
      w.db,
      owner.ctx,
      c.id,
      1,
      normalizeBody({ caption: 'Compre hoje a nova coleção', cta: 'Clique no link' }),
    );
    expect((await saveVersion(w.db, owner.ctx, c.id)).number).toBe(2);
    expect((await listVersions(w.db, owner.ctx, c.id)).map((v) => v.number)).toEqual([2, 1]);
    const cmp = await compareVersions(w.db, owner.ctx, c.id, 1, 2);
    expect(cmp.diffs.map((d) => d.field)).toEqual(['caption', 'cta']);
    expect(cmp.diffs[0]!.ops.some((o) => o.type === 'del' && o.text.includes('agora'))).toBe(true);
    await restoreVersion(w.db, owner.ctx, c.id, 1, 2);
    const ed = await getEditor(w.db, owner.ctx, c.id);
    expect(ed.draft.body.caption).toBe('Compre agora a coleção');
    expect(ed.draft.body.cta).toBe('');
    expect((await getVersion(w.db, owner.ctx, c.id, 2)).body.caption).toBe(
      'Compre hoje a nova coleção',
    ); // v2 intacta
    expect((await listVersions(w.db, owner.ctx, c.id)).map((v) => v.number)).toEqual([2, 1]);
    expect(await code(restoreVersion(w.db, owner.ctx, c.id, 1, 1))).toBe('CONFLICT'); // revisão desatualizada
    expect(await code(restoreVersion(w.db, owner.ctx, c.id, 99, ed.draft.revision))).toBe(
      'NOT_FOUND',
    );
  });

  it('versões simultâneas não repetem número', async () => {
    const c = await mk(clientA1, 'Editor versões paralelas');
    await saveDraft(w.db, owner.ctx, c.id, 0, normalizeBody({ caption: 'x' }));
    const res = await Promise.allSettled([
      saveVersion(w.db, owner.ctx, c.id),
      saveVersion(w.db, owner.ctx, c.id),
    ]);
    const nums = (await listVersions(w.db, owner.ctx, c.id)).map((v) => v.number);
    expect(new Set(nums).size).toBe(nums.length);
    expect(res.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
  });

  it('conteúdo publicado/arquivado não aceita edição', async () => {
    const c = await mk(clientA1, 'Editor bloqueado');
    await saveDraft(w.db, owner.ctx, c.id, 0, normalizeBody({ caption: 'ok' }));
    await w.db.update(contents).set({ status: 'published' }).where(eq(contents.id, c.id));
    expect(
      await code(saveDraft(w.db, owner.ctx, c.id, 1, normalizeBody({ caption: 'novo' }))),
    ).toBe('CONFLICT');
    expect(await code(saveVersion(w.db, owner.ctx, c.id))).toBe('CONFLICT');
    expect((await getEditor(w.db, owner.ctx, c.id)).canEdit).toBe(false);
    const d = await mk(clientA1, 'Editor arquivado');
    await changeContentStatus(w.db, owner.ctx, d.id, 'archived');
    expect(await code(saveDraft(w.db, owner.ctx, d.id, 0, normalizeBody({})))).toBe('CONFLICT');
  });

  it('permissões e isolamento do editor', async () => {
    const c = await mk(clientA1, 'Editor permissões');
    await saveDraft(w.db, owner.ctx, c.id, 0, normalizeBody({ caption: 'privado' }));
    expect(await code(getEditor(w.db, viewer.ctx, c.id))).toBe('ok'); // consulta lê
    expect(await code(saveDraft(w.db, viewer.ctx, c.id, 1, normalizeBody({})))).toBe('FORBIDDEN');
    expect(await code(saveVersion(w.db, viewer.ctx, c.id))).toBe('FORBIDDEN');
    expect(
      await code(saveDraft(w.db, designer.ctx, c.id, 1, normalizeBody({ caption: 'designer' }))),
    ).toBe('ok');
    await w.db.update(contents).set({ status: 'awaiting_client' }).where(eq(contents.id, c.id));
    expect(await code(getEditor(w.db, ext.ctx, c.id))).toBe('FORBIDDEN'); // externo nunca vê o editor
    expect(await code(listVersions(w.db, ext.ctx, c.id))).toBe('NOT_FOUND');
    const a2 = await mk(clientA2, 'Editor outro cliente');
    expect(await code(getEditor(w.db, scoped.ctx, a2.id))).toBe('NOT_FOUND');
    for (const fn of [
      () => getEditor(w.db, ownerB.ctx, c.id),
      () => saveDraft(w.db, ownerB.ctx, c.id, 1, normalizeBody({})),
      () => saveVersion(w.db, ownerB.ctx, c.id),
      () => listVersions(w.db, ownerB.ctx, c.id),
      () => getVersion(w.db, ownerB.ctx, c.id, 1),
      () => compareVersions(w.db, ownerB.ctx, c.id, 1, 1),
      () => restoreVersion(w.db, ownerB.ctx, c.id, 1, 1),
    ])
      expect(await code(fn())).toBe('NOT_FOUND');
    expect((await getEditor(w.db, owner.ctx, c.id)).draft.body.caption).toBe('designer');
  });
});

describe('blocos e modelos', () => {
  it('blocos: escopo por cliente, criação por permissão e exclusão pelo autor ou administrador', async () => {
    const org = await saveBlock(w.db, writer.ctx, null, {
      name: 'CTA padrão',
      kind: 'cta',
      text: 'Saiba mais no link da bio',
    });
    const cl = await saveBlock(w.db, owner.ctx, null, {
      name: 'Bloco do A2',
      kind: 'hashtags',
      text: '#a2',
      clientId: clientA2,
    });
    expect((await listBlocks(w.db, owner.ctx)).map((b) => b.name)).toEqual(
      expect.arrayContaining(['CTA padrão', 'Bloco do A2']),
    );
    expect((await listBlocks(w.db, scoped.ctx)).map((b) => b.name)).toEqual(['CTA padrão']); // não vê bloco de outro cliente
    expect(
      await code(
        saveBlock(w.db, scoped.ctx, null, { name: 'Org inteira', kind: 'other', text: 'x' }),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await code(saveBlock(w.db, ext.ctx, null, { name: 'Externo', kind: 'other', text: 'x' })),
    ).toBe('FORBIDDEN');
    expect(await code(listBlocks(w.db, ext.ctx))).toBe('FORBIDDEN');
    const other = await w.actor(A, 'writer');
    expect(await code(deleteBlock(w.db, other.ctx, org.id))).toBe('FORBIDDEN');
    expect(await code(deleteBlock(w.db, writer.ctx, org.id))).toBe('ok');
    expect(await code(deleteBlock(w.db, owner.ctx, cl.id))).toBe('ok');
    expect(await code(deleteBlock(w.db, ownerB.ctx, cl.id))).toBe('NOT_FOUND');
    expect(
      await code(
        saveBlock(w.db, owner.ctx, null, {
          name: 'X',
          kind: 'other',
          text: 'x',
          clientId: clientB1,
        }),
      ),
    ).toBe('NOT_FOUND');
  });

  it('modelos: nascem do rascunho (sem checklist), filtram por formato e respeitam isolamento', async () => {
    const c = await mk(clientA1, 'Modelo origem', { format: 'reels' });
    await saveDraft(
      w.db,
      owner.ctx,
      c.id,
      0,
      normalizeBody({ hook: 'Gancho padrão', script: 'Roteiro padrão', checklist: ['ortografia'] }),
    );
    const t = await createTemplate(w.db, owner.ctx, {
      name: 'Reels institucional',
      fromContentId: c.id,
    });
    expect(
      await code(
        createTemplate(w.db, owner.ctx, { name: 'Reels institucional', fromContentId: c.id }),
      ),
    ).toBe('CONFLICT');
    const list = await listTemplates(w.db, owner.ctx, 'reels');
    expect(list.find((x) => x.id === t.id)!.body).toMatchObject({
      hook: 'Gancho padrão',
      checklist: [],
    });
    expect((await listTemplates(w.db, owner.ctx, 'carousel')).some((x) => x.id === t.id)).toBe(
      false,
    );
    expect((await listTemplates(w.db, ownerB.ctx)).some((x) => x.id === t.id)).toBe(false);
    expect(
      await code(createTemplate(w.db, ownerB.ctx, { name: 'Roubo', fromContentId: c.id })),
    ).toBe('NOT_FOUND');
    expect(await code(deleteTemplate(w.db, ownerB.ctx, t.id))).toBe('NOT_FOUND');
    expect(await code(deleteTemplate(w.db, owner.ctx, t.id))).toBe('ok');
    expect(await code(createTemplate(w.db, owner.ctx, { name: 'Sem corpo' }))).toBe('VALIDATION');
  });
});

describe('biblioteca: upload seguro', () => {
  it('guarda o arquivo fora de qualquer caminho do usuário e registra metadados e auditoria', async () => {
    const brand = (await createBrand(w.db, owner.ctx, clientA1, { name: 'Marca Lib' })).id;
    const r = await upload(owner.ctx, {
      brandId: brand,
      tags: ['#Verão', 'campanha', 'verão'],
      description: 'Foto da vitrine',
      file: { name: '../../etc/Foto Final.PNG', data: png('a') },
    });
    expect(r.duplicate).toBe(false);
    const a = await getAsset(w.db, owner.ctx, r.id);
    expect(a).toMatchObject({
      kind: 'image',
      mime: 'image/png',
      brandName: 'Marca Lib',
      description: 'Foto da vitrine',
      originalName: 'Foto Final.PNG',
      tags: ['campanha', 'verão'],
    });
    const [row] = await w.db.select().from(assets).where(eq(assets.id, r.id));
    expect(row!.storageKey).toBe(`orgs/${A}/clients/${clientA1}/${r.id}.png`);
    expect(row!.storageKey).not.toMatch(/Foto|etc/i);
    expect(await storage.exists(row!.storageKey)).toBe(true);
    expect((await readAssetFile(w.db, storage, owner.ctx, r.id)).data.equals(png('a'))).toBe(true);
  });

  it('recusa SVG, HTML, executáveis, polyglots, vazio e grande demais — e não grava nada', async () => {
    const before = (await w.db.select().from(assets)).length;
    const bad: [string, Buffer][] = [
      ['x.svg', Buffer.from('<svg onload="alert(1)"/>')],
      ['x.html', Buffer.from('<script>1</script>')],
      ['setup.exe', Buffer.from('MZ\x90\0')],
      ['shell.php', png('p')],
      ['x.bin', Buffer.alloc(100, 7)],
      ['vazio.png', Buffer.alloc(0)],
    ];
    for (const [name, data] of bad)
      expect(await details(upload(owner.ctx, { file: { name, data } })), name).toHaveProperty(
        'file',
      );
    const big = Buffer.concat([png('b'), Buffer.alloc(MAX + 1)]);
    expect(
      await details(upload(owner.ctx, { file: { name: 'grande.png', data: big } })),
    ).toHaveProperty('file');
    expect((await w.db.select().from(assets)).length).toBe(before);
  });

  it('não duplica: o mesmo arquivo no mesmo cliente devolve o existente; em outro cliente é permitido', async () => {
    const first = await upload(owner.ctx, {}, 'dedupe');
    const again = await upload(owner.ctx, {}, 'dedupe');
    expect(again).toMatchObject({ duplicate: true, id: first.id });
    expect((await upload(owner.ctx, { clientId: clientA2 }, 'dedupe')).duplicate).toBe(false);
  });

  it('respeita limite de armazenamento da organização', async () => {
    const used = (await storageUsage(w.db, owner.ctx)).usedBytes;
    await w.db.update(organizations).set({ storageLimitMb: 1 }).where(eq(organizations.id, A));
    const big = Buffer.concat([png('q'), Buffer.alloc(1024 * 1024)]);
    expect(used).toBeGreaterThan(0);
    expect(
      await details(upload(owner.ctx, { file: { name: 'quota.png', data: big } })),
    ).toHaveProperty('file');
    await w.db.update(organizations).set({ storageLimitMb: 5120 }).where(eq(organizations.id, A));
    expect(await code(upload(owner.ctx, { file: { name: 'quota.png', data: big } }))).toBe('ok');
  });

  it('permissões, escopo e isolamento de upload/leitura', async () => {
    expect(await code(upload(viewer.ctx))).toBe('FORBIDDEN'); // só consulta
    expect(await code(upload(ext.ctx))).toBe('FORBIDDEN'); // externo
    expect(await code(upload(scoped.ctx, { clientId: clientA2 }))).toBe('NOT_FOUND'); // fora do escopo
    expect(await code(upload(ownerB.ctx, { clientId: clientA1 }))).toBe('NOT_FOUND'); // outra organização
    const own = await upload(scoped.ctx);
    expect(await code(upload(designer.ctx, { brandId: '01HZZZZZZZZZZZZZZZZZZZZZZZ' }))).toBe(
      'VALIDATION',
    );
    const a2 = await upload(owner.ctx, { clientId: clientA2 });
    for (const [who, id] of [
      [scoped, a2.id],
      [ownerB, own.id],
      [ext, own.id],
    ] as const) {
      expect(await code(readAssetFile(w.db, storage, who.ctx, id))).toBe('NOT_FOUND');
      expect(await code(getAsset(w.db, who.ctx, id))).toBe('NOT_FOUND');
    }
    expect((await listAssets(w.db, ext.ctx)).items).toEqual([]);
    expect((await listAssets(w.db, ownerB.ctx, { limit: 500 })).items).toEqual([]);
    expect(
      (await listAssets(w.db, scoped.ctx, { limit: 500 })).items.every(
        (i) => i.clientId === clientA1,
      ),
    ).toBe(true);
  });
});

describe('biblioteca: organização, versões e vínculos', () => {
  it('lista, filtra por tipo/pasta/tag/busca/favoritos/sem vínculo e pagina', async () => {
    const folder = (
      await createFolder(w.db, owner.ctx, { clientId: clientA1, name: 'Campanha Verão' })
    ).id;
    const img = await upload(owner.ctx, {
      folderId: folder,
      tags: ['praia'],
      displayName: 'Banner praia',
    });
    const vid = await uploadAsset(
      w.db,
      storage,
      owner.ctx,
      {
        clientId: clientA1,
        folderId: folder,
        file: { name: 'clipe.mp4', data: mp4('v1') },
        tags: ['praia', 'reels'],
      },
      { maxBytes: MAX },
    );
    const ids = async (f: Parameters<typeof listAssets>[2]) =>
      (await listAssets(w.db, owner.ctx, f)).items.map((i) => i.id);
    expect(await ids({ folderId: folder })).toEqual(expect.arrayContaining([img.id, vid.id]));
    expect(await ids({ folderId: folder, kind: 'video' })).toEqual([vid.id]);
    expect(await ids({ q: 'banner' })).toContain(img.id);
    expect(await ids({ q: 'reels' })).toContain(vid.id); // busca em tags
    expect(await ids({ tag: 'reels' })).toEqual([vid.id]);
    expect(await ids({ q: '%' })).toEqual([]);
    await setFavorite(w.db, owner.ctx, img.id, true);
    expect(await ids({ favorites: true })).toEqual([img.id]);
    expect((await listAssets(w.db, designer.ctx, { favorites: true })).items).toEqual([]); // favoritos são por usuário
    const c = await mk(clientA1, 'Usa arquivo');
    await linkAsset(w.db, owner.ctx, c.id, img.id);
    expect(await ids({ folderId: folder, unlinked: true })).toEqual([vid.id]);
    expect((await listAssets(w.db, owner.ctx, { limit: 2 })).nextBefore).not.toBeNull();
    expect(await ids({ folderId: 'root', clientId: clientA1, limit: 500 })).not.toContain(img.id);
  });

  it('nova versão mantém metadados/tags, esconde as antigas na lista e atualiza vínculos; tipo diferente e idêntico são recusados', async () => {
    const r = await upload(owner.ctx, { tags: ['logo'], credits: 'Estúdio X' }, 'v-um');
    const c = await mk(clientA1, 'Conteúdo com logo');
    await linkAsset(w.db, owner.ctx, c.id, r.id);
    expect(
      await code(
        uploadAssetVersion(
          w.db,
          storage,
          owner.ctx,
          r.id,
          { name: 'logo.png', data: png('v-um') },
          { maxBytes: MAX },
        ),
      ),
    ).toBe('CONFLICT');
    expect(
      await code(
        uploadAssetVersion(
          w.db,
          storage,
          owner.ctx,
          r.id,
          { name: 'logo.mp4', data: mp4('x') },
          { maxBytes: MAX },
        ),
      ),
    ).toBe('VALIDATION');
    const v2 = await uploadAssetVersion(
      w.db,
      storage,
      owner.ctx,
      r.id,
      { name: 'logo-v2.png', data: png('v-dois') },
      { maxBytes: MAX },
    );
    expect(v2.version).toBe(2);
    const latest = await getAsset(w.db, owner.ctx, v2.id);
    expect(latest).toMatchObject({
      versionNumber: 2,
      isLatest: true,
      tags: ['logo'],
      credits: 'Estúdio X',
    });
    expect(latest.versions.map((v) => v.version)).toEqual([2, 1]);
    const listed = (await listAssets(w.db, owner.ctx, { tag: 'logo' })).items.map((i) => i.id);
    expect(listed).toContain(v2.id);
    expect(listed).not.toContain(r.id);
    expect((await listContentAssets(w.db, owner.ctx, c.id)).map((x) => x.id)).toEqual([v2.id]);
    expect(
      await code(
        uploadAssetVersion(
          w.db,
          storage,
          owner.ctx,
          r.id,
          { name: 'x.png', data: png('v-tres') },
          { maxBytes: MAX },
        ),
      ),
    ).toBe('CONFLICT'); // só a partir da mais recente
    expect(
      await code(
        uploadAssetVersion(
          w.db,
          storage,
          viewer.ctx,
          v2.id,
          { name: 'x.png', data: png('v-4') },
          { maxBytes: MAX },
        ),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await code(
        uploadAssetVersion(
          w.db,
          storage,
          ownerB.ctx,
          v2.id,
          { name: 'x.png', data: png('v-5') },
          { maxBytes: MAX },
        ),
      ),
    ).toBe('NOT_FOUND');
  });

  it('editar metadados vale para todas as versões; marca e pasta precisam ser do cliente', async () => {
    const r = await upload(owner.ctx, {}, 'meta');
    const v2 = await uploadAssetVersion(
      w.db,
      storage,
      owner.ctx,
      r.id,
      { name: 'a.png', data: png('meta2') },
      { maxBytes: MAX },
    );
    await updateAsset(w.db, owner.ctx, v2.id, {
      displayName: 'Nome novo',
      credits: 'Foto: Ana',
      tags: ['Novo Tag'],
    });
    expect(await getAsset(w.db, owner.ctx, r.id)).toMatchObject({
      displayName: 'Nome novo',
      credits: 'Foto: Ana',
      tags: ['novo-tag'],
    });
    const otherBrand = (await createBrand(w.db, owner.ctx, clientA2, { name: 'Marca do A2' })).id;
    expect(await code(updateAsset(w.db, owner.ctx, v2.id, { brandId: otherBrand }))).toBe(
      'VALIDATION',
    );
    expect(await code(updateAsset(w.db, viewer.ctx, v2.id, { displayName: 'x' }))).toBe(
      'FORBIDDEN',
    );
    expect(await code(updateAsset(w.db, ownerB.ctx, v2.id, { displayName: 'x' }))).toBe(
      'NOT_FOUND',
    );
    expect(
      await code(
        updateAsset(w.db, owner.ctx, v2.id, {
          tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
        }),
      ),
    ).toBe('VALIDATION');
  });

  it('vínculos: mesmo cliente, versão mais recente, sem duplicar; arquivo na lixeira é sinalizado', async () => {
    const a = await upload(owner.ctx, {}, 'link');
    const other = await upload(owner.ctx, { clientId: clientA2 }, 'link2');
    const c = await mk(clientA1, 'Vínculos');
    expect(await code(linkAsset(w.db, owner.ctx, c.id, other.id))).toBe('VALIDATION');
    await linkAsset(w.db, owner.ctx, c.id, a.id, 'cover');
    expect(await code(linkAsset(w.db, owner.ctx, c.id, a.id))).toBe('CONFLICT');
    expect(await code(linkAsset(w.db, designer.ctx, c.id, a.id))).toBe('CONFLICT');
    expect(await code(linkAsset(w.db, viewer.ctx, c.id, a.id))).toBe('FORBIDDEN');
    expect(await code(linkAsset(w.db, ownerB.ctx, c.id, a.id))).toBe('NOT_FOUND');
    expect((await getAsset(w.db, owner.ctx, a.id)).usedIn.map((u) => u.title)).toEqual([
      'Vínculos',
    ]);
    expect(await code(listContentAssets(w.db, ext.ctx, c.id))).toBe('NOT_FOUND');
    await trashAsset(w.db, owner.ctx, a.id);
    expect((await listContentAssets(w.db, owner.ctx, c.id))[0]!.trashed).toBe(true);
    await restoreAsset(w.db, owner.ctx, a.id);
    await unlinkAsset(w.db, owner.ctx, c.id, a.id);
    expect(await code(unlinkAsset(w.db, owner.ctx, c.id, a.id))).toBe('NOT_FOUND');
    const rows = await w.db.select().from(contentAssets).where(eq(contentAssets.contentId, c.id));
    expect(rows).toHaveLength(0);
  });
});

describe('biblioteca: pastas, lixeira e retenção', () => {
  it('pastas aninhadas com limite de profundidade; excluir devolve arquivos à raiz', async () => {
    let parent: string | null = null;
    for (let i = 0; i < 5; i++)
      parent = (
        await createFolder(w.db, owner.ctx, {
          clientId: clientA2,
          name: `Nível ${i}`,
          parentId: parent,
        })
      ).id;
    expect(
      await details(
        createFolder(w.db, owner.ctx, { clientId: clientA2, name: 'Nível 6', parentId: parent }),
      ),
    ).toHaveProperty('parentId');
    expect(await code(createFolder(w.db, owner.ctx, { clientId: clientA2, name: 'Nível 0' }))).toBe(
      'CONFLICT',
    );
    expect(
      await code(
        createFolder(w.db, owner.ctx, {
          clientId: clientA1,
          name: 'Filha estranha',
          parentId: parent,
        }),
      ),
    ).toBe('VALIDATION'); // pai de outro cliente
    expect(
      await code(createFolder(w.db, ownerB.ctx, { clientId: clientA2, name: 'Invasora' })),
    ).toBe('NOT_FOUND');
    expect(
      await code(createFolder(w.db, viewer.ctx, { clientId: clientA2, name: 'Sem permissão' })),
    ).toBe('FORBIDDEN');
    const f = (await createFolder(w.db, owner.ctx, { clientId: clientA2, name: 'Temporária' })).id;
    const a = await upload(owner.ctx, { clientId: clientA2, folderId: f }, 'em-pasta');
    expect(await code(deleteFolder(w.db, designer.ctx, f))).toBe('FORBIDDEN');
    expect(await code(deleteFolder(w.db, ownerB.ctx, f))).toBe('NOT_FOUND');
    await deleteFolder(w.db, owner.ctx, f);
    expect((await getAsset(w.db, owner.ctx, a.id)).folderId).toBeNull();
    expect((await listFolders(w.db, owner.ctx, clientA2)).some((x) => x.id === f)).toBe(false);
  });

  it('lixeira: só quem tem library:delete; arquivo da lixeira não é servido; exclusão definitiva só da lixeira e apaga o arquivo', async () => {
    const a = await upload(owner.ctx, {}, 'lixeira');
    const [row] = await w.db.select().from(assets).where(eq(assets.id, a.id));
    expect(await code(trashAsset(w.db, designer.ctx, a.id))).toBe('FORBIDDEN');
    expect(await code(purgeAsset(w.db, storage, owner.ctx, a.id))).toBe('CONFLICT'); // ainda não está na lixeira
    await trashAsset(w.db, owner.ctx, a.id);
    expect(await code(readAssetFile(w.db, storage, owner.ctx, a.id))).toBe('NOT_FOUND');
    expect((await listAssets(w.db, owner.ctx, { trash: true })).items.map((i) => i.id)).toContain(
      a.id,
    );
    expect(
      (await listAssets(w.db, owner.ctx, { tag: undefined, limit: 500 })).items.map((i) => i.id),
    ).not.toContain(a.id);
    expect(await code(purgeAsset(w.db, storage, designer.ctx, a.id))).toBe('FORBIDDEN');
    expect(await code(purgeAsset(w.db, storage, ownerB.ctx, a.id))).toBe('NOT_FOUND');
    await restoreAsset(w.db, owner.ctx, a.id);
    expect(await code(readAssetFile(w.db, storage, owner.ctx, a.id))).toBe('ok');
    await trashAsset(w.db, owner.ctx, a.id);
    await purgeAsset(w.db, storage, owner.ctx, a.id);
    expect(await storage.exists(row!.storageKey)).toBe(false);
    expect(await w.db.select().from(assets).where(eq(assets.id, a.id))).toHaveLength(0);
  });

  it('retenção: só apaga o que está na lixeira há mais que o prazo', async () => {
    const old = await upload(owner.ctx, {}, 'ret-old');
    const recent = await upload(owner.ctx, {}, 'ret-recent');
    const live = await upload(owner.ctx, {}, 'ret-live');
    await trashAsset(w.db, owner.ctx, old.id);
    await trashAsset(w.db, owner.ctx, recent.id);
    await w.db
      .update(assets)
      .set({ deletedAt: new Date(Date.now() - 40 * 86_400_000) })
      .where(eq(assets.id, old.id));
    const n = await purgeExpiredAssets(w.db, storage, 30);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await w.db.select().from(assets).where(eq(assets.id, old.id))).toHaveLength(0);
    expect(await w.db.select().from(assets).where(eq(assets.id, recent.id))).toHaveLength(1);
    expect(await w.db.select().from(assets).where(eq(assets.id, live.id))).toHaveLength(1);
  });
});
