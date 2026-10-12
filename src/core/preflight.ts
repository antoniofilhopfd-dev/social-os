/** Verificações de pré-implantação puras (testáveis); o script `npm run preflight` junta estas com as que dependem do servidor. */
export type Level = 'ok' | 'warn' | 'fail';
export interface PreflightResult {
  name: string;
  level: Level;
  detail: string;
}

export function checkEnv(env: Record<string, string | undefined>): PreflightResult[] {
  const out: PreflightResult[] = [];
  const add = (name: string, level: Level, detail: string) => out.push({ name, level, detail });
  const prod = env.NODE_ENV === 'production';
  add(
    'NODE_ENV=production',
    prod ? 'ok' : 'warn',
    prod ? 'ok' : `valor atual: ${env.NODE_ENV ?? '(vazio)'} — use production no servidor`,
  );
  const url = env.APP_URL ?? '';
  if (!url) add('APP_URL', 'fail', 'não definida');
  else if (!url.startsWith('https://'))
    add(
      'APP_URL usa HTTPS',
      prod ? 'fail' : 'warn',
      'use o endereço https:// do domínio (cookies seguros e HSTS dependem disso)',
    );
  else add('APP_URL usa HTTPS', 'ok', 'ok');
  add(
    'DATABASE_URL',
    env.DATABASE_URL?.startsWith('mysql://') ? 'ok' : 'fail',
    env.DATABASE_URL ? 'formato mysql://' : 'não definida',
  );
  add(
    'STORAGE_DIR',
    env.STORAGE_DIR ? 'ok' : 'fail',
    env.STORAGE_DIR ? 'definido' : 'não definido',
  );
  add(
    'APP_SECRET (2FA e chaves de integração)',
    env.APP_SECRET && env.APP_SECRET.length >= 32 ? 'ok' : prod ? 'fail' : 'warn',
    env.APP_SECRET
      ? env.APP_SECRET.length >= 32
        ? 'ok'
        : 'menos de 32 caracteres'
      : 'não definido',
  );
  add(
    'BACKUP_PASSPHRASE (backup cifrado)',
    env.BACKUP_PASSPHRASE && env.BACKUP_PASSPHRASE.length >= 12 ? 'ok' : 'warn',
    env.BACKUP_PASSPHRASE ? 'ok' : 'não definida — backups ficariam sem cifra',
  );
  add(
    'TRUST_PROXY',
    env.TRUST_PROXY === 'true' ? 'ok' : prod ? 'warn' : 'ok',
    env.TRUST_PROXY === 'true'
      ? 'IP real via proxy'
      : 'false — atrás de proxy reverso o limite por IP enxerga um IP só; confirme com a hospedagem',
  );
  if (env.ANTHROPIC_BASE_URL)
    add(
      'ANTHROPIC_BASE_URL',
      prod ? 'warn' : 'ok',
      'definida — confirme que é o gateway esperado (ambiente de testes?)',
    );
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: env.APP_TIMEZONE || 'America/Sao_Paulo' });
    add('APP_TIMEZONE', 'ok', env.APP_TIMEZONE || 'America/Sao_Paulo (padrão)');
  } catch {
    add('APP_TIMEZONE', 'fail', 'fuso inválido');
  }
  const mb = Number(env.MAX_UPLOAD_MB ?? 50);
  add(
    'MAX_UPLOAD_MB',
    Number.isFinite(mb) && mb > 0 && mb <= 500 ? 'ok' : 'warn',
    `${env.MAX_UPLOAD_MB ?? '50 (padrão)'} — confira o limite de corpo do proxy/hospedagem`,
  );
  return out;
}

/** O diretório de arquivos não pode ficar dentro de `public/` nem do diretório de build (seria servido pela web). */
export function storageIsSafe(storageAbs: string, cwd: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const s = norm(storageAbs);
  return !(
    s === `${norm(cwd)}/public` ||
    s.startsWith(`${norm(cwd)}/public/`) ||
    s.startsWith(`${norm(cwd)}/.next`)
  );
}

export const worst = (r: PreflightResult[]): Level =>
  r.some((x) => x.level === 'fail') ? 'fail' : r.some((x) => x.level === 'warn') ? 'warn' : 'ok';
