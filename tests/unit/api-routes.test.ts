import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const API_DIR = path.resolve(import.meta.dirname, '../../src/app/api');

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? routeFiles(p) : f === 'route.ts' ? [p] : [];
  });
}

// Únicas rotas que podem ser acessadas sem sessão. Qualquer outra rota nova DEVE usar `route()`.
const PUBLIC_ALLOWLIST = ['auth/login', 'auth/accept-invite', 'auth/reset-password'];

describe('guarda estrutural das rotas de API', () => {
  const files = routeFiles(API_DIR);

  it('encontra as rotas', () => expect(files.length).toBeGreaterThanOrEqual(15));

  it.each(files.map((f) => [path.relative(API_DIR, path.dirname(f)), f]))(
    '%s usa o wrapper de autorização',
    (rel, file) => {
      const src = readFileSync(file as string, 'utf8');
      const handlers = [...src.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\s*=\s*(\w+)/g)];
      expect(handlers.length).toBeGreaterThan(0);
      const isPublic = PUBLIC_ALLOWLIST.includes((rel as string).replaceAll('\\', '/'));
      for (const [, , wrapper] of handlers) {
        expect(wrapper).toBe(isPublic ? 'publicRoute' : 'route');
      }
      // Nenhuma rota pode ler o banco sem passar pelo contexto: proíbe acesso direto a tabelas no arquivo da rota.
      expect(src).not.toMatch(/from '@\/db\/schema'/);
    },
  );
});
