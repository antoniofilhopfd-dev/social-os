# Implantação (Etapa 13)

> **Estado:** o procedimento e as verificações automáticas estão prontos e foram exercitados **localmente** (`npm run preflight`, `npm run smoke` contra `next start` em produção, backup/restauração de ponta a ponta). **A implantação real depende de informações e acessos que só você tem** (plano/hospedagem, domínio, credenciais) — ver `docs/PENDENCIAS.md`. Nada foi publicado em servidor algum.

## Requisitos do servidor

- Node.js ≥ 20.9 (testado em 22), MySQL 8 (utf8mb4), HTTPS, disco persistente fora do diretório público para `STORAGE_DIR`.
- Recomendado: acesso a `mysqldump`, `mysql` e `tar` (backup), cron, processo persistente (systemd/pm2/painel da hospedagem) e proxy reverso com HTTPS.
- Se a hospedagem for compartilhada/gerenciada, confirmar os itens de `docs/HOSPEDAGEM.md` **antes** (plano, Node, cron, MySQL, SSH).

## Primeira implantação

1. **Código:** clonar o repositório na versão desejada (`git checkout <tag/branch>`), `npm ci`.
2. **Ambiente:** criar `.env` a partir de `.env.example` (nunca versionar): `NODE_ENV=production`, `APP_URL=https://…`, `DATABASE_URL`, `STORAGE_DIR` (fora de `public/`), `APP_SECRET` (`openssl rand -base64 36`), `BACKUP_PASSPHRASE`, `TRUST_PROXY=true` se houver proxy confiável, `APP_TIMEZONE`.
3. **Banco:** criar o banco vazio em utf8mb4 com um usuário de privilégio mínimo (apenas esse banco); `npm run db:migrate`.
4. **Verificar:** `npm run preflight` — corrigir todos os ✘ e revisar os `!`.
5. **Build:** `npm run build`.
6. **Primeiro acesso:** `npm run bootstrap -- --org "Nome da Agência" --slug slug --owner-email dono@dominio --owner-name "Nome"` (imprime um link de definição de senha de uso único). Não há cadastro público.
7. **Subir:** `npm start` sob um gerenciador de processos (reinício automático) atrás do proxy HTTPS. A aplicação escuta na porta definida por `PORT` (padrão 3000).
8. **Conferir de fora:** `npm run smoke -- --url https://seu-dominio` — tudo deve passar (inclusive HTTPS/HSTS).
9. **Agendar:** cron diário `npm run jobs:daily` (lixeira de arquivos, limpeza e backup) e monitor externo em `GET /api/health`.
10. **Segurança do dono:** entrar, ativar o 2FA em “Segurança da conta” e guardar os códigos de recuperação.
11. **Backup real:** `npm run backup`, copiar o arquivo para fora do servidor e **testar a restauração em um banco novo** (ver `docs/BACKUP.md`).

## Atualização (cada nova versão)

1. `npm run backup` e conferir o arquivo (cópia externa).
2. Colocar em manutenção se houver migração destrutiva; `git fetch && git checkout <nova versão>`; `npm ci`.
3. `npm run preflight` (mostra migrações pendentes) → `npm run db:migrate` → `npm run build`.
4. Reiniciar o processo; `npm run smoke -- --url …`; abrir login, um conteúdo e um arquivo.

## Reversão

- **Só código** (sem migração nova): voltar ao commit/tag anterior, `npm ci`, `npm run build`, reiniciar.
- **Com migração:** `npm run db:rollback` desfaz a última migração (arquivos `.down.sql`); se houver perda de dados ou dúvida, **restaurar o backup** feito no passo 1 em banco novo e apontar a aplicação para ele.
- Manter a versão anterior do build até validar a nova.

## Variáveis e segredos

Nenhum segredo vai para o repositório, logs ou auditoria. Rotacionar `APP_SECRET` invalida os segredos cifrados (2FA e chaves de integração): exigiria reconfigurar 2FA e a chave de IA — planejar com cuidado.

## Fumaça local (como foi exercitado)

`NODE_ENV=production next start` + `npm run smoke -- --url http://localhost:PORTA` → todas as verificações passam, exceto “HTTPS” (esperado em http local).
