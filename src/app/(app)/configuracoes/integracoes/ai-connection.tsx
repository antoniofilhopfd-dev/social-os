'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Badge } from '@/ui/components';
import { ConfirmDialog } from '@/ui/confirm-dialog';

interface Props {
  configured: boolean;
  status: 'active' | 'disabled' | 'error' | null;
  secretHint: string | null;
  model: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  canManage: boolean;
  models: { id: string; label: string }[];
  serverReady: boolean;
}

export function AiConnection(p: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fe = (k: string) => fields[k]?.[0];

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    const r = await api('PUT', '/api/integrations/ai', {
      apiKey: String(f.get('apiKey') ?? '').trim() || undefined,
      model: String(f.get('model') ?? ''),
    });
    setBusy(false);
    if (r.ok) {
      form.reset();
      setError(null);
      setFields({});
      setOk('Configuração salva. Use “Testar conexão” para validar a chave.');
      router.refresh();
    } else {
      setOk(null);
      setError(r.error?.message ?? 'Erro.');
      setFields(r.error?.details ?? {});
    }
  }
  async function test() {
    setBusy(true);
    const r = await api('POST', '/api/integrations/ai/test');
    setBusy(false);
    if (r.ok) {
      setError(null);
      setOk('Conexão validada com sucesso.');
    } else {
      setOk(null);
      setError(r.error?.message ?? 'Falha no teste.');
    }
    router.refresh();
  }
  async function remove() {
    const r = await api('DELETE', '/api/integrations/ai');
    if (r.ok) {
      setOk('Conexão removida.');
      router.refresh();
    } else setError(r.error?.message ?? 'Erro.');
  }

  return (
    <section className="section stack" aria-labelledby="ia-h">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id="ia-h">Assistente de IA (Anthropic)</h2>
        <Badge
          tone={p.status === 'active' ? 'success' : p.status === 'error' ? 'danger' : 'neutral'}
        >
          {p.status === 'active'
            ? 'Conectado'
            : p.status === 'error'
              ? 'Com erro'
              : 'Não configurado'}
        </Badge>
      </div>
      <p className="muted">
        Gera sugestões de legenda, hashtags, chamadas e revisão de texto no editor. As sugestões
        nunca são salvas, aprovadas nem publicadas automaticamente: uma pessoa revisa e decide. O
        texto do conteúdo (sem observações internas) é enviado ao serviço da Anthropic para gerar a
        resposta; a chave fica cifrada no servidor e nunca é exibida.
      </p>
      {!p.serverReady && (
        <Alert tone="warning">
          O servidor ainda não tem APP_SECRET definido; não é possível guardar chaves com segurança.
        </Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      {ok && <Alert tone="success">{ok}</Alert>}
      {p.configured || p.status === 'error' ? (
        <dl className="kv">
          <dt>Chave</dt>
          <dd>{p.secretHint}</dd>
          <dt>Modelo</dt>
          <dd>{p.models.find((m) => m.id === p.model)?.label ?? p.model}</dd>
          <dt>Último teste</dt>
          <dd>
            {p.lastCheckedAt ? new Date(p.lastCheckedAt).toLocaleString('pt-BR') : 'Nunca testado'}
          </dd>
          {p.lastError && (
            <>
              <dt>Erro</dt>
              <dd>{p.lastError}</dd>
            </>
          )}
        </dl>
      ) : null}
      {p.canManage ? (
        <form onSubmit={save} className="stack" noValidate aria-label="Configurar IA">
          <div className="field">
            <label htmlFor="ia-key">
              {p.secretHint ? 'Nova chave de API (deixe em branco para manter)' : 'Chave de API'}
            </label>
            <input
              id="ia-key"
              name="apiKey"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="input"
              aria-invalid={fe('apiKey') ? true : undefined}
            />
            {fe('apiKey') && <span className="field-error">{fe('apiKey')}</span>}
          </div>
          <div className="field">
            <label htmlFor="ia-model">Modelo</label>
            <select id="ia-model" name="model" className="input" defaultValue={p.model}>
              {p.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            {fe('model') && <span className="field-error">{fe('model')}</span>}
          </div>
          <div className="row">
            <button className="btn btn-primary" type="submit" disabled={busy || !p.serverReady}>
              Salvar
            </button>
            {(p.configured || p.status === 'error') && (
              <button
                className="btn btn-secondary"
                type="button"
                disabled={busy}
                onClick={() => void test()}
              >
                Testar conexão
              </button>
            )}
            {(p.configured || p.status === 'error') && (
              <ConfirmDialog
                triggerLabel="Remover conexão"
                title="Remover a conexão com a IA?"
                description="A chave será apagada do servidor e o assistente deixa de aparecer no editor."
                confirmLabel="Remover conexão"
                onConfirm={() => void remove()}
              />
            )}
          </div>
        </form>
      ) : (
        <p className="muted">
          Só administradores com permissão de integrações podem alterar esta conexão.
        </p>
      )}
    </section>
  );
}
