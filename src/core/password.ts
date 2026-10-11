import { hash, verify } from '@node-rs/argon2';

// Argon2id com parâmetros mínimos recomendados pela OWASP (m=19 MiB, t=2, p=1).
const OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

// Lista curta e local de senhas notoriamente fracas. Não substitui uma base como a do HIBP.
const COMMON = new Set(
  [
    'password1234',
    '123456789012',
    'qwertyuiop12',
    'senha1234567',
    'senhasenha123',
    'mudar123456',
    'administrador',
    'password12345',
    'abcdefghijkl',
    'iloveyou1234',
    '111111111111',
    '000000000000',
    '1q2w3e4r5t6y',
    'brasil123456',
    'socialmedia123',
  ].map((s) => s.toLowerCase()),
);

export function validatePassword(
  password: string,
  context: { email?: string; name?: string } = {},
): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN)
    problems.push(`A senha deve ter pelo menos ${PASSWORD_MIN} caracteres.`);
  if (password.length > PASSWORD_MAX)
    problems.push(`A senha deve ter no máximo ${PASSWORD_MAX} caracteres.`);
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password))
    problems.push('Essa senha é muito comum. Escolha outra.');
  const local = context.email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local))
    problems.push('A senha não pode conter o seu e-mail.');
  return problems;
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;
/** Executa uma verificação "de mentira" para igualar o tempo quando o usuário não existe. */
export async function burnVerification(password: string): Promise<void> {
  dummy ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(await dummy, password);
}
