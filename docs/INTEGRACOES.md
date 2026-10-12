# Integrações externas (Etapa 12)

> **Estado honesto:** a integração com IA está **implementada e testada contra um servidor HTTP local** (para observar o que é enviado); **ainda não foi validada contra o serviço real** porque não há chave de API disponível neste ambiente. As redes sociais **não estão conectadas**: dependem de aprovação das plataformas. Nada é simulado na interface.

## Assistente de IA (Anthropic)

- **Onde configurar:** Configurações → Integrações (permissão `integrations:manage_integrations` na organização inteira). Informe a chave de API e o modelo; use **Testar conexão**.
- **Chave:** cifrada em repouso (AES-256-GCM, chave derivada de `APP_SECRET`), nunca devolvida por API nem exibida (só “…ABCD”), nunca registrada na auditoria. Trocar só o modelo mantém a chave.
- **Uso:** no editor, botões de sugestão (legendas, variações de tom, ganchos, CTA, hashtags, texto alternativo, revisão, clareza). O resultado aparece com o selo **“Gerado por IA — revise antes de usar”** e avisos de verificação; **nada é salvo, aprovado ou publicado automaticamente**. Versões criadas depois de usar sugestões ficam marcadas como `ai_assisted`.
- **O que é enviado:** diretrizes/tom/público/temas proibidos do cliente e da marca, briefing, título, formato, rede e os campos de texto voltados ao público (legenda, gancho, roteiro, CTA, hashtags, capa). **Nunca:** observações de produção/publicação, referências, contatos, dados de outros clientes ou da organização, nem a chave. O conteúdo vai dentro de `<contexto>` e o prompt de sistema o trata como **dado, não instrução** (mitigação de injeção de prompt; não é garantia absoluta — por isso a revisão humana é obrigatória).
- **Limites e custo:** 20 pedidos por pessoa/hora e 300 por organização/dia (tabela `ai_usage`, que registra tarefa, modelo e tokens, sem texto). Cada pedido tem teto de 1.500 tokens de saída e 45 s de espera. O custo é cobrado pela Anthropic na conta da agência.
- **Falhas:** chave recusada, limite do provedor, indisponibilidade e resposta malformada viram mensagens claras; redirecionamentos HTTP são recusados (a chave não vai a outro destino).
- **Variáveis:** `APP_SECRET` (obrigatória para guardar chaves). `ANTHROPIC_BASE_URL` é opcional (gateway/proxy ou testes); não é configurável por usuários.
- **Para validar com o serviço real (pendente):** criar a chave, salvar em Integrações, rodar “Testar conexão” e gerar uma sugestão; conferir `ai_usage` e o consumo no painel da Anthropic.
- **Privacidade/LGPD:** o texto dos clientes é processado pela Anthropic conforme o contrato/termos de API da agência. Avaliar cláusulas com os clientes; a organização pode remover a conexão a qualquer momento.

## Redes sociais — publicação automática (pendente, depende de terceiros)

Não há conector ativo. O contrato (`src/integrations/social/types.ts`) e a lista de requisitos por plataforma (exibida em Integrações) estão prontos. Para cada rede é preciso, **fora do sistema** (confirmar sempre na documentação oficial vigente, pois mudam):

- **Meta (Instagram/Facebook):** app cadastrado, empresa verificada, perfil profissional ligado a uma Página, permissões de publicação aprovadas em App Review, tokens de longa duração e renovação.
- **LinkedIn:** aplicativo com produto de publicação em Páginas aprovado; administrador da Página autoriza via OAuth.
- **TikTok:** Content Posting API aprovada (auditoria do app); conta autoriza via OAuth.
- **YouTube:** projeto Google Cloud com YouTube Data API, tela de consentimento verificada, cota de upload.
- **Pinterest:** aplicativo com acesso à API de Pins aprovado.
  Quando houver credenciais/aprovações: implementar `SocialPublisher` por rede, fluxo OAuth com armazenamento cifrado dos tokens (mesmo cofre), conferência do link/ID publicado e importação de métricas (`metric_entries.source = 'api'`). Até lá, a **publicação assistida** (Etapa 09) cobre o fluxo.

## Referência Orkestrya

O arquivo `orkestrya.zip` enviado é produto separado e **não foi integrado**; permanece apenas como referência de ideias.
