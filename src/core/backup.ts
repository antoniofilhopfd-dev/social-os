import { spawn } from 'node:child_process';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCb,
} from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import mysql, { type RowDataPacket } from 'mysql2/promise';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const BACKUP_FORMAT = 1;
const MAGIC = Buffer.from('SOSBK1\n');

export interface Manifest {
  format: number;
  createdAt: string;
  database: string;
  migrations: string[];
  tables: Record<string, number>;
  files: Record<string, string | null>;
  storage: { included: boolean; files: number };
  encrypted: boolean;
}

export interface DbConn {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

export function parseDbUrl(url: string): DbConn {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || '3306',
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  };
}

/** Executa um programa SEM shell; a senha do MySQL vai por variável de ambiente (nunca aparece na lista de processos). */
function run(
  cmd: string,
  args: string[],
  opts: { env?: Record<string, string>; stdout?: string; stdin?: string; cwd?: string } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const out = opts.stdout ? createWriteStream(opts.stdout, { mode: 0o600 }) : null;
    const input = opts.stdin ? createReadStream(opts.stdin) : null;
    const p = spawn(cmd, args, {
      env: { ...process.env, ...opts.env },
      cwd: opts.cwd,
      stdio: [input ? 'pipe' : 'ignore', out ? 'pipe' : 'ignore', 'pipe'],
    });
    let err = '';
    p.stderr?.on('data', (d) => (err += String(d).slice(0, 2000)));
    if (out && p.stdout) p.stdout.pipe(out);
    if (input && p.stdin) input.pipe(p.stdin);
    p.on('error', (e) => reject(new Error(`Não foi possível executar ${cmd}: ${e.message}`)));
    p.on('close', (code) => {
      out?.end();
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${cmd} terminou com código ${code}: ${err.replace(/password[^\n]*/gi, '***').trim()}`,
          ),
        );
    });
  });
}

const mysqlEnv = (c: DbConn): Record<string, string> => ({ MYSQL_PWD: c.password });
const connArgs = (c: DbConn) => [`--host=${c.host}`, `--port=${c.port}`, `--user=${c.user}`];

export async function sha256File(file: string): Promise<string> {
  const h = createHash('sha256');
  await pipeline(createReadStream(file), h);
  return h.digest('hex');
}

async function listTables(conn: mysql.Connection): Promise<string[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  return rows.map((r) => String(r.t ?? r.TABLE_NAME));
}

export async function countRows(
  url: string,
): Promise<{ tables: Record<string, number>; migrations: string[] }> {
  const conn = await mysql.createConnection({ uri: url });
  try {
    const tables: Record<string, number> = {};
    for (const t of await listTables(conn)) {
      const [r] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM \`${t}\``);
      tables[t] = Number(r[0]?.n ?? 0);
    }
    let migrations: string[] = [];
    if ('schema_migrations' in tables) {
      const [rows] = await conn.query<RowDataPacket[]>(
        'SELECT version FROM schema_migrations ORDER BY version',
      );
      migrations = rows.map((x) => String(x.version));
    }
    return { tables, migrations };
  } finally {
    await conn.end();
  }
}

async function countFiles(dir: string): Promise<number> {
  let n = 0;
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.isDirectory()) n += await countFiles(path.join(dir, e.name));
    else n++;
  }
  return n;
}

// ------------------------------------------------------------------ cifragem
export async function encryptFile(src: string, dest: string, passphrase: string): Promise<void> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await scrypt(passphrase, salt, 32);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const out = createWriteStream(dest, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC, salt, iv]));
  await pipeline(createReadStream(src), cipher, out, { end: false });
  out.end(cipher.getAuthTag());
  await new Promise<void>((r) => out.on('close', () => r()));
}

export async function decryptFile(src: string, dest: string, passphrase: string): Promise<void> {
  const fd = await fs.open(src, 'r');
  try {
    const { size } = await fd.stat();
    const head = Buffer.alloc(MAGIC.length + 28);
    await fd.read(head, 0, head.length, 0);
    if (!head.subarray(0, MAGIC.length).equals(MAGIC))
      throw new Error('Arquivo de backup cifrado inválido.');
    const salt = head.subarray(MAGIC.length, MAGIC.length + 16);
    const iv = head.subarray(MAGIC.length + 16);
    const tag = Buffer.alloc(16);
    await fd.read(tag, 0, 16, size - 16);
    const d = createDecipheriv('aes-256-gcm', await scrypt(passphrase, salt, 32), iv);
    d.setAuthTag(tag);
    await pipeline(
      createReadStream(src, { start: head.length, end: size - 17 }),
      d,
      createWriteStream(dest, { mode: 0o600 }),
    );
  } catch (e) {
    await fs.rm(dest, { force: true });
    throw new Error(
      e instanceof Error && /Unsupported state|auth/i.test(e.message)
        ? 'Frase de backup incorreta ou arquivo adulterado.'
        : (e as Error).message,
    );
  } finally {
    await fd.close();
  }
}

// -------------------------------------------------------------------- backup
export interface BackupOptions {
  databaseUrl: string;
  storageDir: string;
  outDir: string;
  passphrase?: string;
  now?: Date;
}

export const backupFileName = (now: Date, encrypted: boolean) =>
  `socialos-${now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z')}.tar.gz${encrypted ? '.enc' : ''}`;

export async function createBackup(
  o: BackupOptions,
): Promise<{ file: string; manifest: Manifest }> {
  const now = o.now ?? new Date();
  const c = parseDbUrl(o.databaseUrl);
  await fs.mkdir(o.outDir, { recursive: true, mode: 0o700 });
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'socialos-bk-'));
  try {
    const dump = path.join(work, 'dump.sql');
    // contagens ANTES do dump; o dump usa --single-transaction (consistente). Uma divergência indica escrita concorrente.
    const before = await countRows(o.databaseUrl);
    await run(
      'mysqldump',
      [
        ...connArgs(c),
        '--single-transaction',
        '--routines',
        '--triggers',
        '--no-tablespaces',
        '--default-character-set=utf8mb4',
        '--skip-comments',
        c.database,
      ],
      { env: mysqlEnv(c), stdout: dump },
    );
    const files: Record<string, string | null> = {
      'dump.sql': await sha256File(dump),
      'storage.tar': null,
    };
    let storageFiles = 0;
    const storageExists = await fs.stat(o.storageDir).then(
      (s) => s.isDirectory(),
      () => false,
    );
    if (storageExists) {
      storageFiles = await countFiles(o.storageDir);
      const tarPath = path.join(work, 'storage.tar');
      await run('tar', ['-cf', tarPath, '-C', o.storageDir, '.']);
      files['storage.tar'] = await sha256File(tarPath);
    }
    const manifest: Manifest = {
      format: BACKUP_FORMAT,
      createdAt: now.toISOString(),
      database: c.database,
      migrations: before.migrations,
      tables: before.tables,
      files,
      storage: { included: storageExists, files: storageFiles },
      encrypted: !!o.passphrase,
    };
    await fs.writeFile(path.join(work, 'manifest.json'), JSON.stringify(manifest, null, 2), {
      mode: 0o600,
    });
    const names = ['manifest.json', 'dump.sql', ...(storageExists ? ['storage.tar'] : [])];
    const bundle = path.join(work, 'bundle.tar.gz');
    await run('tar', ['-czf', bundle, '-C', work, ...names]);
    const final = path.join(o.outDir, backupFileName(now, !!o.passphrase));
    if (o.passphrase) await encryptFile(bundle, final, o.passphrase);
    else {
      await fs.copyFile(bundle, final);
      await fs.chmod(final, 0o600);
    }
    return { file: final, manifest };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

// --------------------------------------------------------------- restauração
async function extract(
  file: string,
  passphrase: string | undefined,
  work: string,
): Promise<Manifest> {
  let bundle = file;
  if (file.endsWith('.enc')) {
    if (!passphrase) throw new Error('Este backup é cifrado: informe a frase (BACKUP_PASSPHRASE).');
    bundle = path.join(work, 'bundle.tar.gz');
    await decryptFile(file, bundle, passphrase);
  }
  const dir = path.join(work, 'x');
  await fs.mkdir(dir);
  await run('tar', ['-xzf', bundle, '-C', dir]);
  const manifest = JSON.parse(
    await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'),
  ) as Manifest;
  if (manifest.format !== BACKUP_FORMAT)
    throw new Error(`Formato de backup não suportado (${manifest.format}).`);
  for (const [name, sum] of Object.entries(manifest.files)) {
    if (!sum) continue;
    if ((await sha256File(path.join(dir, name))) !== sum)
      throw new Error(
        `Falha de integridade: o arquivo ${name} do backup não confere com o checksum.`,
      );
  }
  return manifest;
}

export interface RestoreOptions {
  file: string;
  targetDatabaseUrl: string;
  storageDir?: string;
  passphrase?: string;
  /** Permite restaurar sobre um banco/diretório que já tem dados (apaga as tabelas existentes). */
  force?: boolean;
}

export async function restoreBackup(
  o: RestoreOptions,
): Promise<{ manifest: Manifest; tables: number; rows: number }> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'socialos-rs-'));
  try {
    const manifest = await extract(o.file, o.passphrase, work);
    const dir = path.join(work, 'x');
    const c = parseDbUrl(o.targetDatabaseUrl);

    const conn = await mysql.createConnection({
      uri: o.targetDatabaseUrl,
      multipleStatements: true,
    });
    try {
      const existing = await listTables(conn);
      if (existing.length > 0) {
        if (!o.force)
          throw new Error(
            `O banco de destino "${c.database}" não está vazio (${existing.length} tabelas). Use --force para sobrescrever.`,
          );
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        for (const t of existing) await conn.query(`DROP TABLE IF EXISTS \`${t}\``);
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
      }
    } finally {
      await conn.end();
    }
    await run('mysql', [...connArgs(c), '--default-character-set=utf8mb4', c.database], {
      env: mysqlEnv(c),
      stdin: path.join(dir, 'dump.sql'),
    });

    // verificação: contagem de linhas de cada tabela deve bater com o manifesto
    const after = await countRows(o.targetDatabaseUrl);
    const diffs: string[] = [];
    for (const [t, n] of Object.entries(manifest.tables)) {
      if (after.tables[t] !== n)
        diffs.push(`${t}: esperado ${n}, restaurado ${after.tables[t] ?? 'ausente'}`);
    }
    if (diffs.length) throw new Error(`Restauração incompleta — ${diffs.join('; ')}`);
    if (JSON.stringify(after.migrations) !== JSON.stringify(manifest.migrations))
      throw new Error('As migrações restauradas não conferem com o manifesto.');

    if (o.storageDir && manifest.storage.included) {
      const has = await fs.readdir(o.storageDir).then(
        (l) => l.length > 0,
        () => false,
      );
      if (has && !o.force)
        throw new Error(`O diretório de arquivos "${o.storageDir}" não está vazio. Use --force.`);
      await fs.mkdir(o.storageDir, { recursive: true, mode: 0o700 });
      await run('tar', ['-xf', path.join(dir, 'storage.tar'), '-C', o.storageDir]);
      const n = await countFiles(o.storageDir);
      if (n < manifest.storage.files)
        throw new Error(
          `Arquivos restaurados (${n}) menos que o esperado (${manifest.storage.files}).`,
        );
    }
    return {
      manifest,
      tables: Object.keys(manifest.tables).length,
      rows: Object.values(manifest.tables).reduce((a, b) => a + b, 0),
    };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------ retenção
export interface RetentionPolicy {
  daily: number;
  weekly: number;
  monthly: number;
}
export const DEFAULT_RETENTION: RetentionPolicy = { daily: 7, weekly: 4, monthly: 3 };

const isoWeek = (d: Date) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
  return `${y}-W${w}`;
};

/** Escolhe quais backups manter: o mais recente de cada dia (N dias), semana (N semanas) e mês (N meses). */
export function selectBackupsToKeep(
  backups: { name: string; at: Date }[],
  policy: RetentionPolicy = DEFAULT_RETENTION,
): Set<string> {
  const sorted = [...backups].sort((a, b) => b.at.getTime() - a.at.getTime());
  const keep = new Set<string>();
  const take = (keyOf: (d: Date) => string, n: number) => {
    const seen = new Set<string>();
    for (const b of sorted) {
      const k = keyOf(b.at);
      if (seen.has(k)) continue;
      if (seen.size >= n) break;
      seen.add(k);
      keep.add(b.name);
    }
  };
  take((d) => d.toISOString().slice(0, 10), policy.daily);
  take(isoWeek, policy.weekly);
  take((d) => d.toISOString().slice(0, 7), policy.monthly);
  return keep;
}

const NAME = /^socialos-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.tar\.gz(\.enc)?$/;
export const parseBackupName = (n: string): Date | null => {
  const m = NAME.exec(n);
  return m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!)) : null;
};

export async function pruneBackups(dir: string, policy = DEFAULT_RETENTION): Promise<string[]> {
  const entries = (await fs.readdir(dir).catch(() => [])).flatMap((name) => {
    const at = parseBackupName(name);
    return at ? [{ name, at }] : [];
  });
  const keep = selectBackupsToKeep(entries, policy);
  const removed: string[] = [];
  for (const e of entries)
    if (!keep.has(e.name)) {
      await fs.rm(path.join(dir, e.name), { force: true });
      removed.push(e.name);
    }
  return removed;
}
