# Projetos e tarefas (Etapa 07)

## Modelo

- **Projeto**: sempre de um cliente; situação (planejamento, em andamento, em espera, concluído, cancelado), período, responsável. Só é excluído sem tarefas abertas.
- **Tarefa**: pode ter cliente (derivado do projeto/conteúdo vinculado) ou ser **interna** (sem cliente; só visível com `tasks:view` na organização inteira). Situações: a fazer, em andamento, bloqueada (exige motivo), em revisão, concluída, cancelada. Encerradas não ficam atrasadas e só voltam a ser editáveis reabrindo.
- Checklist (até 60 itens), comentários e histórico (`task_events`).

## Segurança

- `visibleTasks`/`visibleProjects` aplicam organização + escopo de cliente em toda consulta; recurso alheio → 404, sem permissão → 403; externos não acessam tarefas.
- Vínculos (projeto/conteúdo) são validados no escopo do usuário e devem ser do mesmo cliente.
- Atribuir a outra pessoa exige `tasks:assign` (assumir para si não); o responsável deve ser membro interno ativo.
- Auditoria de criação, edição, mudança de situação e exclusão; notificações de atribuição, comentário e conclusão/bloqueio.

## Interface

`/tarefas` (minhas, todas, Kanban — mover por seleção, sem arrastar), `/tarefas/nova`, `/tarefas/[id]`, `/projetos`, `/projetos/novo`, `/projetos/[id]`. Pendências (atrasadas, para hoje, bloqueadas) aparecem no painel inicial; tarefas entram na busca global.

## Pendências

- Subtarefas, dependências, recorrência e estimativa de horas não fazem parte desta etapa.
