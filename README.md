# Social Media OS

Plataforma de gestão de operações de social media **orgânico** para agências com múltiplos clientes.
Projeto independente do AdsPilot (sem tráfego pago, sem dados ou código compartilhados).

> **Estado: Etapa 13/13 — pronto para implantação.** Funcionalidades completas e testadas; a **implantação real, a validação da IA com chave real e a publicação automática em redes dependem de acessos/aprovações externos** — ver [docs/PENDENCIAS.md](docs/PENDENCIAS.md).

## O que o sistema faz

Multiempresa com permissões por organização/cliente · clientes, marcas e perfis · solicitações · conteúdos com calendário, semana, agenda, lista e Kanban · editor com versões, limites por rede e checklists · biblioteca de mídia com upload seguro · projetos e tarefas · aprovações do cliente (portal) · publicação assistida · resultados e relatórios (manuais, sem dados fictícios) · 2FA, auditoria, notificações, busca · backup/restauração verificados · assistente de IA opcional (Anthropic) com revisão humana.

## Requisitos

Node.js 22 (mínimo 20.9) · MySQL 8 (utf8mb4).

## Como rodar (desenvolvimento)

```bash
cp .env.example .env        # ajuste DATABASE_URL, TEST_DATABASE_URL e APP_SECRET
npm install
npm run db:migrate          # db:rollback reverte a última; db:status lista
npm run bootstrap -- --org "Minha Agência" --slug minha-agencia \
  --owner-email voce@exemplo.com --owner-name "Seu Nome"   # imprime o link para definir a senha
npm run dev                 # http://localhost:3000
```

## Qualidade

| Comando                                                       | O que faz                                                                                                                                                                                                            |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint` · `npm run typecheck` · `npm run format:check` | ESLint, TypeScript estrito, Prettier                                                                                                                                                                                 |
| `npm test`                                                    | Vitest: unidade + integração em MySQL real (`TEST_DATABASE_URL`)                                                                                                                                                     |
| `npm run test:e2e`                                            | Playwright: build + servidor de produção + isolamento entre organizações + acessibilidade (axe) e sem rolagem horizontal em 3 larguras. Nuvem: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` |
| `npm run screenshots:e2e`                                     | Prints reais de todas as etapas em `screenshots/etapa-NN/`                                                                                                                                                           |

⚠️ `TEST_DATABASE_URL` aponta para um banco que os testes **apagam e recriam** (o nome precisa conter "test"). Nunca use desenvolvimento/produção. O teste de restauração usa `RESTORE_TEST_DATABASE_URL` (banco vazio descartável).

## Operação

| Comando                                   | Uso                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run preflight`                       | Verifica ambiente, banco, migrações, armazenamento, Argon2 e binários antes de subir |
| `npm run smoke -- --url https://…`        | Teste de fumaça pós-implantação (cabeçalhos, 401, CSRF, HTTPS/HSTS, health)          |
| `npm run backup` / `npm run restore -- …` | Backup cifrado e restauração conferida                                               |
| `npm run jobs:daily`                      | Rotina diária: lixeira de arquivos, limpeza e backup (cron)                          |

## Documentação

[Arquitetura](docs/ARQUITETURA.md) · [Segurança](docs/SEGURANCA.md) · [Permissões](docs/PERMISSOES.md) · [Extensão de módulos](docs/EXTENSAO-MODULOS.md) · [Convenções](docs/CONVENCOES.md)
Módulos: [Solicitações](docs/SOLICITACOES.md) · [Conteúdos](docs/CONTEUDOS.md) · [Editor e biblioteca](docs/EDITOR-BIBLIOTECA.md) · [Tarefas](docs/TAREFAS.md) · [Aprovações](docs/APROVACOES.md) · [Publicação](docs/PUBLICACAO.md) · [Resultados](docs/RESULTADOS.md) · [Integrações](docs/INTEGRACOES.md)
Operação: [Implantação](docs/IMPLANTACAO.md) · [Backup](docs/BACKUP.md) · [Operação](docs/OPERACAO.md) · [Hospedagem](docs/HOSPEDAGEM.md) · [Pendências](docs/PENDENCIAS.md)
