import { describe, expect, it } from 'vitest';
import { AppError, toErrorResponse } from '@/core/errors';

describe('toErrorResponse', () => {
  it('mapeia AppError para status e corpo padronizados', () => {
    const r = toErrorResponse(new AppError('FORBIDDEN', 'Sem permissão'));
    expect(r.status).toBe(403);
    expect(r.body.error).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
  });

  it('não vaza detalhes de erros desconhecidos', () => {
    const r = toErrorResponse(new Error('connect ECONNREFUSED mysql://u:pw@h'));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('mysql');
  });
});
