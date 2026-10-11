import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string().regex(/^mysql:\/\//, 'deve começar com mysql://'),
  TEST_DATABASE_URL: z
    .string()
    .regex(/^mysql:\/\//)
    .optional(),
  STORAGE_DIR: z.string().min(1),
  /** 'true' somente se a aplicação está atrás de um proxy confiável que define X-Forwarded-For. */
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
});

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Configuração de ambiente inválida:\n - ${problems.join('\n - ')}`);
    this.name = 'EnvError';
  }
}

/** Valida as variáveis de ambiente. Lança EnvError listando apenas os NOMES com problema (nunca os valores). */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new EnvError(problems);
  }
  return result.data;
}

let cached: Env | undefined;
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
