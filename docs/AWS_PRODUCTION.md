# Produção AWS de baixo custo

> Este documento define a arquitetura; não autoriza criação de recursos. Verifique região, créditos/Free Tier reais e preços da conta em uso antes de provisionar.

## Arquitetura recomendada

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
2. escolha a região pela latência, disponibilidade e preço real da conta;
3. estime Amplify, EC2, EBS, snapshots/tráfego e IPv4 público na AWS Pricing Calculator;
4. crie AWS Budget mensal com alertas em 50%, 80% e 100%; confirme e-mail;
5. registre data, região, instance type, EBS, retenção de backup e responsável em `FREE_TIER_VERIFICATION.md`;
6. só então mude `DEPLOY_ENABLED` para `true`.

O modelo atual de Free Tier usa condições/créditos que variam por data e conta; não presuma a antiga gratuidade fixa de 12 meses.

## Rede e acesso

- Security Group: entrada 80/443 da internet; não exponha 3000, 5432 ou 9090.
- SSH/22 fechado por padrão; administração via Session Manager.
- PostgreSQL escuta apenas em loopback.
- IMDSv2 obrigatório; volume EBS criptografado; desabilite source/destination checks apenas se houver motivo.
- Role da EC2: política mínima `AmazonSSMManagedInstanceCore`. Não dê credenciais de deploy à instância.
- Role do GitHub: trust limitado ao repositório e environment `production`, usando os templates em `deploy/aws`.

## Preparação do host

Crie usuário de serviço `agora`, instale Node.js 22, PostgreSQL 16, Caddy, Git, `pg_dump`, curl, SSM Agent e Grafana Alloy por repositórios oficiais. Depois:

```bash
sudo install -d -o agora -g agora /opt/agora/{releases,shared,backups,bin}
sudo install -m 0755 deploy/aws/deploy-backend.sh /opt/agora/bin/deploy-backend.sh
sudo install -m 0644 deploy/aws/agora-api.service /etc/systemd/system/agora-api.service
sudo install -m 0644 deploy/aws/Caddyfile /etc/caddy/Caddyfile
sudo install -m 0600 deploy/aws/backend.env.example /opt/agora/shared/backend.env
sudo systemctl daemon-reload
sudo systemctl enable agora-api caddy postgresql
```

Substitua todos os placeholders do ambiente com valores aleatórios. O arquivo deve pertencer a `agora`/root e ter modo `0600`. Não copie o arquivo preenchido para GitHub, SSM command, ticket ou log.

Para Alloy, copie `alloy.config` para o caminho de configuração da distribuição e `alloy.env.example` para o EnvironmentFile do serviço, com modo `0600`. Use usuário PostgreSQL somente leitura para o exporter quando viável.

## Banco, migração e backup

- Banco no volume EBS persistente; defina espaço livre mínimo de 15%.
- O CD cria `pg_dump` comprimido antes de migrar, valida arquivo não vazio e mantém 14 dias por padrão (`BACKUP_RETENTION_DAYS`).
- Configure job diário separado, retenção local curta e cópia externa criptografada somente após aprovar custo do destino.
- Teste restauração periodicamente; backup não testado não é garantia.
- Nunca execute `migrate:baseline` automaticamente. Um operador deve comparar objetos e confirmar a linha de base.
- Migrações precisam ser backward compatible, pois rollback automático de schema não existe.

## Amplify

Crie um app de deployment manual, configure rewrite SPA `/<*> → /index.html` com HTTP 200, variável de build `VITE_API_URL=https://API_DOMAIN/api` e domínio HTTPS. O workflow envia exatamente o diretório `dist` produzido no CI. Desative webhooks de build automáticos para que nenhum push contorne o Quality Gate.

## Ativação e validação

1. proteja `main` e o environment `production`;
2. configure Sonar, variáveis e OIDC;
3. instale release inicial manualmente e valide systemd/Caddy;
4. confirme `/api/health`, `/api/health/ready` e acesso local autenticado a `/metrics`;
5. importe dashboards, configure Synthetic Monitoring e contact points;
6. execute um deploy de baixo risco com `DEPLOY_ENABLED=true`;
7. confira smoke tests, logs, métricas, backup e custo real.

## Troubleshooting

- Deploy SSM não inicia: confira managed instance online, role EC2, tag e policy GitHub.
- API falha: `journalctl -u agora-api -n 200 --no-pager` e `systemctl status agora-api`.
- Caddy/HTTPS: confira DNS, portas 80/443, `journalctl -u caddy` e rate limits de certificado.
- Banco: confira espaço, `pg_isready`, conexões e checksum de migrations; não edite migration antiga.
- Amplify: consulte status/job logs e redeploy do último artefato aprovado.
