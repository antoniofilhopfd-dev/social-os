import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '@/db';
import { permissions, rolePermissions, roles } from '@/db/schema';
import { newId } from '@/core/ids';
import { PERMISSIONS, SYSTEM_ROLES } from './catalog';

/** Idempotente: sincroniza permissões e funções do sistema com o catálogo em código. */
export async function seedPermissionsAndRoles(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    for (const p of PERMISSIONS) {
      await tx
        .insert(permissions)
        .values({ code: p.code, module: p.module, action: p.action, description: p.description })
        .onDuplicateKeyUpdate({
          set: { module: p.module, action: p.action, description: p.description },
        });
    }
    for (const r of SYSTEM_ROLES) {
      const existing = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.keyName, r.key), isNull(roles.organizationId)))
        .limit(1);
      let roleId = existing[0]?.id;
      if (!roleId) {
        roleId = newId();
        await tx.insert(roles).values({
          id: roleId,
          organizationId: null,
          keyName: r.key,
          name: r.name,
          description: r.description,
          isSystem: 1,
          kind: r.kind,
        });
      } else {
        await tx
          .update(roles)
          .set({ name: r.name, description: r.description, kind: r.kind })
          .where(eq(roles.id, roleId));
      }
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      await tx
        .insert(rolePermissions)
        .values(r.permissions.map((code) => ({ roleId: roleId!, permissionCode: code })));
    }
  });
}

export async function systemRoleId(db: Db, key: string): Promise<string> {
  const rows = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.keyName, key), isNull(roles.organizationId)))
    .limit(1);
  if (!rows[0]) throw new Error(`Função do sistema ausente: ${key}. Execute o seed.`);
  return rows[0].id;
}

export async function permissionsOfRoles(
  db: Db,
  roleIds: string[],
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (roleIds.length === 0) return map;
  const rows = await db
    .select()
    .from(rolePermissions)
    .where(inArray(rolePermissions.roleId, roleIds));
  for (const r of rows) {
    const set = map.get(r.roleId) ?? new Set<string>();
    set.add(r.permissionCode);
    map.set(r.roleId, set);
  }
  return map;
}
