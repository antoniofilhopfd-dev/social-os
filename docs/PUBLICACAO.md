# Publicação assistida (Etapa 09)

Nenhuma rede social é acessada nesta etapa. A equipe **programa** o conteúdo, **copia o pacote**, publica manualmente na rede e **registra o resultado**. A publicação automática por API é a Etapa 12 (depende de credenciais e aprovação das plataformas).

## Fluxo

1. Conteúdo **aprovado** pelo cliente → aba _Publicação_ → data/horário (Brasília; não pode ser no passado). Alternativa explícita: _dispensar a aprovação_ (conteúdo em produção/revisão; exige `contents:approve` e é auditada).
2. Situação do conteúdo vira _Programado_; a agenda do conteúdo é sincronizada. Conflito de agenda (mesmo perfil, dia e horário) só avisa.
3. `/publicacoes`: fila em **Atrasadas / Hoje / Próximas** e histórico. Painel inicial destaca atrasadas e as de hoje.
4. Detalhe: **pacote** (texto da versão aprovada, ou da última versão/rascunho; legenda + CTA + hashtags sem repetição; texto alternativo; orientações; arquivos para baixar) com botões de copiar.
5. Resultado: _Marcar como publicada_ (link opcional http/https sem credenciais, data/hora real, observações) → conteúdo _Publicado_; _Registrar falha_ (motivo) → conteúdo volta a _Aprovado_ e pode ser reprogramado; _Reagendar_; _Cancelar programação_.

## Garantias

- Uma programação ativa por conteúdo (índice único no banco) e uma única conclusão (trava de linha).
- Permissões: `publications:create` programa, `publications:edit` reagenda/cancela, `publications:publish` registra resultado; clientes externos não acessam. Escopo por cliente e organização em toda consulta.
- Links só `http(s)`; abertos com `rel="noopener noreferrer nofollow"`.
- Histórico (`publication_events`) e auditoria de cada passo.
- “Hoje” e horários usam o fuso `APP_TIMEZONE` (padrão `America/Sao_Paulo`), corrigindo o deslocamento do UTC à noite.

## Pendências

- Importar métricas da publicação (Etapa 10/12) e conferir o link junto à rede (Etapa 12).
- Lembretes automáticos de horário exigem rotina agendada (cron) — ver Etapa 11/13.
