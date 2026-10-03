# Produção AWS de baixo custo

> Este documento define a arquitetura; não autoriza criação de recursos. Verifique região, créditos/Free Tier reais e preços da conta em uso antes de provisionar.

## Arquitetura adotada

> Arquitetura vigente: EC2 Ubuntu 24.04 + Caddy + backend Node.js/Express + PostgreSQL 16 local + GitHub Actions + OIDC + AWS Systems Manager. Qualquer menção a AWS Amplify neste documento é histórica e não faz parte do fluxo de produção atual.

Estado remoto informado pelo responsável em 2026-09-11, sem inspeção ou alteração da conta nesta revisão: região `us-east-1`; EC2 Ubuntu 24.04; Node.js 22; PostgreSQL 16 na mesma instância; systemd/Caddy; administração SSM com SSH desativado; GitHub OIDC e role de deploy com privilégio mínimo já criada. Como registro histórico, existiu anteriormente um app AWS Amplify com branch `main/PRODUCTION` e AutoBuild desativado. Ele não integra o fluxo operacional atual descrito neste documento. Grafana Alloy → Grafana Cloud permanece a arquitetura de observabilidade.

Aplicação pública: `https://agora-techpark.duckdns.org`. O frontend é construído com `VITE_API_URL=/api` e servido pelo Caddy na mesma origem da API. Não colocar `/api` em `PRODUCTION_API_URL`.

O bootstrap da infraestrutura foi manual. O deploy da aplicação é automatizado por GitHub Actions + OIDC + AWS Systems Manager. Terraform, CloudFormation e CDK não são requisito desta etapa.

```text
Internet

└─ Caddy/HTTPS — EC2 pública
   ├─ Express em 127.0.0.1:3000, systemd
   ├─ PostgreSQL 16 em 127.0.0.1:5432, volume EBS
   ├─ Grafana Alloy → Grafana Cloud
   └─ SSM Agent ← GitHub Actions/OIDC
```

É uma arquitetura econômica, mas a EC2 é ponto único de falha e banco/aplicação disputam CPU, RAM e disco. Serve para carga pequena e tolerância a indisponibilidade. RDS, ALB, NAT Gateway, ECS/Fargate, EKS e Secrets Manager não entram sem nova aprovação de custo.

## Gate financeiro obrigatório

Antes de criar qualquer recurso:

1. confira em Billing a modalidade Free Plan/Paid Plan, créditos, expiração e serviços elegíveis;
2. confira custos e elegibilidade na região adotada, `us-east-1`;
3. estime EC2, EBS, snapshots/tráfego e IPv4 público na AWS Pricing Calculator;
4. crie AWS Budget mensal com alertas em 50%, 80% e 100%; confirme e-mail;
5. registre data, região, instance type, EBS, retenção de backup e responsável no registro operacional abaixo; `FREE_TIER_VERIFICATION.md` é histórico e não comprova a situação atual;
6. só então mude `DEPLOY_ENABLED` para `true`.

O modelo atual de Free Tier usa condições/créditos que variam por data e conta; não presuma a antiga gratuidade fixa de 12 meses.

Registro operacional a preencher após conferência na conta: data da verificação, responsável, região `us-east-1`, tipo da EC2, tamanho/criptografia do EBS, créditos/expiração, orçamento/alertas e retenção/destino do backup. Esses dados ainda não foram validados nesta revisão local.

## Rede e acesso

- Security Group: entrada 80/443 da internet; não exponha 3000, 5432 ou 9090.
- SSH/22 fechado por padrão; administração via Session Manager.
- PostgreSQL escuta apenas em loopback.
- IMDSv2 obrigatório; volume EBS criptografado; desabilite source/destination checks apenas se houver motivo.
- Role da EC2: política mínima `AmazonSSMManagedInstanceCore`. Não dê credenciais de deploy à instância.
- Role do GitHub: trust limitado ao repositório e environment `production`, usando os templates em `deploy/aws`. `SendCommand` é limitado à EC2 do projeto e `AWS-RunShellScript`; `CreateDeployment`/`StartDeployment` à branch `main`; `GetJob` a seus `jobs/*`. `GetCommandInvocation` é a única leitura SSM usada e requer `Resource: "*"` porque a ação não oferece escopo por recurso. Não adicionar `AdministratorAccess` nem curingas de ações.

## Preparação do host

O host adotado é Ubuntu 24.04. Confira usuário `agora`, Node.js 22, PostgreSQL 16, Caddy, Git, `pg_dump`, curl, SSM Agent e Grafana Alloy. Os comandos abaixo documentam bootstrap/reprodução futura; não foram executados remotamente nesta revisão. Não sobrescreva ambientes já preenchidos:

```bash
sudo install -d -o agora -g agora /opt/agora/{releases,shared,backups,bin}
sudo install -m 0644 deploy/aws/agora-api.service /etc/systemd/system/agora-api.service
sudo install -m 0644 deploy/aws/Caddyfile /etc/caddy/Caddyfile
sudo test -e /opt/agora/shared/backend.env || sudo install -o agora -g agora -m 0600 deploy/aws/backend.env.example /opt/agora/shared/backend.env
sudo systemctl daemon-reload
sudo systemctl enable agora-api caddy postgresql
```

Substitua placeholders por valores reais: segredos aleatórios, URLs de frontend corretas e SMTP real. O arquivo deve pertencer a `agora:agora` e ter modo `0600`, pois a aplicação também lê o symlink `.env`. Não copie o arquivo preenchido para GitHub, SSM command, ticket ou log. Os diretórios de release precisam ser legíveis por `agora`.

`NODE_ENV=production`, `PORT=3000`, `LISTEN_HOST=127.0.0.1` são o contrato do host/Caddy/Alloy. A configuração central assume loopback em produção e rejeita qualquer outro `LISTEN_HOST`. Em development/test o default é `0.0.0.0`, permitindo containers locais; pode ser substituído por loopback. Não copie `LISTEN_HOST=0.0.0.0` do exemplo DEV para produção. O Compose local não inicia o servidor da API.

### Domínio do Caddy e systemd

Na EC2 já foi criado manualmente um drop-in com `API_DOMAIN=agora-techpark.duckdns.org`. A forma reproduzível passa a ser `deploy/aws/caddy.service.d/environment.conf` + `/etc/caddy/caddy.env`, mantendo o Caddyfile genérico `{$API_DOMAIN}`.

```bash
sudo install -d -m 0755 /etc/systemd/system/caddy.service.d
sudo install -m 0644 deploy/aws/caddy.service.d/environment.conf /etc/systemd/system/caddy.service.d/environment.conf
sudo test -e /etc/caddy/caddy.env || sudo install -o root -g caddy -m 0640 deploy/aws/caddy.env.example /etc/caddy/caddy.env
sudoedit /etc/caddy/caddy.env
```

No arquivo local do host, definir `API_DOMAIN=agora-techpark.duckdns.org` (hostname sem protocolo/caminho). O exemplo versionado mantém `api.example.org`. Revisar o drop-in manual anterior e retirar somente a atribuição antiga de `API_DOMAIN`, preservando outras opções, para ter uma única fonte de configuração. Não basta definir a variável no ambiente do backend: Caddy é outro serviço.

Validação futura no host, sem publicar uma release nem solicitar certificados:

```bash
sudo systemd-analyze verify /etc/systemd/system/agora-api.service /lib/systemd/system/caddy.service
sudo sh -c 'set -a; . /etc/caddy/caddy.env; set +a; caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile'
```

Depois da conferência, a aplicação operacional da mudança requer `systemctl daemon-reload` e **restart do Caddy** em janela autorizada: apenas reload do Caddy não atualiza o ambiente do processo existente. Confirmar DNS DuckDNS, portas 80/443 e HTTPS antes de liberar o deploy. Nenhum desses comandos remotos foi executado nesta correção.

Para Alloy, copie `alloy.config` para o caminho de configuração da distribuição e `alloy.env.example` para o EnvironmentFile do serviço, com modo `0600`. Use usuário PostgreSQL somente leitura para o exporter quando viável.

## Segurança e reexecução do deploy backend

O script requer `flock` (util-linux) e `realpath` (coreutils), disponíveis no ambiente Linux adotado. O host precisa ter `/opt/agora` preparado. O descritor de `/opt/agora/deploy.lock` permanece aberto desde antes da leitura de `current` até o fim do deploy, incluindo rollback e retenção. Contenção ou falha ao adquirir o lock encerra a tentativa sem alterar releases/current. Não remover o arquivo de lock durante execuções; todos os deploys devem passar por esse script.

O destino de `current` é normalizado e deve permanecer dentro de `/opt/agora/releases`. Rerun do SHA ativo verifica diretório, `backend/src/server.js`, `backend/package.json` e health local. Se saudável, retorna sucesso sem clone, instalação, backup, migrations, troca de symlink, restart ou retenção. Se inválido ou não saudável, retorna erro preservando os arquivos. Diretório de SHA existente e inativo nunca é destruído automaticamente: o operador deve investigar, confirmar que não está ativo nem necessário para rollback e tratar eventual release parcial somente de forma controlada.

SHA novo executa: clone → checkout → ambiente backend → dependências backend (npm ci) → dependências frontend (npm ci) → build frontend (VITE_API_URL=/api) → validação do artefato frontend/dist (scripts/validate-frontend-artifact.mjs) → validação de release conjunta (backend + dist/index.html) → remoção de frontend/node_modules → backup (pg_dump) → validação de migrations (dry-run) → migrations → troca atômica de `current` → restart `agora-api` → health local. Falha em qualquer etapa de dependências, build ou validação do frontend aborta imediatamente antes do backup ou das migrações, sem tocar em `current`. Falha no restart ou health tenta restaurar uma anterior com estrutura válida, reiniciar e verificar sua saúde; informa recuperação bem-sucedida ou falha, mantendo erro do deploy original. Releases legadas backend-only continuam reconhecidas e aceitas para rollback transitório da API. Primeiro deploy sem anterior válida não tem rollback. Não há rollback automático do banco, e compatibilidade das migrations continua obrigatória.

As releases atuais contêm backend e `frontend/dist` construído com `VITE_API_URL=/api`. O Caddy serve a SPA e encaminha `/api` para o backend. Frontend e backend são publicados conjuntamente como uma única release na EC2.

A retenção mantém os cinco diretórios com maior mtime e preserva adicionalmente a release ativa, a anterior e a recém-ativada, comparando caminhos normalizados dentro da árvore de releases. Por isso pode manter mais de cinco diretórios. Preparações que falham podem deixar releases parciais; não há limpeza automática dessas releases. Falhas no pipeline ou na validação do backup removem o temporário. Alterações manuais fora do lock não são serializadas.

Validação local: `node --test scripts/deploy-backend.test.mjs scripts/deploy-backup.test.mjs` executa uma cópia do script com apenas a restrição de raiz adaptada para diretório temporário, filesystem/symlinks reais e comandos git, npm, pg_dump, curl e systemctl simulados. Não acessa AWS, banco ou serviços reais. No Windows, o teste substitui `flock` por exclusão via diretório temporário; em Linux usa `flock` real, incluindo duas execuções concorrentes. A semântica Linux do lock ainda deve ser validada localmente em Linux quando os testes forem executados somente em Windows.

O CD não instala nem depende de `/opt/agora/bin/deploy-backend.sh` ou `/opt/agora/bin/deploy-backend.sh.previous`. A cada deploy e a cada rollback, o comando SSM cria um diretório com `mktemp -d`, registra `trap cleanup EXIT`, inicializa um repositório Git temporário, busca o SHA exato de 40 caracteres de `https://github.com/GeovaniaLuiza/agora-tech-park-fullstack.git` com `git fetch --depth 1 origin "$RELEASE_SHA"`, compara `rev-parse FETCH_HEAD^{commit}` com `RELEASE_SHA`, extrai `RELEASE_SHA:deploy/aws/deploy-backend.sh`, exige arquivo não vazio, executa `bash -n` e só então roda a cópia temporária com `RELEASE_SHA` e a ação `deploy` ou `rollback`. `main`, `latest`, `origin/main` e HEAD remoto não são consultados. Falha em `fetch`, comparação, extração ou `bash -n` aborta antes de tocar na release ativa; o `trap` apaga o diretório temporário em sucesso e em falha. O script viaja como Bash em texto no parâmetro SSM, sem base64 e sem cópia persistente no host, eliminando o drift entre o Git aprovado e o runtime da EC2. A única leitura do deploy continua sendo `GetCommandInvocation`; o bootstrap usa `git`, já exigido pelo script. Validação local: `node --test scripts/prepare-deploy-runtime.test.mjs` executa o bootstrap contra um repositório Git local real e cobre deploy, rollback, cleanup e cada condição de abort. Esta alteração não foi executada na EC2 e não altera `DEPLOY_ENABLED`. Permanecem os limites do health local (sem comprovação do SHA ou HTTPS/Caddy), a ausência de prazo total explícito para o deploy e os gaps de backup abaixo.

## Banco, migração, backup e recuperação

- Banco no volume EBS persistente; defina espaço livre mínimo de 15%.
- O CD cria `pg_dump` comprimido antes de migrar, valida arquivo não vazio e integridade com `gzip -t`, publica o arquivo final atomicamente e mantém 14 dias por padrão (`BACKUP_RETENTION_DAYS`).
- Nunca execute `migrate:baseline` automaticamente. Um operador deve comparar objetos e confirmar a linha de base.
- Migrações precisam ser backward compatible, pois rollback automático de schema não existe.

### Backup lógico PostgreSQL

O script preserva `set -Eeuo pipefail` e passa a URI explicitamente por `pg_dump --dbname="$DATABASE_URL"`, sem imprimir a conexão. O pipeline grava em temporário no mesmo diretório; somente após sucesso, tamanho maior que zero e `gzip -t` o arquivo é renomeado atomicamente para `.sql.gz`. Falhas removem o temporário e abortam antes das dependências, `migrate:dry` e `migrate`, preservando backups anteriores. O arquivo usa SQL plain, sem owners/privileges.

A retenção só é aplicada ao final de deploy bem-sucedido. `node --test scripts/deploy-backup.test.mjs` exercita o trecho real de backup com `pg_dump` simulado em diretório temporário, verificando conexão explícita, ausência da URI nos logs, sucesso, limpeza em falhas de dump/compressão/validação e preservação de backups anteriores, sem conectar a banco ou executar o restante do deploy.

`test -s` e `gzip -t` confirmam bytes e integridade do arquivo comprimido, mas não comprovam conteúdo SQL útil nem restauração. Os dumps PostgreSQL existentes em `/opt/agora/backups` constituem uma camada complementar de recuperação, porém não foi executado restore lógico de `pg_dump` nesta validação.

### AWS Backup e restauração de EBS

O volume EBS de produção `vol-052715cd3003f3f23`, de 30 GiB, tipo `gp3`, criptografado com `aws/ebs`, está protegido pelo AWS Backup.

Foi configurado o plano `agora-tech-park-prod-backup`, com a regra `daily-ebs-prod`, cofre `Default`, execução diária às `12:30 America/Sao_Paulo` e retenção de 14 dias.

Um backup on-demand foi executado com sucesso para o volume de produção. O job `C6DD6466-95B7-855D-1C89-426DA1403AB8` foi concluído e gerou o recovery point/snapshot `snap-046748087c4c04aad`.

A recuperabilidade do recovery point também foi validada. O restore job `2156d79f-bfca-433f-b391-17a3664cd087` criou com sucesso um novo volume EBS de 30 GiB, `vol-0b18fff7293b8a310`, na AZ `us-east-1f`. A criação do volume restaurado levou aproximadamente 1 minuto.

O volume restaurado foi mantido isolado, não foi anexado à EC2 de produção e foi removido após a validação. O volume original `vol-052715cd3003f3f23` permaneceu intacto durante todo o procedimento.

Essa validação comprova backup e restauração no nível de infraestrutura EBS. Ela não deve ser interpretada como teste de restore lógico do PostgreSQL, nem como comprovação de que o snapshot EBS é application-consistent. Também não representa o RTO completo da aplicação: o tempo de aproximadamente 1 minuto refere-se somente à criação do volume EBS restaurado.

Para recuperação de desastre, a estratégia atual combina duas camadas: snapshots EBS automatizados via AWS Backup e dumps lógicos PostgreSQL produzidos pelo fluxo de deploy. Um teste futuro de restore lógico do `pg_dump` pode ampliar a evidência de recuperação em nível de banco, sem invalidar a validação de EBS concluída nesta issue.

## AWS Amplify — legado

O AWS Amplify foi utilizado anteriormente para hospedagem do frontend. A arquitetura atual publica frontend e backend conjuntamente na EC2, com Caddy servindo a SPA e encaminhando `/api` para o backend. A eventual existência de recursos Amplify remotos é tratada separadamente na DEVOPS-02. Nenhum recurso remoto deve ser removido apenas com base nesta documentação. Ver [CI_CD.md](CI_CD.md).

## Ativação e validação

1. proteja `main` e o environment `production`;
2. configure Sonar, variáveis e OIDC;
3. instale release inicial manualmente e valide systemd/Caddy;
4. confirme `/api/health`, `/api/health/ready` e acesso local autenticado a `/metrics`;
5. importe dashboards, configure Synthetic Monitoring e contact points;
6. execute um deploy de baixo risco com `DEPLOY_ENABLED=true`;
7. confira smoke tests, logs, métricas, backup e custo real.

## Troubleshooting

- Deploy SSM não inicia: confira managed instance online, role EC2, ID da instância e policy GitHub.
- API falha: `journalctl -u agora-api -n 200 --no-pager` e `systemctl status agora-api`.
- Caddy/HTTPS: confira DNS, portas 80/443, `journalctl -u caddy` e rate limits de certificado.
- Banco: confira espaço, `pg_isready`, conexões e checksum de migrations; não edite migration antiga.

## Encerramento do legado AWS Amplify

Em 29/09/2026, a hospedagem legada no AWS Amplify foi descontinuada após a consolidação do frontend e do backend na EC2 com Caddy.

Foram concluídas as seguintes ações operacionais:

- remoção das variáveis `AMPLIFY_APP_ID` e `AMPLIFY_BRANCH` do environment `production` no GitHub;
- desconexão da branch `main` do aplicativo Amplify;
- retirada das permissões `amplify:CreateDeployment`, `amplify:StartDeployment` e `amplify:GetJob` da role `AgoraTechPark-GitHubDeploy-Role`;
- validação da aplicação em `https://agora-techpark.duckdns.org` após a desconexão do Amplify;
- confirmação de indisponibilidade da antiga URL `*.amplifyapp.com`.

O fluxo operacional atual de produção é:

`GitHub Actions → OIDC → AWS Systems Manager → EC2/Caddy`.

A role de deploy permanece com as permissões necessárias para `ssm:SendCommand` e `ssm:GetCommandInvocation`.
