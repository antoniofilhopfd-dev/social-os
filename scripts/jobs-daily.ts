import 'dotenv/config';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createBackup, pruneBackups } from '../src/core/backup';
import { createPool } from '../src/core/db';
import { getEnv } from '../src/core/env';
import { cleanupExpired } from '../src/core/maintenance';
import { createDb } from '../src/db';
import { LocalStorageDriver } from '../src/integrations/storage/local';
import { purgeExpiredAssets } from '../src/modules/library/service';

/**
 * Rotina diária (agendar no cron do servidor, p. ex. 03:30):
 *   1. exclui definitivamente arquivos que passaram 30 dias na lixeira;
 *   2. limpa sessões/links/tentativas vencidos;
 *   3. cria o backup e aplica a retenção (use --no-backup para pular).
 * Cada etapa é independente: uma falha é registrada, as demais continuam, e o código de saída fica ≠ 0.
 */
async function main() {
  const { values } = parseArgs({ options: { 'no-backup': { type: 'boolean' } } });
  const env = getEnv();
  const storageDir = path.resolve(process.cwd(), env.STORAGE_DIR);
  const pool = createPool(env.DATABASE_URL);
  const db = createDb(pool);
  let failed = false;
  const step = async (name: string, fn: () => Promise<string>) => {
    try {
      console.log(`[ok] ${name}: ${await fn()}`);
    } catch (e) {
      failed = true;
      console.error(`[FALHA] ${name}: ${e instanceof Error ? e.message : e}`);
    }
  };
  try {
    await step(
      'lixeira de arquivos',
      async () => `${await purgeExpiredAssets(db, new LocalStorageDriver(storageDir))} excluído(s)`,
    );
    await step('limpeza de dados efêmeros', async () => JSON.stringify(await cleanupExpired(db)));
    if (!values['no-backup'])
      await step('backup', async () => {
        const outDir = path.resolve(process.cwd(), env.BACKUP_DIR);
        const { file } = await createBackup({
          databaseUrl: env.DATABASE_URL,
          storageDir,
          outDir,
          passphrase: env.BACKUP_PASSPHRASE,
        });
        const removed = await pruneBackups(outDir);
        return `${path.basename(file)} (${removed.length} removido(s) pela retenção)`;
      });
  } finally {
    await pool.end();
  }
  if (failed) process.exit(1);
}
main();
