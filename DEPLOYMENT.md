# Deployment

O fluxo oficial separa CI e CD. Consulte [CI/CD](docs/CI_CD.md) para checks e proteção de branch e [Produção AWS](docs/AWS_PRODUCTION.md) para arquitetura, custo, provisionamento, backup e rollback.

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
                                      ├─ backend: SSM → backup → dry-run → migrate → systemd → health
                                      ├─ frontend: artefato aprovado → Amplify
                                      └─ smoke: health → HTML → login opcional
```

O workflow não aceita pull request como origem de deploy e usa credenciais AWS temporárias via OIDC. O backend faz checkout do SHA aprovado em uma release imutável; não usa `git pull` no diretório em execução.

## Validação operacional

```bash
systemctl status agora-api caddy postgresql alloy
curl -fsS http://127.0.0.1:3000/api/health
journalctl -u agora-api -n 200 --no-pager
```

Se o health falhar, o script restaura o symlink da aplicação anterior e marca o deploy como falho. Migrações não são revertidas automaticamente; mudanças de schema devem ser backward compatible.
