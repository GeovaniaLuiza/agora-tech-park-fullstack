# Deployment

O fluxo oficial separa CI e CD. Consulte [CI/CD](docs/CI_CD.md) para checks e proteção de branch e [Produção AWS](docs/AWS_PRODUCTION.md) para arquitetura, custo, provisionamento, backup e rollback.

Arquitetura vigente: frontend React/Vite e backend Node.js/Express publicados conjuntamente em uma EC2 Ubuntu 24.04 em `us-east-1`, com Caddy servindo a SPA e encaminhando `/api` para o backend. PostgreSQL 16 permanece local em EBS. Administração via AWS Systems Manager, SSH desativado, deploy via GitHub Actions/OIDC e observabilidade via Alloy/Grafana Cloud. Bootstrap manual; IaC não é pré-requisito.

O CI valida a URL pública incorporada ao `frontend-dist`; o CD repete a validação antes de acessar AWS. Amplify mantém AutoBuild desativado.

## Pré-condições

- CI verde e SonarQube Cloud Quality Gate aprovado;
- nenhuma issue Critical/High aberta;
- branch `main` protegida;
- AWS Budget, região e custos confirmados;
- EC2, Systems Manager, OIDC, Caddy e Grafana previamente autorizados e configurados;
- secrets somente no host ou GitHub Environment;
- `DEPLOY_ENABLED=true` somente depois de uma release inicial validada.

## Fluxo automático

```text
push main → CI → testes/build/Sonar → CD Production
                                      ├─ EC2: SSM → clone → deps backend/frontend → build frontend (/api) → validate dist → backup → dry-run → migrate → current → restart → health
                                      ├─ frontend: artefato aprovado → `frontend/dist` da release na EC2
                                      └─ smoke: health → HTML → login opcional
```

As releases atuais contêm backend e `frontend/dist` construído com `VITE_API_URL=/api`. O Caddy serve a SPA React/Vite e encaminha `/api` ao backend. O deploy é ativado como uma release conjunta e validado por smoke tests após a publicação.

O workflow não aceita pull request como origem de deploy e usa credenciais AWS temporárias via OIDC. O backend faz checkout do SHA aprovado em uma release imutável; não usa `git pull` no diretório em execução.

## Validação operacional

```bash
systemctl status agora-api caddy postgresql alloy
curl -fsS http://127.0.0.1:3000/api/health
journalctl -u agora-api -n 200 --no-pager
```

Se o health falhar, o script restaura o symlink da aplicação anterior e marca o deploy como falho. Migrações não são revertidas automaticamente; mudanças de schema devem ser backward compatible.
