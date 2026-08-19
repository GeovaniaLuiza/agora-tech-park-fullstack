# CI/CD

## Integração contínua

`.github/workflows/ci.yml` executa em PRs e pushes para `main`/`develop`:

```text
lint + audit High/Critical
├─ backend unit tests + cobertura
├─ frontend unit tests + cobertura + build
└─ PostgreSQL 16 + migrações + integração
                 ↓
          Sonar analysis
                 ↓
      Quality Gate + Critical/High
```

O PostgreSQL do CI usa credenciais efêmeras do próprio service container e não acessa banco do desenvolvedor. O artefato `frontend-dist` vem do mesmo build aprovado.

PRs de forks não recebem `SONAR_TOKEN`; por segurança, nunca use `pull_request_target` para analisar código não confiável. Contribuições externas precisam de branch de mantenedor ou aprovação operacional compatível com a política do projeto.

## Proteção de `main`

Configure uma ruleset no GitHub para:

- exigir pull request e uma aprovação (recomendado);
- exigir `Lint and dependency audit`, `Backend unit tests`, `Frontend tests and build`, `PostgreSQL integration tests` e `SonarQube Cloud Quality Gate`;
- exigir branch atualizada e resolução de conversas;
- bloquear force push e exclusão;
- restringir bypass a mantenedores de emergência e registrar seu uso.

Essa configuração é administrativa e não pode ser garantida por arquivos versionados.

## Entrega contínua

`cd-production.yml` só é elegível após uma execução `push/main` do workflow `CI` concluir com sucesso e `DEPLOY_ENABLED=true`. PR nunca faz deploy. O environment `production` pode exigir aprovação manual adicional.

O backend usa OIDC e Systems Manager, sem access keys ou SSH private key. A EC2 instala o SHA exato em `/opt/agora/releases`, faz backup, instala dependências, valida/aplica migrações, troca o symlink, reinicia o systemd e verifica health. Se o health falhar, o binário volta à release anterior; migrações não são revertidas automaticamente.

O frontend usa o artefato Vite aprovado e o fluxo manual de deployment do Amplify. Isso evita o risco de o Amplify construir um commit mais novo ainda não aprovado.

Variáveis do environment `production`: `DEPLOY_ENABLED`, `AWS_ROLE_ARN`, `AWS_REGION`, `EC2_INSTANCE_ID`, `AMPLIFY_APP_ID`, `AMPLIFY_BRANCH`, `PRODUCTION_API_URL`, `PRODUCTION_FRONTEND_URL`. A variável de repositório `VITE_API_URL` deve ser exatamente `PRODUCTION_API_URL + /api`; o CD recusa artefato com outra configuração. Secrets opcionais para login de smoke test: `SMOKE_EMAIL`, `SMOKE_PASSWORD`.

Rollback manual backend: aponte `/opt/agora/current` para uma release anterior, reinicie `agora-api` e rode `/api/health`; primeiro verifique compatibilidade com migrações já aplicadas. Rollback frontend: redeploy de um artefato aprovado anterior no Amplify.
