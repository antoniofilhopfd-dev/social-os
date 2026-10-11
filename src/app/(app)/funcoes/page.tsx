import type { Metadata } from 'next';
import { getDb } from '@/db';
import { canOrgWide, orgWidePermissions } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { ACTION_LABELS, MODULES } from '@/core/permissions/catalog';
import { listRoles } from '@/modules/roles/service';
import { Forbidden } from '@/ui/forbidden';
import { RolesClient } from './roles-client';

export const metadata: Metadata = { title: 'Funções e permissões' };

export default async function RolesPage() {
  const { ctx } = await requireAuthPage();
  if (!canOrgWide(ctx, 'roles:view')) return <Forbidden />;
  const roles = await listRoles(getDb(), ctx);
  return (
    <>
      <div className="page-head">
        <h1>Funções e permissões</h1>
      </div>
      <p className="muted">
        Funções do sistema são fixas. Crie funções personalizadas combinando permissões por módulo.
        Você só pode conceder permissões que você mesmo possui.
      </p>
      <RolesClient
        roles={roles}
        modules={Object.entries(MODULES).map(([key, m]) => ({
          key,
          label: m.label,
          actions: [...m.actions],
        }))}
        actionLabels={ACTION_LABELS}
        myPermissions={[...orgWidePermissions(ctx)]}
        can={{
          create: canOrgWide(ctx, 'roles:create'),
          edit: canOrgWide(ctx, 'roles:edit'),
          remove: canOrgWide(ctx, 'roles:delete'),
        }}
      />
    </>
  );
}
