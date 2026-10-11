# Social Media OS

Plataforma de gestão de operações de social media **orgânico** para agências com múltiplos clientes.
Projeto independente do AdsPilot (sem tráfego pago, sem dados ou código compartilhados).

> **Estado atual: Etapa 01/13 (fundação).** Não há funcionalidades de negócio ainda.
> Existem a base técnica, o design system (`/design-system`) e a infraestrutura de testes.

## Requisitos

- Node.js 22 (mínimo 20.9)
- MySQL 8

## Como rodar

```bash
cp .env.example .env        # ajuste DATABASE_URL e TEST_DATABASE_URL
npm install
npm run db:migrate          # aplica migrações (db:rollback reverte a última, db:status lista)
npm run dev                 # http://localhost:3000
```

## Qualidade

| Comando                | O que faz                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | ESLint                                                                                                                                                    |
| `npm run typecheck`    | TypeScript estrito                                                                                                                                        |
| `npm run format:check` | Prettier                                                                                                                                                  |
| `npm test`             | Vitest (unidade + integração MySQL em `TEST_DATABASE_URL`)                                                                                                |
| `npm run test:e2e`     | Playwright (build + servidor + acessibilidade em 3 larguras). No ambiente de nuvem: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` |
| `npm run screenshots`  | Prints reais das telas em `screenshots/` (servidor precisa estar no ar)                                                                                   |

⚠️ `TEST_DATABASE_URL` aponta para um banco que os testes **apagam e recriam**. Nunca use o banco de desenvolvimento ou produção.

## Documentação

- [docs/ARQUITETURA.md](docs/ARQUITETURA.md)
- [docs/CONVENCOES.md](docs/CONVENCOES.md)
- [docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md)
- [docs/BACKUP.md](docs/BACKUP.md)
