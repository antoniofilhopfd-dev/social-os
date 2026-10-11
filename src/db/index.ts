import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { getEnv } from '@/core/env';
import { getPool } from '@/core/db';
import * as schema from './schema';

export type Db = MySql2Database<typeof schema>;

export function createDb(pool: Parameters<typeof drizzle>[0]): Db {
  return drizzle(pool as never, { schema, mode: 'default' });
}

let db: Db | undefined;
export function getDb(): Db {
  const g = globalThis as unknown as { __socialosDb?: Db };
  db ??= g.__socialosDb ??= createDb(getPool(getEnv().DATABASE_URL));
  return db;
}

export { schema };
