import 'dotenv/config';
import { accessSync, constants, mkdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadMigrations, connect, applied } from '../src/core/migrations';
import { hashPassword, verifyPassword } from '../src/core/password';
import { checkEnv, storageIsSafe, worst, type PreflightResult } from '../src/core/preflight';

/**
 * Verificação antes de subir/atualizar a aplicação no servidor. Não altera nada (só cria e apaga um arquivo de teste no STORAGE_DIR).
 *   npm run preflight             # falha (código 1) se algo obrigatório estiver errado
 *   npm run preflight -- --strict # avisos também falham
 */
async function main() {
  const { values } = parseArgs({ options: { strict: { type: 'boolean' } } });
  const out: PreflightResult[] = [];
  const add = (name: string, level: PreflightResult['level'], detail: string) =>
    out.push({ name, level, detail });

  const major = Number(process.versions.node.split('.')[0]);
  add('Node.js ≥ 20.9', major >= 20 ? 'ok' : 'fail', `v${process.versions.node}`);
  out.push(...checkEnv(process.env));

  // banco e migrações
  const url = process.env.DATABASE_URL;
  if (url?.startsWith('mysql://')) {
    try {
      const conn = await connect(url);
      try {
        const [rows] = await conn.query(
          'SELECT VERSION() AS v, @@character_set_database AS cs, @@collation_database AS co',
        );
        const r = (rows as { v: string; cs: string; co: string }[])[0]!;
        add('MySQL acessível', 'ok', `versão ${r.v}`);
        add('Banco em utf8mb4', r.cs === 'utf8mb4' ? 'ok' : 'fail', `${r.cs} / ${r.co}`);
        const files = await loadMigrations(path.resolve(process.cwd(), 'migrations'));
        const done = new Set(await applied(conn));
        const pending = files.filter((f) => !done.has(f.version)).map((f) => f.version);
        add(
          'Migrações aplicadas',
          pending.length === 0 ? 'ok' : 'fail',
          pending.length
            ? `pendentes: ${pending.join(', ')} — rode npm run db:migrate (após backup)`
            : `${files.length} aplicadas`,
        );
        const [tz] = await conn.query('SELECT @@global.time_zone AS g, @@session.time_zone AS s');
        add(
          'Fuso do MySQL',
          'ok',
          JSON.stringify((tz as unknown[])[0]) + ' (a aplicação grava e lê em UTC)',
        );
      } finally {
        await conn.end();
      }
    } catch (e) {
      add(
        'MySQL acessível',
        'fail',
        (e as Error).message.replace(/mysql:\/\/[^\s]+/g, 'mysql://***'),
      );
    }
  }

  // armazenamento
  const storage = path.resolve(process.cwd(), process.env.STORAGE_DIR ?? './storage');
  add(
    'Armazenamento fora de public/',
    storageIsSafe(storage, process.cwd()) ? 'ok' : 'fail',
    storage,
  );
  try {
    mkdirSync(storage, { recursive: true });
    const probe = path.join(storage, `.preflight-${process.pid}`);
    writeFileSync(probe, 'ok');
    rmSync(probe);
    accessSync(storage, constants.W_OK);
    add('Armazenamento gravável', 'ok', statSync(storage).isDirectory() ? 'ok' : '?');
  } catch (e) {
    add('Armazenamento gravável', 'fail', (e as Error).message);
  }

  // Argon2 nativo (risco declarado na hospedagem)
  try {
    const t = Date.now();
    const h = await hashPassword('verificacao-de-ambiente-123');
    const ok = await verifyPassword(h, 'verificacao-de-ambiente-123');
    add('Argon2 nativo funciona', ok ? 'ok' : 'fail', `${Date.now() - t} ms`);
  } catch (e) {
    add(
      'Argon2 nativo funciona',
      'fail',
      `${(e as Error).message} — ver plano B em docs/SEGURANCA.md`,
    );
  }

  // binários de backup
  for (const bin of ['mysqldump', 'mysql', 'tar']) {
    const r = spawnSync(bin, ['--version'], { stdio: 'ignore' });
    add(
      `Binário ${bin} (backup/restauração)`,
      r.status === 0 ? 'ok' : 'warn',
      r.status === 0
        ? 'disponível'
        : 'indisponível — backup automático não funcionará; usar o do provedor',
    );
  }

  add(
    'Build de produção presente',
    (() => {
      try {
        return statSync(path.resolve('.next/BUILD_ID')).isFile();
      } catch {
        return false;
      }
    })()
      ? 'ok'
      : 'warn',
    'rode npm run build',
  );

  const icon = { ok: '✔', warn: '!', fail: '✘' } as const;
  for (const r of out) console.log(`${icon[r.level]} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  const w = worst(out);
  console.log(
    `\nResultado: ${w === 'ok' ? 'PRONTO' : w === 'warn' ? 'PRONTO COM AVISOS' : 'NÃO PRONTO'}`,
  );
  process.exit(w === 'fail' || (values.strict && w === 'warn') ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
