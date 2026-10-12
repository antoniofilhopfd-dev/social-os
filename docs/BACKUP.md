# Backup e restauração (Etapa 11)

Um backup só é confiável depois de restaurado. Os comandos abaixo foram **executados de ponta a ponta** (backup cifrado → restauração em banco vazio → conferência) e fazem parte da suíte de testes (`tests/integration/backup-restore.test.ts`).

## O que é salvo

Banco MySQL completo (`mysqldump --single-transaction`, consistente, com rotinas e gatilhos) + diretório de arquivos (`STORAGE_DIR`) + `manifest.json` com versão do formato, migrações aplicadas, **contagem de linhas por tabela** e **SHA-256** de cada parte. O pacote é `.tar.gz`; com `BACKUP_PASSPHRASE` vira `.tar.gz.enc` (AES-256-GCM, chave derivada por scrypt, autenticado). Arquivos são criados com permissão 0600 em diretório 0700. A senha do banco nunca vai na linha de comando (usa `MYSQL_PWD`) nem aparece no backup.

## Backup

```bash
npm run backup              # cria e aplica a retenção
npm run backup -- --no-prune
```

- Retenção: 7 diários, 4 semanais, 3 mensais (só apaga arquivos com o nome gerado pelo programa).
- **Cópia externa:** envie o arquivo para fora do servidor (outro provedor/armazenamento). **Guarde a frase (`BACKUP_PASSPHRASE`) separada do backup** — sem ela o arquivo cifrado não abre.
- Rotina diária recomendada (cron, 03:30): `npm run jobs:daily` (lixeira de arquivos + limpeza de sessões/links vencidos + backup).

## Restauração

```bash
BACKUP_PASSPHRASE='…' npm run restore -- \
  --file backups/socialos-AAAAMMDDTHHMMSSZ.tar.gz.enc \
  --target-db 'mysql://usuario:senha@host:3306/banco_destino' \
  --storage-dir ./storage-restaurado
```

- Recusa banco/diretório **não vazio** (use `--force` conscientemente) e nunca assume `DATABASE_URL` como destino.
- Verifica checksums, aplica o dump e **compara a contagem de cada tabela e as migrações com o manifesto**; qualquer divergência encerra com erro.
- Frase errada ou arquivo adulterado: falha antes de escrever qualquer coisa.

## Procedimento de recuperação (resumo)

1. Parar a aplicação. 2. Criar banco novo e vazio. 3. `npm run restore` no banco novo (e diretório novo). 4. Conferir a saída (“restauração concluída e conferida”). 5. Apontar `DATABASE_URL`/`STORAGE_DIR` para os novos destinos e subir a aplicação. 6. Testar login e abrir um conteúdo com arquivo. Mantenha o banco antigo até validar.

## Antes de migração destrutiva

Rode `npm run backup` e confirme o arquivo. As migrações têm `.down.sql`, mas o backup é a garantia real.

## Limites conhecidos

- Exige `mysqldump`, `mysql` e `tar` no servidor. Em hospedagem compartilhada sem acesso a esses binários, usar o backup do próprio provedor e o export manual — **a validar na Etapa 13**.
- O armazenamento é o disco local; se migrar para S3, o backup dos arquivos passa a ser a replicação do bucket.
- O teste de restauração automatizado precisa de um banco vazio descartável (`RESTORE_TEST_DATABASE_URL`); sem ele, é pulado.
