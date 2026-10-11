'use client';

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, string[]> };
}

/** Chamada à API interna com tratamento uniforme de erro (inclusive falha de rede). */
export async function api<T = Record<string, unknown>>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: (json.error as ApiResult<T>['error']) ?? {
          code: 'INTERNAL',
          message: 'Erro inesperado.',
        },
      };
    }
    return { ok: true, status: res.status, data: json as T };
  } catch {
    return {
      ok: false,
      status: 0,
      error: { code: 'NETWORK', message: 'Sem conexão. Verifique sua internet e tente novamente.' },
    };
  }
}
