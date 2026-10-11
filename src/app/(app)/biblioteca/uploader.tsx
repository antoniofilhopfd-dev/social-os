'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Alert, Button } from '@/ui/components';

interface Row {
  name: string;
  state: 'sending' | 'ok' | 'dup' | 'error';
  message?: string;
}

export function Uploader({
  clientId,
  folderId,
  maxMb,
}: {
  clientId: string;
  folderId?: string;
  maxMb: number;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [tags, setTags] = useState('');

  async function send() {
    const files = [...(input.current?.files ?? [])];
    if (files.length === 0) {
      setRows([{ name: '', state: 'error', message: 'Selecione ao menos um arquivo.' }]);
      return;
    }
    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, state: 'sending' })));
    for (const [i, f] of files.entries()) {
      const set = (r: Row) => setRows((x) => x.map((o, k) => (k === i ? r : o)));
      if (f.size > maxMb * 1048576) {
        set({ name: f.name, state: 'error', message: `Acima do limite de ${maxMb} MB.` });
        continue;
      }
      const fd = new FormData();
      fd.set('clientId', clientId);
      if (folderId) fd.set('folderId', folderId);
      if (tags.trim()) fd.set('tags', tags);
      fd.set('file', f);
      try {
        const res = await fetch('/api/assets', {
          method: 'POST',
          body: fd,
          credentials: 'same-origin',
        });
        const json = (await res.json().catch(() => ({}))) as {
          duplicate?: boolean;
          error?: { message: string };
        };
        if (res.ok) set({ name: f.name, state: json.duplicate ? 'dup' : 'ok' });
        else
          set({ name: f.name, state: 'error', message: json.error?.message ?? 'Falha no envio.' });
      } catch {
        set({ name: f.name, state: 'error', message: 'Sem conexão.' });
      }
    }
    setBusy(false);
    if (input.current) input.current.value = '';
    router.refresh();
  }

  return (
    <section className="section stack" aria-labelledby="up-h">
      <h2 id="up-h">Enviar arquivos</h2>
      <div className="field">
        <label htmlFor="up-files">Arquivos (limite de {maxMb} MB cada)</label>
        <input id="up-files" ref={input} type="file" multiple className="input" />
      </div>
      <div className="field">
        <label htmlFor="up-tags">Etiquetas (separadas por vírgula)</label>
        <input
          id="up-tags"
          className="input"
          value={tags}
          maxLength={600}
          onChange={(e) => setTags(e.target.value)}
        />
      </div>
      <div>
        <Button disabled={busy} onClick={() => void send()}>
          {busy ? 'Enviando…' : 'Enviar'}
        </Button>
      </div>
      <ul className="plain-list" aria-live="polite">
        {rows.map((r, i) => (
          <li key={i}>
            {r.state === 'error' ? (
              <Alert tone="danger">
                {r.name ? `${r.name}: ` : ''}
                {r.message}
              </Alert>
            ) : (
              <span>
                {r.name} —{' '}
                {r.state === 'sending'
                  ? 'enviando…'
                  : r.state === 'dup'
                    ? 'já existia na biblioteca (reaproveitado)'
                    : 'enviado'}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
