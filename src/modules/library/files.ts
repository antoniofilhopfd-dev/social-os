/**
 * Validação de arquivos enviados. O tipo é decidido pelo CONTEÚDO (assinatura), nunca pelo nome ou pelo
 * Content-Type informado pelo navegador. SVG, HTML, scripts e executáveis são recusados de propósito
 * (risco de XSS e execução). Os tipos aceitos são imagens raster, vídeos MP4/MOV/WebM, PDF, Office (docx/xlsx/pptx) e texto.
 */
export type AssetKind = 'image' | 'video' | 'document' | 'other';
export interface DetectedFile {
  mime: string;
  ext: string;
  kind: AssetKind;
}

const startsWith = (b: Buffer, sig: number[], offset = 0) =>
  sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Buffer, from: number, to: number) => b.subarray(from, to).toString('latin1');

/** Extensões que nunca são aceitas, mesmo que o conteúdo pareça inofensivo (polyglots). */
const BLOCKED_EXT = new Set([
  'svg',
  'svgz',
  'html',
  'htm',
  'xhtml',
  'xml',
  'js',
  'mjs',
  'cjs',
  'php',
  'phtml',
  'exe',
  'dll',
  'bat',
  'cmd',
  'com',
  'sh',
  'bash',
  'ps1',
  'vbs',
  'jar',
  'msi',
  'scr',
  'apk',
  'swf',
  'hta',
  'jsp',
  'asp',
  'aspx',
  'py',
  'rb',
  'pl',
]);

export function extensionOf(name: string): string {
  const m = /\.([a-zA-Z0-9]{1,8})$/.exec(name.trim());
  return m ? m[1]!.toLowerCase() : '';
}

function isUtf8Text(buf: Buffer): boolean {
  if (buf.length === 0) return false;
  for (const byte of buf)
    if (byte === 0 || byte < 9 || (byte > 13 && byte < 32 && byte !== 27)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

export function detectFile(buf: Buffer, originalName: string): DetectedFile | null {
  const ext = extensionOf(originalName);
  if (BLOCKED_EXT.has(ext)) return null;
  if (buf.length < 4) return null;

  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { mime: 'image/png', ext: 'png', kind: 'image' };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg', kind: 'image' };
  if (ascii(buf, 0, 6) === 'GIF87a' || ascii(buf, 0, 6) === 'GIF89a')
    return { mime: 'image/gif', ext: 'gif', kind: 'image' };
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP')
    return { mime: 'image/webp', ext: 'webp', kind: 'image' };
  if (ascii(buf, 4, 8) === 'ftyp') {
    const brand = ascii(buf, 8, 12);
    if (brand === 'qt  ') return { mime: 'video/quicktime', ext: 'mov', kind: 'video' };
    if (/^(isom|iso2|iso4|iso5|iso6|mp41|mp42|avc1|M4V |M4VH|M4VP|dash|3gp\d|f4v )/.test(brand))
      return { mime: 'video/mp4', ext: 'mp4', kind: 'video' };
    return null; // HEIC/AVIF e demais marcas: não suportados
  }
  if (
    startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3]) &&
    buf.subarray(0, 64).includes(Buffer.from('webm'))
  )
    return { mime: 'video/webm', ext: 'webm', kind: 'video' };
  if (ascii(buf, 0, 5) === '%PDF-')
    return { mime: 'application/pdf', ext: 'pdf', kind: 'document' };
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    if (ext === 'docx' && buf.includes(Buffer.from('word/')))
      return {
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ext: 'docx',
        kind: 'document',
      };
    if (ext === 'xlsx' && buf.includes(Buffer.from('xl/')))
      return {
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ext: 'xlsx',
        kind: 'document',
      };
    if (ext === 'pptx' && buf.includes(Buffer.from('ppt/')))
      return {
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ext: 'pptx',
        kind: 'document',
      };
    return null; // zip genérico/jar/apk não são aceitos
  }
  if (['txt', 'csv', 'md'].includes(ext) && isUtf8Text(buf)) {
    // texto que parece HTML/script não é aceito
    const head = buf.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
    if (head.startsWith('<') || head.startsWith('#!')) return null;
    return {
      mime: ext === 'csv' ? 'text/csv' : ext === 'md' ? 'text/markdown' : 'text/plain',
      ext,
      kind: 'document',
    };
  }
  return null;
}

export function sanitizeFileName(name: string): string {
  let n = name.normalize('NFC').split(/[\\/]/).pop() ?? '';
  n = n
    .replace(/[\u0000-\u001f\u007f<>:"|?*\u202a-\u202e\u2066-\u2069]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  if (!n) return 'arquivo';
  if (n.length > 150) {
    const ext = extensionOf(n);
    n = ext ? `${n.slice(0, 150 - ext.length - 1)}.${ext}` : n.slice(0, 150);
  }
  return n;
}

/** Chave de armazenamento: só segmentos gerados pelo sistema (ULID + extensão detectada). Nenhum dado do usuário. */
export function storageKeyFor(
  organizationId: string,
  clientId: string,
  assetId: string,
  ext: string,
): string {
  return `orgs/${organizationId}/clients/${clientId}/${assetId}.${ext}`;
}

export function normalizeTag(raw: string): string | null {
  const t = raw
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .slice(0, 40);
  return t.length >= 2 ? t : null;
}

export const INLINE_KINDS = new Set(['image', 'video']);
export const INLINE_MIMES = new Set(['application/pdf']);
