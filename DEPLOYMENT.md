# Deployment

O fluxo oficial separa CI e CD. Consulte [CI/CD](docs/CI_CD.md) para checks e proteção de branch e [Produção AWS](docs/AWS_PRODUCTION.md) para arquitetura, custo, provisionamento, backup e rollback.

Arquitetura vigente: Amplify `main/PRODUCTION` + EC2 Ubuntu 24.04 em `us-east-1`, Node.js 22/systemd, Caddy e PostgreSQL 16 local/EBS. Administração via SSM com SSH desativado, deploy via OIDC, observabilidade Alloy/Grafana Cloud. Bootstrap manual; IaC não é pré-requisito. Esta sincronização do repositório não executa deploy nem migrations remotas.

O CI valida a URL pública incorporada ao `frontend-dist`; o CD repete a validação antes de acessar AWS. Amplify mantém AutoBuild desativado.

## Pré-condições

- CI verde e SonarQube Cloud Quality Gate aprovado;
- nenhuma issue Critical/High aberta;
- branch `main` protegida;
- AWS Budget, região e custos confirmados;
- EC2/Amplify/Grafana previamente autorizados e configurados;
- secrets somente no host ou GitHub Environment;
- `DEPLOY_ENABLED=true` somente depois de uma release inicial validada.

## Fluxo automático

```text
push main → CI → testes/build/Sonar → CD Production
                                      ├─ EC2: SSM → clone → deps backend/frontend → build frontend (/api) → validate dist → backup → dry-run → migrate → current → restart → health
                                      ├─ frontend: artefato aprovado → Amplify (contingência/rollback)
                                      └─ smoke: health → HTML → login opcional
```

Na Etapa 2 da migração frontend, novas releases na EC2 passam a conter backend + `frontend/dist` construído com `VITE_API_URL=/api`. A compilação e validação do frontend ocorrem antes do backup do banco (`pg_dump`) e das migrações. O Caddy ainda NÃO serve o frontend nesta etapa (permanece proxy reverso para a API). O Amplify continua ativo como contingência operacional e frontend de produção.

O workflow não aceita pull request como origem de deploy e usa credenciais AWS temporárias via OIDC. O backend faz checkout do SHA aprovado em uma release imutável; não usa `git pull` no diretório em execução.

## Validação operacional

```bash
systemctl status agora-api caddy postgresql alloy
curl -fsS http://127.0.0.1:3000/api/health
journalctl -u agora-api -n 200 --no-pager
```

Se o health falhar, o script restaura o symlink da aplicação anterior e marca o deploy como falho. Migrações não são revertidas automaticamente; mudanças de schema devem ser backward compatible.
