'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Badge, Button } from '@/ui/components';
import {
  CHECKLISTS,
  FIELD_LABELS,
  HARD_LIMITS,
  MAX_SLIDES,
  charCount,
  hashtagList,
  limitReports,
  missingForFormat,
  type EditorBody,
  type FieldDiff,
  type TextField,
} from '@/modules/editor/rules';
import type { ContentFormat } from '@/modules/contents/rules';

export interface VersionItem {
  id: string;
  number: number;
  note: string | null;
  source: string;
  createdAt: string;
  createdByName: string | null;
}
export interface BlockItem {
  id: string;
  name: string;
  kind: string;
  text: string;
}
export interface LinkedAsset {
  id: string;
  displayName: string;
  kind: string;
  role: string;
  trashed: boolean;
}
interface PickAsset {
  id: string;
  displayName: string;
  kind: string;
}
type SaveState = 'saved' | 'saving' | 'dirty' | 'error' | 'conflict';

const MAIN_FIELDS: TextField[] = ['hook', 'caption', 'script', 'cta', 'hashtags'];
const SIDE_FIELDS: TextField[] = [
  'coverText',
  'altText',
  'productionNotes',
  'publishNotes',
  'references',
];
const SAVE_LABEL: Record<SaveState, string> = {
  saved: 'Salvo',
  saving: 'Salvando…',
  dirty: 'Alterações não salvas',
  error: 'Erro ao salvar',
  conflict: 'Conflito de edição',
};
const fmtDate = (iso: string) => new Date(iso).toLocaleString('pt-BR');

export function EditorPanel(props: {
  contentId: string;
  clientId: string;
  format: ContentFormat;
  network: string | null;
  canEdit: boolean;
  initialBody: EditorBody;
  initialRevision: number;
  updatedByName: string | null;
  versions: VersionItem[];
  blocks: BlockItem[];
  linked: LinkedAsset[];
}) {
  const { contentId, format, network, canEdit } = props;
  const [body, setBody] = useState<EditorBody>(props.initialBody);
  const [revision, setRevision] = useState(props.initialRevision);
  const [state, setState] = useState<SaveState>('saved');
  const [message, setMessage] = useState<string | null>(null);
  const [versions, setVersions] = useState(props.versions);
  const [linked, setLinked] = useState(props.linked);
  const [note, setNote] = useState('');
  const [diff, setDiff] = useState<{ a: number; b: number; diffs: FieldDiff[] } | null>(null);
  const [cmpA, setCmpA] = useState('');
  const [cmpB, setCmpB] = useState('');
  const [pick, setPick] = useState<PickAsset[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef(body);
  const revRef = useRef(revision);
  const busy = useRef(false);
  const dirty = useRef(false);
  const saveRef = useRef<() => Promise<void>>(async () => {});

  const save = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    dirty.current = false;
    setState('saving');
    const r = await api<{ revision: number }>('PUT', `/api/contents/${contentId}/editor/draft`, {
      baseRevision: revRef.current,
      body: bodyRef.current,
    });
    busy.current = false;
    if (r.ok) {
      revRef.current = r.data!.revision;
      setRevision(r.data!.revision);
      if (dirty.current) {
        setState('dirty');
        timer.current = setTimeout(() => void saveRef.current(), 800);
      } else {
        setState('saved');
        setMessage(null);
      }
    } else if (r.error?.code === 'CONFLICT') {
      setState('conflict');
      setMessage(r.error.message);
    } else {
      setState('error');
      setMessage(r.error?.message ?? 'Não foi possível salvar.');
    }
  }, [contentId]);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  function change(patch: Partial<EditorBody>) {
    if (!canEdit) return;
    bodyRef.current = { ...bodyRef.current, ...patch };
    setBody(bodyRef.current);
    dirty.current = true;
    setState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveRef.current(), 1200);
  }

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current || busy.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const missing = useMemo(() => missingForFormat(format, body), [format, body]);
  const limits = useMemo(() => limitReports(network, body), [network, body]);
  const tags = useMemo(
    () => hashtagList(`${body.caption} ${body.hashtags}`),
    [body.caption, body.hashtags],
  );
  const checklist = CHECKLISTS[format];

  async function reloadVersions() {
    const r = await api<{ items: VersionItem[] }>(
      'GET',
      `/api/contents/${contentId}/editor/versions`,
    );
    if (r.ok) setVersions(r.data!.items);
  }
  async function snapshot() {
    if (timer.current) clearTimeout(timer.current);
    if (dirty.current) await save();
    const r = await api('POST', `/api/contents/${contentId}/editor/versions`, {
      note: note || undefined,
    });
    if (r.ok) {
      setNote('');
      setMessage('Versão salva.');
      await reloadVersions();
    } else setMessage(r.error?.message ?? 'Não foi possível salvar a versão.');
  }
  async function restore(n: number) {
    const r = await api<{ revision: number; body: EditorBody }>(
      'POST',
      `/api/contents/${contentId}/editor/versions/${n}/restore`,
      { baseRevision: revRef.current },
    );
    if (r.ok) {
      const g = await api<{ draft: { body: EditorBody; revision: number } }>(
        'GET',
        `/api/contents/${contentId}/editor`,
      );
      if (g.ok) {
        bodyRef.current = g.data!.draft.body;
        revRef.current = g.data!.draft.revision;
        setBody(g.data!.draft.body);
        setRevision(g.data!.draft.revision);
        setState('saved');
        setMessage(`Versão ${n} restaurada no rascunho.`);
      }
    } else setMessage(r.error?.message ?? 'Não foi possível restaurar.');
  }
  async function compare() {
    const r = await api<{ a: number; b: number; diffs: FieldDiff[] }>(
      'GET',
      `/api/contents/${contentId}/editor/compare?a=${cmpA}&b=${cmpB}`,
    );
    if (r.ok) setDiff(r.data!);
    else setMessage(r.error?.message ?? 'Não foi possível comparar.');
  }
  async function reloadFromServer() {
    const g = await api<{ draft: { body: EditorBody; revision: number } }>(
      'GET',
      `/api/contents/${contentId}/editor`,
    );
    if (g.ok) {
      bodyRef.current = g.data!.draft.body;
      revRef.current = g.data!.draft.revision;
      setBody(g.data!.draft.body);
      setRevision(g.data!.draft.revision);
      dirty.current = false;
      setState('saved');
      setMessage(null);
    }
  }
  async function openPicker() {
    const r = await api<{ items: PickAsset[] }>('GET', `/api/assets?clientId=${props.clientId}`);
    setPick(r.ok ? r.data!.items : []);
  }
  async function link(assetId: string, role = 'attachment') {
    const r = await api('POST', `/api/contents/${contentId}/assets`, { assetId, role });
    if (r.ok) {
      const l = await api<{ items: LinkedAsset[] }>('GET', `/api/contents/${contentId}/assets`);
      if (l.ok) setLinked(l.data!.items);
      setPick(null);
    } else setMessage(r.error?.message ?? 'Não foi possível anexar.');
  }
  async function unlink(assetId: string) {
    const r = await api('DELETE', `/api/contents/${contentId}/assets`, { assetId });
    if (r.ok) setLinked((x) => x.filter((a) => a.id !== assetId));
  }
  function insertBlock(b: BlockItem) {
    const f: TextField = b.kind === 'hashtags' ? 'hashtags' : b.kind === 'cta' ? 'cta' : 'caption';
    const cur = body[f];
    change({ [f]: cur ? `${cur}\n${b.text}` : b.text } as Partial<EditorBody>);
  }
  function setSlide(i: number, patch: Partial<{ title: string; text: string }>) {
    change({ slides: body.slides.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  }
  function moveSlide(i: number, d: -1 | 1) {
    const s = [...body.slides];
    const j = i + d;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j]!, s[i]!];
    change({ slides: s });
  }

  const renderField = (f: TextField) => {
    const rows = f === 'caption' || f === 'script' ? 8 : f === 'hook' || f === 'cta' ? 3 : 4;
    const used = charCount(body[f]);
    return (
      <div className="field" key={f}>
        <label htmlFor={`ed-${f}`}>{FIELD_LABELS[f]}</label>
        <textarea
          id={`ed-${f}`}
          className="input"
          rows={rows}
          value={body[f]}
          readOnly={!canEdit}
          maxLength={HARD_LIMITS[f]}
          onChange={(e) => change({ [f]: e.target.value } as Partial<EditorBody>)}
        />
        <span className="field-hint">
          {used} / {HARD_LIMITS[f]} caracteres
        </span>
      </div>
    );
  };

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="muted" role="status" aria-live="polite" data-testid="save-state">
          <Badge
            tone={
              state === 'saved'
                ? 'success'
                : state === 'error' || state === 'conflict'
                  ? 'danger'
                  : 'warning'
            }
          >
            {SAVE_LABEL[state]}
          </Badge>{' '}
          {props.updatedByName && state === 'saved' && revision > 0
            ? `Última edição por ${props.updatedByName}.`
            : null}
        </p>
        {!canEdit && <Badge tone="neutral">Somente leitura</Badge>}
      </div>
      {message && (
        <Alert tone={state === 'conflict' || state === 'error' ? 'danger' : 'info'}>
          {message}
        </Alert>
      )}
      {state === 'conflict' && (
        <div className="row">
          <Button variant="secondary" onClick={() => void reloadFromServer()}>
            Descartar minhas alterações e recarregar
          </Button>
        </div>
      )}
      {(missing.length > 0 || limits.some((l) => l.over)) && (
        <Alert tone="warning">
          {missing.length > 0 && <>Itens ainda vazios para este formato: {missing.join('; ')}. </>}
          {limits
            .filter((l) => l.over)
            .map((l) => `${l.field}: ${l.used}/${l.limit} (acima do limite de referência)`)
            .join('; ')}
        </Alert>
      )}
      <div className="editor-grid">
        <section className="section stack" aria-labelledby="ed-texto">
          <h2 id="ed-texto">Texto</h2>
          {MAIN_FIELDS.map(renderField)}
          {limits.length > 0 && (
            <p className="muted" data-testid="limits">
              Limites de referência ({network}):{' '}
              {limits.map((l) => `${l.field} ${l.used}/${l.limit}`).join(' · ')}. Confirme na rede
              antes de publicar.
            </p>
          )}
          <p className="muted">Hashtags detectadas: {tags.length}</p>
        </section>
        <section className="section stack" aria-labelledby="ed-apoio">
          <h2 id="ed-apoio">Apoio e produção</h2>
          {SIDE_FIELDS.map(renderField)}
        </section>
      </div>

      <section className="section stack" aria-labelledby="ed-slides">
        <h2 id="ed-slides">{FIELD_LABELS.slides}</h2>
        {body.slides.length === 0 && <p className="muted">Nenhum slide/tela definido.</p>}
        {body.slides.map((s, i) => (
          <div key={i} className="slide-row">
            <strong>{i + 1}</strong>
            <div className="stack" style={{ flex: 1 }}>
              <input
                className="input"
                aria-label={`Título do slide ${i + 1}`}
                value={s.title}
                readOnly={!canEdit}
                maxLength={200}
                onChange={(e) => setSlide(i, { title: e.target.value })}
              />
              <textarea
                className="input"
                rows={2}
                aria-label={`Texto do slide ${i + 1}`}
                value={s.text}
                readOnly={!canEdit}
                maxLength={3000}
                onChange={(e) => setSlide(i, { text: e.target.value })}
              />
            </div>
            {canEdit && (
              <div className="row">
                <Button
                  variant="secondary"
                  className="btn-sm"
                  aria-label={`Subir slide ${i + 1}`}
                  onClick={() => moveSlide(i, -1)}
                >
                  ↑
                </Button>
                <Button
                  variant="secondary"
                  className="btn-sm"
                  aria-label={`Descer slide ${i + 1}`}
                  onClick={() => moveSlide(i, 1)}
                >
                  ↓
                </Button>
                <Button
                  variant="secondary"
                  className="btn-sm"
                  aria-label={`Remover slide ${i + 1}`}
                  onClick={() => change({ slides: body.slides.filter((_, k) => k !== i) })}
                >
                  Remover
                </Button>
              </div>
            )}
          </div>
        ))}
        {canEdit && (
          <div>
            <Button
              variant="secondary"
              disabled={body.slides.length >= MAX_SLIDES}
              onClick={() => change({ slides: [...body.slides, { title: '', text: '' }] })}
            >
              Adicionar slide
            </Button>
          </div>
        )}
      </section>

      <section className="section stack" aria-labelledby="ed-check">
        <h2 id="ed-check">Checklist de revisão</h2>
        <ul className="plain-list">
          {checklist.map((it) => (
            <li key={it.id}>
              <label className="row" style={{ flexWrap: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={body.checklist.includes(it.id)}
                  disabled={!canEdit}
                  onChange={(e) =>
                    change({
                      checklist: e.target.checked
                        ? [...body.checklist, it.id]
                        : body.checklist.filter((x) => x !== it.id),
                    })
                  }
                />
                {it.label}
              </label>
            </li>
          ))}
        </ul>
      </section>

      {props.blocks.length > 0 && canEdit && (
        <section className="section stack" aria-labelledby="ed-blocos">
          <h2 id="ed-blocos">Blocos de texto reutilizáveis</h2>
          <div className="row">
            {props.blocks.map((b) => (
              <Button
                key={b.id}
                variant="secondary"
                className="btn-sm"
                onClick={() => insertBlock(b)}
              >
                Inserir: {b.name}
              </Button>
            ))}
          </div>
        </section>
      )}

      <section className="section stack" aria-labelledby="ed-arquivos">
        <h2 id="ed-arquivos">Arquivos do conteúdo</h2>
        {linked.length === 0 && <p className="muted">Nenhum arquivo vinculado.</p>}
        <ul className="plain-list">
          {linked.map((a) => (
            <li key={a.id} className="row">
              <a href={`/biblioteca/${a.id}`}>{a.displayName}</a>
              <Badge tone="neutral">
                {a.role === 'cover' ? 'Capa' : a.role === 'reference' ? 'Referência' : 'Anexo'}
              </Badge>
              {a.trashed && <Badge tone="danger">Na lixeira</Badge>}
              {canEdit && (
                <Button
                  variant="secondary"
                  className="btn-sm"
                  aria-label={`Desvincular ${a.displayName}`}
                  onClick={() => void unlink(a.id)}
                >
                  Desvincular
                </Button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="stack">
            <div>
              <Button variant="secondary" onClick={() => void openPicker()}>
                Anexar da biblioteca
              </Button>
            </div>
            {pick && (
              <ul className="plain-list" aria-label="Arquivos disponíveis">
                {pick.length === 0 && <li className="muted">Nenhum arquivo deste cliente.</li>}
                {pick
                  .filter((p) => !linked.some((l) => l.id === p.id))
                  .map((p) => (
                    <li key={p.id} className="row">
                      {p.displayName}
                      <Button className="btn-sm" onClick={() => void link(p.id)}>
                        Anexar
                      </Button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="section stack" aria-labelledby="ed-previa">
        <h2 id="ed-previa">
          Prévia <Badge tone="info">Simulação</Badge>
        </h2>
        <p className="muted">
          Aproximação do texto. A aparência real depende da rede e é conferida na publicação.
        </p>
        <div className="preview" data-testid="preview">
          {body.hook && <strong>{body.hook}</strong>}
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{body.caption || 'Sem legenda.'}</p>
          {body.cta && <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{body.cta}</p>}
          {body.hashtags && <p className="muted">{body.hashtags}</p>}
        </div>
      </section>

      <section className="section stack" aria-labelledby="ed-versoes">
        <h2 id="ed-versoes">Versões</h2>
        {canEdit && (
          <div className="row">
            <input
              className="input"
              style={{ maxWidth: 360 }}
              aria-label="Nota da versão"
              placeholder="Nota (opcional)"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button onClick={() => void snapshot()}>Salvar versão</Button>
          </div>
        )}
        {versions.length === 0 && <p className="muted">Ainda não há versões salvas.</p>}
        <ul className="plain-list">
          {versions.map((v) => (
            <li key={v.id} className="row">
              <strong>Versão {v.number}</strong>
              <span className="muted">
                {fmtDate(v.createdAt)} · {v.createdByName ?? '—'}
                {v.note ? ` · ${v.note}` : ''}
              </span>
              {canEdit && (
                <Button
                  variant="secondary"
                  className="btn-sm"
                  aria-label={`Restaurar versão ${v.number}`}
                  onClick={() => void restore(v.number)}
                >
                  Restaurar
                </Button>
              )}
            </li>
          ))}
        </ul>
        {versions.length >= 2 && (
          <div className="row">
            <select
              className="input"
              style={{ maxWidth: 160 }}
              aria-label="Versão A"
              value={cmpA}
              onChange={(e) => setCmpA(e.target.value)}
            >
              <option value="">Versão A</option>
              {versions.map((v) => (
                <option key={v.id} value={v.number}>
                  Versão {v.number}
                </option>
              ))}
            </select>
            <select
              className="input"
              style={{ maxWidth: 160 }}
              aria-label="Versão B"
              value={cmpB}
              onChange={(e) => setCmpB(e.target.value)}
            >
              <option value="">Versão B</option>
              {versions.map((v) => (
                <option key={v.id} value={v.number}>
                  Versão {v.number}
                </option>
              ))}
            </select>
            <Button variant="secondary" disabled={!cmpA || !cmpB} onClick={() => void compare()}>
              Comparar
            </Button>
          </div>
        )}
        {diff && (
          <div data-testid="diff">
            <h3>
              Versão {diff.a} → versão {diff.b}
            </h3>
            {diff.diffs.length === 0 && <p className="muted">Sem diferenças.</p>}
            {diff.diffs.map((d) => (
              <div key={d.field}>
                <strong>{d.label}</strong>
                <p style={{ whiteSpace: 'pre-wrap' }}>
                  {d.ops.map((o, i) =>
                    o.type === 'eq' ? (
                      <span key={i}>{o.text}</span>
                    ) : o.type === 'add' ? (
                      <ins key={i}>{o.text}</ins>
                    ) : (
                      <del key={i}>{o.text}</del>
                    ),
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="ed-ia">
        <h2 id="ed-ia">Assistente de IA</h2>
        <p className="muted">
          Nenhum assistente de IA está configurado. A integração será habilitada na etapa de
          integrações externas.
        </p>
      </section>
    </div>
  );
}
