import 'dotenv/config';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { restoreBackup } from '../src/core/backup';

/**
 * Restaura um backup em um banco de DESTINO (e, opcionalmente, no diretório de arquivos) e confere contagens e migrações.
 *   npm run restore -- --file backups/socialos-AAAAMMDDTHHMMSSZ.tar.gz.enc --target-db mysql://u:s@host/banco_novo --storage-dir ./storage-restaurado
 * Recusa banco/diretório não vazio, a menos que --force. Nunca usa DATABASE_URL por padrão (evita sobrescrever produção por engano).
 */
async function main() {
  const { values: v } = parseArgs({
    options: {
      file: { type: 'string' },
      'target-db': { type: 'string' },
      'storage-dir': { type: 'string' },
      force: { type: 'boolean' },
    },
  });
  if (!v.file || !v['target-db']) {
    console.error(
      'Uso: npm run restore -- --file <backup> --target-db <mysql://...> [--storage-dir <dir>] [--force]',
    );
    process.exit(2);
  }
  const r = await restoreBackup({
    file: path.resolve(v.file),
    targetDatabaseUrl: v['target-db'],
    storageDir: v['storage-dir'] ? path.resolve(v['storage-dir']) : undefined,
    passphrase: process.env.BACKUP_PASSPHRASE,
    force: v.force,
  });
  console.log(
    `Restauração concluída e conferida: ${r.tables} tabelas, ${r.rows} linhas (backup de ${r.manifest.createdAt}).`,
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
