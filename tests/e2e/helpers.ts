import { readFileSync } from 'node:fs';
import path from 'node:path';
import { request, type APIRequestContext, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { users } from '@/db/schema';
import { notify } from '@/modules/notifications/service';
import { world } from '../helpers/db';
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
  notificationA: string;
  brandA: string;
  profileA: string;
  contactA: string;
  dateA: string;
  typeA: string;
  pillarA: string;
  campaignA: string;
  contentA1: string;
  projectA: string;
  approvalA: string;
  taskA: string;
  taskB: string;
  contentA2: string;
  contentExtA1: string;
  contentB1: string;
  requestA1: string;
  requestA2: string;
  requestExtA1: string;
  requestB1: string;
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

/** Cria uma notificação de teste direto no banco de testes (a origem real é testada nos testes de integração). */
export async function seedNotification(email: string, title: string, orgId: string) {
  const w = world();
  try {
    const [u] = await w.db.select().from(users).where(eq(users.email, email));
    await notify(w.db, { organizationId: orgId, userId: u!.id, type: 'role_changed', title });
  } finally {
    await w.close();
  }
}
