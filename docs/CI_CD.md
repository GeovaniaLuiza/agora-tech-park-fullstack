# CI/CD

## Arquitetura vigente e legado

A arquitetura ativa de produção é EC2 Ubuntu 24.04 + Caddy + backend Node.js/Express + PostgreSQL 16 + GitHub Actions + AWS OIDC + Systems Manager. Qualquer referência a AWS Amplify neste documento é histórica e não representa o fluxo ativo de deploy.

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

O job `quality`, em `ubuntu-24.04`, executa os testes isolados `scripts/deploy-backend.test.mjs`, `scripts/deploy-backup.test.mjs` e `scripts/prepare-deploy-runtime.test.mjs`. Este último cria um repositório Git local real e exercita o bootstrap em Bash: deploy e rollback temporários com remoção do diretório, e abortos para fetch inválido, SHA divergente, script ausente, runtime vazio, sintaxe inválida e ação desconhecida; também verifica por asserção estática que o bootstrap e `cd-production.yml` não mencionam `main`, `latest`, `origin/main`, `base64`, `/opt/agora/bin` ou `.previous`. O backup passa `DATABASE_URL` explicitamente ao `pg_dump` por `--dbname`, sem registrar a conexão. O arquivo final `.sql.gz` só aparece após sucesso do pipeline, verificação de tamanho e `gzip -t`, por renomeação de um temporário no mesmo diretório. Falhas removem o temporário e abortam antes das migrations (dependências e build já foram preparados). Restore permanece manual.

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

`cd-production.yml` só é elegível após uma execução `push/main` do workflow `CI` concluir com sucesso, `DEPLOY_ENABLED=true` e `SESSION_REVOCATION_ROLLOUT_READY=true`. As duas flags devem ser variáveis de repositório; ausência ou valor diferente de true bloqueia o job. PR nunca faz deploy. O environment `production` pode exigir aprovação manual adicional. Durante a preparação da primeira implantação, o gate de rollout deve permanecer ausente/false, inclusive se o gate histórico de deploy estiver true. Sua liberação futura exige mudança operacional autorizada após homologação; esta implementação não altera variáveis remotas nem desativa proteções de CI/Sonar.

O backend usa OIDC e Systems Manager, sem access keys ou SSH private key. Para um SHA novo, a EC2 instala o SHA exato em `/opt/agora/releases`, instala dependências do backend e do frontend, compila o frontend com `VITE_API_URL=/api`, valida `frontend/dist` com `scripts/validate-frontend-artifact.mjs`, remove `frontend/node_modules`, faz backup do banco via `pg_dump`, valida/aplica migrações, para a API antiga, grava o requisito persistente de revogação e troca o symlink `current`, reinicia `agora-api` e verifica health. Se qualquer etapa de dependências, build ou validação do frontend falhar, o deploy é abortado imediatamente antes do backup e das migrações, sem tocar em `current` ou reiniciar serviços. Releases legadas sem revogação nunca são destinos de recuperação. A candidata de recuperação precisa cumprir o contrato descrito em SESSION_SECURITY.md. Um lock exclusivo `flock` no host cobre a leitura de `current`, preparação, ativação, recuperação e retenção; uma segunda execução falha sem modificar releases/current. A concorrência do GitHub permanece como proteção adicional.

Reexecutar o SHA já ativo é no-op com sucesso somente se a estrutura esperada existir e o health local passar: não clona, instala dependências, migra, troca symlink ou reinicia. Se estiver inválido ou não saudável, falha preservando a release. Um diretório de SHA existente e inativo também causa erro e é preservado; o operador deve investigar uma release parcial e removê-la somente de forma controlada, verificando antes que não é ativa nem necessária para rollback.

O preflight exige recuperação compatível e aprovação operacional privada antes do clone/backup/migrations, conforme SESSION_SECURITY.md. Falta de preparação registra SESSION_DEPLOY_NOT_READY e preserva a API ativa, current e marcador. Não se compara a ativa com fingerprints de dependências da candidata para decidir pará-la. Falha no restart ou health após o corte aciona a recuperação: revalida contrato e aprovação, restaura seu symlink atomicamente, tenta restart e verifica health. O deploy original sempre retorna erro. Se a recuperação deixar de estar disponível após o corte ou falhar, registra SESSION_RECOVERY_BLOCKED, para a API e exige recuperação operacional. Migrações não têm rollback automático e precisam permanecer compatíveis com a recuperação aprovada. A retenção preserva explicitamente os caminhos normalizados da ativa, anterior, recuperação selecionada e recém-ativada dentro de `/opt/agora/releases`.

O runtime de deploy não é persistente no host. `scripts/prepare-deploy-runtime.mjs` gera um bootstrap SSM autocontido em Bash puro: ele cria um diretório com `mktemp -d`, registra `trap cleanup EXIT` (e `INT`/`TERM`), inicializa um repositório Git temporário, faz `git fetch --depth 1 origin "$RELEASE_SHA"` do SHA exato de 40 caracteres de `https://github.com/GeovaniaLuiza/agora-tech-park-fullstack.git`, compara `rev-parse FETCH_HEAD^{commit}` com `RELEASE_SHA` e aborta na divergência, extrai `RELEASE_SHA:deploy/aws/deploy-backend.sh`, exige arquivo não vazio, roda `bash -n` e só então executa a cópia temporária. `main`, `latest`, `origin/main` e HEAD remoto não são usados. Falha em `fetch`, comparação, extração ou `bash -n` aborta antes de qualquer mudança na release ativa, e o `trap` remove o diretório temporário em sucesso e em falha. O script viaja como texto no parâmetro SSM, sem base64 e sem cópia persistente. O deploy e o rollback usam exatamente o mesmo bootstrap, diferindo apenas em `AGORA_DEPLOY_ACTION=deploy|rollback`. O CI não mantém, instala nem depende de `/opt/agora/bin/deploy-backend.sh` ou `.previous`. Falha na preparação mantém a release ativa intacta e impede o deploy. Esta correção local não executou deploy remoto nem altera `DEPLOY_ENABLED`. O health local ainda não comprova o SHA respondente nem Caddy/HTTPS. Consulte os limites de backup e a validação isolada em `AWS_PRODUCTION.md`.

A arquitetura atual publica frontend e backend conjuntamente na EC2. O Caddy serve o `frontend/dist` e encaminha `/api` para o backend na mesma origem. O AWS Amplify pertence ao histórico da arquitetura anterior e não integra o fluxo atual de deployment.

O CI constrói `frontend-dist` com `VITE_API_URL=/api`. O validador aceita somente esse valor same-origin ou uma URL HTTPS absoluta, pública, sem credenciais/query/fragmento e com pathname exatamente `/api`. O suporte ao formato absoluto permanece por compatibilidade com artefatos e configurações legadas, não como requisito da arquitetura atual.

Depois do build, `scripts/validate-frontend-artifact.mjs` exige `index.html`, procura a URL esperada como literal completo no JavaScript e rejeita endereços locais/DEV nos arquivos de texto, inclusive assets aninhados. O CI valida e publica `frontend-dist` para diagnóstico. O CD não baixa esse artefato: autentica na AWS e reconstrói a release do SHA aprovado na EC2; o runtime valida o novo dist antes do backup, das migrations e da ativação. Comparar apenas as variáveis não é suficiente. O script não altera o artefato nem registra seu conteúdo. O CI executa seus testes com `node --test scripts/validate-frontend-artifact.test.mjs`.

React Router inclui uma base auxiliar `http://localhost` para parsing de URLs. O plugin de build `frontend/build/router-url-base.js` troca apenas esse literal, apenas nos módulos de React Router, por `https://router.invalid`; a origem real do navegador continua prevalecendo. Isso permite rejeitar qualquer localhost no dist sem mascarar endpoints DEV da aplicação. Atualizações do Router devem manter os testes e a validação do artefato aprovados.

`DEPLOY_ENABLED` e `SESSION_REVOCATION_ROLLOUT_READY` devem ser variáveis de **repositório**, pois são lidas no `if` do job antes da disponibilização das variáveis do environment. O registro anterior de DEPLOY_ENABLED=true não comprova preparação para a primeira ativação da revogação: o gate adicional precisa permanecer ausente/false até homologação. Em configuração, manutenção ou incidentes operacionais, DEPLOY_ENABLED=false também pode bloquear deploys temporariamente. Esta implementação altera somente a condição versionada; não verifica nem modifica o valor remoto dessas variáveis. Variáveis operacionais do environment `production`: `AWS_ROLE_ARN`, `AWS_REGION=us-east-1`, `EC2_INSTANCE_ID`, `PRODUCTION_API_URL=https://agora-techpark.duckdns.org` e `PRODUCTION_FRONTEND_URL=https://agora-techpark.duckdns.org`. Qualquer variável legada do Amplify deve ser tratada como histórica, sem efeito no fluxo atual. Secrets opcionais para login de smoke test: `SMOKE_EMAIL`, `SMOKE_PASSWORD`. `SONAR_TOKEN` é necessário no CI. Não versionar IDs reais ou segredos.

Na arquitetura atual, os valores esperados são `VITE_API_URL=/api`, `CLIENT_URL=https://agora-techpark.duckdns.org` e `FRONTEND_URL=https://agora-techpark.duckdns.org`. Frontend e backend são servidos pela mesma origem via Caddy. Configurações remotas legadas do Amplify são históricas e não devem ser interpretadas como parte do fluxo atual.

Rollback da aplicação deve restaurar exclusivamente uma release conjunta validada pelo contrato de revogação dentro de `/opt/agora/releases`, atualizar o symlink `current`, reiniciar `agora-api` e validar `/api/health`. Como frontend e backend fazem parte da mesma release, o rollback é conjunto. Migrações já aplicadas não possuem rollback automático e precisam permanecer compatíveis com a release restaurada.


## Recuperação com preservação da revogação

O runtime extrai também `scripts/verify-session-recovery.mjs` e `deploy/aws/session-recovery-contract.json` do mesmo SHA aprovado, abortando se estiverem ausentes. A política não vem da release candidata. O verificador compara o inventário completo e hashes SHA-256 do backend com o código revisado em `08b7ae3` e as dependências aprovadas em `reviewedDependencyUpdate`, incluindo todo `backend/src`, package/lockfile e migration 022. Não executa código da candidata. Mudanças futuras do backend exigem revisão explícita do contrato e homologação; não regenerar fingerprints automaticamente para fazer uma candidata passar.

O script prioriza `/opt/agora/recovery`, quando existir e for compatível, e depois considera a anterior. Antes da seleção, normaliza caminhos dentro de releases, valida SHA/HEAD, frontend e marcador de release. Verifica novamente a candidata imediatamente antes da restauração. Ter a migration ou um marcador autodeclarado não é prova de compatibilidade. A recuperação selecionada é preservada pela retenção.

`shared/session-revocation-required` é um requisito permanente do host, gravado antes da ativação e depois da parada planejada da API. Sua presença ou sessionSchema.js na ativa classifica a revogação como já ativa, sem parada ou gravação durante o preflight; a migration 022 isolada não indica ativação. Diferenças de dependências entre releases não são usadas como prova de que a ativa viola a revogação. A candidata e qualquer destino de recuperação precisam cumprir o contrato novo; a recuperação também exige aprovação operacional para seu SHA/hash. A parada da API antes de trocar current evita servir o autenticador antigo durante a ativação, ao custo de um intervalo de manutenção. Sem preparação, não se inicia esse corte, nem na primeira implantação a partir da release legada.

Falha de restart/health ou de smoke público só restaura uma candidata verificada. Sem candidata compatível, registra `SESSION_RECOVERY_BLOCKED`, não troca current para código inseguro e tenta parar a API; falha ao parar exige isolamento operacional imediato. O workflow de smoke registra também `SESSION_RECOVERY_BLOCKED_OR_FAILED` quando o comando de recuperação falha. Se a recuperação compatível falhar no próprio restart/health, a API também é parada. Falha interrompendo a ativação deixa registro `SESSION_ACTIVATION_FAILED`. Deploy/smoke originais continuam reprovados mesmo quando a recuperação funciona.

O banco nunca é restaurado/revertido por esses caminhos. O procedimento operacional detalhado, inclusive restauração de snapshots e invalidação de tokens, está em `SESSION_SECURITY.md`. Estes fluxos foram implementados e testados localmente; não confirmam permissões, configurações ou releases disponíveis no host de produção.
