import 'dotenv/config';
import path from 'node:path';
import { parseEnv } from '../src/core/env';
import { applied, connect, loadMigrations, migrateDown, migrateUp } from '../src/core/migrations';

async function main() {
  const cmd = process.argv[2] ?? 'status';
  const env = parseEnv(process.env);
  const url =
    process.env.MIGRATE_TARGET === 'test' && env.TEST_DATABASE_URL
      ? env.TEST_DATABASE_URL
      : env.DATABASE_URL;
  const migrations = await loadMigrations(path.resolve(__dirname, '../migrations'));
  const conn = await connect(url);
  try {
    if (cmd === 'up')
      console.log(
        'Aplicadas:',
        (await migrateUp(conn, migrations)).join(', ') || 'nenhuma (já atualizado)',
      );
    else if (cmd === 'down')
      console.log('Revertidas:', (await migrateDown(conn, migrations)).join(', ') || 'nenhuma');
    else if (cmd === 'status') {
      const done = new Set(await applied(conn));
      for (const m of migrations)
        console.log(`${done.has(m.version) ? '[x]' : '[ ]'} ${m.version} ${m.name}`);
    } else throw new Error(`Comando desconhecido: ${cmd}`);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
