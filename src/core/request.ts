import { getEnv } from '@/core/env';

/** IP do cliente. Só confia em X-Forwarded-For se TRUST_PROXY=true (proxy reverso próprio). */
export function clientIp(h: Pick<Headers, 'get'>): string {
  if (getEnv().TRUST_PROXY === 'true') {
    const first = h.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return 'unknown';
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Proteção CSRF para mutações: exige `Origin` igual à origem da aplicação (ou, na ausência dele,
 * `Sec-Fetch-Site: same-origin`). Complementa SameSite=Lax do cookie de sessão.
 */
export function isSameOrigin(req: Request): boolean {
  if (SAFE_METHODS.has(req.method)) return true;
  const allowed = new Set<string>([new URL(getEnv().APP_URL).origin]);
  const host = req.headers.get('host');
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  const origin = req.headers.get('origin');
  if (origin) {
    if (!allowed.has(origin)) return false;
    // `http://host` só é aceito quando a aplicação realmente roda em http.
    return new URL(origin).protocol === new URL(getEnv().APP_URL).protocol;
  }
  const site = req.headers.get('sec-fetch-site');
  return site === 'same-origin';
}
