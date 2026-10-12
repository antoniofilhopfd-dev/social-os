import { describe, expect, it } from 'vitest';
import { backupFileName, parseBackupName, selectBackupsToKeep } from '@/core/backup';

const mk = (iso: string) => {
  const at = new Date(iso);
  return { name: backupFileName(at, false), at };
};

describe('retenção de backups', () => {
  it('nomes ida e volta', () => {
    const at = new Date('2031-03-12T03:30:05Z');
    expect(backupFileName(at, false)).toBe('socialos-20310312T033005Z.tar.gz');
    expect(backupFileName(at, true)).toBe('socialos-20310312T033005Z.tar.gz.enc');
    expect(parseBackupName(backupFileName(at, true))!.toISOString()).toBe(at.toISOString());
    expect(parseBackupName('qualquer-coisa.tar.gz')).toBeNull();
    expect(parseBackupName('../socialos-20310312T033005Z.tar.gz')).toBeNull();
  });

  it('mantém 7 diários + 4 semanais + 3 mensais e descarta o resto', () => {
    const all = [];
    for (let i = 0; i < 120; i++)
      all.push(mk(new Date(Date.UTC(2031, 5, 30) - i * 86_400_000 + 3 * 3_600_000).toISOString()));
    const keep = selectBackupsToKeep(all);
    // os 7 dias mais recentes estão todos presentes
    for (const b of all.slice(0, 7)) expect(keep.has(b.name)).toBe(true);
    expect(keep.size).toBeLessThanOrEqual(7 + 4 + 3);
    expect(keep.size).toBeGreaterThanOrEqual(10);
    // o mais antigo de 120 dias não é mantido
    expect(keep.has(all[119]!.name)).toBe(false);
    // o mais recente sempre é mantido
    expect(keep.has(all[0]!.name)).toBe(true);
  });

  it('com mais de um backup no mesmo dia, mantém só o mais recente do dia', () => {
    const a = mk('2031-06-30T03:00:00Z');
    const b = mk('2031-06-30T15:00:00Z');
    const keep = selectBackupsToKeep([a, b], { daily: 1, weekly: 0, monthly: 0 });
    expect([...keep]).toEqual([b.name]);
  });

  it('lista vazia e política zerada', () => {
    expect(selectBackupsToKeep([]).size).toBe(0);
    expect(
      selectBackupsToKeep([mk('2031-06-30T03:00:00Z')], { daily: 0, weekly: 0, monthly: 0 }).size,
    ).toBe(0);
  });
});
