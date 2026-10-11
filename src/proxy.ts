import { NextResponse, type NextRequest } from 'next/server';

// Rotas acessíveis sem sessão. A validação REAL da sessão ocorre no servidor (páginas e API);
// aqui só se evita servir páginas internas a quem nem possui o cookie.
const PUBLIC_PREFIXES = ['/login', '/convite/', '/redefinir-senha/', '/design-system', '/api/'];
const COOKIE_NAMES = ['__Host-sid', 'sid'];

function csp(nonce: string): string {
  const dev = process.env.NODE_ENV !== 'production';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = COOKIE_NAMES.some((n) => request.cookies.has(n));
  const isPublic = PUBLIC_PREFIXES.some(
    (p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p),
  );

  if (!isPublic && !hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Arquivos da biblioteca definem a própria CSP restritiva (sandbox) na rota; não sobrescrever.
  if (/^\/api\/assets\/[^/]+\/file$/.test(pathname)) return NextResponse.next();

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = csp(nonce);
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('content-security-policy', policy);
  return response;
}

export const config = {
  matcher: [{ source: '/((?!_next/static|_next/image|favicon.ico).*)' }],
};
