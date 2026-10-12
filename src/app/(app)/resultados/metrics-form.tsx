'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert } from '@/ui/components';
import { METRIC_FIELDS, METRIC_LABELS } from '@/modules/metrics/rules';

export interface EntryView {
  id: string;
  capturedOn: string;
  values: Record<string, number | null>;
  interactions: number | null;
  engagementRate: number | null;
  notes: string | null;
  createdByName: string | null;
  canEdit: boolean;
}

const fmtD = (d: string) => d.split('-').reverse().join('/');
const n = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR'));

export function MetricsPanel({
  publicationId,
  canCreate,
  entries,
  publishedDay,
}: {
  publicationId: string;
  canCreate: boolean;
  entries: EntryView[];
  publishedDay: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const body: Record<string, unknown> = { capturedOn: String(f.get('capturedOn') ?? '') };
    for (const k of METRIC_FIELDS) {
      const raw = String(f.get(k) ?? '').trim();
      body[k] = raw === '' ? null : Number(raw);
    }
    const notes = String(f.get('notes') ?? '').trim();
    body.notes = notes || null;
    setBusy(true);
    const r = await api('POST', `/api/publications/${publicationId}/metrics`, body);
    setBusy(false);
    if (r.ok) {
      setError(null);
      setFields({});
      form.reset();
      router.refresh();
    } else {
      setError(r.error?.message ?? 'Erro.');
      setFields(r.error?.details ?? {});
    }
  }
  async function remove(id: string) {
    const r = await api('DELETE', `/api/metrics/entries/${id}`);
    if (r.ok) router.refresh();
    else setError(r.error?.message ?? 'Erro.');
  }
  const fe = (k: string) => fields[k]?.[0];

  return (
    <section className="section stack" aria-labelledby="mt-h">
      <h2 id="mt-h">Resultados da publicação</h2>
      <p className="muted">
        Os números são informados manualmente a partir da própria rede. Deixe em branco o que não
        estiver disponível: campo vazio é “não informado”, diferente de zero.
      </p>
      {entries.length === 0 ? (
        <p className="muted">Nenhum resultado registrado ainda.</p>
      ) : (
        <div className="table-wrap" tabIndex={0}>
          <table className="table">
            <caption className="sr-only">Coletas de resultados</caption>
            <thead>
              <tr>
                <th scope="col">Coleta</th>
                <th scope="col">Alcance</th>
                <th scope="col">Impressões</th>
                <th scope="col">Interações</th>
                <th scope="col">Engajamento</th>
                <th scope="col">Cliques</th>
                <th scope="col">Vídeo</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((en) => (
                <tr key={en.id}>
                  <td>
                    {fmtD(en.capturedOn)}
                    <div className="muted">{en.createdByName ?? '—'}</div>
                  </td>
                  <td>{n(en.values.reach ?? null)}</td>
                  <td>{n(en.values.impressions ?? null)}</td>
                  <td>{n(en.interactions)}</td>
                  <td>
                    {en.engagementRate == null
                      ? '—'
                      : `${en.engagementRate.toLocaleString('pt-BR')}%`}
                  </td>
                  <td>{n(en.values.clicks ?? null)}</td>
                  <td>{n(en.values.videoViews ?? null)}</td>
                  <td>
                    {en.canEdit && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        aria-label={`Excluir coleta de ${fmtD(en.capturedOn)}`}
                        onClick={() => void remove(en.id)}
                      >
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canCreate && (
        <form onSubmit={submit} className="stack" noValidate aria-label="Registrar resultados">
          <h3>Registrar nova coleta</h3>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="field">
            <label htmlFor="mt-date">Data da coleta *</label>
            <input
              id="mt-date"
              name="capturedOn"
              type="date"
              className="input"
              min={publishedDay}
              aria-invalid={fe('capturedOn') ? true : undefined}
            />
            {fe('capturedOn') && <span className="field-error">{fe('capturedOn')}</span>}
          </div>
          <div className="form-row">
            {METRIC_FIELDS.map((k) => (
              <div className="field" key={k}>
                <label htmlFor={`mt-${k}`}>{METRIC_LABELS[k]}</label>
                <input
                  id={`mt-${k}`}
                  name={k}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  className="input"
                  aria-invalid={fe(k) ? true : undefined}
                />
                {fe(k) && <span className="field-error">{fe(k)}</span>}
              </div>
            ))}
          </div>
          <div className="field">
            <label htmlFor="mt-notes">Observações</label>
            <textarea
              id="mt-notes"
              name="notes"
              className="input"
              rows={2}
              style={{ padding: 10 }}
              maxLength={1000}
            />
          </div>
          <div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Salvar resultados
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export function FollowersForm({ profiles }: { profiles: { id: string; label: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [ok, setOk] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const raw = String(f.get('followers') ?? '').trim();
    const r = await api('POST', '/api/profile-snapshots', {
      socialProfileId: String(f.get('socialProfileId') ?? ''),
      capturedOn: String(f.get('capturedOn') ?? ''),
      followers: raw === '' ? undefined : Number(raw),
    });
    if (r.ok) {
      setError(null);
      setFields({});
      setOk(true);
      form.reset();
      router.refresh();
    } else {
      setOk(false);
      setError(r.error?.message ?? 'Erro.');
      setFields(r.error?.details ?? {});
    }
  }
  const fe = (k: string) => fields[k]?.[0];
  return (
    <form onSubmit={submit} className="section stack" noValidate aria-label="Registrar seguidores">
      {error && <Alert tone="danger">{error}</Alert>}
      {ok && <Alert tone="success">Registro salvo.</Alert>}
      <div className="field">
        <label htmlFor="fl-profile">Perfil *</label>
        <select id="fl-profile" name="socialProfileId" className="input">
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="fl-date">Data *</label>
          <input
            id="fl-date"
            name="capturedOn"
            type="date"
            className="input"
            aria-invalid={fe('capturedOn') ? true : undefined}
          />
          {fe('capturedOn') && <span className="field-error">{fe('capturedOn')}</span>}
        </div>
        <div className="field">
          <label htmlFor="fl-count">Seguidores *</label>
          <input
            id="fl-count"
            name="followers"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            className="input"
            aria-invalid={fe('followers') ? true : undefined}
          />
          {fe('followers') && <span className="field-error">{fe('followers')}</span>}
        </div>
      </div>
      <div>
        <button className="btn btn-primary" type="submit">
          Salvar
        </button>
      </div>
    </form>
  );
}
