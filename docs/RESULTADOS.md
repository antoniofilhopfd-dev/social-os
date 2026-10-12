# Resultados e relatórios (Etapa 10)

Somente dados reais. Nada é simulado nem importado de redes nesta etapa: as métricas são **informadas manualmente** (origem `manual`); a coluna `source` já aceita `api` para a Etapa 12.

## Dados

- `metric_entries`: coletas por publicação (alcance, impressões, curtidas, comentários, compartilhamentos, salvamentos, cliques, visualizações de vídeo, novos seguidores). Vários registros por publicação (histórico); o relatório usa o mais recente. **Campo vazio = não informado ≠ zero.**
- `profile_snapshots`: seguidores por perfil e dia (um por dia, garantido no banco; exclusão lógica libera o dia).
- Validações: inteiros ≥ 0, impressões ≥ alcance, coleta não pode ser futura nem anterior à publicação, só publicações com status _publicada_.

## Definições (exibidas na tela)

- Interações = curtidas + comentários + compartilhamentos + salvamentos.
- Taxa de engajamento = interações ÷ alcance (%), só onde ambos foram informados.
- Totais somam só o que foi informado e mostram quantas publicações ainda não têm resultados.

## Relatórios

- **Desempenho** (equipe e cliente): totais, ranking por interações, por rede e formato, crescimento de seguidores (primeiro × último registro do período), lista completa. Período máximo de 366 dias, no fuso de Brasília.
- **Operação** (só equipe): conteúdos criados, aprovações (enviadas/aprovadas/ajustes/pendentes, tempo médio de resposta), publicações (pontualidade) e tarefas.
- **Exportação CSV** (`metrics:export`, só equipe): `;` + BOM UTF-8, neutraliza injeção de fórmulas, auditada. **Versão para impressão** (use “Imprimir → PDF” do navegador).

## Segurança

Escopo por organização e cliente em todas as consultas; cliente externo só lê o próprio relatório (sem exportar nem ver operação); registrar/editar exige `metrics:create`/`metrics:edit` por cliente.

## Pendências

- Importação automática de métricas e de seguidores (Etapa 12, depende das APIs/credenciais).
- Geração de PDF no servidor (hoje: impressão do navegador).
