import { NextResponse } from 'next/server';

const INLINE = new Set(['image', 'video', 'pdf']);

export interface FilePayload {
  mime: string;
  kind: string;
  name: string;
  ext: string;
  data: Buffer;
}

/** Entrega com o MIME detectado (nunca o informado), sem sniffing, isolada por CSP/sandbox e com suporte a Range. */
export function fileResponse(req: Request, f: FilePayload): Response {
  const headers: Record<string, string> = {
    'Content-Type': f.mime,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, max-age=0, must-revalidate',
    'Accept-Ranges': 'bytes',
  };
  const download = new URL(req.url).searchParams.get('download') === '1';
  const inline = INLINE.has(f.kind) && !download;
  const fname = encodeURIComponent(f.name.replace(/\.[^.]*$/, '') + '.' + f.ext);
  headers['Content-Disposition'] = `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${fname}`;
  const total = f.data.length;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : total - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : total - 1;
    start = Math.max(0, start);
    end = Math.min(end, total - 1);
    if (start > end || start >= total)
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${total}` },
      });
    return new NextResponse(new Uint8Array(f.data.subarray(start, end + 1)), {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': String(end - start + 1),
      },
    });
  }
  return new NextResponse(new Uint8Array(f.data), {
    headers: { ...headers, 'Content-Length': String(total) },
  });
}
