import { getDb } from '@/db';
import { requireAuthPage } from '@/core/auth/server';
import { listMyOrganizations } from '@/modules/organizations/service';
import { unreadCount } from '@/modules/notifications/service';
import { AppShell } from '@/ui/shell/app-shell';
import { buildNav } from '@/ui/shell/nav-config';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, ctx } = await requireAuthPage();
  const db = getDb();
  const [orgs, unread] = await Promise.all([
    listMyOrganizations(db, user.id),
    unreadCount(db, ctx),
  ]);
  return (
    <AppShell
      userName={user.name}
      orgs={orgs}
      activeOrgId={ctx.organizationId}
      groups={buildNav(ctx)}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}
