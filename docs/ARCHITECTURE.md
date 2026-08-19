# Arquitetura

## Visão geral

```text
React/Vite (Amplify) → HTTPS → Caddy → Express → PostgreSQL 16
                                      ├→ SMTP
                                      └→ /metrics → Grafana Alloy → Grafana Cloud
```

O frontend permanece uma SPA React 18. O backend mantém o fluxo `routes → controllers → services → repositories`; regras de negócio ficam nos services e SQL parametrizado nos repositories. Controllers traduzem HTTP, e middlewares tratam autenticação, autorização, limites, logs, métricas e erros.

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
