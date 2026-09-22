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

O job `quality`, em `ubuntu-latest`, executa os testes isolados `scripts/deploy-backend.test.mjs` e `scripts/deploy-backup.test.mjs`. O backup passa `DATABASE_URL` explicitamente ao `pg_dump` por `--dbname`, sem registrar a conexão. O arquivo final `.sql.gz` só aparece após sucesso do pipeline, verificação de tamanho e `gzip -t`, por renomeação de um temporário no mesmo diretório. Falhas removem o temporário e abortam antes das dependências e migrations. Restore permanece manual.

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

O backend usa OIDC e Systems Manager, sem access keys ou SSH private key. Para um SHA novo, a EC2 instala o SHA exato em `/opt/agora/releases`, instala dependências do backend e do frontend, compila o frontend com `VITE_API_URL=/api`, valida `frontend/dist` com `scripts/validate-frontend-artifact.mjs`, remove `frontend/node_modules`, faz backup do banco via `pg_dump`, valida/aplica migrações, troca o symlink `current`, reinicia `agora-api` e verifica health. Se qualquer etapa de dependências, build ou validação do frontend falhar, o deploy é abortado imediatamente antes do backup e das migrações, sem tocar em `current` ou reiniciar serviços. Releases legadas backend-only continuam reconhecidas e utilizáveis para rollback automático caso o restart ou health check falhe. Um lock exclusivo `flock` no host cobre a leitura de `current`, preparação, ativação, recuperação e retenção; uma segunda execução falha sem modificar releases/current. A concorrência do GitHub permanece como proteção adicional.

Reexecutar o SHA já ativo é no-op com sucesso somente se a estrutura esperada existir e o health local passar: não clona, instala dependências, migra, troca symlink ou reinicia. Se estiver inválido ou não saudável, falha preservando a release. Um diretório de SHA existente e inativo também causa erro e é preservado; o operador deve investigar uma release parcial e removê-la somente de forma controlada, verificando antes que não é ativa nem necessária para rollback.

Falha no restart ou health da candidata aciona a mesma recuperação da aplicação: se houver uma release anterior válida, restaura o symlink atomicamente, tenta restart e verifica health, registrando sucesso ou falha. O deploy original sempre retorna erro. Sem anterior válida, informa que rollback está indisponível. Migrações não têm rollback automático e precisam permanecer compatíveis com a aplicação anterior. A retenção preserva explicitamente os caminhos normalizados da ativa, anterior e recém-ativada dentro de `/opt/agora/releases`.

Esta correção local não declara produção pronta nem autoriza ativar CD. O workflow executa `/opt/agora/bin/deploy-backend.sh` já instalado na EC2; atualizar o repositório não atualiza esse arquivo no host. Falhas posteriores no Amplify/smoke não revertem o backend; health local não comprova o SHA respondente nem Caddy/HTTPS. Consulte os limites de backup e a validação isolada em `AWS_PRODUCTION.md`.

O frontend no Amplify permanece ativo com o último artefato aprovado, branch `main/PRODUCTION` e AutoBuild desativado. O código do deployment Amplify continua no workflow para rollback, mas o step não executa quando `VITE_API_URL=/api`: um artefato same-origin não pode ser publicado no hostname do Amplify.

Na etapa de preparação do frontend para EC2/Caddy, o CI constrói `frontend-dist` com `VITE_API_URL=/api`. O validador aceita somente esse valor same-origin ou uma URL HTTPS absoluta, pública, sem credenciais/query/fragmento e com pathname exatamente `/api`; o formato absoluto continua disponível para rollback compatível com Amplify.

Depois do build e novamente depois de baixar `frontend-dist`, `scripts/validate-frontend-artifact.mjs` exige `index.html`, procura a URL esperada como literal completo no JavaScript e rejeita endereços locais/DEV nos arquivos de texto, inclusive assets aninhados. No CD a verificação acontece antes da autenticação AWS e de qualquer deploy; comparar apenas as variáveis não é suficiente. O script não altera o artefato nem registra seu conteúdo. O CI executa seus testes com `node --test scripts/validate-frontend-artifact.test.mjs`.

React Router inclui uma base auxiliar `http://localhost` para parsing de URLs. O plugin de build `frontend/build/router-url-base.js` troca apenas esse literal, apenas nos módulos de React Router, por `https://router.invalid`; a origem real do navegador continua prevalecendo. Isso permite rejeitar qualquer localhost no dist sem mascarar endpoints DEV da aplicação. Atualizações do Router devem manter os testes e a validação do artefato aprovados.

`DEPLOY_ENABLED` deve ser variável de **repositório**, pois é lida no `if` do job antes da disponibilização das variáveis do environment. Mantenha `false` durante a configuração. Variáveis atuais do environment `production`: `AWS_ROLE_ARN`, `AWS_REGION=us-east-1`, `EC2_INSTANCE_ID`, `AMPLIFY_APP_ID`, `AMPLIFY_BRANCH=main`, `PRODUCTION_API_URL=https://agora-techpark.duckdns.org`, `PRODUCTION_FRONTEND_URL` com a URL real do Amplify. Secrets opcionais para login de smoke test: `SMOKE_EMAIL`, `SMOKE_PASSWORD`. `SONAR_TOKEN` é necessário no CI. Não versionar IDs reais ou segredos.

Quando a migração operacional para EC2/Caddy for autorizada, os valores finais serão `VITE_API_URL=/api`, `CLIENT_URL=https://agora-techpark.duckdns.org` e `FRONTEND_URL=https://agora-techpark.duckdns.org`. Durante a coexistência desta etapa, não alterar os valores reais atuais de `CLIENT_URL` e `FRONTEND_URL`: o Amplify continua sendo o frontend de produção e nenhuma configuração remota deve ser modificada.

Rollback manual backend: aponte `/opt/agora/current` para uma release anterior, reinicie `agora-api` e rode `/api/health`; primeiro verifique compatibilidade com migrações já aplicadas. Rollback frontend: redeploy de um artefato aprovado anterior no Amplify.
