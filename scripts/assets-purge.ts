import 'dotenv/config';
import path from 'node:path';
import { getEnv } from '../src/core/env';
import { createPool } from '../src/core/db';
import { createDb } from '../src/db';
import { LocalStorageDriver } from '../src/integrations/storage/local';
import { purgeExpiredAssets } from '../src/modules/library/service';

/** Exclui definitivamente arquivos que ficaram mais de 30 dias na lixeira. Agendar diariamente (cron). */
async function main() {
  const env = getEnv();
  const pool = createPool(env.DATABASE_URL);
  try {
    const n = await purgeExpiredAssets(
      createDb(pool),
      new LocalStorageDriver(path.resolve(process.cwd(), env.STORAGE_DIR)),
    );
    console.log(`Arquivos excluídos definitivamente: ${n}`);
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
