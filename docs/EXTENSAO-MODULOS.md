# Como um módulo novo se conecta ao painel (Etapa 03)

Cada módulo (conteúdos, tarefas, aprovações...) se registra em quatro pontos. Nada disso depende de dados fictícios: só aparece o que o módulo realmente produz.

1. **Menu:** acrescente o item em `src/ui/shell/nav-config.ts`, condicionado à permissão do módulo. O menu é conveniência; o backend continua sendo a barreira.
2. **Pendências do dashboard:** crie um `PendingProvider` em `src/modules/dashboard/providers.ts` e adicione-o a `PENDING_PROVIDERS`. Ele recebe o `Ctx` e os filtros (período, cliente) e devolve apenas itens que o usuário pode ver (use o escopo do `Ctx`, nunca consulte sem ele).
3. **Notificações:** declare o tipo em `src/modules/notifications/types.ts` (aparece nas preferências automaticamente) e chame `notify()` no serviço de origem. `notify` respeita a preferência e nunca derruba a ação original.
4. **Busca global:** inclua a fonte em `src/modules/search/service.ts`, reutilizando a função de listagem do próprio módulo (mesmo controle de acesso) e escapando o texto com `likePattern`.

Rotas de API novas devem usar `route()` (o teste `tests/unit/api-routes.test.ts` falha caso contrário) e entrar na lista de rotas protegidas de `tests/e2e/api-isolation.spec.ts`.
