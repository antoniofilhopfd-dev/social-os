import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { getDb } from '@/db';
import { AppError, toErrorResponse } from '@/core/errors';
import { createLogger } from '@/core/logger';
import { getEnv } from '@/core/env';
import { newId } from '@/core/ids';
import { authenticateToken, type Auth } from '@/core/auth/server';
import { readSessionToken } from '@/core/auth/cookies';
import { clientIp, isSameOrigin } from '@/core/request';
import type { Ctx } from '@/core/auth/context';

const MAX_BODY_BYTES = 100_000;

export interface RouteArgs<P> {
  req: Request;
  params: P;
  ip: string;
  userAgent: string | null;
  /** Presente quando há sessão válida (também em rotas `optional`). */
  auth: Auth | null;
}
export interface AuthedArgs<P> extends Omit<RouteArgs<P>, 'auth'> {
  auth: Auth & { ctx: Ctx };
  ctx: Ctx;
}

type Handler<A> = (args: A) => Promise<Response | object | void>;

function failure(err: unknown, requestId: string) {
  if (err instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const i of err.issues) (details[i.path.join('.') || '_'] ??= []).push(i.message);
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Dados inválidos.', details } },
      { status: 400 },
    );
  }
  const { status, body } = toErrorResponse(err);
  if (status >= 500) {
    createLogger({ level: getEnv().LOG_LEVEL }).error('Erro não tratado na API', {
      requestId,
      err,
    });
  }
  return NextResponse.json(body, { status });
}

function wrap<P, A extends RouteArgs<P>>(
  mode: 'required' | 'optional' | 'none',
  handler: Handler<A>,
  build: (base: RouteArgs<P>, auth: Auth | null) => A,
) {
  return async (req: Request, routeCtx: { params: Promise<P> }): Promise<Response> => {
    const requestId = newId();
    try {
      if (!isSameOrigin(req))
        throw new AppError('FORBIDDEN', 'Origem da requisição não permitida.');
      const ip = clientIp(req.headers);
      const auth =
        mode === 'none' ? null : await authenticateToken(getDb(), await readSessionToken(), ip);
      if (mode === 'required') {
        if (!auth)
          throw new AppError('UNAUTHENTICATED', 'Sessão expirada ou inexistente. Entre novamente.');
        if (!auth.ctx)
          throw new AppError('FORBIDDEN', 'Sua conta não está vinculada a uma organização.');
      }
      const params = routeCtx?.params ? await routeCtx.params : ({} as P);
      const out = await handler(
        build({ req, params, ip, userAgent: req.headers.get('user-agent'), auth }, auth),
      );
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (err) {
      return failure(err, requestId);
    }
  };
}

/** Rota protegida: exige sessão, contexto de organização e origem válida (CSRF). */
export function route<P = Record<string, never>>(handler: Handler<AuthedArgs<P>>) {
  return wrap<P, AuthedArgs<P>>('required', handler, (base, auth) => ({
    ...base,
    auth: auth as Auth & { ctx: Ctx },
    ctx: (auth as Auth & { ctx: Ctx }).ctx,
  }));
}

/** Rota pública explícita (login, aceitar convite, redefinição). Mantém a checagem de origem. */
export function publicRoute<P = Record<string, never>>(handler: Handler<RouteArgs<P>>) {
  return wrap<P, RouteArgs<P>>('optional', handler, (base) => base);
}

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES)
    throw new AppError('VALIDATION', 'Corpo da requisição muito grande.');
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new AppError('VALIDATION', 'JSON inválido.');
  }
  return schema.parse(data);
}
