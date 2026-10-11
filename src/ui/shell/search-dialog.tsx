'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/ui/api-client';

interface Results {
  clients: { id: string; name: string; href: string }[];
  people: { userId: string; name: string; email: string; href: string }[];
}

export function SearchDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  // Resposta mais recente, marcada com o termo que a originou (evita exibir resultado de busca antiga).
  const [answer, setAnswer] = useState<{
    term: string;
    data: Results | null;
    error: string | null;
  } | null>(null);

  const term = q.trim();
  const active = term.length >= 2;
  const current = active && answer?.term === term ? answer : null;
  const loading = active && !current;
  const results = current?.data ?? null;
  const error = current?.error ?? null;

  const open = useCallback(() => {
    ref.current?.showModal();
    inputRef.current?.focus();
  }, []);
  const close = () => ref.current?.close();

  // Atalho "/" abre a busca (exceto ao digitar em campos).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing =
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable);
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        open();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (term.length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await api<Results>('GET', `/api/search?q=${encodeURIComponent(term)}`);
      if (cancelled) return;
      setAnswer({
        term,
        data: r.ok ? r.data! : null,
        error: r.ok ? null : (r.error?.message ?? 'Falha na busca.'),
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term]);

  const empty = results && results.clients.length === 0 && results.people.length === 0;

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        onClick={open}
        aria-label="Buscar (atalho: tecla /)"
      >
        Buscar <kbd aria-hidden="true">/</kbd>
      </button>
      <dialog
        ref={ref}
        className="search-dialog"
        aria-label="Busca"
        onClick={(e) => e.target === ref.current && close()}
      >
        <div className="field">
          <label htmlFor="global-search">Buscar clientes e pessoas</label>
          <input
            id="global-search"
            ref={inputRef}
            className="input"
            type="text"
            role="searchbox"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Digite ao menos 2 letras"
          />
        </div>
        <div role="status" aria-live="polite">
          {loading && <p className="muted">Buscando…</p>}
          {error && <p className="field-error">{error}</p>}
          {empty && !loading && <p className="muted">Nada encontrado para “{term}”.</p>}
        </div>
        {results && !empty && (
          <div>
            {results.clients.length > 0 && (
              <>
                <p className="search-group">Clientes</p>
                <ul className="search-results">
                  {results.clients.map((c) => (
                    <li key={c.id}>
                      <Link href={c.href} onClick={close}>
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {results.people.length > 0 && (
              <>
                <p className="search-group">Pessoas</p>
                <ul className="search-results">
                  {results.people.map((p) => (
                    <li key={p.userId}>
                      <Link href={p.href} onClick={close}>
                        {p.name} <span className="muted">· {p.email}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={close}>
            Fechar
          </button>
        </div>
      </dialog>
    </>
  );
}
