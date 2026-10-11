# Segurança: autenticação, sessões e isolamento (Etapa 02)

## Autenticação

- Senhas com **Argon2id** (`@node-rs/argon2`, m=19 MiB, t=2, p=1). Nunca em texto puro nem em logs.
- Política: 12 a 128 caracteres, sem exigir símbolos, rejeita senhas comuns (lista curta local), repetições e senhas que contenham a parte local do e-mail.
- Não existe cadastro público. O acesso nasce por `npm run bootstrap` (primeira organização/proprietário) e depois por **convites**.
- Convite e redefinição de senha usam **link copiável** gerado por um administrador (sem e-mail externo na Fase 1). O token tem 256 bits, é gravado **só como hash SHA-256**, expira (convite 7 dias, senha 24 h), é de **uso único** e o novo link invalida o anterior.
- Convite para e-mail que já tem conta só é aceito com a pessoa autenticada como ela mesma.
- Login devolve a mesma mensagem para senha errada e e-mail inexistente e executa uma verificação "de mentira" para igualar o tempo.

## Sessões

- Token aleatório de 256 bits em cookie `HttpOnly`, `SameSite=Lax`, `Secure` e prefixo `__Host-` quando `APP_URL` é HTTPS. No banco só existe o hash.
- Expira por **8 h de inatividade** e **30 dias absolutos**. Revogar uma sessão (ou todas as outras) vale imediatamente.
- Redefinir a senha revoga todas as sessões. Remover o último vínculo na organização revoga as sessões dela. Usuário desativado perde o acesso.

## Autorização e isolamento

- **Toda** consulta de domínio passa por um `Ctx` (usuário, organização ativa, concessões por escopo) criado no servidor. Serviços filtram por `organization_id` e pelos escopos de cliente.
- Recurso de outra organização ou fora do escopo responde **404**, igual a inexistente (não confirma existência). Falta de permissão responde 403.
- **Anti-escalada:** só se concede/edita o que se possui (convites, funções, mudança de função, link de senha). Não se mexe em quem tem mais poder. A organização mantém ao menos um proprietário.
- Funções personalizadas só valem na organização dona; um vínculo forjado para função de outra organização não concede nada (testado).
- Guarda estrutural: teste falha se uma rota de API não usar `route()`/`publicRoute()` ou acessar tabelas diretamente. Só 3 rotas são públicas (login, aceitar convite, redefinir senha).

## Proteções da camada HTTP

- **CSRF:** mutações exigem `Origin` igual à aplicação (ou `Sec-Fetch-Site: same-origin`) além de `SameSite=Lax`.
- **Limite de tentativas** (banco, sem Redis): 5 falhas por e-mail e 30 por IP em 15 min bloqueiam o login; 20 tokens inválidos por IP em 15 min bloqueiam convites/redefinições.
- **CSP com nonce** por requisição, `strict-dynamic`, `frame-ancestors 'none'`, `object-src 'none'`; mais `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- Corpo de requisição limitado a 100 KB; entrada validada com Zod; IDs malformados viram 404 sem tocar no banco; erros 5xx não vazam detalhes.

## Auditoria

Eventos: login, falha de login, logout, convite (criado/aceito/revogado), mudança/remoção de vínculo, funções, links de senha, sessões encerradas, clientes. Registro **imutável por convenção de código** (a aplicação não oferece update/delete). Metadados passam por redação e **nunca** recebem senhas, tokens ou hashes (testado). A falha de login guarda apenas um prefixo de hash do e-mail digitado.

## Limitações conhecidas (declaradas)

- **Sem 2FA/TOTP** (planejado para a Etapa 11).
- **Bloqueio por e-mail pode ser usado para travar a conta de alguém por 15 min** (compromisso aceito; o limite por IP é independente).
- O IP só é conhecido com `TRUST_PROXY=true` atrás de proxy confiável; sem isso todos compartilham o IP "unknown" (o limite por IP fica menos útil). **Defina conforme a hospedagem.**
- A lista de senhas comuns é pequena e local; não consulta bases de vazamentos.
- `style-src` mantém `'unsafe-inline'` (necessário para estilos do Next e atributos `style`).
- A imutabilidade da auditoria não é imposta por triggers no banco, pois os privilégios do MySQL na hospedagem não estão confirmados.
- O binário nativo do Argon2 **não foi testado na hospedagem real**; plano B: `scrypt` do Node ou WebAssembly.
- Usuário em várias organizações entra na mais antiga; **não há seletor de organização** ainda (Etapa 03).
- Administrador da plataforma existe como indicador e via `bootstrap`; **não há painel** e ele não acessa conteúdo de organizações.
- A verificação de nome duplicado de cliente é feita na aplicação (corrida improvável entre duas criações simultâneas).
- Exclusão de cliente é lógica; **não há tela de lixeira/recuperação** ainda.
