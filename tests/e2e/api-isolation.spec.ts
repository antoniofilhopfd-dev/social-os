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
