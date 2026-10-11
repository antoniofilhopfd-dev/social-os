# Solicitações e cadastro de clientes (Etapa 04)

## Clientes, marcas e perfis

- **Cliente:** dados básicos (nome, situação, responsável interno), diretrizes (objetivos, público, tom de voz, diretrizes editoriais, restrições de linguagem, temas permitidos/proibidos, identidade visual em texto, informações recorrentes), fluxo de aprovação, SLA de primeira resposta (horas) e prazo de entrega (dias), contatos, datas importantes e observações internas.
- **Observações internas** só aparecem para a equipe interna que pode editar o cliente; nunca para externos nem no portal.
- **Marcas:** várias por cliente, com diretrizes próprias. **Perfis sociais:** cadastrados **manualmente**; publicação sempre manual e integração sempre “não conectada” nesta fase (a conexão por API é da Etapa 12).
- **Histórico:** toda alteração do cliente e de seus contatos, datas, marcas e perfis é auditada com campo, valor anterior e novo (textos longos truncados). A aba Histórico só aparece para a equipe interna que edita o cliente.
- **Pendente (declarado):** arquivos de identidade visual e anexos vêm com a Biblioteca (Etapa 06).

## Solicitações

**Situações e transições** (validadas no servidor, `src/modules/requests/rules.ts`):

| De                     | Para                                                |
| ---------------------- | --------------------------------------------------- |
| Nova                   | Em triagem, Recusada, Cancelada                     |
| Em triagem             | Aguardando informações, Aceita, Recusada, Cancelada |
| Aguardando informações | Em triagem, Recusada, Cancelada                     |
| Aceita                 | Cancelada                                           |
| Recusada / Cancelada   | Em triagem (reabrir, com motivo)                    |

- **Mensagem obrigatória** ao pedir informações, recusar, cancelar ou reabrir.
- **Demanda incompleta não avança em silêncio:** para **Aceita** é preciso ter responsável e todos os campos que o tipo exige (o servidor lista o que falta).
- **Tipos configuráveis** (Configurações → Tipos de solicitação): cada tipo define campos obrigatórios entre marca, objetivo, público, rede, formato, data desejada e referências. Cliente, título e descrição são sempre obrigatórios. Tipos desativados saem do formulário; as solicitações existentes permanecem.
- **Duplicidade:** ao criar, títulos semelhantes (Jaccard ≥ 0,7 sobre palavras significativas, sem acentos) em solicitações abertas ou aceitas do mesmo cliente nos últimos 30 dias exigem confirmação (“Criar mesmo assim”). Ao confirmar, a possível duplicata fica registrada.
- **Prioridade:** a prioridade original é preservada; mudanças geram eventos. `Urgente` exige justificativa.
- **Prazos:** o SLA do cliente define o prazo de primeira resposta; solicitação nova sem resposta após o prazo aparece como “Sem resposta no prazo”; prazo estimado de entrega vencido enquanto aberta aparece como “Prazo vencido”. Esses estados alimentam o dashboard (alerta). **Não há alerta automático por e-mail ou cron**: o cálculo é feito ao consultar.
- **Numeração** sequencial por organização (#1, #2…), sem repetição sob concorrência.
- **Visibilidade:** externos só veem e criam solicitações do próprio cliente; **notas internas** e a triagem são invisíveis para eles. Resposta do cliente a um pedido de informações devolve a solicitação à triagem.
- **Notificações:** nova solicitação (para quem pode atribuir), atribuição, pedido de informações, informações recebidas e mudança de situação para o solicitante.
- **Conversão:** solicitação **aceita** converte em **conteúdo** (Etapa 05; ver [CONTEUDOS.md](CONTEUDOS.md)). Conversão em projeto ou tarefa depende da Etapa 07 e ainda não tem botão.
