import { cache } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db';
import { sessions, users } from '@/db/schema';
import { buildContext, type Ctx } from './context';
import { readSessionToken } from './cookies';
import { defaultOrganizationId, resolveSession } from './session';
import { clientIp } from '@/core/request';

export interface Auth {
  user: {
    id: string;
    name: string;
    email: string;
    kind: 'internal' | 'external';
    isPlatformAdmin: boolean;
  };
  sessionId: string;
  /** null quando a conta existe mas não tem vínculo ativo com organização (ex.: admin da plataforma). */
  ctx: Ctx | null;
}

export async function authenticateToken(
  db: Db,
  token: string | undefined,
  ip: string,
): Promise<Auth | null> {
  if (!token) return null;
  const session = await resolveSession(db, token);
  if (!session) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) return null;

  let orgId = session.organizationId;
  let ctx = orgId
    ? await buildContext(db, {
        userId: user.id,
        organizationId: orgId,
        sessionId: session.sessionId,
        ip,
      })
    : null;
  if (!ctx) {
    // Organização ativa perdida (vínculo removido): tenta a próxima; senão, sem contexto.
    orgId = await defaultOrganizationId(db, user.id);
    ctx = orgId
      ? await buildContext(db, {
          userId: user.id,
          organizationId: orgId,
          sessionId: session.sessionId,
          ip,
        })
      : null;
    if (ctx)
      await db
        .update(sessions)
        .set({ organizationId: orgId })
        .where(eq(sessions.id, session.sessionId));
  }
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      kind: user.kind,
      isPlatformAdmin: user.isPlatformAdmin === 1,
    },
    sessionId: session.sessionId,
    ctx,
  };
}

/** Autenticação para Server Components (memoizada por requisição). */
export const getAuth = cache(async (): Promise<Auth | null> => {
  const h = await headers();
  return authenticateToken(getDb(), await readSessionToken(), clientIp(h));
});

/** Para páginas internas: redireciona ao login se não houver sessão válida e exige contexto de organização. */
export async function requireAuthPage(): Promise<Auth & { ctx: Ctx }> {
  const auth = await getAuth();
  if (!auth) redirect('/login');
  if (!auth.ctx) redirect('/sem-acesso');
  return auth as Auth & { ctx: Ctx };
}
