/** Fuso em que “hoje” é calculado para prazos e agenda (padrão: horário de Brasília). */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Sao_Paulo';

/** Data de hoje (AAAA-MM-DD) no fuso da aplicação — evita que, à noite, “hoje” vire o dia seguinte (UTC). */
export function todayLocal(now = new Date(), tz = APP_TIMEZONE): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return p; // en-CA já formata como AAAA-MM-DD
}

/** Hora atual (HH:MM) no fuso da aplicação. */
export function nowTimeLocal(now = new Date(), tz = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
}
