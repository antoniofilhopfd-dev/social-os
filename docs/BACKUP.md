# Estratégia de backup (planejada, NÃO implementada)

Implementação e teste de restauração: **Etapa 11**. Validação em produção: **Etapa 13**.
Um backup só é considerado confiável depois de restaurado com sucesso.

## Proposta (a confirmar)

- **Escopo:** dump MySQL (`mysqldump --single-transaction`) + diretório de arquivos (`STORAGE_DIR`).
- **Frequência:** diária.
- **Retenção:** 7 diários, 4 semanais, 3 mensais.
- **Proteção:** arquivos cifrados e cópia em local externo à hospedagem; checksum registrado.
- **Restauração:** script repetível, executado em banco limpo, com verificação de contagens e integridade.
- **Antes de migração destrutiva:** backup obrigatório e plano de reversão.

## Logs

Logs JSON em stdout, sem segredos (redação testada). Retenção e rotação serão definidas conforme o plano de hospedagem.
