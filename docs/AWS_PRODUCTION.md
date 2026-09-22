# Produção AWS de baixo custo

> Este documento define a arquitetura; não autoriza criação de recursos. Verifique região, créditos/Free Tier reais e preços da conta em uso antes de provisionar.

## Arquitetura adotada

Estado remoto informado pelo responsável em 2026-09-11, sem inspeção ou alteração da conta nesta revisão: região `us-east-1`; EC2 Ubuntu 24.04; Node.js 22; PostgreSQL 16 na mesma instância; systemd/Caddy; administração SSM com SSH desativado; GitHub OIDC e role de deploy com privilégio mínimo já criada. Amplify já criado com branch `main/PRODUCTION` e AutoBuild desativado. Grafana Alloy → Grafana Cloud permanece a arquitetura de observabilidade.

API pública planejada: `https://agora-techpark.duckdns.org`. O artefato preparado para a futura hospedagem EC2/Caddy usa `VITE_API_URL=/api`; o Amplify preserva o último artefato aprovado com URL absoluta durante a coexistência. Não colocar `/api` em `PRODUCTION_API_URL`.

O bootstrap da infraestrutura foi manual. O deploy da aplicação será automatizado por GitHub Actions + OIDC + SSM/Amplify. Terraform, CloudFormation e CDK não são requisito desta etapa.

```text
Internet
├─ AWS Amplify Hosting — SPA React, HTTPS
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
3. estime Amplify, EC2, EBS, snapshots/tráfego e IPv4 público na AWS Pricing Calculator;
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
sudo install -m 0755 deploy/aws/deploy-backend.sh /opt/agora/bin/deploy-backend.sh
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

SHA novo mantém clone → checkout → ambiente → backup → dependências → dry-run → migrations → troca atômica de `current` → restart → health. Falha no restart ou health tenta restaurar uma anterior com estrutura válida, reiniciar e verificar sua saúde; informa recuperação bem-sucedida ou falha, mantendo erro do deploy original. Primeiro deploy sem anterior válida não tem rollback. Não há rollback automático do banco, e compatibilidade das migrations continua obrigatória. A verificação estrutural não comprova integridade completa da release ou compatibilidade de schema.

A retenção mantém os cinco diretórios com maior mtime e preserva adicionalmente a release ativa, a anterior e a recém-ativada, comparando caminhos normalizados dentro da árvore de releases. Por isso pode manter mais de cinco diretórios. Preparações que falham podem deixar releases parciais; não há limpeza automática dessas releases. Falhas no pipeline ou na validação do backup removem o temporário. Alterações manuais fora do lock não são serializadas.

Validação local: `node --test scripts/deploy-backend.test.mjs scripts/deploy-backup.test.mjs` executa uma cópia do script com apenas a restrição de raiz adaptada para diretório temporário, filesystem/symlinks reais e comandos git, npm, pg_dump, curl e systemctl simulados. Não acessa AWS, banco ou serviços reais. No Windows, o teste substitui `flock` por exclusão via diretório temporário; em Linux usa `flock` real, incluindo duas execuções concorrentes. A semântica Linux do lock ainda deve ser validada localmente em Linux quando os testes forem executados somente em Windows.

Esta etapa não declara produção pronta. O script instalado em `/opt/agora/bin` deverá ser atualizado em etapa operacional autorizada; o checkout do workflow não o instala. Permanecem os limites do health local (sem comprovação do SHA, HTTPS/Caddy ou prazo total explícito), ausência de rollback após falhas do Amplify/smoke e os gaps de backup abaixo. Nenhuma ativação de CD é autorizada por esta correção.

## Banco, migração e backup

- Banco no volume EBS persistente; defina espaço livre mínimo de 15%.
- O CD cria `pg_dump` comprimido antes de migrar, valida arquivo não vazio e integridade com `gzip -t`, publica o arquivo final atomicamente e mantém 14 dias por padrão (`BACKUP_RETENTION_DAYS`).
- Configure job diário separado, retenção local curta e cópia externa criptografada somente após aprovar custo do destino.
- Teste restauração periodicamente; backup não testado não é garantia.
- Nunca execute `migrate:baseline` automaticamente. Um operador deve comparar objetos e confirmar a linha de base.
- Migrações precisam ser backward compatible, pois rollback automático de schema não existe.

### Gap de backup e recuperação

O script preserva `set -Eeuo pipefail` e passa a URI explicitamente por `pg_dump --dbname="$DATABASE_URL"`, sem imprimir a conexão. O pipeline grava em temporário no mesmo diretório; somente após sucesso, tamanho maior que zero e `gzip -t` o arquivo é renomeado atomicamente para `.sql.gz`. Falhas removem o temporário e abortam antes das dependências, `migrate:dry` e `migrate`, preservando backups anteriores. O arquivo usa SQL plain, sem owners/privileges. A retenção só é aplicada ao final de deploy bem-sucedido. `node --test scripts/deploy-backup.test.mjs` exercita o trecho real de backup com `pg_dump` simulado em diretório temporário, verificando conexão explícita, ausência da URI nos logs, sucesso, limpeza em falhas de dump/compressão/validação e preservação de backups anteriores, sem conectar a banco ou executar o restante do deploy.

`test -s` e `gzip -t` confirmam bytes e integridade do arquivo comprimido, mas não comprovam conteúdo SQL útil nem restauração. Restore continua sendo procedimento manual. Não foi feito dump ou restore de produção. Não existe job diário nem cópia off-site implementada; perda da EC2/EBS pode perder banco e backups. Registrar também permissões restritas dos dumps e espaço disponível.

Próxima etapa: um serviço/timer systemd separado do deploy deverá executar backup diário, validar gzip e conteúdo, aplicar retenção e reportar falhas ao Alloy/Grafana. A cópia off-site criptografada deverá ser adicionada após esse backup, com destino, custo e credenciais de privilégio mínimo aprovados. Um procedimento independente deve restaurar em PostgreSQL 16 isolado, validar schema/dados e registrar RPO/RTO e data do teste. Nenhum recurso externo pago, timer ou restore foi criado nesta etapa.

## Amplify

O app já existe; manter branch `main/PRODUCTION` e AutoBuild desativado. Confirmar rewrite SPA para `/index.html` com HTTP 200 para rotas da aplicação, preservando assets existentes. O CI agora prepara `frontend-dist` com `VITE_API_URL=/api` para a futura hospedagem na EC2; o workflow não publica esse artefato same-origin no Amplify. O código de deployment Amplify e o último artefato absoluto aprovado permanecem disponíveis para rollback. Ver [CI_CD.md](CI_CD.md).

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
- Amplify: consulte status/job logs e redeploy do último artefato aprovado.
