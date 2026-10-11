/** Texto de um campo do formulário: aparado; vazio vira null. */
export function str(form: FormData, key: string): string | null {
  const v = form.get(key);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Primeira mensagem de erro de um campo, vinda de `error.details`. */
export function fieldError(
  details: Record<string, string[]> | undefined,
  key: string,
): string | undefined {
  return details?.[key]?.[0];
}
