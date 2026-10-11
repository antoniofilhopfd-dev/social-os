# Social Media OS

Plataforma de gestão de operações de social media **orgânico** para agências com múltiplos clientes.
Projeto independente do AdsPilot (sem tráfego pago, sem dados ou código compartilhados).

> **Estado atual: Etapa 03/13 (navegação e dashboard).** Autenticação, multiempresa, permissões,
> clientes (cadastro mínimo), auditoria, layout responsivo, dashboard com pendências reais, busca
> global e notificações internas. Os módulos de negócio começam na Etapa 04.

## Requisitos

- Node.js 22 (mínimo 20.9)
- MySQL 8

## Como rodar

```bash
cp .env.example .env        # ajuste DATABASE_URL e TEST_DATABASE_URL
npm install
npm run db:migrate          # aplica migrações (db:rollback reverte a última, db:status lista)
npm run bootstrap -- --org "Minha Agência" --slug minha-agencia \
  --owner-email voce@exemplo.com --owner-name "Seu Nome"   # imprime o link para definir a senha
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

⚠️ `TEST_DATABASE_URL` aponta para um banco que os testes **apagam e recriam** (o nome precisa conter "test"). Nunca use o banco de desenvolvimento ou produção.

## Documentação

- [docs/ARQUITETURA.md](docs/ARQUITETURA.md)
- [docs/SEGURANCA.md](docs/SEGURANCA.md)
- [docs/PERMISSOES.md](docs/PERMISSOES.md)
- [docs/EXTENSAO-MODULOS.md](docs/EXTENSAO-MODULOS.md)
- [docs/CONVENCOES.md](docs/CONVENCOES.md)
- [docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md)
- [docs/BACKUP.md](docs/BACKUP.md)
