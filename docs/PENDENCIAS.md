# Pendências e dependências externas (consolidado)

O que **não** pôde ser concluído por depender de você ou de terceiros. Nada abaixo foi simulado.

## Bloqueios externos

| #   | Item                                                                                           | Depende de                                                 | Onde está registrado                     |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| 1   | Plano/hospedagem real (Hostinger?), versão do Node, cron, MySQL, SSH, `mysqldump`              | Você (hPanel)                                              | `docs/HOSPEDAGEM.md`                     |
| 2   | Domínio, DNS, HTTPS e proxy                                                                    | Você                                                       | `docs/IMPLANTACAO.md`                    |
| 3   | Chave de API da Anthropic para validar a IA contra o serviço real                              | Você                                                       | `docs/INTEGRACOES.md`                    |
| 4   | Conectores de publicação automática (Instagram/Facebook, LinkedIn, TikTok, YouTube, Pinterest) | Aprovação de cada plataforma + autorização de cada cliente | `docs/INTEGRACOES.md` e tela Integrações |
| 5   | Importação automática de métricas e seguidores                                                 | Item 4                                                     | `docs/RESULTADOS.md`                     |
| 6   | Binário nativo do Argon2 no servidor                                                           | Item 1 (conferir com `npm run preflight`)                  | `docs/SEGURANCA.md`                      |
| 7   | Envio de e-mail (convites/redefinição por e-mail, links de aprovação sem login)                | Provedor SMTP/serviço de e-mail e decisão de produto       | `docs/APROVACOES.md`                     |
| 8   | Teste de carga/resiliência em ambiente real                                                    | Item 1                                                     | `docs/SEGURANCA.md`                      |

## Melhorias conhecidas (não bloqueantes)

- 2FA obrigatório por organização; QR code no cadastro do autenticador.
- Varredura de antivírus em uploads; miniaturas e metadados de vídeo.
- Geração de PDF no servidor para relatórios (hoje: impressão do navegador).
- Subtarefas/dependências, comentários ancorados em aprovações, tela para pastas e para blocos/modelos do editor.
- Seletor de organização para usuários em várias organizações já existe; painel de administrador da plataforma não existe.
- Datas em `TIMESTAMP` do MySQL só até 2038 (campos de planejamento usam `DATE`/`DATETIME`).

## Decisões tomadas por mim (reversíveis)

Fuso padrão America/Sao_Paulo; limites de IA (20/h por pessoa, 300/dia por organização); retenção de backup 7/4/3; lixeira de arquivos por 30 dias; modelo de IA padrão Claude Sonnet 5.5 (configurável).
