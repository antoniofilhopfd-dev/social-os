import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { checkEnv, storageIsSafe, worst } from '@/core/preflight';
import { runSmoke } from '@/core/smoke';

const base = {
  NODE_ENV: 'production',
  APP_URL: 'https://app.exemplo.com.br',
  DATABASE_URL: 'mysql://u:p@h/db',
  STORAGE_DIR: '/var/socialos/storage',
  APP_SECRET: 'x'.repeat(40),
  BACKUP_PASSPHRASE: 'frase-longa-123456',
  TRUST_PROXY: 'true',
};
const level = (env: Record<string, string | undefined>, name: string) =>
  checkEnv(env).find((r) => r.name.startsWith(name))?.level;

describe('pré-implantação', () => {
  it('configuração correta de produção passa sem avisos', () => {
    expect(worst(checkEnv(base))).toBe('ok');
  });
  it('produção sem https, sem segredo ou com fuso inválido falha', () => {
    expect(level({ ...base, APP_URL: 'http://x.com' }, 'APP_URL usa HTTPS')).toBe('fail');
    expect(level({ ...base, APP_SECRET: undefined }, 'APP_SECRET')).toBe('fail');
    expect(level({ ...base, APP_SECRET: 'curto' }, 'APP_SECRET')).toBe('fail');
    expect(level({ ...base, APP_TIMEZONE: 'Marte/Olimpo' }, 'APP_TIMEZONE')).toBe('fail');
    expect(level({ ...base, DATABASE_URL: 'postgres://x' }, 'DATABASE_URL')).toBe('fail');
    expect(level({ ...base, BACKUP_PASSPHRASE: undefined }, 'BACKUP_PASSPHRASE')).toBe('warn');
    expect(level({ ...base, TRUST_PROXY: 'false' }, 'TRUST_PROXY')).toBe('warn');
    expect(level({ ...base, ANTHROPIC_BASE_URL: 'http://127.0.0.1:1' }, 'ANTHROPIC_BASE_URL')).toBe(
      'warn',
    );
  });
  it('em desenvolvimento http e segredo ausente são só avisos', () => {
    expect(
      level(
        {
          ...base,
          NODE_ENV: 'development',
          APP_URL: 'http://localhost:3000',
          APP_SECRET: undefined,
        },
        'APP_URL usa HTTPS',
      ),
    ).toBe('warn');
    expect(level({ ...base, NODE_ENV: 'development', APP_SECRET: undefined }, 'APP_SECRET')).toBe(
      'warn',
    );
  });
  it('armazenamento nunca dentro de public/ ou .next', () => {
    expect(storageIsSafe('/app/storage', '/app')).toBe(true);
    expect(storageIsSafe('/app/public/uploads', '/app')).toBe(false);
    expect(storageIsSafe('/app/public', '/app')).toBe(false);
    expect(storageIsSafe('/app/.next/cache', '/app')).toBe(false);
    expect(storageIsSafe('/var/data/files', '/app')).toBe(true);
  });
});

async function server(opts: { secure: boolean }) {
  const srv = createServer((req, res) => {
    const h: Record<string, string> = {};
    if (opts.secure) {
      Object.assign(h, {
        'content-security-policy':
          "default-src 'self'; script-src 'self' 'nonce-abc' 'strict-dynamic'; frame-ancestors 'none'",
        'x-frame-options': 'DENY',
        'x-content-type-options': 'nosniff',
      });
    } else h['x-powered-by'] = 'Express';
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', ...h });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/api/health') return json(200, { status: 'ok' });
    if (req.url === '/login') {
      res.writeHead(200, { 'content-type': 'text/html', ...h });
      return res.end('<html></html>');
    }
    if (req.url === '/api/clients')
      return json(
        opts.secure ? 401 : 200,
        opts.secure
          ? { error: { code: 'UNAUTHENTICATED' } }
          : { error: 'at Object.<anonymous> (/home/app/node_modules/x.js:1:1)' },
      );
    if (req.url === '/api/auth/login') {
      if (req.headers.origin?.includes('externo')) return json(opts.secure ? 403 : 200, {});
      return json(401, {});
    }
    if (req.url === '/') {
      res.writeHead(opts.secure ? 307 : 200, { location: '/login', ...h });
      return res.end();
    }
    json(404, {});
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(srv.address() as { port: number }).port}`,
    close: () => new Promise<void>((r) => srv.close(() => r())),
  };
}

describe('teste de fumaça', () => {
  it('app configurada corretamente passa em tudo, exceto HTTPS quando o endereço é http', async () => {
    const s = await server({ secure: true });
    const checks = await runSmoke(s.url);
    const failed = checks.filter((c) => !c.ok).map((c) => c.name);
    expect(failed).toEqual(['HTTPS']);
    await s.close();
  });
  it('detecta cabeçalhos ausentes, API aberta, vazamento e CSRF', async () => {
    const s = await server({ secure: false });
    const failed = (await runSmoke(s.url)).filter((c) => !c.ok).map((c) => c.name);
    expect(failed).toEqual(
      expect.arrayContaining([
        'CSP com nonce e sem unsafe-eval',
        'X-Content-Type-Options: nosniff',
        'Não expõe X-Powered-By',
        'API protegida responde 401 sem sessão',
        'Erros da API não vazam detalhes internos',
        'Requisição de outra origem é recusada (CSRF)',
        'Área interna sem sessão redireciona ao login',
      ]),
    );
    await s.close();
  });
  it('sem resposta do servidor: falha clara e para', async () => {
    const checks = await runSmoke('http://127.0.0.1:9');
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ ok: false, name: 'Health check (app + banco)' });
  });
});
