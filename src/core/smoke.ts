/** Verificação pós-implantação: confere de fora (HTTP) que a aplicação respondeu como esperado. Somente leitura, sem login. */
export interface SmokeCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export async function runSmoke(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SmokeCheck[]> {
  const base = baseUrl.replace(/\/$/, '');
  const https = base.startsWith('https://');
  const out: SmokeCheck[] = [];
  const add = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const get = (path: string, init: RequestInit = {}) =>
    fetchImpl(`${base}${path}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
      ...init,
    });

  try {
    const h = await get('/api/health');
    const body = (await h.json().catch(() => null)) as { status?: string } | null;
    add(
      'Health check (app + banco)',
      h.status === 200 && body?.status === 'ok',
      `HTTP ${h.status}`,
    );
  } catch (e) {
    add('Health check (app + banco)', false, `sem resposta: ${(e as Error).message}`);
    return out; // sem resposta, o restante não faz sentido
  }

  const login = await get('/login');
  const hd = login.headers;
  add('Página de login responde', login.status === 200, `HTTP ${login.status}`);
  const csp = hd.get('content-security-policy') ?? '';
  add(
    'CSP com nonce e sem unsafe-eval',
    /script-src[^;]*'nonce-/.test(csp) && !csp.includes('unsafe-eval'),
    csp ? 'presente' : 'ausente',
  );
  add(
    'Não permite ser embutido (frame-ancestors/X-Frame-Options)',
    hd.get('x-frame-options') === 'DENY' && csp.includes("frame-ancestors 'none'"),
    hd.get('x-frame-options') ?? 'ausente',
  );
  add(
    'X-Content-Type-Options: nosniff',
    hd.get('x-content-type-options') === 'nosniff',
    hd.get('x-content-type-options') ?? 'ausente',
  );
  add('Não expõe X-Powered-By', !hd.has('x-powered-by'), hd.get('x-powered-by') ?? 'ok');
  if (https)
    add(
      'HSTS ativo (HTTPS)',
      /max-age=\d{7,}/.test(hd.get('strict-transport-security') ?? ''),
      hd.get('strict-transport-security') ?? 'ausente',
    );
  else add('HTTPS', false, 'o endereço testado é http — em produção use https');

  const api = await get('/api/clients', { headers: { origin: base } });
  const apiBody = JSON.stringify(await api.json().catch(() => ({})));
  add('API protegida responde 401 sem sessão', api.status === 401, `HTTP ${api.status}`);
  add(
    'Erros da API não vazam detalhes internos',
    !/node_modules|\/home\/|\bat \w+\s*\(/.test(apiBody),
    'ok',
  );

  const bad = await get('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({
      email: 'verificacao@invalido.example',
      password: 'senha-invalida-de-verificacao',
    }),
  });
  add(
    'Login inválido é recusado e não cria cookie',
    bad.status === 401 && !(bad.headers.get('set-cookie') ?? '').includes('sid'),
    `HTTP ${bad.status}`,
  );

  const cross = await get('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://site-externo.example' },
    body: '{}',
  });
  add('Requisição de outra origem é recusada (CSRF)', cross.status === 403, `HTTP ${cross.status}`);

  const redirect = await get('/');
  add(
    'Área interna sem sessão redireciona ao login',
    redirect.status >= 300 &&
      redirect.status < 400 &&
      (redirect.headers.get('location') ?? '').includes('/login'),
    `HTTP ${redirect.status}`,
  );
  return out;
}
