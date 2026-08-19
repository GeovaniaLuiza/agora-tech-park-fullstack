# Ágora Tech Park — Plataforma de Indicadores

[![CI](https://github.com/GeovaniaLuiza/agora-tech-park-fullstack/actions/workflows/ci.yml/badge.svg)](https://github.com/GeovaniaLuiza/agora-tech-park-fullstack/actions/workflows/ci.yml)

Plataforma fullstack para coleta, acompanhamento e visualização de indicadores de organizações residentes do Ágora Tech Park.

O fluxo de coleta por formulário e sua integração com Indicadores e Dashboard está documentado em [docs/FORMS_INDICATORS.md](docs/FORMS_INDICATORS.md).

## Arquitetura

- Frontend: React 18, Vite, React Router e Context API.
- Backend: Node.js 22, Express, ES Modules, JWT, Zod e PostgreSQL 16.
- Organização backend: `routes → controllers → services → repositories → PostgreSQL`.
- Desenvolvimento: Docker Compose com PostgreSQL e Mailpit.
- Produção proposta: Amplify para o frontend; EC2 com Caddy, Node, PostgreSQL e systemd para a API; Grafana Cloud e Alloy para observabilidade.

Detalhes: [arquitetura](docs/ARCHITECTURE.md), [qualidade](docs/QUALITY.md), [CI/CD](docs/CI_CD.md), [produção AWS](docs/AWS_PRODUCTION.md) e [monitoramento](docs/MONITORING.md).

## Desenvolvimento local

Pré-requisitos: Node.js 22, npm e Docker Compose.

```powershell
Copy-Item backend/.env.example backend/.env
docker compose up -d
npm ci
npm ci --prefix backend
npm ci --prefix frontend
npm run dev
```

- Frontend: `http://localhost:5174`
- API: `http://localhost:3002`
- Health: `http://localhost:3002/api/health`
- Mailpit: `http://localhost:8025`

## Qualidade e testes

```powershell
npm run lint
npm test
npm run test:coverage
npm run build
npm run audit
```

Os testes de integração usam PostgreSQL isolado no GitHub Actions. O SonarQube Cloud recebe os relatórios LCOV e bloqueia a promoção quando o Quality Gate reprova ou existem issues Critical/High.

## Segurança

Nunca versione `.env`, tokens, credenciais AWS, chaves privadas, dumps ou backups. Produção usa GitHub Environments, secrets e OIDC para obter credenciais AWS temporárias. Consulte [SECURITY.md](SECURITY.md) antes de publicar dados ou anexos.

## Licença

Este repositório ainda não possui licença. Código público sem `LICENSE` continua protegido por copyright; nenhuma licença será escolhida sem decisão explícita dos responsáveis.
