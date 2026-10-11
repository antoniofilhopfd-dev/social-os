import { readFileSync } from 'node:fs';
import path from 'node:path';
import { request, type APIRequestContext, type Page } from '@playwright/test';
import { PASSWORD } from './constants';

export const BASE = 'http://localhost:3100';
export { PASSWORD };

export interface Fixtures {
  A: string;
  B: string;
  clientA1: string;
  clientA2: string;
  clientB1: string;
  roleA: string;
  invitationA: string;
  membershipWriterA: string;
  writerAUserId: string;
  ownerAUserId: string;
}
export const fx = (): Fixtures =>
  JSON.parse(readFileSync(path.resolve(__dirname, '.fixtures.json'), 'utf8'));

/** Origem válida para mutações (a API exige Origin ou Sec-Fetch-Site). */
export const SAME_ORIGIN = { Origin: BASE };

export async function apiLogin(email: string, password = PASSWORD): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: SAME_ORIGIN });
  const res = await ctx.post('/api/auth/login', { data: { email, password } });
  if (!res.ok()) throw new Error(`login falhou para ${email}: ${res.status()}`);
  return ctx;
}

export async function uiLogin(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(`${BASE}/`);
}
