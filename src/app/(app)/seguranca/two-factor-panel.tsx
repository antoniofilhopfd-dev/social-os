'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert } from '@/ui/components';

type Mode = 'idle' | 'setup' | 'disable' | 'regen';

export function TwoFactorPanel({
  enabled,
  available,
  remaining,
}: {
  enabled: boolean;
  available: boolean;
  remaining: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('idle');
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const fe = (k: string) => fields[k]?.[0];

  async function fail(r: { error?: { message: string; details?: Record<string, string[]> } }) {
    setError(r.error?.message ?? 'Erro.');
    setFields(r.error?.details ?? {});
  }
  async function startSetup() {
    setBusy(true);
    const r = await api<{ secret: string; uri: string }>('POST', '/api/me/2fa/setup');
    setBusy(false);
    if (r.ok) {
      setSetup(r.data!);
      setMode('setup');
      setError(null);
    } else await fail(r);
  }
  async function confirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code') ?? '');
    setBusy(true);
    const r = await api<{ recoveryCodes: string[] }>('POST', '/api/me/2fa/enable', { code });
    setBusy(false);
    if (r.ok) {
      setCodes(r.data!.recoveryCodes);
      setSetup(null);
      setMode('idle');
      setError(null);
      setFields({});
      router.refresh();
    } else await fail(r);
  }
  async function reauth(e: React.FormEvent<HTMLFormElement>, kind: 'disable' | 'regen') {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await api<{ recoveryCodes?: string[] }>(
      'POST',
      kind === 'disable' ? '/api/me/2fa/disable' : '/api/me/2fa/recovery-codes',
      { password: String(f.get('password') ?? ''), code: String(f.get('code') ?? '') },
    );
    setBusy(false);
    if (r.ok) {
      if (kind === 'regen') setCodes(r.data!.recoveryCodes ?? null);
      setMode('idle');
      setError(null);
      setFields({});
      router.refresh();
    } else await fail(r);
  }

  const reauthForm = (kind: 'disable' | 'regen') => (
    <form
      className="stack"
      noValidate
      onSubmit={(e) => void reauth(e, kind)}
      aria-label={kind === 'disable' ? 'Desativar 2FA' : 'Gerar novos códigos'}
    >
      <div className="field">
        <label htmlFor="tf-pass">Sua senha</label>
        <input
          id="tf-pass"
          name="password"
          type="password"
          autoComplete="current-password"
          className="input"
          aria-invalid={fe('password') ? true : undefined}
        />
        {fe('password') && <span className="field-error">{fe('password')}</span>}
      </div>
      <div className="field">
        <label htmlFor="tf-code">Código do app (ou de recuperação)</label>
        <input
          id="tf-code"
          name="code"
          autoComplete="one-time-code"
          className="input"
          aria-invalid={fe('code') ? true : undefined}
        />
        {fe('code') && <span className="field-error">{fe('code')}</span>}
      </div>
      <div className="row">
        <button
          className={`btn ${kind === 'disable' ? 'btn-danger' : 'btn-primary'}`}
          type="submit"
          disabled={busy}
        >
          {kind === 'disable' ? 'Desativar 2FA' : 'Gerar novos códigos'}
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => setMode('idle')}>
          Cancelar
        </button>
      </div>
    </form>
  );

  return (
    <section className="section stack" aria-labelledby="tf-h">
      <h2 id="tf-h">Verificação em duas etapas (2FA)</h2>
      <p className="muted">
        Além da senha, o login passa a exigir um código de 6 dígitos gerado por um app autenticador
        (Google Authenticator, Authy, 1Password etc.).
      </p>
      {error && <Alert tone="danger">{error}</Alert>}
      {!available && (
        <Alert tone="warning">
          Indisponível neste servidor: o administrador precisa definir a variável APP_SECRET.
        </Alert>
      )}
      {codes && (
        <div className="stack" role="status">
          <Alert tone="warning">
            Guarde estes códigos de recuperação em local seguro. Cada um vale uma vez e eles{' '}
            <strong>não serão exibidos novamente</strong>.
          </Alert>
          <ul
            className="plain-list"
            data-testid="recovery-codes"
            style={{ fontFamily: 'ui-monospace, monospace' }}
          >
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div>
            <button className="btn btn-secondary" type="button" onClick={() => setCodes(null)}>
              Já guardei os códigos
            </button>
          </div>
        </div>
      )}
      {enabled ? (
        <>
          <p>
            <strong>2FA ativo.</strong> Códigos de recuperação restantes: {remaining}.
          </p>
          {mode === 'idle' && (
            <div className="row">
              <button className="btn btn-secondary" type="button" onClick={() => setMode('regen')}>
                Gerar novos códigos de recuperação
              </button>
              <button className="btn btn-danger" type="button" onClick={() => setMode('disable')}>
                Desativar 2FA
              </button>
            </div>
          )}
          {mode === 'disable' && reauthForm('disable')}
          {mode === 'regen' && reauthForm('regen')}
        </>
      ) : mode === 'setup' && setup ? (
        <form className="stack" noValidate onSubmit={confirm} aria-label="Confirmar 2FA">
          <ol>
            <li>Abra o app autenticador e adicione uma conta manualmente com esta chave:</li>
          </ol>
          <p>
            <code data-testid="totp-secret" style={{ wordBreak: 'break-all' }}>
              {setup.secret.match(/.{1,4}/g)?.join(' ')}
            </code>
          </p>
          <p className="muted">
            Em celulares, o link abre o app: <a href={setup.uri}>adicionar ao autenticador</a>.
            Tipo: baseado em tempo, 6 dígitos.
          </p>
          <div className="field">
            <label htmlFor="tf-confirm">Código de 6 dígitos mostrado no app</label>
            <input
              id="tf-confirm"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="input"
              aria-invalid={fe('code') ? true : undefined}
            />
            {fe('code') && <span className="field-error">{fe('code')}</span>}
          </div>
          <div className="row">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Ativar 2FA
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setMode('idle')}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!available || busy}
            onClick={() => void startSetup()}
          >
            Configurar 2FA
          </button>
        </div>
      )}
    </section>
  );
}
