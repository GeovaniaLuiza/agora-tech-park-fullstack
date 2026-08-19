# Guia de execução

## Requisitos

- Node.js 22 e npm compatível;
- Docker Desktop ou Docker Engine com Compose;
- portas locais 3002, 5174, 5435 e 8025 disponíveis.

## Development

```powershell
Copy-Item backend/.env.example backend/.env
docker compose up -d
npm ci
npm ci --prefix backend
npm ci --prefix frontend
npm run dev
```

Serviços:

- frontend: `http://localhost:5174`;
- backend: `http://localhost:3002`;
- health: `http://localhost:3002/api/health`;
- Mailpit: `http://localhost:8025`;
- PostgreSQL: `localhost:5435`, conforme `.env.example`/Compose.

O Docker inicializa as migrations em banco novo. Para banco existente, use o runner versionado:

```powershell
npm run migrate:dry --prefix backend
npm run migrate --prefix backend
```

`migrate:baseline` é somente para banco legado já conferido; nunca rode automaticamente.

## Test

```powershell
npm run lint
npm test
npm run test:coverage
npm run build
npm run audit
```

Integração requer PostgreSQL isolado e `DATABASE_URL` de teste. O workflow CI fornece esse container e aplica todas as migrations antes dos testes. Não aponte testes para banco de desenvolvimento ou produção.

## Production

Produção usa configuração descrita em [AWS_PRODUCTION.md](docs/AWS_PRODUCTION.md). Não execute o workflow de CD antes de aprovar custos e completar OIDC, EC2, Amplify, Grafana e GitHub Environment. Os exemplos de ambiente em `deploy/aws` contêm placeholders e nunca devem receber valores reais no Git.

## Diagnóstico rápido

```powershell
docker compose ps
docker compose logs postgres
npm run test --prefix backend
npm run test --prefix frontend
```

Falhas de e-mail no ambiente local devem aparecer no Mailpit. Em produção, SMTP indisponível deixa health `degraded`; PostgreSQL indisponível deixa health `unavailable` e HTTP 503.
