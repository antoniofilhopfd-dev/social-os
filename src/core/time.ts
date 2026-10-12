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

/** Instante UTC em que o dia local `date` (AAAA-MM-DD) começa no fuso informado. */
export function startOfLocalDay(date: string, tz = APP_TIMEZONE): Date {
  const guess = new Date(`${date}T00:00:00Z`);
  // diferença entre o relógio local nesse instante e o UTC, aplicada de volta (vale para fusos sem DST ambíguo à meia-noite)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(guess);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(
    g('year'),
    g('month') - 1,
    g('day'),
    g('hour') % 24,
    g('minute'),
    g('second'),
  );
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

/** Primeiro instante do dia seguinte ao dia local `date` (limite superior exclusivo de um período). */
export function startOfNextLocalDay(date: string, tz = APP_TIMEZONE): Date {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return startOfLocalDay(next.toISOString().slice(0, 10), tz);
}
