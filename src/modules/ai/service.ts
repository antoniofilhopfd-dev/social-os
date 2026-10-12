import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { aiUsage, brands, clients, contentDrafts, socialProfiles } from '@/db/schema';
import { audit } from '@/core/audit';
import { requireAnyScope, type Ctx } from '@/core/auth/context';
import { AppError } from '@/core/errors';
import { newId } from '@/core/ids';
import { loadForWrite } from '@/modules/contents/service';
import { EDIT_BLOCKED } from '@/modules/editor/service';
import { normalizeBody } from '@/modules/editor/rules';
import { loadAiProvider } from '@/modules/integrations/service';
import { buildAiContext, type AiProvider, type AiTask } from '@/integrations/ai';

/** Tarefas oferecidas na interface do editor. */
export const EDITOR_AI_TASKS: AiTask[] = [
  'caption',
  'tone_variations',
  'titles',
  'cta',
  'hashtags',
  'alt_text',
  'proofread',
  'clarity',
];
export const LIMITS = { perUserHour: 20, perOrgDay: 300 } as const;

async function enforceLimits(db: Db, ctx: Ctx, now: Date) {
  const hour = new Date(now.getTime() - 3_600_000);
  const day = new Date(now.getTime() - 86_400_000);
  const [[u], [o]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(aiUsage)
      .where(
        and(
          eq(aiUsage.organizationId, ctx.organizationId),
          eq(aiUsage.userId, ctx.userId),
          gte(aiUsage.createdAt, hour),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)` })
      .from(aiUsage)
      .where(and(eq(aiUsage.organizationId, ctx.organizationId), gte(aiUsage.createdAt, day))),
  ]);
  if (Number(u?.n ?? 0) >= LIMITS.perUserHour)
    throw new AppError(
      'RATE_LIMITED',
      'Você atingiu o limite de pedidos à IA nesta hora. Tente mais tarde.',
    );
  if (Number(o?.n ?? 0) >= LIMITS.perOrgDay)
    throw new AppError('RATE_LIMITED', 'A organização atingiu o limite diário de pedidos à IA.');
}

/**
 * Gera sugestões para um conteúdo. Nada é salvo: o resultado volta à tela como opções para revisão humana.
 * O contexto enviado é mínimo (diretrizes do cliente/marca, briefing e campos de texto voltados ao público);
 * observações internas, referências, contatos e dados de outros clientes nunca saem daqui.
 */
export async function suggest(
  db: Db,
  ctx: Ctx,
  contentId: string,
  input: { task: AiTask; instruction?: string },
  opts: { provider?: AiProvider; now?: Date } = {},
) {
  const now = opts.now ?? new Date();
  const c = await loadForWrite(db, ctx, contentId, 'contents:edit');
  requireAnyScope(ctx, 'contents:edit');
  if (!EDITOR_AI_TASKS.includes(input.task))
    throw new AppError('VALIDATION', 'Tarefa de IA inválida.', { task: ['Tarefa inválida.'] });
  if (EDIT_BLOCKED.includes(c.status))
    throw new AppError('CONFLICT', 'Este conteúdo não pode mais ser editado nesta situação.');
  const provider = opts.provider ?? (await loadAiProvider(db, ctx.organizationId));
  await enforceLimits(db, ctx, now);

  const [[client], [brand], [profile], [draft]] = await Promise.all([
    db
      .select()
      .from(clients)
      .where(and(eq(clients.id, c.clientId), eq(clients.organizationId, ctx.organizationId))),
    c.brandId
      ? db
          .select()
          .from(brands)
          .where(and(eq(brands.id, c.brandId), eq(brands.organizationId, ctx.organizationId)))
      : Promise.resolve([]),
    c.socialProfileId
      ? db
          .select({ network: socialProfiles.network })
          .from(socialProfiles)
          .where(eq(socialProfiles.id, c.socialProfileId))
      : Promise.resolve([]),
    db.select().from(contentDrafts).where(eq(contentDrafts.contentId, contentId)),
  ]);
  if (!client) throw new AppError('NOT_FOUND', 'Cliente não encontrado.');
  const body = normalizeBody(draft?.body);
  const context = buildAiContext({
    client,
    brand: brand ?? null,
    content: {
      title: c.title,
      format: c.format,
      objective: c.objective,
      audience: c.audience,
      brief: c.brief,
      network: profile?.network ?? null,
    },
    // somente campos voltados ao público; observações de produção/publicação e referências ficam de fora
    draft: {
      caption: body.caption,
      hook: body.hook,
      script: body.script,
      cta: body.cta,
      hashtags: body.hashtags,
      coverText: body.coverText,
    },
  });

  let result;
  try {
    result = await provider.generate({ task: input.task, context, instruction: input.instruction });
  } catch (e) {
    await db.insert(aiUsage).values({
      id: newId(),
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      contentId,
      task: input.task,
      provider: provider.id,
      status: 'error',
    });
    throw e;
  }
  await db.insert(aiUsage).values({
    id: newId(),
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    contentId,
    task: input.task,
    provider: result.provider,
    model: result.model ?? null,
    status: 'ok',
    inputTokens: result.usage?.inputTokens ?? null,
    outputTokens: result.usage?.outputTokens ?? null,
  });
  // a auditoria registra o uso, nunca o texto enviado nem o recebido
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'ai.generated',
    entityType: 'content',
    entityId: contentId,
    metadata: { task: input.task, provider: result.provider, model: result.model ?? null },
    ip: ctx.ip,
  });
  return {
    options: result.options,
    notes: result.notes,
    provider: result.provider,
    model: result.model ?? null,
  };
}
