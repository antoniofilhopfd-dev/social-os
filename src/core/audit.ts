import type { Db } from '@/db';
import { auditLogs } from '@/db/schema';
import { newId } from '@/core/ids';
import { redact } from '@/core/logger';

/** Aceita o banco ou uma transação, para auditar dentro da mesma unidade de trabalho. */
type Executor = Pick<Db, 'insert'>;

export interface AuditEvent {
  organizationId: string | null;
  actorUserId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/**
 * Registra um evento imutável. Metadados passam por `redact` (chaves sensíveis e credenciais em URL)
 * e valores longos são truncados. Nunca passe senhas, tokens ou hashes: a redação é só a rede de segurança.
 */
export async function audit(db: Executor, e: AuditEvent): Promise<void> {
  const metadata = e.metadata ? (redact(truncate(e.metadata)) as Record<string, unknown>) : null;
  await db.insert(auditLogs).values({
    id: newId(),
    organizationId: e.organizationId,
    actorUserId: e.actorUserId,
    action: e.action,
    entityType: e.entityType ?? null,
    entityId: e.entityId ?? null,
    metadata,
    ip: e.ip ?? null,
  });
}

function truncate(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.length > 300 ? value.slice(0, 300) + '…' : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => truncate(v, depth + 1));
  if (value && typeof value === 'object' && depth < 4) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, truncate(v, depth + 1)]));
  }
  return value;
}
