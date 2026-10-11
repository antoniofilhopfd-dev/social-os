import mysql, { type Pool } from 'mysql2/promise';

export function createPool(url: string): Pool {
  return mysql.createPool({
    uri: url,
    connectionLimit: 10,
    waitForConnections: true,
    timezone: 'Z',
    charset: 'utf8mb4',
    dateStrings: false,
  });
}

let pool: Pool | undefined;
/** Pool singleton da aplicação (reutilizado entre requisições e recargas em desenvolvimento). */
export function getPool(url: string): Pool {
  const g = globalThis as unknown as { __socialosPool?: Pool };
  pool ??= g.__socialosPool ??= createPool(url);
  return pool;
}
