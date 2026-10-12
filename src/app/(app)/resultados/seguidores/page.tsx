import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db';
import { can } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { isId } from '@/core/ids';
import { listBrands } from '@/modules/clients/children';
import { listClients } from '@/modules/clients/service';
import { listSnapshots } from '@/modules/metrics/service';
import { NETWORK_LABELS } from '@/modules/requests/labels';
import { Forbidden } from '@/ui/forbidden';
import { FollowersForm } from '../metrics-form';

export const metadata: Metadata = { title: 'Seguidores' };
const fmtD = (d: string) => d.split('-').reverse().join('/');

export default async function FollowersPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const sp = await searchParams;
  const { ctx } = await requireAuthPage();
  if (ctx.userKind !== 'internal' || !ctx.grants.some((g) => g.permissions.has('metrics:create')))
    return <Forbidden />;
  const db = getDb();
  const clients = (await listClients(db, ctx)).filter((c) => can(ctx, 'metrics:create', c.id));
  const clientId =
    sp.clientId && isId(sp.clientId) && clients.some((c) => c.id === sp.clientId)
      ? sp.clientId
      : clients[0]?.id;
  const brands = clientId ? await listBrands(db, ctx, clientId) : [];
  const profiles = brands.flatMap((b) =>
    b.profiles.map((p) => ({
      id: p.id,
      label: `${b.name} · ${NETWORK_LABELS[p.network]} @${p.handle}`,
    })),
  );
  const lists = await Promise.all(
    profiles.map(async (p) => ({ ...p, items: await listSnapshots(db, ctx, p.id) })),
  );
  return (
    <>
      <p>
        <Link href="/resultados">← Voltar aos resultados</Link>
      </p>
      <div className="page-head">
        <h1>Seguidores dos perfis</h1>
      </div>
      <form method="get" className="section form-row" aria-label="Escolher cliente">
        <div className="field">
          <label htmlFor="sg-cliente">Cliente</label>
          <select id="sg-cliente" name="clientId" className="input" defaultValue={clientId ?? ''}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" type="submit">
          Selecionar
        </button>
      </form>
      {profiles.length === 0 ? (
        <p className="muted">Este cliente não tem perfis sociais cadastrados.</p>
      ) : (
        <>
          <FollowersForm profiles={profiles} />
          {lists.map((l) => (
            <section key={l.id} className="section stack" aria-label={`Registros de ${l.label}`}>
              <h2>{l.label}</h2>
              {l.items.length === 0 ? (
                <p className="muted">Nenhum registro.</p>
              ) : (
                <ul className="plain-list">
                  {l.items.slice(0, 12).map((s) => (
                    <li key={s.id}>
                      {fmtD(s.capturedOn)}: <strong>{s.followers.toLocaleString('pt-BR')}</strong>{' '}
                      seguidores
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </>
      )}
    </>
  );
}
