import path from 'node:path';
import { getEnv } from '@/core/env';
import { LocalStorageDriver } from '@/integrations/storage/local';
import type { StorageDriver } from '@/integrations/storage/types';

let driver: StorageDriver | undefined;
/** Driver de armazenamento da aplicação (disco local fora do diretório público). Trocável por S3 sem tocar nos módulos. */
export function getStorage(): StorageDriver {
  driver ??= new LocalStorageDriver(path.resolve(process.cwd(), getEnv().STORAGE_DIR));
  return driver;
}
export const setStorage = (d: StorageDriver) => {
  driver = d;
};

export function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB ?? 50);
  return (Number.isFinite(mb) && mb > 0 ? mb : 50) * 1024 * 1024;
}
