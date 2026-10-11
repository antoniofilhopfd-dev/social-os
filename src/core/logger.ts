type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEY =
  /pass(word|wd)?|secret|token|authorization|cookie|api[-_]?key|database_url|session/i;
const URL_CREDENTIALS = /(\w+:\/\/[^:\s/]+:)([^@\s]+)(@)/g;

export const REDACTED = '[REDACTED]';

/** Remove valores sensíveis (por nome de chave) e credenciais embutidas em URLs. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.replace(URL_CREDENTIALS, `$1${REDACTED}$3`);
  if (value === null || typeof value !== 'object') return value;
  if (depth > 6) return '[TRUNCATED]';
  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message), stack: redact(value.stack) };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      SENSITIVE_KEY.test(k) ? REDACTED : redact(v, depth + 1),
    ]),
  );
}

export type LogSink = (line: string) => void;

export function createLogger(
  opts: { level?: Level; sink?: LogSink; base?: Record<string, unknown> } = {},
) {
  const min = order[opts.level ?? 'info'];
  const sink: LogSink = opts.sink ?? ((line) => process.stdout.write(line + '\n'));
  const emit = (level: Level, msg: string, ctx?: Record<string, unknown>) => {
    if (order[level] < min) return;
    const entry = {
      time: new Date().toISOString(),
      level,
      msg: redact(msg),
      ...(redact({ ...opts.base, ...ctx }) as object),
    };
    sink(JSON.stringify(entry));
  };
  return {
    debug: (m: string, c?: Record<string, unknown>) => emit('debug', m, c),
    info: (m: string, c?: Record<string, unknown>) => emit('info', m, c),
    warn: (m: string, c?: Record<string, unknown>) => emit('warn', m, c),
    error: (m: string, c?: Record<string, unknown>) => emit('error', m, c),
    child: (base: Record<string, unknown>) =>
      createLogger({ ...opts, base: { ...opts.base, ...base } }),
  };
}

export type Logger = ReturnType<typeof createLogger>;
