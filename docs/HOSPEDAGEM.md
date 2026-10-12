# Validação da hospedagem (Hostinger)

**Situação: PENDENTE de confirmação com o plano real** (o procedimento de implantação e as verificações automáticas já existem: `docs/IMPLANTACAO.md`, `npm run preflight`, `npm run smoke`). Não tenho acesso à conta; abaixo está o que a documentação pública indica e o que ainda precisa ser conferido no hPanel.

## O que a documentação pública da Hostinger indica

| Item               | Indicação pública                                                                                                                                              | Status                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Aplicações Node.js | Suportadas nos planos **Business** e **Cloud** (Cloud Startup/Professional/Enterprise). Planos de hospedagem compartilhada mais simples não aparecem na lista. | Não confirmado para o seu plano                            |
| Versões do Node.js | 18.x, 20.x, 22.x e 24.x                                                                                                                                        | Compatível com o projeto (Node ≥ 20.9; desenvolvido em 22) |
| Frameworks         | Next.js listado entre os suportados                                                                                                                            | Não confirmado em build real                               |
| MySQL              | Anunciado nos planos Business/Cloud                                                                                                                            | Versão e limites a conferir                                |
| Cron jobs          | Existe guia de cron para hospedagem web/cloud, com exemplos em PHP                                                                                             | **Não confirmado** para executar scripts Node              |

## Itens a conferir no hPanel (preciso da sua resposta)

1. Nome exato do plano.
2. Versão do Node.js selecionável e se `npm run build` roda no servidor (memória disponível no build).
3. Processo persistente: limite de memória, CPU e processos.
4. Cron: frequência mínima e se executa `node`/`npx`.
5. MySQL: versão (8.0 ou MariaDB), tamanho máximo, conexões simultâneas, acesso a `mysqldump`.
6. Disco, inodes e se é possível manter uma pasta de arquivos **fora** do diretório público.
7. SSH, deploy por Git, domínio e HTTPS.

## Alternativas se algum item falhar

- VPS da Hostinger (controle total, mais responsabilidade operacional).
- Aplicação em outro host Node com MySQL na Hostinger (mais latência e mais um ponto de falha).

Fontes consultadas: documentação pública da Hostinger sobre Node.js e cron (suporte e docs.hostinger.com). Páginas de marketing foram tratadas como indicativo, não como garantia.
