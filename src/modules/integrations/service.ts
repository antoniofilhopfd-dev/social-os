import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { integrationConnections } from '@/db/schema';
import { audit } from '@/core/audit';
import { canOrgWide, requireOrgWide, type Ctx } from '@/core/auth/context';
import { getEnv } from '@/core/env';
import { AppError } from '@/core/errors';
import { newId } from '@/core/ids';
import { open, seal } from '@/core/secret-box';
import {
  ANTHROPIC_MODELS,
  AnthropicProvider,
  DEFAULT_ANTHROPIC_MODEL,
} from '@/integrations/ai/anthropic';

const PURPOSE = 'integration';
export const AI_PROVIDER = 'anthropic';

const appSecret = (): string => {
  const s = getEnv().APP_SECRET;
  if (!s)
    throw new AppError(
      'CONFLICT',
      'Não é possível guardar credenciais: o administrador do servidor precisa definir APP_SECRET.',
    );
  return s;
};

/** Mostra só o final da chave (ex.: “…a1b2”), nunca a chave. */
const hint = (key: string) => `…${key.slice(-4)}`;

/** Endereço base opcional (proxy/gateway ou ambiente de testes), definido só no servidor. */
const baseUrl = () => process.env.ANTHROPIC_BASE_URL || undefined;

export async function getAiConnection(db: Db, ctx: Ctx) {
  requireOrgWide(ctx, 'integrations:view');
  const [c] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.organizationId, ctx.organizationId),
        eq(integrationConnections.provider, AI_PROVIDER),
      ),
    );
  return {
    configured: !!c && c.status !== 'disabled' && !!c.secretEnc,
    status: c?.status ?? null,
    secretHint: c?.secretHint ?? null,
    model: c?.model ?? DEFAULT_ANTHROPIC_MODEL,
    lastCheckedAt: c?.lastCheckedAt ?? null,
    lastError: c?.lastError ?? null,
    canManage: canOrgWide(ctx, 'integrations:manage_integrations'),
    models: ANTHROPIC_MODELS,
  };
}

/** Usado por quem só precisa saber se pode oferecer o assistente (qualquer membro interno). */
export async function aiAvailableFor(db: Db, organizationId: string): Promise<boolean> {
  const [c] = await db
    .select({ status: integrationConnections.status, secret: integrationConnections.secretEnc })
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.organizationId, organizationId),
        eq(integrationConnections.provider, AI_PROVIDER),
      ),
    );
  return !!c && c.status === 'active' && !!c.secret;
}

/** Provedor pronto para uso da organização; a chave é decifrada só aqui, em memória. */
export async function loadAiProvider(
  db: Db,
  organizationId: string,
  opts: { allowError?: boolean } = {},
) {
  const [c] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.organizationId, organizationId),
        eq(integrationConnections.provider, AI_PROVIDER),
      ),
    );
  if (!c || !c.secretEnc || c.status === 'disabled' || (c.status === 'error' && !opts.allowError))
    throw new AppError(
      'CONFLICT',
      'O assistente de IA não está configurado. Peça a um administrador em Integrações.',
    );
  const apiKey = open(c.secretEnc, appSecret(), PURPOSE);
  return new AnthropicProvider({
    apiKey,
    model: c.model ?? DEFAULT_ANTHROPIC_MODEL,
    baseUrl: baseUrl(),
  });
}

export async function saveAiConnection(
  db: Db,
  ctx: Ctx,
  input: { apiKey?: string; model: string },
) {
  requireOrgWide(ctx, 'integrations:manage_integrations');
  if (!ANTHROPIC_MODELS.some((m) => m.id === input.model))
    throw new AppError('VALIDATION', 'Modelo inválido.', {
      model: ['Escolha um modelo da lista.'],
    });
  const key = appSecret();
  const [existing] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.organizationId, ctx.organizationId),
        eq(integrationConnections.provider, AI_PROVIDER),
      ),
    );
  const apiKey = input.apiKey?.trim();
  if (!existing && !apiKey)
    throw new AppError('VALIDATION', 'Informe a chave de API.', {
      apiKey: ['Informe a chave de API.'],
    });
  if (apiKey && (apiKey.length < 20 || /\s/.test(apiKey)))
    throw new AppError('VALIDATION', 'Chave de API inválida.', {
      apiKey: ['A chave parece inválida (muito curta ou com espaços).'],
    });
  const set = {
    model: input.model,
    status: 'active' as const,
    lastError: null,
    updatedBy: ctx.userId,
    ...(apiKey ? { secretEnc: seal(apiKey, key, PURPOSE), secretHint: hint(apiKey) } : {}),
  };
  if (existing)
    await db
      .update(integrationConnections)
      .set(set)
      .where(eq(integrationConnections.id, existing.id));
  else
    await db.insert(integrationConnections).values({
      id: newId(),
      organizationId: ctx.organizationId,
      provider: AI_PROVIDER,
      createdBy: ctx.userId,
      ...set,
    });
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: existing ? 'integration.updated' : 'integration.created',
    entityType: 'integration',
    entityId: AI_PROVIDER,
    // nunca registra a chave; só se ela foi trocada
    metadata: { provider: AI_PROVIDER, model: input.model, keyChanged: !!apiKey },
    ip: ctx.ip,
  });
}

/** Faz um pedido mínimo real ao serviço de IA para validar a chave e o modelo. */
export async function testAiConnection(db: Db, ctx: Ctx) {
  requireOrgWide(ctx, 'integrations:manage_integrations');
  const provider = await loadAiProvider(db, ctx.organizationId, { allowError: true });
  let error: string | null = null;
  try {
    await provider.ping();
  } catch (e) {
    error = e instanceof AppError ? e.message : 'Falha ao testar a conexão.';
  }
  await db
    .update(integrationConnections)
    .set({ lastCheckedAt: new Date(), lastError: error, status: error ? 'error' : 'active' })
    .where(
      and(
        eq(integrationConnections.organizationId, ctx.organizationId),
        eq(integrationConnections.provider, AI_PROVIDER),
      ),
    );
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'integration.tested',
    entityType: 'integration',
    entityId: AI_PROVIDER,
    metadata: { ok: !error },
    ip: ctx.ip,
  });
  if (error) throw new AppError('UPSTREAM', error);
}

export async function removeAiConnection(db: Db, ctx: Ctx) {
  requireOrgWide(ctx, 'integrations:manage_integrations');
  await db
    .delete(integrationConnections)
    .where(
      and(
        eq(integrationConnections.organizationId, ctx.organizationId),
        eq(integrationConnections.provider, AI_PROVIDER),
      ),
    );
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'integration.removed',
    entityType: 'integration',
    entityId: AI_PROVIDER,
    ip: ctx.ip,
  });
}
