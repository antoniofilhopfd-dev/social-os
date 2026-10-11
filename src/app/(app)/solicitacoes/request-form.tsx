'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Button, Field } from '@/ui/components';
import { fieldError, str } from '@/ui/form-utils';
import { NETWORK_LABELS } from '@/modules/requests/labels';
import { CONFIGURABLE_FIELDS, PRIORITY_LABELS } from '@/modules/requests/rules';

interface Type {
  id: string;
  name: string;
  requiredFields: string[];
}
interface Initial {
  id: string;
  clientId: string;
  typeId: string;
  brandId: string | null;
  title: string;
  description: string;
  objective: string | null;
  audience: string | null;
  network: string | null;
  format: string | null;
  desiredDate: string | null;
  referenceNotes: string | null;
  approvalRequired: boolean;
  priority: string;
  urgencyReason: string | null;
}

const FORMATS = ['Post estático', 'Carrossel', 'Reels', 'Stories', 'Vídeo', 'Texto', 'Outro'];

export function RequestForm({
  mode,
  clients,
  types,
  initial,
}: {
  mode: 'create' | 'edit';
  clients: { id: string; name: string }[];
  types: Type[];
  initial?: Initial;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [clientId, setClientId] = useState(initial?.clientId ?? clients[0]?.id ?? '');
  const [typeId, setTypeId] = useState(initial?.typeId ?? types[0]?.id ?? '');
  const [priority, setPriority] = useState(initial?.priority ?? 'normal');
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string[]> | undefined>();
  const [duplicates, setDuplicates] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const required = new Set(types.find((t) => t.id === typeId)?.requiredFields ?? []);
  const req = (k: string) => required.has(k);
  const star = (k: string, label: string) => (req(k) ? `${label} *` : label);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    api<{ brands: { id: string; name: string; status: string }[] }>(
      'GET',
      `/api/clients/${clientId}/brands`,
    ).then((r) => {
      if (!cancelled) setBrands(r.ok ? r.data!.brands.filter((b) => b.status === 'active') : []);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function submit(force = false) {
    const f = new FormData(formRef.current!);
    const body: Record<string, unknown> = {
      title: f.get('title'),
      description: f.get('description'),
      brandId: str(f, 'brandId'),
      objective: str(f, 'objective'),
      audience: str(f, 'audience'),
      network: str(f, 'network'),
      format: str(f, 'format'),
      desiredDate: str(f, 'desiredDate'),
      referenceNotes: str(f, 'referenceNotes'),
      approvalRequired: f.get('approvalRequired') === 'on',
      priority,
      urgencyReason: str(f, 'urgencyReason'),
      typeId,
    };
    if (mode === 'create') {
      body.clientId = clientId;
      body.requesterName = str(f, 'requesterName');
      if (force) body.force = true;
    }
    setBusy(true);
    const r =
      mode === 'create'
        ? await api<{ id: string }>('POST', '/api/requests', body)
        : await api('PATCH', `/api/requests/${initial!.id}`, body);
    setBusy(false);
    if (r.ok) {
      router.push(
        `/solicitacoes/${mode === 'create' ? (r.data as { id: string }).id : initial!.id}`,
      );
      router.refresh();
      return;
    }
    setDetails(r.error?.details);
    if (r.error?.code === 'CONFLICT' && r.error.details?.duplicates) {
      setDuplicates(r.error.details.duplicates);
      setError(null);
    } else {
      setDuplicates(null);
      setError(r.error?.message ?? 'Não foi possível salvar.');
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="stack"
      noValidate
    >
      {error && <Alert tone="danger">{error}</Alert>}
      {duplicates && (
        <Alert tone="warning">
          <strong>Possível duplicidade.</strong> Já existem solicitações parecidas em aberto para
          este cliente:
          <ul>
            {duplicates.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          Se esta solicitação é diferente, confirme abaixo.
          <div style={{ marginTop: 8 }}>
            <Button type="button" variant="secondary" onClick={() => submit(true)}>
              Criar mesmo assim
            </Button>
          </div>
        </Alert>
      )}
      <section className="section stack" aria-labelledby="rq-basico">
        <h2 id="rq-basico">Dados da solicitação</h2>
        <div className="form-row">
          <div className="field">
            <label htmlFor="rq-client">Cliente *</label>
            <select
              id="rq-client"
              className="input"
              value={clientId}
              disabled={mode === 'edit'}
              onChange={(e) => setClientId(e.target.value)}
              required
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {fieldError(details, 'clientId') && (
              <span className="field-error">{fieldError(details, 'clientId')}</span>
            )}
          </div>
          <div className="field">
            <label htmlFor="rq-type">Tipo *</label>
            <select
              id="rq-type"
              className="input"
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className="field-hint">Campos marcados com * dependem do tipo escolhido.</span>
          </div>
          <div className="field">
            <label htmlFor="rq-brand">{star('brandId', 'Marca')}</label>
            <select
              id="rq-brand"
              name="brandId"
              className="input"
              defaultValue={initial?.brandId ?? ''}
              key={clientId}
            >
              <option value="">Sem marca específica</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {fieldError(details, 'brandId') && (
              <span className="field-error">{fieldError(details, 'brandId')}</span>
            )}
          </div>
        </div>
        <Field
          id="rq-title"
          name="title"
          label="Título *"
          defaultValue={initial?.title ?? ''}
          error={fieldError(details, 'title')}
          required
        />
        <div className="field">
          <label htmlFor="rq-desc">Descrição *</label>
          <textarea
            id="rq-desc"
            name="description"
            className="input"
            rows={4}
            style={{ padding: 10, minHeight: 100 }}
            defaultValue={initial?.description ?? ''}
            required
            aria-invalid={fieldError(details, 'description') ? true : undefined}
          />
          {fieldError(details, 'description') && (
            <span className="field-error">{fieldError(details, 'description')}</span>
          )}
        </div>
        <div className="field">
          <label htmlFor="rq-obj">{star('objective', 'Objetivo')}</label>
          <textarea
            id="rq-obj"
            name="objective"
            className="input"
            rows={2}
            style={{ padding: 10, minHeight: 64 }}
            defaultValue={initial?.objective ?? ''}
          />
          {fieldError(details, 'objective') && (
            <span className="field-error">{fieldError(details, 'objective')}</span>
          )}
        </div>
        <div className="form-row">
          <Field
            id="rq-aud"
            name="audience"
            label={star('audience', 'Público')}
            defaultValue={initial?.audience ?? ''}
            error={fieldError(details, 'audience')}
          />
          <div className="field">
            <label htmlFor="rq-net">{star('network', 'Rede social')}</label>
            <select
              id="rq-net"
              name="network"
              className="input"
              defaultValue={initial?.network ?? ''}
            >
              <option value="">Não definida</option>
              {Object.entries(NETWORK_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {fieldError(details, 'network') && (
              <span className="field-error">{fieldError(details, 'network')}</span>
            )}
          </div>
          <div className="field">
            <label htmlFor="rq-fmt">{star('format', 'Formato')}</label>
            <input
              id="rq-fmt"
              name="format"
              className="input"
              list="rq-formats"
              defaultValue={initial?.format ?? ''}
            />
            <datalist id="rq-formats">
              {FORMATS.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
            {fieldError(details, 'format') && (
              <span className="field-error">{fieldError(details, 'format')}</span>
            )}
          </div>
          <Field
            id="rq-date"
            name="desiredDate"
            label={star('desiredDate', 'Data desejada')}
            type="date"
            defaultValue={initial?.desiredDate ?? ''}
            error={fieldError(details, 'desiredDate')}
          />
        </div>
        <div className="field">
          <label htmlFor="rq-ref">{star('referenceNotes', 'Referências')}</label>
          <textarea
            id="rq-ref"
            name="referenceNotes"
            className="input"
            rows={2}
            style={{ padding: 10, minHeight: 64 }}
            defaultValue={initial?.referenceNotes ?? ''}
            aria-describedby="rq-ref-h"
          />
          <span id="rq-ref-h" className="field-hint">
            Links e observações. O envio de arquivos anexos chega com a Biblioteca (Etapa 06).
          </span>
          {fieldError(details, 'referenceNotes') && (
            <span className="field-error">{fieldError(details, 'referenceNotes')}</span>
          )}
        </div>
      </section>

      <section className="section stack" aria-labelledby="rq-prazo">
        <h2 id="rq-prazo">Prioridade e aprovação</h2>
        <div className="form-row">
          <div className="field">
            <label htmlFor="rq-prio">Prioridade</label>
            <select
              id="rq-prio"
              className="input"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {mode === 'create' && (
            <Field
              id="rq-reqn"
              name="requesterName"
              label="Solicitante (se for em nome de outra pessoa)"
            />
          )}
        </div>
        {priority === 'urgent' && (
          <Field
            id="rq-urg"
            name="urgencyReason"
            label="Justificativa da urgência *"
            defaultValue={initial?.urgencyReason ?? ''}
            error={fieldError(details, 'urgencyReason')}
          />
        )}
        <label className="row" style={{ minHeight: 44 }}>
          <input
            type="checkbox"
            name="approvalRequired"
            className="check"
            defaultChecked={initial?.approvalRequired ?? true}
          />{' '}
          Requer aprovação do cliente
        </label>
      </section>
      <div className="actions">
        <Button type="submit" disabled={busy}>
          {busy ? 'Salvando…' : mode === 'create' ? 'Enviar solicitação' : 'Salvar alterações'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
      <p className="muted">
        Campos obrigatórios deste tipo:{' '}
        {[...required]
          .map((k) => CONFIGURABLE_FIELDS[k as keyof typeof CONFIGURABLE_FIELDS])
          .join(', ') || 'nenhum além do básico'}
        .
      </p>
    </form>
  );
}
