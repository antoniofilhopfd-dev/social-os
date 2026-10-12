# Aprovações e portal do cliente (Etapa 08)

## Fluxo

1. A equipe (permissão `contents:approve`) envia o conteúdo pela aba **Aprovação**. Situações aceitas: em produção, em revisão interna, ajustes solicitados. Exige texto para o cliente avaliar e ao menos um aprovador externo cadastrado para o cliente.
2. O envio **congela** a versão do texto (cria/reutiliza uma versão imutável do editor) e a lista de arquivos vinculados (`approval_assets`). O conteúdo passa a _Aguardando cliente_, o editor é bloqueado e os aprovadores são notificados.
3. O cliente (usuário externo com `approvals:approve` no escopo do cliente) aprova ou solicita ajustes (comentário obrigatório). A decisão é única (trava de linha) e muda o conteúdo para _Aprovado_ ou _Ajustes solicitados_; a equipe é notificada.
4. Depois de ajustes, a equipe edita e reenvia: nova rodada, com nova versão; rodadas anteriores permanecem intactas.
5. Cancelar o envio (antes da decisão) devolve à revisão interna. Reabrir um conteúdo aprovado o devolve à produção e marca a aprovação como _substituída_.

## Segurança

- Uma só rodada pendente por conteúdo, garantida no banco (`pending_key` único).
- Equipe não decide pelo cliente; cliente não envia, cancela nem reabre.
- Cliente vê só os campos voltados a ele (`CLIENT_BODY_FIELDS`): observações de produção/publicação, referências e checklist nunca saem do servidor para externos. Briefing e responsável também foram removidos das respostas de conteúdo para externos.
- Arquivos chegam ao cliente apenas pelo endpoint da aprovação e só os congelados na rodada; a biblioteca interna continua inacessível. A entrega usa o mesmo cabeçalho seguro (nosniff, CSP sandbox).
- Rodadas canceladas não aparecem para o cliente. Tudo é auditado (`approval.*`).

## Interface

`/aprovacoes` (lista; para o cliente destaca “Aguardando a sua decisão”), `/aprovacoes/[id]` (conteúdo, arquivos, decisão, conversa, rodadas), aba **Aprovação** em `/conteudos/[id]`. Pendências no painel inicial (cliente: conteúdos a aprovar; equipe: ajustes pedidos e clientes sem resposta há 3+ dias).

## Pendências

- Link de aprovação por e-mail para quem não tem login: depende do envio de e-mail (Etapa 12/13) e de decisão sobre acesso sem conta.
- Comentários ancorados em trechos/arquivos específicos não fazem parte desta etapa.
