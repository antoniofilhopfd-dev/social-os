import 'dotenv/config';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createBackup, pruneBackups } from '../src/core/backup';
import { getEnv } from '../src/core/env';

/**
 * Cria um backup completo (banco + arquivos), com manifesto e checksums; cifra se BACKUP_PASSPHRASE estiver definida.
 *   npm run backup            # cria e aplica a retenção (7 diários, 4 semanais, 3 mensais)
 *   npm run backup -- --no-prune
 * Para guardar uma cópia FORA do servidor, envie o arquivo gerado para outro local (a frase não deve ir junto).
 */
async function main() {
  const { values } = parseArgs({ options: { 'no-prune': { type: 'boolean' } } });
  const env = getEnv();
  const { file, manifest } = await createBackup({
    databaseUrl: env.DATABASE_URL,
    storageDir: path.resolve(process.cwd(), env.STORAGE_DIR),
    outDir: path.resolve(process.cwd(), env.BACKUP_DIR),
    passphrase: env.BACKUP_PASSPHRASE,
  });
  const rows = Object.values(manifest.tables).reduce((a, b) => a + b, 0);
  console.log(`Backup criado: ${file}`);
  console.log(
    `  tabelas: ${Object.keys(manifest.tables).length} · linhas: ${rows} · arquivos: ${manifest.storage.files} · cifrado: ${manifest.encrypted ? 'sim' : 'NÃO (defina BACKUP_PASSPHRASE)'}`,
  );
  if (!values['no-prune']) {
    const removed = await pruneBackups(path.resolve(process.cwd(), env.BACKUP_DIR));
    if (removed.length)
      console.log(`  retenção: ${removed.length} backup(s) antigo(s) removido(s)`);
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
