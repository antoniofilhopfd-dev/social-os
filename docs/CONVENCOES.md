# Convenções de código

- TypeScript `strict` e `noUncheckedIndexedAccess`. Sem `any` implícito.
- Prettier (aspas simples, ponto e vírgula, largura 100) e ESLint (`next/core-web-vitals` + TypeScript) são obrigatórios; CI falha se divergirem.
- Interface em pt-BR. Identificadores de código e nomes de tabelas/colunas em inglês.
- Regra de negócio fica em `modules/*/service`, sem depender de HTTP. Autorização antes de qualquer acesso a dados.
- Entrada validada no servidor com Zod. Consultas sempre parametrizadas.
- Banco: chave primária estável, `created_at`/`updated_at`, `utf8mb4`, chaves estrangeiras e unicidade reais. Migração sempre com `.up.sql` e `.down.sql`.
- Segredos só em variáveis de ambiente. `.env` nunca é versionado.
- Componentes de UI usam os tokens de `globals.css`. Alvo de toque mínimo de 44 px; foco visível; contraste AA (testado em `tests/unit/contrast.test.ts`).
- Nenhum botão ou menu sem ação real. O que é futuro fica registrado em documentação como pendente.
- Dados fictícios só em testes ou em páginas explicitamente rotuladas como exemplo.
