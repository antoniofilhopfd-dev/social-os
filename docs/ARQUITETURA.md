# Arquitetura (Etapa 01)

Monólito modular: Next.js (App Router) + TypeScript estrito + MySQL 8, em um único processo Node.

## Estrutura

```
src/app/            rotas e layouts (área interna; o portal do cliente terá grupo de rotas próprio)
src/modules/        um diretório por domínio (service, schema de entrada). Etapa 02: auth, team, roles, clients, audit.
src/core/           env, logger, errors, db, migrations, ids, crypto, password, audit, rate-limit,
                    auth/ (contexto de autorização, sessões, cookies), permissions/ (catálogo e seed), http (wrapper de rotas)
src/db/             schema Drizzle (espelha as migrações) e fábrica do cliente
src/proxy.ts        CSP com nonce e redirecionamento de páginas sem cookie de sessão
src/integrations/   contratos e drivers externos. Hoje: StorageDriver + driver local em disco.
src/ui/             design system (componentes e estados) e utilitário de contraste
migrations/         SQL versionado (NNNN_nome.up.sql / .down.sql)
```

## Decisões desta etapa

| Decisão    | Escolha                                                                                                                                                      | Motivo                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | Next.js 16.4                                                                                                                                                 | Interface e API no mesmo projeto. Roda em Node 18–24, compatível com as versões listadas pela Hostinger (ver HOSPEDAGEM).                           |
| Migrações  | Runner próprio em SQL puro com `up` e `down`                                                                                                                 | Reversão obrigatória por requisito; evita ferramenta que só avança. Limitação: DDL do MySQL não é transacional, então migrações devem ser pequenas. |
| ORM        | **Adiado para a Etapa 02**, quando surgirem as primeiras tabelas. Candidato: Drizzle (sem binário nativo, leve para hospedagem compartilhada) contra Prisma. | Evita decidir sem schema real. A escolha será apresentada antes de usar.                                                                            |
| Validação  | Zod                                                                                                                                                          | Mesma definição no servidor e no cliente.                                                                                                           |
| Logs       | JSON em stdout com redação por nome de chave e credenciais em URL                                                                                            | Sem segredos em logs (requisito).                                                                                                                   |
| Erros      | `AppError` com código estável e mensagem segura; erros desconhecidos viram `INTERNAL` genérico                                                               | Nada interno vaza ao usuário.                                                                                                                       |
| Arquivos   | Interface `StorageDriver`; driver local rejeita chaves com travessia de diretório e não sobrescreve objetos                                                  | Troca futura para S3 sem reescrever módulos.                                                                                                        |
| Cabeçalhos | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; sem `X-Powered-By`                                                              | CSP completa será definida junto da autenticação (Etapa 02), pois depende de scripts do Next.                                                       |

## O que NÃO existe ainda

Autenticação, multiempresa, tabelas de domínio, upload de usuário, backup funcional e qualquer integração externa.
