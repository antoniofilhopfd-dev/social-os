/** Tamanho legível em pt-BR (KB abaixo de 1 MB). */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / 1048576;
  return `${mb.toFixed(mb < 10 ? 1 : 0).replace('.', ',')} MB`;
}
