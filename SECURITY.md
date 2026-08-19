# Política de segurança

Relate vulnerabilidades de forma privada pelo recurso **Security advisories** do GitHub. Não publique credenciais, dados pessoais, exploit funcional ou detalhes sensíveis em issues públicas.

## Antes de publicar ou contribuir

- não versione `.env`, tokens, credenciais AWS/Sonar/Grafana, chaves, dumps, backups ou logs;
- revise anexos binários e planilhas manualmente para dados pessoais e metadados;
- habilite Secret Scanning e Push Protection nas configurações do repositório público;
- execute `git grep` e um scanner de histórico aprovado antes de cada mudança de visibilidade;
- se um segredo já foi commitado, revogue/rotacione primeiro e avalie reescrever o histórico; apagar só o arquivo não resolve;
- use dados sintéticos em testes e exemplos.

Secrets do CI ficam em GitHub Secrets/Environments. AWS usa OIDC e credenciais temporárias. Logs da API aplicam redaction, mas qualquer novo campo sensível deve ser incluído e testado.

## Licença

O código está público, mas não há licença concedida enquanto não existir um arquivo `LICENSE`. Opções típicas a decidir: MIT (permissiva e simples), Apache-2.0 (permissiva com cláusulas de patentes) ou uma licença copyleft. A escolha exige aprovação do titular.
