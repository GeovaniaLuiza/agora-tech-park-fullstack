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

O backend usa OIDC e Systems Manager, sem access keys ou SSH private key. Para um SHA novo, a EC2 instala o SHA exato em `/opt/agora/releases`, faz backup, instala dependências, valida/aplica migrações, troca o symlink, reinicia o systemd e verifica health. Um lock exclusivo `flock` no host cobre a leitura de `current`, preparação, ativação, recuperação e retenção; uma segunda execução falha sem modificar releases/current. A concorrência do GitHub permanece como proteção adicional.

Reexecutar o SHA já ativo é no-op com sucesso somente se a estrutura esperada existir e o health local passar: não clona, instala dependências, migra, troca symlink ou reinicia. Se estiver inválido ou não saudável, falha preservando a release. Um diretório de SHA existente e inativo também causa erro e é preservado; o operador deve investigar uma release parcial e removê-la somente de forma controlada, verificando antes que não é ativa nem necessária para rollback.

Falha no restart ou health da candidata aciona a mesma recuperação da aplicação: se houver uma release anterior válida, restaura o symlink atomicamente, tenta restart e verifica health, registrando sucesso ou falha. O deploy original sempre retorna erro. Sem anterior válida, informa que rollback está indisponível. Migrações não têm rollback automático e precisam permanecer compatíveis com a aplicação anterior. A retenção preserva explicitamente os caminhos normalizados da ativa, anterior e recém-ativada dentro de `/opt/agora/releases`.

Esta correção local não declara produção pronta nem autoriza ativar CD. O workflow executa `/opt/agora/bin/deploy-backend.sh` já instalado na EC2; atualizar o repositório não atualiza esse arquivo no host. Falhas posteriores no Amplify/smoke não revertem o backend; health local não comprova o SHA respondente nem Caddy/HTTPS. Consulte os limites de backup e a validação isolada em `AWS_PRODUCTION.md`.

O frontend usa o artefato Vite aprovado e o fluxo manual de deployment do Amplify, branch `main/PRODUCTION`, com AutoBuild desativado. Isso evita o risco de o Amplify construir um commit mais novo ainda não aprovado.

`VITE_API_URL` deve existir como variável pública de **repositório**, pois o job de build do CI não usa o environment `production`. Valor adotado: `https://agora-techpark.duckdns.org/api`. Não há fallback `/api` no CI. Não configure um override diferente no environment de CD.

Depois do build e novamente depois de baixar `frontend-dist`, `scripts/validate-frontend-artifact.mjs` exige `index.html`, procura a URL esperada como literal completo no JavaScript e rejeita endereços locais/DEV nos arquivos de texto, inclusive assets aninhados. No CD a verificação acontece antes da autenticação AWS e de qualquer deploy; comparar apenas as variáveis não é suficiente. O script não altera o artefato nem registra seu conteúdo. O CI executa seus testes com `node --test scripts/validate-frontend-artifact.test.mjs`.

React Router inclui uma base auxiliar `http://localhost` para parsing de URLs. O plugin de build `frontend/build/router-url-base.js` troca apenas esse literal, apenas nos módulos de React Router, por `https://router.invalid`; a origem real do navegador continua prevalecendo. Isso permite rejeitar qualquer localhost no dist sem mascarar endpoints DEV da aplicação. Atualizações do Router devem manter os testes e a validação do artefato aprovados.

`DEPLOY_ENABLED` deve ser variável de **repositório**, pois é lida no `if` do job antes da disponibilização das variáveis do environment. Mantenha `false` durante a configuração. Variáveis do environment `production`: `AWS_ROLE_ARN`, `AWS_REGION=us-east-1`, `EC2_INSTANCE_ID`, `AMPLIFY_APP_ID`, `AMPLIFY_BRANCH=main`, `PRODUCTION_API_URL=https://agora-techpark.duckdns.org`, `PRODUCTION_FRONTEND_URL` com a URL real do Amplify. A variável de repositório `VITE_API_URL` deve ser exatamente `PRODUCTION_API_URL + /api`; o CD recusa artefato com outra configuração. Secrets opcionais para login de smoke test: `SMOKE_EMAIL`, `SMOKE_PASSWORD`. `SONAR_TOKEN` é necessário no CI. Não versionar IDs reais ou segredos.

Rollback manual backend: aponte `/opt/agora/current` para uma release anterior, reinicie `agora-api` e rode `/api/health`; primeiro verifique compatibilidade com migrações já aplicadas. Rollback frontend: redeploy de um artefato aprovado anterior no Amplify.
