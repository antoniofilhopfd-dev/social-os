# Operação

## Variáveis de ambiente

Ver `.env.example`. Obrigatórias: `APP_URL`, `DATABASE_URL`, `STORAGE_DIR`. Recomendadas em produção: `APP_SECRET` (2FA), `BACKUP_PASSPHRASE`, `TRUST_PROXY=true` atrás de proxy confiável, `APP_TIMEZONE`.

## Rotinas agendadas (cron)

| Rotina                                                   | Comando                | Frequência           |
| -------------------------------------------------------- | ---------------------- | -------------------- |
| Lixeira de arquivos + limpeza de dados efêmeros + backup | `npm run jobs:daily`   | diária (ex.: 03:30)  |
| Só backup                                                | `npm run backup`       | conforme necessidade |
| Só lixeira de arquivos                                   | `npm run assets:purge` | diária               |

Saída ≠ 0 indica falha em alguma etapa (cada etapa é independente). Monitore o código de saída e os logs.

## Monitoramento

`GET /api/health` → `200 {"status":"ok"}` (app e banco) ou `503`. Use em um monitor externo.

## Logs

JSON em stdout, sem segredos (redação testada). Rotação/retenção conforme a hospedagem.

## Pendente de validação na hospedagem (Etapa 13)

Presença de `mysqldump`/`mysql`/`tar`, permissão de cron, binário nativo do Argon2, disco persistente para `STORAGE_DIR`, HTTPS e proxy.
