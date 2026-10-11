# Editor de conteúdo e biblioteca de mídia (Etapa 06)

## Editor

- Aba **Editor** em `/conteudos/[id]` (só equipe interna). Campos: gancho, legenda, roteiro, CTA, hashtags, texto de capa, texto alternativo, observações de produção, orientações de publicação, referências, slides e checklist por formato.
- **Autosave** com debounce; o servidor usa controle otimista (`baseRevision`). Se outra pessoa salvou antes, a resposta é `CONFLICT` e a tela oferece recarregar. Há aviso ao sair com alterações pendentes.
- **Versões** numeradas e imutáveis (`content_versions`); comparação por palavras; restaurar copia a versão para o rascunho sem apagar nada.
- **Limites por rede** (`NETWORK_LIMITS`) são apenas avisos de referência; reconfirmar na documentação oficial na Etapa 12.
- **Prévia** é rotulada “Simulação”.
- **Blocos e modelos** reutilizáveis (`/api/editor-blocks`, `/api/content-templates`); modelos não copiam checklist nem anexos.
- **Assistente de IA**: apenas a interface `AiProvider` (`src/integrations/ai`) com provedor “não configurado”; nenhum botão falso. Conexão real na Etapa 12.

## Biblioteca (`/biblioteca`)

- Upload multipart, 1 arquivo por requisição; limite `MAX_UPLOAD_MB` (padrão 50), checado antes de ler o corpo e depois no buffer.
- Tipo detectado pelo **conteúdo** (assinatura), nunca pela extensão/MIME informados. SVG, HTML, executáveis, scripts e polyglots são recusados. Nome de arquivo sanitizado; chave de storage gerada só com ULIDs (sem path traversal).
- Entrega em `/api/assets/[id]/file` passa pela mesma autorização, com `Content-Type` detectado, `nosniff`, `CSP: default-src 'none'; sandbox` (o proxy não sobrescreve), inline apenas imagem/vídeo/PDF, suporte a `Range`.
- Deduplicação por SHA-256 por cliente; versões do arquivo; favoritos; etiquetas; pastas; vínculo a conteúdos; cota por organização (`organizations.storage_limit_mb`, padrão 5 GB).
- **Lixeira** com retenção de 30 dias; `npm run assets:purge` exclui os vencidos (agendar via cron diário).
- Clientes externos não acessam a biblioteca interna; arquivos para o cliente chegarão pelo portal (Etapa 08).

## Pendências

- Armazenamento em disco local (`STORAGE_DIR`, fora do diretório público). Em hospedagem, confirmar disco persistente e incluí-lo no backup (ver BACKUP.md); trocar por S3 exige apenas outro `StorageDriver`.
- Miniaturas geradas e leitura de metadados de vídeo (duração/dimensões) dependem de binários externos; ficam para a Etapa 11/12.
