import type { Metadata } from 'next';
import { getDb } from '@/db';
import { canOrgWide } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { listPillars } from '@/modules/contents/service';
import { Forbidden } from '@/ui/forbidden';
import { PillarsClient } from './pillars-client';

export const metadata: Metadata = { title: 'Pilares editoriais' };

export default async function PillarsPage() {
  const { ctx } = await requireAuthPage();
  if (!canOrgWide(ctx, 'settings:view')) return <Forbidden />;
  const pillars = await listPillars(getDb(), ctx, { includeInactive: true });
  return (
    <>
      <div className="page-head">
        <h1>Pilares editoriais</h1>
      </div>
      <p className="muted">
        Pilares organizam os temas de conteúdo e aparecem com cor no calendário. Pilares desativados
        deixam de ser selecionáveis, mas os conteúdos existentes são mantidos.
      </p>
      <PillarsClient pillars={pillars} canEdit={canOrgWide(ctx, 'settings:edit')} />
    </>
  );
}
