import { expect, request, test, type APIRequestContext } from '@playwright/test';
import { BASE, SAME_ORIGIN, apiLogin, fx } from './helpers';

test.describe.configure({ mode: 'serial' });

const ID = '01HZZZZZZZZZZZZZZZZZZZZZZZ';
let ownerA: APIRequestContext,
  ownerB: APIRequestContext,
  writerA: APIRequestContext,
  scopedA1: APIRequestContext,
  anon: APIRequestContext;

test.beforeAll(async () => {
  ownerA = await apiLogin('dona.a@example.test');
  ownerB = await apiLogin('dono.b@example.test');
  writerA = await apiLogin('redator.a@example.test');
  scopedA1 = await apiLogin('consulta.a1@example.test');
  anon = await request.newContext({ baseURL: BASE, extraHTTPHeaders: SAME_ORIGIN });
});
test.afterAll(async () => {
  await Promise.all([ownerA, ownerB, writerA, scopedA1, anon].map((c) => c.dispose()));
});

// Todas as rotas protegidas da API. Rota nova sem `route()` é barrada pelo teste estrutural (api-routes.test.ts).
const protectedRoutes = (f: ReturnType<typeof fx>): [string, string][] => [
  ['POST', '/api/auth/logout'],
  ['GET', '/api/me/sessions'],
  ['DELETE', '/api/me/sessions'],
  ['DELETE', `/api/me/sessions/${ID}`],
  ['GET', '/api/team'],
  ['POST', '/api/team/invitations'],
  ['DELETE', `/api/team/invitations/${f.invitationA}`],
  ['PATCH', `/api/team/members/${f.membershipWriterA}`],
  ['DELETE', `/api/team/members/${f.membershipWriterA}`],
  ['POST', `/api/team/users/${f.writerAUserId}/reset-link`],
  ['GET', '/api/roles'],
  ['POST', '/api/roles'],
  ['PUT', `/api/roles/${f.roleA}`],
  ['DELETE', `/api/roles/${f.roleA}`],
  ['GET', '/api/clients'],
  ['POST', '/api/clients'],
  ['GET', `/api/clients/${f.clientA1}`],
  ['PATCH', `/api/clients/${f.clientA1}`],
  ['DELETE', `/api/clients/${f.clientA1}`],
  ['GET', '/api/audit'],
  ['GET', '/api/notifications'],
  ['POST', '/api/notifications/read-all'],
  ['POST', `/api/notifications/${ID}/read`],
  ['GET', '/api/notifications/preferences'],
  ['PUT', '/api/notifications/preferences'],
  ['GET', '/api/search?q=cliente'],
  ['POST', '/api/session/organization'],
  // Etapa 04
  ['GET', `/api/clients/${f.clientA1}/contacts`],
  ['POST', `/api/clients/${f.clientA1}/contacts`],
  ['PUT', `/api/clients/${f.clientA1}/contacts/${f.contactA}`],
  ['DELETE', `/api/clients/${f.clientA1}/contacts/${f.contactA}`],
  ['GET', `/api/clients/${f.clientA1}/dates`],
  ['POST', `/api/clients/${f.clientA1}/dates`],
  ['DELETE', `/api/clients/${f.clientA1}/dates/${f.dateA}`],
  ['GET', `/api/clients/${f.clientA1}/brands`],
  ['POST', `/api/clients/${f.clientA1}/brands`],
  ['GET', `/api/clients/${f.clientA1}/history`],
  ['PUT', `/api/brands/${f.brandA}`],
  ['DELETE', `/api/brands/${f.brandA}`],
  ['POST', `/api/brands/${f.brandA}/profiles`],
  ['PUT', `/api/social-profiles/${f.profileA}`],
  ['DELETE', `/api/social-profiles/${f.profileA}`],
  ['GET', '/api/requests'],
  ['POST', '/api/requests'],
  ['GET', '/api/requests/assignees'],
  ['GET', `/api/requests/${f.requestA1}`],
  ['PATCH', `/api/requests/${f.requestA1}`],
  ['POST', `/api/requests/${f.requestA1}/status`],
  ['POST', `/api/requests/${f.requestA1}/assign`],
  ['POST', `/api/requests/${f.requestA1}/comments`],
  ['GET', '/api/request-types'],
  ['POST', '/api/request-types'],
  ['PUT', `/api/request-types/${f.typeA}`],
  // Etapa 05
  ['GET', '/api/contents'],
  ['POST', '/api/contents'],
  ['GET', `/api/contents/${f.contentA1}`],
  ['PATCH', `/api/contents/${f.contentA1}`],
  ['DELETE', `/api/contents/${f.contentA1}`],
  ['POST', `/api/contents/${f.contentA1}/status`],
  ['POST', `/api/contents/${f.contentA1}/duplicate`],
  ['GET', `/api/contents/${f.contentA1}/history`],
  ['GET', '/api/content-pillars'],
  ['POST', '/api/content-pillars'],
  ['PUT', `/api/content-pillars/${f.pillarA}`],
  ['GET', `/api/clients/${f.clientA1}/campaigns`],
  ['POST', `/api/clients/${f.clientA1}/campaigns`],
  ['PUT', `/api/campaigns/${f.campaignA}`],
  ['DELETE', `/api/campaigns/${f.campaignA}`],
  ['POST', `/api/requests/${f.requestA1}/convert`],
  // Etapa 06
  ['GET', `/api/contents/${f.contentA1}/editor`],
  ['PUT', `/api/contents/${f.contentA1}/editor/draft`],
  ['GET', `/api/contents/${f.contentA1}/editor/versions`],
  ['POST', `/api/contents/${f.contentA1}/editor/versions`],
  ['GET', `/api/contents/${f.contentA1}/editor/versions/1`],
  ['POST', `/api/contents/${f.contentA1}/editor/versions/1/restore`],
  ['GET', `/api/contents/${f.contentA1}/editor/compare?a=1&b=2`],
  ['GET', `/api/contents/${f.contentA1}/assets`],
  ['POST', `/api/contents/${f.contentA1}/assets`],
  ['GET', '/api/editor-blocks'],
  ['POST', '/api/editor-blocks'],
  ['GET', '/api/content-templates'],
  ['POST', '/api/content-templates'],
  ['GET', '/api/assets'],
  ['POST', '/api/assets'],
  ['GET', `/api/asset-folders?clientId=${f.clientA1}`],
  ['POST', '/api/asset-folders'],
  // Etapa 10
  ['GET', '/api/metrics/performance?from=2031-01-01&to=2031-01-31'],
  ['GET', '/api/metrics/operations?from=2031-01-01&to=2031-01-31'],
  ['GET', '/api/metrics/export?from=2031-01-01&to=2031-01-31'],
  ['GET', `/api/publications/${ID}/metrics`],
  ['POST', `/api/publications/${ID}/metrics`],
  ['PATCH', `/api/metrics/entries/${ID}`],
  ['DELETE', `/api/metrics/entries/${ID}`],
  ['GET', `/api/profile-snapshots?profileId=${ID}`],
  ['POST', '/api/profile-snapshots'],
  ['DELETE', `/api/profile-snapshots/${ID}`],
  // Etapa 09
  ['GET', '/api/publications'],
  ['GET', `/api/publications/${ID}`],
  ['PATCH', `/api/publications/${ID}`],
  ['POST', `/api/publications/${ID}/published`],
  ['POST', `/api/publications/${ID}/failed`],
  ['POST', `/api/publications/${ID}/cancel`],
  ['POST', `/api/contents/${f.contentA1}/publication`],
  // Etapa 08
  ['GET', '/api/approvals'],
  ['GET', `/api/approvals/${f.approvalA}`],
  ['POST', `/api/approvals/${f.approvalA}/decision`],
  ['POST', `/api/approvals/${f.approvalA}/comments`],
  ['POST', `/api/approvals/${f.approvalA}/cancel`],
  ['GET', `/api/approvals/${f.approvalA}/assets/${f.contentA1}/file`],
  ['GET', `/api/contents/${f.contentA1}/approval`],
  ['POST', `/api/contents/${f.contentA1}/approval`],
  ['POST', `/api/contents/${f.contentA1}/reopen`],
  // Etapa 07
  ['GET', '/api/projects'],
  ['POST', '/api/projects'],
  ['GET', `/api/projects/${f.projectA}`],
  ['PATCH', `/api/projects/${f.projectA}`],
  ['DELETE', `/api/projects/${f.projectA}`],
  ['GET', '/api/tasks'],
  ['POST', '/api/tasks'],
  ['GET', '/api/tasks/assignees'],
  ['GET', `/api/tasks/${f.taskA}`],
  ['PATCH', `/api/tasks/${f.taskA}`],
  ['DELETE', `/api/tasks/${f.taskA}`],
  ['POST', `/api/tasks/${f.taskA}/status`],
  ['POST', `/api/tasks/${f.taskA}/comments`],
  ['POST', `/api/tasks/${f.taskA}/checklist`],
];

test('sem sessão, TODAS as rotas protegidas respondem 401 (e nada é alterado)', async () => {
  for (const [method, url] of protectedRoutes(fx())) {
    const res = await anon.fetch(url, { method, data: method === 'GET' ? undefined : {} });
    expect(res.status(), `${method} ${url}`).toBe(401);
  }
});

test('mutações exigem origem válida (CSRF): sem Origin e com Origin estrangeiro são recusadas', async () => {
  const raw = await request.newContext({ baseURL: BASE });
  const login = await raw.post('/api/auth/login', {
    data: { email: 'dona.a@example.test', password: 'senha-de-teste-e2e-123' },
    headers: { Origin: BASE },
  });
  expect(login.ok()).toBe(true);
  expect((await raw.post('/api/clients', { data: { name: 'CSRF sem origin' } })).status()).toBe(
    403,
  );
  expect(
    (
      await raw.post('/api/clients', {
        data: { name: 'CSRF origem externa' },
        headers: { Origin: 'https://evil.example' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await raw.post('/api/clients', {
        data: { name: 'Sec-Fetch' },
        headers: { 'Sec-Fetch-Site': 'cross-site' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await raw.post('/api/clients', {
        data: { name: 'Cliente via origem válida' },
        headers: { Origin: BASE },
      })
    ).status(),
  ).toBe(200);
  const names = (await (await ownerA.get('/api/clients')).json()).clients.map(
    (c: { name: string }) => c.name,
  );
  expect(names).toContain('Cliente via origem válida');
  for (const n of ['CSRF sem origin', 'CSRF origem externa', 'Sec-Fetch'])
    expect(names).not.toContain(n);
  await raw.dispose();
});

test('usuário da org B não acessa NENHUM recurso da org A por ID (404, sem alteração)', async () => {
  const f = fx();
  const attempts: [string, string, unknown?][] = [
    ['GET', `/api/clients/${f.clientA1}`],
    ['PATCH', `/api/clients/${f.clientA1}`, { name: 'Invadido' }],
    ['DELETE', `/api/clients/${f.clientA1}`],
    ['DELETE', `/api/team/invitations/${f.invitationA}`],
    ['PATCH', `/api/team/members/${f.membershipWriterA}`, { roleId: f.roleA }],
    ['DELETE', `/api/team/members/${f.membershipWriterA}`],
    ['POST', `/api/team/users/${f.writerAUserId}/reset-link`],
    ['PUT', `/api/roles/${f.roleA}`, { name: 'Invadida', kind: 'internal', permissions: [] }],
    ['DELETE', `/api/roles/${f.roleA}`],
  ];
  for (const [method, url, data] of attempts) {
    const res = await ownerB.fetch(url, {
      method,
      data: data ?? (method === 'GET' ? undefined : {}),
    });
    expect(res.status(), `${method} ${url}`).toBe(404);
  }
  const clients = (await (await ownerA.get('/api/clients')).json()).clients.map(
    (c: { id: string; name: string }) => [c.id, c.name],
  );
  expect(clients).toContainEqual([f.clientA1, 'Cliente A1']);
  const team = await (await ownerA.get('/api/team')).json();
  expect(team.members.map((m: { membershipId: string }) => m.membershipId)).toContain(
    f.membershipWriterA,
  );
  expect(team.invitations.map((i: { id: string }) => i.id)).toContain(f.invitationA);
  expect(
    (await (await ownerA.get('/api/roles')).json()).roles.map((r: { id: string }) => r.id),
  ).toContain(f.roleA);
});

test('listagens da org B não vazam dados da org A', async () => {
  const f = fx();
  const clients = (await (await ownerB.get('/api/clients')).json()).clients;
  expect(clients.map((c: { id: string }) => c.id)).toEqual([f.clientB1]);
  const team = await (await ownerB.get('/api/team')).json();
  expect(team.members.map((m: { email: string }) => m.email).sort()).toEqual([
    'dono.b@example.test',
    'multi.org@example.test',
  ]);
  expect(team.invitations).toHaveLength(0);
  expect(
    (await (await ownerB.get('/api/roles')).json()).roles.some(
      (r: { id: string }) => r.id === f.roleA,
    ),
  ).toBe(false);
  const text = JSON.stringify(await (await ownerB.get('/api/audit')).json());
  for (const secret of [f.clientA1, f.clientA2, 'dona.a@example.test', 'pendente.a@example.test'])
    expect(text).not.toContain(secret);
});

test('usuário da org B não encerra sessão de outro usuário da org A', async () => {
  const sessions = (await (await ownerA.get('/api/me/sessions')).json()).sessions as {
    id: string;
  }[];
  expect((await ownerB.delete(`/api/me/sessions/${sessions[0]!.id}`)).status()).toBe(404);
  expect((await ownerA.get('/api/me/sessions')).status()).toBe(200);
});

test('escopo de cliente: consulta do cliente A1 não vê A2 nem recursos administrativos', async () => {
  const f = fx();
  const list = (await (await scopedA1.get('/api/clients')).json()).clients;
  expect(list.map((c: { id: string }) => c.id)).toEqual([f.clientA1]);
  expect((await scopedA1.get(`/api/clients/${f.clientA2}`)).status()).toBe(404);
  for (const url of ['/api/team', '/api/roles', '/api/audit'])
    expect((await scopedA1.get(url)).status(), url).toBe(403);
  expect((await scopedA1.post('/api/clients', { data: { name: 'Nao pode' } })).status()).toBe(403);
});

test('permissões no backend: redator não acessa equipe, funções, auditoria nem cria clientes', async () => {
  for (const url of ['/api/team', '/api/roles', '/api/audit'])
    expect((await writerA.get(url)).status(), url).toBe(403);
  expect((await writerA.post('/api/clients', { data: { name: 'Nao pode' } })).status()).toBe(403);
  expect(
    (
      await writerA.post('/api/team/invitations', {
        data: { email: 'x@example.test', name: 'Xis', roleId: fx().roleA },
      })
    ).status(),
  ).toBe(403);
  expect((await writerA.get('/api/clients')).status()).toBe(200);
});

test('entradas malformadas: ID inválido = 404, JSON inválido e campos inválidos = 400', async () => {
  expect((await ownerA.get('/api/clients/nao-e-um-id')).status()).toBe(404);
  expect((await ownerA.get("/api/clients/1'%20OR%20'1'='1")).status()).toBe(404);
  expect(
    (
      await ownerA.post('/api/clients', {
        headers: { 'Content-Type': 'application/json' },
        data: '{json quebrado',
      })
    ).status(),
  ).toBe(400);
  const invalid = await ownerA.post('/api/team/invitations', {
    data: { email: 'nao-e-email', name: '', roleId: 'x' },
  });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).error.code).toBe('VALIDATION');
  const big = await ownerA.post('/api/clients', {
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ name: 'x'.repeat(200_000) }),
  });
  expect(big.status()).toBe(400);
});

test('respostas de erro não vazam detalhes internos', async () => {
  const text = await (await ownerA.get('/api/clients/' + ID)).text();
  expect(text).not.toMatch(/mysql|select |stack|at \w+ \(/i);
});

test('revogar outras sessões derruba imediatamente a sessão paralela; logout invalida a atual', async () => {
  const one = await apiLogin('redator.a@example.test');
  const two = await apiLogin('redator.a@example.test');
  expect((await two.get('/api/clients')).status()).toBe(200);
  expect((await one.delete('/api/me/sessions')).status()).toBe(200);
  expect((await two.get('/api/clients')).status()).toBe(401);
  expect((await one.get('/api/clients')).status()).toBe(200);
  expect((await one.post('/api/auth/logout')).status()).toBe(200);
  expect((await one.get('/api/clients')).status()).toBe(401);
  await Promise.all([one.dispose(), two.dispose()]);
});

test('cookie de sessão: HttpOnly, SameSite=Lax, sem token no corpo; login inválido não cria sessão', async () => {
  const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: SAME_ORIGIN });
  const bad = await ctx.post('/api/auth/login', {
    data: { email: 'redator.a@example.test', password: 'senha-errada-123456' },
  });
  expect(bad.status()).toBe(401);
  expect(bad.headers()['set-cookie']).toBeUndefined();
  const res = await ctx.post('/api/auth/login', {
    data: { email: 'redator.a@example.test', password: 'senha-de-teste-e2e-123' },
  });
  const cookie = res.headers()['set-cookie']!;
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=Lax/i);
  expect(await res.text()).not.toMatch(/token|sid/i);
  await ctx.dispose();
});

test('páginas internas redirecionam ao login sem sessão e a CSP com nonce está ativa', async () => {
  const noRedirect = await anon.get('/equipe', { maxRedirects: 0 });
  expect(noRedirect.status()).toBe(307);
  expect(noRedirect.headers()['location']).toContain('/login');
  const csp = (await anon.get('/login')).headers()['content-security-policy']!;
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain('unsafe-eval');
});

test('notificações: ninguém lê nem marca a notificação de outro usuário', async () => {
  const f = fx();
  const mine = (await (await ownerA.get('/api/notifications')).json()).items.map(
    (i: { id: string }) => i.id,
  );
  expect(mine).toContain(f.notificationA);
  expect((await ownerB.get('/api/notifications')).status()).toBe(200);
  const theirs = (await (await ownerB.get('/api/notifications')).json()).items.map(
    (i: { id: string }) => i.id,
  );
  expect(theirs).not.toContain(f.notificationA);
  expect((await ownerB.post(`/api/notifications/${f.notificationA}/read`)).status()).toBe(404);
  // a sessão original do redator foi encerrada pelo teste anterior; entra de novo
  const writer = await apiLogin('redator.a@example.test');
  expect((await writer.post(`/api/notifications/${f.notificationA}/read`)).status()).toBe(404);
  await writer.dispose();
  const still = (await (await ownerA.get('/api/notifications?unread=1')).json()).items.map(
    (i: { id: string }) => i.id,
  );
  expect(still).toContain(f.notificationA);
  expect(
    (
      await ownerA.put('/api/notifications/preferences', {
        data: { type: 'inexistente', enabled: false },
      })
    ).status(),
  ).toBe(400);
});

test('busca: respeita organização e escopo de cliente', async () => {
  const f = fx();
  const a = await (await ownerA.get('/api/search?q=cliente')).json();
  const aIds = a.clients.map((c: { id: string }) => c.id);
  expect(aIds).toEqual(expect.arrayContaining([f.clientA1, f.clientA2]));
  expect(aIds).not.toContain(f.clientB1);
  const b = await (await ownerB.get('/api/search?q=cliente')).json();
  expect(b.clients.map((c: { id: string }) => c.id)).toEqual([f.clientB1]);
  const scoped = await (await scopedA1.get('/api/search?q=cliente')).json();
  expect(scoped.clients.map((c: { id: string }) => c.id)).toEqual([f.clientA1]);
  expect(scoped.people).toEqual([]);
  const people = await (await ownerB.get('/api/search?q=example.test')).json();
  expect(JSON.stringify(people)).not.toContain('dona.a@example.test');
  expect((await ownerA.get('/api/search?q=%25')).status()).toBe(200);
  expect((await (await ownerA.get('/api/search?q=%25%25')).json()).clients).toEqual([]);
});

test('troca de organização: não-membro recebe 404 e a sessão não muda', async () => {
  const f = fx();
  expect(
    (await ownerB.post('/api/session/organization', { data: { organizationId: f.A } })).status(),
  ).toBe(404);
  expect((await ownerB.get('/api/clients')).status()).toBe(200);
  const b = (await (await ownerB.get('/api/clients')).json()).clients.map(
    (c: { id: string }) => c.id,
  );
  expect(b).toEqual([f.clientB1]);
  expect(
    (
      await ownerB.post('/api/session/organization', { data: { organizationId: 'nao-e-id' } })
    ).status(),
  ).toBe(400);
  const multi = await apiLogin('multi.org@example.test');
  expect((await multi.get('/api/team')).status()).toBe(403); // redator na A
  expect(
    (await multi.post('/api/session/organization', { data: { organizationId: f.B } })).status(),
  ).toBe(200);
  expect((await multi.get('/api/team')).status()).toBe(200); // proprietária na B
  const clients = (await (await multi.get('/api/clients')).json()).clients.map(
    (c: { id: string }) => c.id,
  );
  expect(clients).toEqual([f.clientB1]);
  await multi.dispose();
});

test('estágio 4: org B não alcança clientes filhos, marcas, perfis, solicitações nem tipos da A (404, sem alteração)', async () => {
  const f = fx();
  const brand = { name: 'Invasor Teste' };
  const contact = { name: 'Invasor Teste' };
  const date = { label: 'Invasor', eventDate: '2031-01-01' };
  const profile = { network: 'tiktok', profileName: 'Invasor', handle: 'invasor' };
  const attempts: [string, string, unknown?][] = [
    ['GET', `/api/clients/${f.clientA1}/contacts`],
    ['POST', `/api/clients/${f.clientA1}/contacts`, contact],
    ['PUT', `/api/clients/${f.clientA1}/contacts/${f.contactA}`, contact],
    ['DELETE', `/api/clients/${f.clientA1}/contacts/${f.contactA}`],
    ['GET', `/api/clients/${f.clientA1}/dates`],
    ['POST', `/api/clients/${f.clientA1}/dates`, date],
    ['DELETE', `/api/clients/${f.clientA1}/dates/${f.dateA}`],
    ['GET', `/api/clients/${f.clientA1}/brands`],
    ['POST', `/api/clients/${f.clientA1}/brands`, brand],
    ['GET', `/api/clients/${f.clientA1}/history`],
    ['PUT', `/api/brands/${f.brandA}`, brand],
    ['DELETE', `/api/brands/${f.brandA}`],
    ['POST', `/api/brands/${f.brandA}/profiles`, profile],
    ['PUT', `/api/social-profiles/${f.profileA}`, profile],
    ['DELETE', `/api/social-profiles/${f.profileA}`],
    ['GET', `/api/requests/${f.requestA1}`],
    ['PATCH', `/api/requests/${f.requestA1}`, { title: 'Invadida' }],
    ['POST', `/api/requests/${f.requestA1}/status`, { to: 'cancelled', message: 'x' }],
    ['POST', `/api/requests/${f.requestA1}/assign`, { assigneeUserId: null }],
    ['POST', `/api/requests/${f.requestA1}/comments`, { body: 'invasão' }],
    ['PUT', `/api/request-types/${f.typeA}`, { name: 'Invadido', requiredFields: [] }],
  ];
  for (const [method, url, data] of attempts) {
    const res = await ownerB.fetch(url, { method, data });
    expect(res.status(), `${method} ${url}`).toBe(404);
  }
  const brands = (await (await ownerA.get(`/api/clients/${f.clientA1}/brands`)).json()).brands;
  expect(
    brands.some(
      (b: { id: string; name: string }) => b.id === f.brandA && b.name === 'Marca Fixture A1',
    ),
  ).toBe(true);
  const req = await (await ownerA.get(`/api/requests/${f.requestA1}`)).json();
  expect(req.status).toBe('new');
  const listB = (await (await ownerB.get('/api/requests')).json()).items.map(
    (i: { id: string }) => i.id,
  );
  expect(listB).toEqual([f.requestB1]);
  expect(
    JSON.stringify((await (await ownerB.get('/api/request-types')).json()).types),
  ).not.toContain('Função');
});

test('estágio 4: cliente externo só vê as próprias solicitações e não opera a triagem', async () => {
  const f = fx();
  const ext = await apiLogin('cliente.a1@example.test');
  const mine = (await (await ext.get('/api/requests')).json()).items;
  expect(mine.every((i: { clientId: string }) => i.clientId === f.clientA1)).toBe(true);
  expect(mine.map((i: { id: string }) => i.id)).toContain(f.requestExtA1);
  expect((await ext.get(`/api/requests/${f.requestA2}`)).status()).toBe(404);
  expect(
    (
      await ext.post(`/api/requests/${f.requestExtA1}/status`, { data: { to: 'in_triage' } })
    ).status(),
  ).toBe(403);
  expect(
    (
      await ext.post(`/api/requests/${f.requestExtA1}/assign`, { data: { assigneeUserId: null } })
    ).status(),
  ).toBe(403);
  expect(
    (await ext.patch(`/api/requests/${f.requestExtA1}`, { data: { priority: 'low' } })).status(),
  ).toBe(403);
  expect((await ext.get('/api/requests/assignees')).status()).toBe(403);
  expect((await ext.get(`/api/clients/${f.clientA1}/history`)).status()).toBe(403);
  expect(
    (await ext.patch(`/api/clients/${f.clientA1}`, { data: { toneOfVoice: 'x' } })).status(),
  ).toBe(403);
  const detail = await (await ext.get(`/api/clients/${f.clientA1}`)).json();
  expect(detail.internalNotes).toBeNull();
  // nota interna do staff fica invisível ao externo
  expect(
    (
      await ownerA.post(`/api/requests/${f.requestExtA1}/comments`, {
        data: { body: 'Nota secreta da equipe', internalOnly: true },
      })
    ).status(),
  ).toBe(200);
  const seenByExt = JSON.stringify(await (await ext.get(`/api/requests/${f.requestExtA1}`)).json());
  expect(seenByExt).not.toContain('Nota secreta');
  const seenByStaff = JSON.stringify(
    await (await ownerA.get(`/api/requests/${f.requestExtA1}`)).json(),
  );
  expect(seenByStaff).toContain('Nota secreta');
  expect(
    (
      await ext.post(`/api/requests/${f.requestExtA1}/comments`, {
        data: { body: 'tentando', internalOnly: true },
      })
    ).status(),
  ).toBe(403);
  await ext.dispose();
});

test('estágio 4: permissões por função (redator e consulta do A1)', async () => {
  const f = fx();
  const writer = await apiLogin('redator.a@example.test');
  expect(
    (await writer.patch(`/api/requests/${f.requestA1}`, { data: { title: 'Nope' } })).status(),
  ).toBe(403);
  expect(
    (
      await writer.post('/api/request-types', {
        data: { name: 'Tipo sem permissão', requiredFields: [] },
      })
    ).status(),
  ).toBe(403);
  expect((await writer.get(`/api/clients/${f.clientA1}/history`)).status()).toBe(403);
  expect(
    (
      await writer.post(`/api/clients/${f.clientA1}/contacts`, { data: { name: 'Sem permissão' } })
    ).status(),
  ).toBe(403);
  expect((await writer.get('/api/requests')).status()).toBe(200);
  await writer.dispose();
  expect(
    (
      await scopedA1.post('/api/requests', {
        data: {
          clientId: f.clientA1,
          typeId: f.typeA,
          title: 'Sem permissão',
          description: 'Texto de teste',
        },
      })
    ).status(),
  ).toBe(403);
  expect((await scopedA1.get(`/api/requests/${f.requestA2}`)).status()).toBe(404);
});

test('estágio 4: validação, duplicidade e CSRF em solicitações', async () => {
  const f = fx();
  const invalid = await ownerA.post('/api/requests', {
    data: { clientId: f.clientA1, typeId: f.typeA, title: 'ab', description: '' },
  });
  expect(invalid.status()).toBe(400);
  expect(Object.keys((await invalid.json()).error.details).sort()).toEqual([
    'description',
    'title',
  ]);
  const ok = await ownerA.post('/api/requests', {
    data: {
      clientId: f.clientA1,
      typeId: f.typeA,
      title: 'Campanha de aniversário da loja',
      description: 'Texto de teste ok',
    },
  });
  expect(ok.status()).toBe(200);
  const dup = await ownerA.post('/api/requests', {
    data: {
      clientId: f.clientA1,
      typeId: f.typeA,
      title: 'campanha aniversario loja',
      description: 'Texto de teste ok',
    },
  });
  expect(dup.status()).toBe(409);
  expect((await dup.json()).error.details.duplicates[0]).toContain(
    'Campanha de aniversário da loja',
  );
  const forced = await ownerA.post('/api/requests', {
    data: {
      clientId: f.clientA1,
      typeId: f.typeA,
      title: 'campanha aniversario loja',
      description: 'Texto de teste ok',
      force: true,
    },
  });
  expect(forced.status()).toBe(200);
  const noOrigin = await request.newContext({ baseURL: BASE });
  await noOrigin.post('/api/auth/login', {
    data: { email: 'dona.a@example.test', password: 'senha-de-teste-e2e-123' },
    headers: { Origin: BASE },
  });
  expect(
    (
      await noOrigin.post('/api/requests', {
        data: {
          clientId: f.clientA1,
          typeId: f.typeA,
          title: 'Sem origem do navegador',
          description: 'Texto de teste',
        },
      })
    ).status(),
  ).toBe(403);
  await noOrigin.dispose();
  expect((await ownerA.get('/api/requests?status=invalido')).status()).toBe(400);
  expect((await ownerA.get("/api/requests?q='%20OR%201=1%20--")).status()).toBe(200);
});

test('estágio 5: org B não alcança conteúdos, pilares nem campanhas da A (404, sem alteração)', async () => {
  const f = fx();
  const attempts: [string, string, unknown?][] = [
    ['GET', `/api/contents/${f.contentA1}`],
    ['PATCH', `/api/contents/${f.contentA1}`, { title: 'Invadido' }],
    ['DELETE', `/api/contents/${f.contentA1}`],
    ['POST', `/api/contents/${f.contentA1}/status`, { to: 'in_production' }],
    ['POST', `/api/contents/${f.contentA1}/duplicate`],
    ['GET', `/api/contents/${f.contentA1}/history`],
    ['PUT', `/api/content-pillars/${f.pillarA}`, { name: 'Invadido', color: 'red' }],
    ['GET', `/api/clients/${f.clientA1}/campaigns`],
    ['POST', `/api/clients/${f.clientA1}/campaigns`, { name: 'Invasora' }],
    ['PUT', `/api/campaigns/${f.campaignA}`, { name: 'Invadida' }],
    ['DELETE', `/api/campaigns/${f.campaignA}`],
    ['POST', `/api/requests/${f.requestA1}/convert`],
    [
      'POST',
      '/api/contents',
      { clientId: f.clientA1, title: 'Em cliente alheio', format: 'carousel' },
    ],
  ];
  for (const [method, url, data] of attempts) {
    const res = await ownerB.fetch(url, { method, data });
    expect(res.status(), `${method} ${url}`).toBe(404);
  }
  const mine = await (await ownerA.get(`/api/contents/${f.contentA1}`)).json();
  expect(mine).toMatchObject({ title: 'Fixture conteúdo do A1', status: 'draft' });
  const listB = (await (await ownerB.get('/api/contents')).json()).items.map(
    (i: { id: string }) => i.id,
  );
  expect(listB).toContain(f.contentB1);
  expect(listB).not.toContain(f.contentA1);
  const pillarsB = JSON.stringify(
    (await (await ownerB.get('/api/content-pillars')).json()).pillars,
  );
  expect(pillarsB).not.toContain('Pilar Fixture');
  expect(
    JSON.stringify((await (await ownerB.get('/api/search?q=Fixture')).json()).contents),
  ).not.toContain('do A1');
});

test('estágio 5: externo só vê conteúdo enviado ao cliente e não opera nada', async () => {
  const f = fx();
  const ext = await apiLogin('cliente.a1@example.test');
  const ids = (await (await ext.get('/api/contents')).json()).items.map(
    (i: { id: string }) => i.id,
  );
  expect(ids).toEqual([f.contentExtA1]); // o rascunho do A1 e o conteúdo do A2 não aparecem
  expect((await ext.get(`/api/contents/${f.contentA1}`)).status()).toBe(404);
  expect((await ext.get(`/api/contents/${f.contentA2}`)).status()).toBe(404);
  expect((await ext.get(`/api/contents/${f.contentExtA1}`)).status()).toBe(200);
  expect(
    (
      await ext.patch(`/api/contents/${f.contentExtA1}`, { data: { title: 'Cliente editando' } })
    ).status(),
  ).toBe(403);
  expect(
    (
      await ext.post(`/api/contents/${f.contentExtA1}/status`, {
        data: { to: 'cancelled', message: 'x' },
      })
    ).status(),
  ).toBe(403);
  expect((await ext.delete(`/api/contents/${f.contentExtA1}`)).status()).toBe(403);
  expect((await ext.post(`/api/contents/${f.contentExtA1}/duplicate`)).status()).toBe(403);
  expect((await ext.get(`/api/contents/${f.contentExtA1}/history`)).status()).toBe(403);
  expect(
    (
      await ext.post('/api/contents', {
        data: { clientId: f.clientA1, title: 'Cliente criando', format: 'carousel' },
      })
    ).status(),
  ).toBe(403);
  const found = JSON.stringify((await (await ext.get('/api/search?q=Fixture')).json()).contents);
  expect(found).toContain('enviado ao cliente');
  expect(found).not.toContain('do A1');
  await ext.dispose();
});

test('estágio 5: escopo e permissões por função em conteúdos', async () => {
  const f = fx();
  expect((await scopedA1.get(`/api/contents/${f.contentA1}`)).status()).toBe(200);
  expect((await scopedA1.get(`/api/contents/${f.contentA2}`)).status()).toBe(404);
  expect(
    (
      await scopedA1.patch(`/api/contents/${f.contentA1}`, { data: { title: 'Sem permissão' } })
    ).status(),
  ).toBe(403);
  expect(
    (
      await scopedA1.post('/api/contents', {
        data: { clientId: f.clientA1, title: 'Sem permissão', format: 'carousel' },
      })
    ).status(),
  ).toBe(403);
  const writer = await apiLogin('redator.a@example.test');
  expect((await writer.delete(`/api/contents/${f.contentA2}`)).status()).toBe(403); // redator não exclui
  expect(
    (
      await writer.post('/api/content-pillars', { data: { name: 'Sem permissão', color: 'blue' } })
    ).status(),
  ).toBe(403);
  expect(
    (
      await writer.post(`/api/clients/${f.clientA1}/campaigns`, { data: { name: 'Sem permissão' } })
    ).status(),
  ).toBe(403);
  expect((await writer.post(`/api/requests/${f.requestA1}/convert`)).status()).toBe(403); // redator não edita solicitações
  const created = await writer.post('/api/contents', {
    data: { clientId: f.clientA1, title: 'Criado pelo redator', format: 'text' },
  });
  expect(created.status()).toBe(200);
  await writer.dispose();
});

test('estágio 5: máquina de estados, validação, duplicação, visões e CSRF pela API', async () => {
  const f = fx();
  const made = await (
    await ownerA.post('/api/contents', {
      data: {
        clientId: f.clientA1,
        title: 'Conteúdo de fluxo de estados',
        format: 'reels',
        scheduledDate: '2031-04-02',
      },
    })
  ).json();
  const id = made.id as string;
  for (const to of ['approved', 'scheduled', 'published', 'awaiting_client']) {
    expect((await ownerA.post(`/api/contents/${id}/status`, { data: { to } })).status(), to).toBe(
      409,
    );
  }
  expect(
    (await ownerA.post(`/api/contents/${id}/status`, { data: { to: 'internal_review' } })).status(),
  ).toBe(409);
  expect(
    (await ownerA.post(`/api/contents/${id}/status`, { data: { to: 'in_production' } })).status(),
  ).toBe(200);
  expect(
    (await ownerA.post(`/api/contents/${id}/status`, { data: { to: 'cancelled' } })).status(),
  ).toBe(400); // sem motivo
  const dup = await ownerA.post(`/api/contents/${id}/duplicate`);
  expect(dup.status()).toBe(200);
  const dupId = (await dup.json()).id as string;
  expect(await (await ownerA.get(`/api/contents/${dupId}`)).json()).toMatchObject({
    title: 'Conteúdo de fluxo de estados (cópia)',
    status: 'draft',
    scheduledDate: null,
  });
  const bad = await ownerA.post('/api/contents', {
    data: { clientId: f.clientA1, title: 'ab', format: 'gif', scheduledDate: '2031-02-30' },
  });
  expect(bad.status()).toBe(400);
  expect(Object.keys((await bad.json()).error.details).sort()).toEqual([
    'format',
    'scheduledDate',
    'title',
  ]);
  expect(
    (await ownerA.patch(`/api/contents/${id}`, { data: { campo_inexistente: 1 } })).status(),
  ).toBe(400);
  expect((await ownerA.get('/api/contents?view=invalida')).status()).toBe(400);
  expect((await ownerA.get('/api/contents?mes=2031-13')).status()).toBe(400);
  expect((await ownerA.get("/api/contents?q='%20OR%201=1%20--")).status()).toBe(200);
  const month = (
    await (await ownerA.get('/api/contents?view=calendario&mes=2031-03')).json()
  ).items.map((i: { id: string }) => i.id);
  expect(month).toEqual(expect.arrayContaining([f.contentA1, f.contentA2]));
  expect(month).not.toContain(f.contentB1);
  const all = (await (await ownerA.get('/api/contents?status=open')).json()).items.map(
    (i: { id: string }) => i.id,
  );
  expect(all).toEqual(expect.arrayContaining([f.contentA1, f.contentA2])); // as mesmas linhas aparecem na visão geral
  const week = (
    await (await ownerA.get('/api/contents?view=semana&dia=2031-03-12')).json()
  ).items.map((i: { id: string }) => i.id);
  expect(week).toContain(f.contentA1);
  expect(week).toContain(f.contentA2); // 14/03 está na mesma semana (09 a 15/03)
  expect(week).not.toContain(f.contentExtA1); // 20/03 está fora
  const noOrigin = await request.newContext({ baseURL: BASE });
  await noOrigin.post('/api/auth/login', {
    data: { email: 'dona.a@example.test', password: 'senha-de-teste-e2e-123' },
    headers: { Origin: BASE },
  });
  expect(
    (
      await noOrigin.post('/api/contents', {
        data: { clientId: f.clientA1, title: 'Sem origem', format: 'carousel' },
      })
    ).status(),
  ).toBe(403);
  await noOrigin.dispose();
});

test('estágio 7: org B não alcança projetos/tarefas da A; externo e escopo respeitados', async () => {
  const f = fx();
  for (const [m, url, data] of [
    ['GET', `/api/tasks/${f.taskA}`],
    ['PATCH', `/api/tasks/${f.taskA}`, { title: 'Invadida' }],
    ['DELETE', `/api/tasks/${f.taskA}`],
    ['POST', `/api/tasks/${f.taskA}/status`, { to: 'done' }],
    ['POST', `/api/tasks/${f.taskA}/comments`, { body: 'oi' }],
    ['POST', `/api/tasks/${f.taskA}/checklist`, { text: 'item' }],
    ['GET', `/api/projects/${f.projectA}`],
    ['PATCH', `/api/projects/${f.projectA}`, { name: 'Invadido' }],
    ['DELETE', `/api/projects/${f.projectA}`],
  ] as [string, string, unknown?][]) {
    const res = await ownerB.fetch(url, {
      method: m,
      data: data ?? (m === 'GET' ? undefined : {}),
    });
    expect(res.status(), `${m} ${url}`).toBe(404);
  }
  expect(
    (
      await ownerB.post('/api/tasks', { data: { title: 'Vínculo alheio', projectId: f.projectA } })
    ).status(),
  ).toBe(404);
  expect(JSON.stringify(await (await ownerB.get('/api/tasks')).json())).not.toContain(
    'Fixture do A1',
  );
  expect(JSON.stringify(await (await ownerB.get('/api/projects')).json())).not.toContain(
    'Projeto Fixture',
  );
  expect(JSON.stringify(await (await ownerB.get('/api/search?q=Fixture')).json())).not.toContain(
    'Fixture do A1',
  );
  // a tarefa da B continua intacta
  expect((await ownerB.get(`/api/tasks/${f.taskB}`)).status()).toBe(200);
  expect((await ownerA.get(`/api/tasks/${f.taskB}`)).status()).toBe(404);

  const ext = await apiLogin('cliente.a1@example.test');
  expect((await ext.get('/api/tasks')).status()).toBe(403);
  expect((await ext.get(`/api/tasks/${f.taskA}`)).status()).toBe(403);
  expect((await ext.get('/api/projects')).status()).toBe(403);
  await ext.dispose();

  // consulta do A1 vê a tarefa do A1, mas não altera nem cria
  expect((await scopedA1.get(`/api/tasks/${f.taskA}`)).status()).toBe(200);
  expect(
    (await scopedA1.post(`/api/tasks/${f.taskA}/status`, { data: { to: 'done' } })).status(),
  ).toBe(403);
  expect(
    (
      await scopedA1.post('/api/tasks', {
        data: { title: 'Consulta criando', clientId: f.clientA1 },
      })
    ).status(),
  ).toBe(403);
  expect((await scopedA1.delete(`/api/tasks/${f.taskA}`)).status()).toBe(403);
  // redator: edita, não exclui
  const writer = await apiLogin('redator.a@example.test');
  expect((await writer.delete(`/api/tasks/${f.taskA}`)).status()).toBe(403);
  await writer.dispose();
  // validação
  expect((await ownerA.post('/api/tasks', { data: { title: 'ab' } })).status()).toBe(400);
  expect(
    (await ownerA.post(`/api/tasks/${f.taskA}/status`, { data: { to: 'blocked' } })).status(),
  ).toBe(400);
  expect((await ownerA.post(`/api/tasks/${ID}/status`, { data: { to: 'done' } })).status()).toBe(
    404,
  );
  expect((await ownerA.get('/api/tasks/nao-e-id')).status()).toBe(404);
});

test('estágio 8: aprovações isoladas por organização/cliente; cliente não vê notas internas', async () => {
  const f = fx();
  const ext = await apiLogin('cliente.a1@example.test');
  const list = await (await ext.get('/api/approvals')).json();
  expect(list.items.map((i: { id: string }) => i.id)).toContain(f.approvalA);
  const detail = await (await ext.get(`/api/approvals/${f.approvalA}`)).json();
  expect(detail.body.caption).toContain('enviada ao cliente');
  expect(JSON.stringify(detail)).not.toContain('NOTA-INTERNA');
  expect(detail.permissions.decide).toBe(true);
  // a visão interna inclui as notas
  expect(
    JSON.stringify(await (await ownerA.get(`/api/approvals/${f.approvalA}`)).json()),
  ).toContain('NOTA-INTERNA');
  // org B não alcança
  for (const [m, url, data] of [
    ['GET', `/api/approvals/${f.approvalA}`],
    ['POST', `/api/approvals/${f.approvalA}/decision`, { decision: 'approved' }],
    ['POST', `/api/approvals/${f.approvalA}/comments`, { body: 'oi' }],
    ['POST', `/api/approvals/${f.approvalA}/cancel`],
  ] as [string, string, unknown?][]) {
    const res = await ownerB.fetch(url, { method: m, data: data ?? {} });
    expect(res.status(), `${m} ${url}`).toBe(404);
  }
  expect(JSON.stringify(await (await ownerB.get('/api/approvals')).json())).not.toContain(
    f.approvalA,
  );
  // equipe não decide pelo cliente; cliente não cancela nem envia
  expect(
    (
      await ownerA.post(`/api/approvals/${f.approvalA}/decision`, {
        data: { decision: 'approved' },
      })
    ).status(),
  ).toBe(403);
  expect((await ext.post(`/api/approvals/${f.approvalA}/cancel`)).status()).toBe(403);
  expect((await ext.post(`/api/contents/${f.contentExtA1}/approval`, { data: {} })).status()).toBe(
    403,
  );
  expect((await ext.post(`/api/contents/${f.contentExtA1}/reopen`)).status()).toBe(403);
  // validação
  expect(
    (
      await ext.post(`/api/approvals/${f.approvalA}/decision`, {
        data: { decision: 'changes_requested' },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await ext.post(`/api/approvals/${f.approvalA}/decision`, { data: { decision: 'talvez' } })
    ).status(),
  ).toBe(400);
  expect(
    (await ext.post(`/api/approvals/${f.approvalA}/comments`, { data: { body: '' } })).status(),
  ).toBe(400);
  expect((await ext.get('/api/approvals/nao-e-id')).status()).toBe(404);
  // cliente não lê a biblioteca interna nem arquivo fora da rodada
  expect((await ext.get('/api/assets')).status()).toBe(200);
  expect((await (await ext.get('/api/assets')).json()).items).toEqual([]);
  expect((await ext.get(`/api/approvals/${f.approvalA}/assets/${ID}/file`)).status()).toBe(404);
  // conteúdo visto pelo cliente não carrega briefing nem responsável
  const content = await (await ext.get(`/api/contents/${f.contentExtA1}`)).json();
  expect(content.brief).toBeNull();
  expect(content.assigneeUserId).toBeNull();
  await ext.dispose();
});

test('estágio 9: publicações isoladas; cliente externo não acessa; links perigosos recusados', async () => {
  const { approvedContent } = await import('./helpers-flow');
  const f = fx();
  const { contentId, owner } = await approvedContent('Publicação isolada');
  const res = await owner.post(`/api/contents/${contentId}/publication`, {
    data: { date: '2099-01-10', time: '10:00' },
  });
  expect(res.status()).toBe(200);
  const { id } = await res.json();
  await owner.dispose();
  for (const [m, url, data] of [
    ['GET', `/api/publications/${id}`],
    ['PATCH', `/api/publications/${id}`, { date: '2099-02-01' }],
    ['POST', `/api/publications/${id}/published`, {}],
    ['POST', `/api/publications/${id}/failed`, { reason: 'invasão' }],
    ['POST', `/api/publications/${id}/cancel`],
    ['POST', `/api/contents/${contentId}/publication`, { date: '2099-03-01' }],
  ] as [string, string, unknown?][]) {
    const r = await ownerB.fetch(url, { method: m, data: data ?? {} });
    expect(r.status(), `${m} ${url}`).toBe(404);
  }
  expect(JSON.stringify(await (await ownerB.get('/api/publications')).json())).not.toContain(id);
  const ext = await apiLogin('cliente.a1@example.test');
  expect((await ext.get('/api/publications')).status()).toBe(403);
  expect((await ext.get(`/api/publications/${id}`)).status()).toBe(403);
  expect(
    (
      await ext.post(`/api/contents/${contentId}/publication`, { data: { date: '2099-03-01' } })
    ).status(),
  ).toBe(403);
  await ext.dispose();
  const scoped = await apiLogin('consulta.a1@example.test');
  expect((await scoped.get(`/api/publications/${id}`)).status()).toBe(200);
  expect((await scoped.post(`/api/publications/${id}/published`, { data: {} })).status()).toBe(403);
  await scoped.dispose();
  const a = await apiLogin('dona.a@example.test');
  expect(
    (
      await a.post(`/api/publications/${id}/published`, {
        data: { postUrl: 'javascript:alert(1)' },
      })
    ).status(),
  ).toBe(400);
  expect((await a.post(`/api/publications/${id}/failed`, { data: { reason: '' } })).status()).toBe(
    400,
  );
  expect(
    (await a.patch(`/api/publications/${id}`, { data: { date: '2000-01-01' } })).status(),
  ).toBe(400);
  expect(
    (
      await a.post(`/api/contents/${f.contentA1}/publication`, { data: { date: 'ontem' } })
    ).status(),
  ).toBe(400);
  expect((await a.get('/api/publications/nao-e-id')).status()).toBe(404);
  await a.dispose();
});

test('estágio 10: métricas isoladas; cliente só lê o próprio; exportação restrita; entradas inválidas recusadas', async () => {
  const { publishedContent } = await import('./helpers-flow');
  const { publicationId, owner } = await publishedContent('Métrica isolada');
  const today = new Date().toISOString().slice(0, 10);
  const rec = await owner.post(`/api/publications/${publicationId}/metrics`, {
    data: {
      capturedOn: today,
      reach: 1200,
      impressions: 1500,
      likes: 80,
      comments: 6,
      shares: 4,
      saves: 10,
    },
  });
  expect(rec.status()).toBe(200);
  const { id: entryId } = await rec.json();
  // validações
  expect(
    (
      await owner.post(`/api/publications/${publicationId}/metrics`, {
        data: { capturedOn: today },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await owner.post(`/api/publications/${publicationId}/metrics`, {
        data: { capturedOn: today, reach: -1 },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await owner.post(`/api/publications/${publicationId}/metrics`, {
        data: { capturedOn: today, reach: 1.5 },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await owner.post(`/api/publications/${publicationId}/metrics`, {
        data: { capturedOn: today, reach: 100, impressions: 10 },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await owner.post(`/api/publications/${publicationId}/metrics`, {
        data: { capturedOn: '2099-01-01', reach: 1 },
      })
    ).status(),
  ).toBe(400);
  expect((await owner.get('/api/metrics/performance?from=2031-02-01&to=2031-01-01')).status()).toBe(
    400,
  );
  expect((await owner.get('/api/metrics/performance?from=2020-01-01&to=2031-01-01')).status()).toBe(
    400,
  );
  expect((await owner.get('/api/metrics/performance')).status()).toBe(400);
  // relatório e exportação
  const rep = await (await owner.get(`/api/metrics/performance?from=${today}&to=${today}`)).json();
  expect(rep.totals.reach).toBeGreaterThanOrEqual(1200);
  const csv = await owner.get(`/api/metrics/export?from=${today}&to=${today}`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()['content-type']).toContain('text/csv');
  expect(csv.headers()['content-disposition']).toContain('attachment');
  expect(await csv.text()).toContain('Métrica isolada');
  // org B não alcança
  for (const [m, url, data] of [
    ['GET', `/api/publications/${publicationId}/metrics`],
    ['POST', `/api/publications/${publicationId}/metrics`, { capturedOn: today, reach: 1 }],
    ['PATCH', `/api/metrics/entries/${entryId}`, { reach: 1 }],
    ['DELETE', `/api/metrics/entries/${entryId}`],
  ] as [string, string, unknown?][]) {
    const r = await ownerB.fetch(url, { method: m, data: data ?? {} });
    expect(r.status(), `${m} ${url}`).toBe(404);
  }
  expect(
    (await (await ownerB.get(`/api/metrics/performance?from=${today}&to=${today}`)).json()).totals
      .posts,
  ).toBe(0);
  expect(
    JSON.stringify(
      await (await ownerB.get(`/api/metrics/export?from=${today}&to=${today}`)).text(),
    ),
  ).not.toContain('Métrica isolada');
  // cliente externo: lê relatório do próprio cliente, não exporta, não registra, não vê operação
  const ext = await apiLogin('cliente.a1@example.test');
  const mine = await (await ext.get(`/api/metrics/performance?from=${today}&to=${today}`)).json();
  expect(JSON.stringify(mine)).toContain('Métrica isolada');
  expect((await ext.get(`/api/metrics/export?from=${today}&to=${today}`)).status()).toBe(403);
  expect((await ext.get(`/api/metrics/operations?from=${today}&to=${today}`)).status()).toBe(403);
  expect(
    (
      await ext.post(`/api/publications/${publicationId}/metrics`, {
        data: { capturedOn: today, reach: 1 },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await ext.patch(`/api/metrics/entries/${entryId}`, { data: { reach: 1 } })).status(),
  ).toBe(403);
  await ext.dispose();
  // consulta (viewer, A1) lê, mas não registra nem exporta
  const viewer = await apiLogin('consulta.a1@example.test');
  expect((await viewer.get(`/api/publications/${publicationId}/metrics`)).status()).toBe(200);
  expect(
    (
      await viewer.post(`/api/publications/${publicationId}/metrics`, {
        data: { capturedOn: today, reach: 1 },
      })
    ).status(),
  ).toBe(403);
  expect((await viewer.get(`/api/metrics/export?from=${today}&to=${today}`)).status()).toBe(403);
  await viewer.dispose();
  // exclusão remove do relatório
  expect((await owner.delete(`/api/metrics/entries/${entryId}`)).status()).toBe(200);
  await owner.dispose();
});
