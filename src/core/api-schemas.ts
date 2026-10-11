import { z } from 'zod';
import { AppError } from '@/core/errors';
import { isId } from '@/core/ids';

export const email = z.string().trim().min(3).max(254).email('E-mail inválido.');
export const personName = z.string().trim().min(2, 'Informe o nome.').max(190);
export const idSchema = z.string().refine(isId, 'Identificador inválido.');

/** IDs malformados em URL são tratados como "não encontrado", sem tocar no banco. */
export function idParam(value: string): string {
  if (!isId(value)) throw new AppError('NOT_FOUND', 'Recurso não encontrado.');
  return value;
}
