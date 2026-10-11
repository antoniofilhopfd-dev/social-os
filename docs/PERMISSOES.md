# Permissões e funções

Permissões têm o formato `módulo:ação` e vivem em `src/core/permissions/catalog.ts` (fonte única; o banco é sincronizado por `seedPermissionsAndRoles`). São 51 permissões em 13 módulos. Até a Etapa 04 o backend **aplica** as de `clients`, `requests`, `contents` (exceto approve/publish/export), `team`, `roles`, `audit` e `settings` (tipos de solicitação); as demais já existem no catálogo e nas funções, para serem aplicadas nos módulos das próximas etapas.

**Escopo:** cada vínculo (membership) vale para a **organização inteira** ou para **um cliente**. Telas administrativas (equipe, funções, auditoria) exigem escopo de organização.

## Funções do sistema (não editáveis)

| Função                      | Tipo    | Resumo                                                                                         |
| --------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| Proprietário                | interna | Tudo                                                                                           |
| Gestor da operação          | interna | Opera tudo, exceto funções/permissões, gestão de usuários e integrações                        |
| Coordenador de social media | interna | Solicitações, conteúdos, biblioteca, tarefas, aprovações, publicações; métricas (ver/exportar) |
| Social media                | interna | Planeja, produz, registra publicação, lança métricas                                           |
| Redator                     | interna | Textos dos conteúdos, tarefas próprias                                                         |
| Designer / Editor de vídeo  | interna | Edita conteúdos e biblioteca                                                                   |
| Analista de resultados      | interna | Métricas e relatórios                                                                          |
| Atendimento                 | interna | Solicitações (triagem)                                                                         |
| Somente consulta            | interna | Leitura operacional                                                                            |
| Cliente externo             | externa | Solicitações, conteúdos, aprovar, métricas liberadas (sempre com escopo de cliente)            |
| Aprovador externo           | externa | Apenas ver e aprovar conteúdos                                                                 |

A matriz exata está em `SYSTEM_ROLES` (`catalog.ts`). Funções **personalizadas** são criadas por organização em _Funções_, respeitando a regra de que só se concede o que se possui.
