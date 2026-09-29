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

O job `quality`, em `ubuntu-24.04`, executa os testes isolados `scripts/deploy-backend.test.mjs`, `scripts/deploy-backup.test.mjs` e `scripts/prepare-deploy-runtime.test.mjs`. Este último cria um repositório Git local real e exercita o bootstrap em Bash: deploy e rollback temporários com remoção do diretório, e abortos para fetch inválido, SHA divergente, script ausente, runtime vazio, sintaxe inválida e ação desconhecida; também verifica por asserção estática que o bootstrap e `cd-production.yml` não mencionam `main`, `latest`, `origin/main`, `base64`, `/opt/agora/bin` ou `.previous`. O backup passa `DATABASE_URL` explicitamente ao `pg_dump` por `--dbname`, sem registrar a conexão. O arquivo final `.sql.gz` só aparece após sucesso do pipeline, verificação de tamanho e `gzip -t`, por renomeação de um temporário no mesmo diretório. Falhas removem o temporário e abortam antes das dependências e migrations. Restore permanece manual.

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

O runtime de deploy não é persistente no host. `scripts/prepare-deploy-runtime.mjs` gera um bootstrap SSM autocontido em Bash puro: ele cria um diretório com `mktemp -d`, registra `trap cleanup EXIT` (e `INT`/`TERM`), inicializa um repositório Git temporário, faz `git fetch --depth 1 origin "$RELEASE_SHA"` do SHA exato de 40 caracteres de `https://github.com/GeovaniaLuiza/agora-tech-park-fullstack.git`, compara `rev-parse FETCH_HEAD^{commit}` com `RELEASE_SHA` e aborta na divergência, extrai `RELEASE_SHA:deploy/aws/deploy-backend.sh`, exige arquivo não vazio, roda `bash -n` e só então executa a cópia temporária. `main`, `latest`, `origin/main` e HEAD remoto não são usados. Falha em `fetch`, comparação, extração ou `bash -n` aborta antes de qualquer mudança na release ativa, e o `trap` remove o diretório temporário em sucesso e em falha. O script viaja como texto no parâmetro SSM, sem base64 e sem cópia persistente. O deploy e o rollback usam exatamente o mesmo bootstrap, diferindo apenas em `AGORA_DEPLOY_ACTION=deploy|rollback`. O CI não mantém, instala nem depende de `/opt/agora/bin/deploy-backend.sh` ou `.previous`. Falha na preparação mantém a release ativa intacta e impede o deploy. Esta correção local não executou deploy remoto nem altera `DEPLOY_ENABLED`. O health local ainda não comprova o SHA respondente nem Caddy/HTTPS. Consulte os limites de backup e a validação isolada em `AWS_PRODUCTION.md`.

A arquitetura atual publica frontend e backend conjuntamente na EC2. O Caddy serve o `frontend/dist` e encaminha `/api` para o backend na mesma origem. O AWS Amplify pertence à arquitetura anterior e não integra o fluxo atual de deployment.

O CI constrói `frontend-dist` com `VITE_API_URL=/api`. O validador aceita somente esse valor same-origin ou uma URL HTTPS absoluta, pública, sem credenciais/query/fragmento e com pathname exatamente `/api`. O suporte ao formato absoluto permanece por compatibilidade com artefatos e configurações legadas, não como requisito da arquitetura atual.

Depois do build e novamente depois de baixar `frontend-dist`, `scripts/validate-frontend-artifact.mjs` exige `index.html`, procura a URL esperada como literal completo no JavaScript e rejeita endereços locais/DEV nos arquivos de texto, inclusive assets aninhados. No CD a verificação acontece antes da autenticação AWS e de qualquer deploy; comparar apenas as variáveis não é suficiente. O script não altera o artefato nem registra seu conteúdo. O CI executa seus testes com `node --test scripts/validate-frontend-artifact.test.mjs`.

React Router inclui uma base auxiliar `http://localhost` para parsing de URLs. O plugin de build `frontend/build/router-url-base.js` troca apenas esse literal, apenas nos módulos de React Router, por `https://router.invalid`; a origem real do navegador continua prevalecendo. Isso permite rejeitar qualquer localhost no dist sem mascarar endpoints DEV da aplicação. Atualizações do Router devem manter os testes e a validação do artefato aprovados.

`DEPLOY_ENABLED` deve ser variável de **repositório**, pois é lida no `if` do job antes da disponibilização das variáveis do environment. Mantenha `false` durante a configuração. Variáveis operacionais do environment `production`: `AWS_ROLE_ARN`, `AWS_REGION=us-east-1`, `EC2_INSTANCE_ID`, `PRODUCTION_API_URL=https://agora-techpark.duckdns.org` e `PRODUCTION_FRONTEND_URL=https://agora-techpark.duckdns.org`. `AMPLIFY_APP_ID` e `AMPLIFY_BRANCH`, caso ainda existam remotamente, são configurações legadas sem consumidor no fluxo atual e devem ser removidas somente após validação remota na DEVOPS-02. Secrets opcionais para login de smoke test: `SMOKE_EMAIL`, `SMOKE_PASSWORD`. `SONAR_TOKEN` é necessário no CI. Não versionar IDs reais ou segredos.

Na arquitetura atual, os valores esperados são `VITE_API_URL=/api`, `CLIENT_URL=https://agora-techpark.duckdns.org` e `FRONTEND_URL=https://agora-techpark.duckdns.org`. Frontend e backend são servidos pela mesma origem via Caddy. Configurações remotas legadas do Amplify devem ser tratadas separadamente na DEVOPS-02 e não removidas sem validação.

Rollback da aplicação deve restaurar uma release anterior válida dentro de `/opt/agora/releases`, atualizar o symlink `current`, reiniciar `agora-api` e validar `/api/health`. Como frontend e backend fazem parte da mesma release, o rollback é conjunto. Migrações já aplicadas não possuem rollback automático e precisam permanecer compatíveis com a release restaurada.
