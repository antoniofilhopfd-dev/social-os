import { cookies } from 'next/headers';
import { getEnv } from '@/core/env';

export function isSecureDeployment(): boolean {
  return new URL(getEnv().APP_URL).protocol === 'https:';
}

/** Com HTTPS usa o prefixo `__Host-` (exige Secure, Path=/ e sem Domain). */
export function sessionCookieName(): string {
  return isSecureDeployment() ? '__Host-sid' : 'sid';
}

export async function setSessionCookie(token: string, expires: Date): Promise<void> {
  (await cookies()).set(sessionCookieName(), token, {
    httpOnly: true,
    secure: isSecureDeployment(),
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(sessionCookieName(), '', {
    httpOnly: true,
    secure: isSecureDeployment(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(sessionCookieName())?.value;
}
