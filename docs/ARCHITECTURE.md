# Arquitetura

## Visão geral

```text
React/Vite (Amplify) → HTTPS → Caddy → Express → PostgreSQL 16
                                      ├→ SMTP
                                      └→ /metrics → Grafana Alloy → Grafana Cloud
```

O frontend permanece uma SPA React. O backend mantém o fluxo `routes → controllers → services → repositories`; regras de negócio ficam nos services e SQL parametrizado nos repositories. Controllers traduzem HTTP, e middlewares tratam autenticação, autorização, limites, logs, métricas e erros.

Produção adotada: `us-east-1`, EC2 Ubuntu 24.04, Node.js 22/systemd, Caddy e PostgreSQL 16 na mesma EC2 com EBS. A API escuta `127.0.0.1:3000` e PostgreSQL `127.0.0.1:5432`. SSM administra a instância com SSH desativado; GitHub Actions usa OIDC para SSM e Amplify. Amplify `main/PRODUCTION` recebe apenas o artefato CI, com AutoBuild desativado. Bootstrap manual, sem requisito de IaC nesta etapa.

`LISTEN_HOST` é centralizado em `backend/src/config/environment.js`: default `127.0.0.1` em produção, rejeitando qualquer outro valor; default `0.0.0.0` em development/test, com override permitido. O Compose local inicia banco, migrations e Mailpit, não a API. Containers locais de API devem usar development/test com `0.0.0.0`; produção segue o contrato EC2/Caddy, sem exposição direta da API.

## Ambientes

| Ambiente | Aplicação | Banco | E-mail | Observabilidade |
| --- | --- | --- | --- | --- |
| development | Node/Vite local | PostgreSQL Docker | Mailpit | JSON no console; métricas locais |
| test | GitHub runner | PostgreSQL 16 isolado | mock | logs silenciosos |
| production | Amplify + EC2/systemd | PostgreSQL persistente na EC2 | SMTP real/degradável | journald + Alloy + Grafana Cloud |

## Endpoints operacionais

- `GET /api/health/live`: liveness da API, sem dependências.
- `GET /api/health/ready`: readiness com PostgreSQL e SMTP.
- `GET /api/health`: contrato agregado; banco indisponível retorna 503, SMTP indisponível retorna `degraded` com HTTP 200.
- `GET /metrics`: Prometheus; em produção exige `Authorization: Bearer <METRICS_TOKEN>` e responde 404 quando não autorizado.

Nenhum label de métrica contém nome, e-mail, identificador de usuário, conteúdo de formulário ou token.

## Migrações

Migrações antigas são imutáveis e verificadas por SHA-256 em `schema_migrations`. `migrate:dry` não altera dados e falha ao detectar banco legado, metadados legados ou checksum divergente. Bancos anteriores ao mecanismo precisam de `migrate:baseline`, com confirmação explícita. Cada migração pendente é transacional e existe um advisory lock contra concorrência.
