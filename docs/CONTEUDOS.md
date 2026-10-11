# Conteúdos e calendário editorial (Etapa 05)

## Modelo

- **Conteúdo:** cliente, marca, perfil social, pilar, campanha, solicitação de origem, título interno, tema, objetivo, público, formato, briefing, data e horário previstos, responsável, prioridade e situação. Numeração sequencial por organização (#1, #2…), sem repetição sob concorrência.
- **Legenda, roteiro, versões e arquivos** pertencem ao **editor e à biblioteca (Etapa 06)**; aqui só existe o briefing.
- **Pilares editoriais** (por organização, com cor) e **campanhas** (por cliente, com período) são cadastros simples. Pilares e campanhas inativos não podem ser escolhidos em novos conteúdos.
- Datas de planejamento usam `DATE`/`TIME` (sem o limite de 2038 do `TIMESTAMP`).

## Cinco visões, uma fonte

Calendário mensal, semana, agenda, lista e Kanban chamam a **mesma consulta** (`listContents`) com os mesmos filtros: cliente, marca, campanha, rede, formato, situação, pilar, responsável, “somente atrasados”, “incluir arquivados” e busca por título, tema ou `#número`. Conteúdos sem data aparecem numa área própria abaixo do calendário/semana/agenda. A grade é de domingo a sábado; no celular o calendário vira uma lista por dia.

## Situações e transições

Dez situações: Rascunho, Em produção, Em revisão interna, Aguardando cliente, Ajustes solicitados, Aprovado, Programado, Publicado, Cancelado e Arquivado.

| Manual (esta etapa)                                                                                                                                                        | Controlado por outros módulos                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Rascunho ⇄ Em produção → Em revisão interna ⇄ Em produção; qualquer não publicado → Cancelado (com motivo); Rascunho/Cancelado → Arquivado; Cancelado/Arquivado → Rascunho | Aguardando cliente, Ajustes solicitados e Aprovado (**Etapa 08**); Programado e Publicado (**Etapa 09**) |

Ninguém consegue marcar “Aprovado”, “Programado” ou “Publicado” manualmente: o servidor recusa. Conteúdo publicado não muda, não é cancelado nem excluído; conteúdo já no fluxo do cliente não pode ser excluído (cancele ou arquive). O Kanban move por **seleção** (acessível por teclado e leitor de tela); **arrastar e soltar não existe**.

## Visibilidade e permissões

- Leitura segue o escopo de cliente de `contents:view`. **Externos só veem conteúdo já enviado ao cliente** (situações do fluxo do cliente); rascunhos e conteúdo em produção nunca aparecem para eles, nem na busca.
- Criar exige `contents:create` no cliente; **atribuir a outra pessoa** exige `contents:assign` (quem edita pode apenas assumir um conteúdo sem responsável); excluir exige `contents:delete`.
- Duplicar copia os dados, volta a Rascunho e limpa data, responsável e solicitação de origem.
- **Conflito de agenda (alerta, não bloqueio):** outro conteúdo ativo no mesmo perfil e dia (e mesmo horário, quando ambos têm).
- **Atraso:** data prevista passada e conteúdo ainda não encerrado. “Publicação próxima”: até 2 dias e ainda em Rascunho/Produção. Ambos alimentam o dashboard.
- **Conversão de solicitação:** solicitação **aceita** vira conteúdo (rascunho) com cliente, marca, título, briefing, referências, data desejada e responsável; liga o perfil quando a marca tem exatamente um perfil ativo na rede pedida. Uma solicitação converte uma única vez.

## Pendências declaradas

Aprovação do cliente (Etapa 08), registro de publicação (Etapa 09), editor, versões e arquivos (Etapa 06), lixeira/recuperação de conteúdos excluídos (Etapa 11) e identificação automática de lacunas no planejamento (não implementada).
