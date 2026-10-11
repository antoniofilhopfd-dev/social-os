'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Button, Field } from '@/ui/components';
import { fieldError, str } from '@/ui/form-utils';
import { FORMAT_LABELS } from '@/modules/contents/rules';
import { NETWORK_LABELS } from '@/modules/requests/labels';
import { PRIORITY_LABELS } from '@/modules/requests/rules';

interface Brand {
  id: string;
  name: string;
  status: string;
  profiles: { id: string; network: string; profileName: string; handle: string }[];
}
interface Campaign {
  id: string;
  name: string;
  status: string;
}
export interface ContentInitial {
  id: string;
  clientId: string;
  brandId: string | null;
  socialProfileId: string | null;
  pillarId: string | null;
  campaignId: string | null;
  title: string;
  theme: string | null;
  objective: string | null;
  audience: string | null;
  format: string;
  brief: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  assigneeUserId: string | null;
  priority: string;
}

export function ContentForm(props: {
  mode: 'create' | 'edit';
  clients: { id: string; name: string }[];
  pillars: { id: string; name: string }[];
  assignees: { id: string; name: string }[];
  canAssign: boolean;
  meId: string;
  initial?: ContentInitial;
  prefill?: { clientId?: string; date?: string; requestId?: string };
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [clientId, setClientId] = useState(
    props.initial?.clientId ?? props.prefill?.clientId ?? props.clients[0]?.id ?? '',
  );
  const [brandId, setBrandId] = useState(props.initial?.brandId ?? '');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string[]> | undefined>();
  const [saved, setSaved] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [takeIt, setTakeIt] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    Promise.all([
      api<{ brands: Brand[] }>('GET', `/api/clients/${clientId}/brands`),
      api<{ campaigns: Campaign[] }>('GET', `/api/clients/${clientId}/campaigns`),
    ]).then(([b, c]) => {
      if (cancelled) return;
      setBrands(b.ok ? b.data!.brands.filter((x) => x.status === 'active') : []);
      setCampaigns(c.ok ? c.data!.campaigns.filter((x) => x.status === 'active') : []);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const profiles = brands
    .filter((b) => !brandId || b.id === brandId)
    .flatMap((b) => b.profiles.map((p) => ({ ...p, brandName: b.name })));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(formRef.current!);
    const body: Record<string, unknown> = {
      title: f.get('title'),
      format: f.get('format'),
      brandId: str(f, 'brandId'),
      socialProfileId: str(f, 'socialProfileId'),
      pillarId: str(f, 'pillarId'),
      campaignId: str(f, 'campaignId'),
      theme: str(f, 'theme'),
      objective: str(f, 'objective'),
      audience: str(f, 'audience'),
      brief: str(f, 'brief'),
      scheduledDate: str(f, 'scheduledDate'),
      scheduledTime: str(f, 'scheduledTime'),
      priority: f.get('priority'),
    };
    if (props.canAssign) body.assigneeUserId = str(f, 'assigneeUserId');
    else if (takeIt) body.assigneeUserId = props.meId;
    if (props.mode === 'create') {
      body.clientId = clientId;
      if (props.prefill?.requestId) body.requestId = props.prefill.requestId;
    }
    setBusy(true);
    const r =
      props.mode === 'create'
        ? await api<{ id: string }>('POST', '/api/contents', body)
        : await api<{ conflicts: { number: number; title: string }[] }>(
            'PATCH',
            `/api/contents/${props.initial!.id}`,
            body,
          );
    setBusy(false);
    if (r.ok) {
      setError(null);
      setDetails(undefined);
      if (props.mode === 'create') {
        router.push(`/conteudos/${(r.data as { id: string }).id}`);
        return;
      }
      setSaved(
        ((r.data as { conflicts?: { number: number; title: string }[] }).conflicts ?? []).map(
          (c) => `#${c.number} · ${c.title}`,
        ),
      );
      router.refresh();
      return;
    }
    setSaved(null);
    setDetails(r.error?.details);
    setError(r.error?.message ?? 'Não foi possível salvar.');
  }

  const e = (k: string) => fieldError(details, k);
  const ta = (
    id: string,
    name: string,
    label: string,
    value: string | null | undefined,
    rows = 3,
  ) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        name={name}
        className="input"
        rows={rows}
        style={{ padding: 10, minHeight: rows * 28 }}
        defaultValue={value ?? ''}
      />
      {e(name) && <span className="field-error">{e(name)}</span>}
    </div>
  );

  return (
    <form ref={formRef} onSubmit={submit} className="stack" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Alterações salvas.</Alert>}
      {saved && saved.length > 0 && (
        <Alert tone="warning">
          Conflito de agenda: já há conteúdo no mesmo perfil, dia e horário: {saved.join('; ')}.
        </Alert>
      )}
      <section className="section stack" aria-labelledby="ct-id">
        <h2 id="ct-id">Identificação</h2>
        <div className="form-row">
          <div className="field">
            <label htmlFor="ct-client">Cliente *</label>
            <select
              id="ct-client"
              className="input"
              value={clientId}
              disabled={props.mode === 'edit'}
              onChange={(ev) => {
                setClientId(ev.target.value);
                setBrandId('');
              }}
            >
              {props.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {e('clientId') && <span className="field-error">{e('clientId')}</span>}
          </div>
          <div className="field">
            <label htmlFor="ct-format">Formato *</label>
            <select
              id="ct-format"
              name="format"
              className="input"
              defaultValue={props.initial?.format ?? 'static_post'}
            >
              {Object.entries(FORMAT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {e('format') && <span className="field-error">{e('format')}</span>}
          </div>
          <div className="field">
            <label htmlFor="ct-prio">Prioridade</label>
            <select
              id="ct-prio"
              name="priority"
              className="input"
              defaultValue={props.initial?.priority ?? 'normal'}
            >
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Field
          id="ct-title"
          name="title"
          label="Título interno *"
          defaultValue={props.initial?.title ?? ''}
          error={e('title')}
          required
        />
        <div className="form-row">
          <Field
            id="ct-theme"
            name="theme"
            label="Tema"
            defaultValue={props.initial?.theme ?? ''}
            error={e('theme')}
          />
          <div className="field">
            <label htmlFor="ct-pillar">Pilar de conteúdo</label>
            <select
              id="ct-pillar"
              name="pillarId"
              className="input"
              defaultValue={props.initial?.pillarId ?? ''}
            >
              <option value="">Sem pilar</option>
              {props.pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {e('pillarId') && <span className="field-error">{e('pillarId')}</span>}
          </div>
          <div className="field">
            <label htmlFor="ct-camp">Campanha</label>
            <select
              id="ct-camp"
              name="campaignId"
              className="input"
              defaultValue={props.initial?.campaignId ?? ''}
              key={`camp-${clientId}-${campaigns.length}`}
            >
              <option value="">Sem campanha</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {e('campaignId') && <span className="field-error">{e('campaignId')}</span>}
          </div>
        </div>
      </section>

      <section className="section stack" aria-labelledby="ct-dest">
        <h2 id="ct-dest">Destino e agenda</h2>
        <div className="form-row">
          <div className="field">
            <label htmlFor="ct-brand">Marca</label>
            <select
              id="ct-brand"
              name="brandId"
              className="input"
              value={brandId}
              onChange={(ev) => setBrandId(ev.target.value)}
            >
              <option value="">Sem marca específica</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {e('brandId') && <span className="field-error">{e('brandId')}</span>}
          </div>
          <div className="field">
            <label htmlFor="ct-prof">Perfil social</label>
            <select
              id="ct-prof"
              name="socialProfileId"
              className="input"
              defaultValue={props.initial?.socialProfileId ?? ''}
              key={`prof-${clientId}-${brandId}-${profiles.length}`}
            >
              <option value="">Não definido</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {NETWORK_LABELS[p.network]} · {p.profileName} (@{p.handle})
                  {brandId ? '' : ` — ${p.brandName}`}
                </option>
              ))}
            </select>
            {e('socialProfileId') && <span className="field-error">{e('socialProfileId')}</span>}
          </div>
          <Field
            id="ct-date"
            name="scheduledDate"
            label="Data prevista"
            type="date"
            defaultValue={props.initial?.scheduledDate ?? props.prefill?.date ?? ''}
            error={e('scheduledDate')}
          />
          <Field
            id="ct-time"
            name="scheduledTime"
            label="Horário previsto"
            type="time"
            defaultValue={props.initial?.scheduledTime ?? ''}
            error={e('scheduledTime')}
            hint="Opcional. Requer a data."
          />
        </div>
        {props.canAssign ? (
          <div className="field">
            <label htmlFor="ct-ass">Responsável</label>
            <select
              id="ct-ass"
              name="assigneeUserId"
              className="input"
              defaultValue={props.initial?.assigneeUserId ?? ''}
            >
              <option value="">Sem responsável</option>
              {props.assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {e('assigneeUserId') && <span className="field-error">{e('assigneeUserId')}</span>}
          </div>
        ) : (
          !props.initial?.assigneeUserId && (
            <label className="row" style={{ minHeight: 44 }}>
              <input
                type="checkbox"
                className="check"
                checked={takeIt}
                onChange={(ev) => setTakeIt(ev.target.checked)}
              />{' '}
              Assumir este conteúdo para mim
            </label>
          )
        )}
      </section>

      <section className="section stack" aria-labelledby="ct-brief">
        <h2 id="ct-brief">Briefing</h2>
        {ta('ct-obj', 'objective', 'Objetivo editorial', props.initial?.objective, 2)}
        <Field
          id="ct-aud"
          name="audience"
          label="Público"
          defaultValue={props.initial?.audience ?? ''}
          error={e('audience')}
        />
        {ta('ct-brf', 'brief', 'Briefing', props.initial?.brief, 5)}
        <p className="field-hint">
          Legendas, roteiros, versões e arquivos são trabalhados no editor (Etapa 06).
        </p>
      </section>

      <div className="actions">
        <Button type="submit" disabled={busy}>
          {busy ? 'Salvando…' : props.mode === 'create' ? 'Criar conteúdo' : 'Salvar alterações'}
        </Button>
        {props.mode === 'create' && (
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
