# Ágora Tech Park — Plataforma de Indicadores

[![CI](https://github.com/GeovaniaLuiza/agora-tech-park-fullstack/actions/workflows/ci.yml/badge.svg)](https://github.com/GeovaniaLuiza/agora-tech-park-fullstack/actions/workflows/ci.yml)

Plataforma fullstack para coleta, acompanhamento e visualização de indicadores de organizações residentes do Ágora Tech Park.

O fluxo de coleta por formulário e sua integração com Indicadores e Dashboard está documentado em [docs/FORMS_INDICATORS.md](docs/FORMS_INDICATORS.md).

## Arquitetura

- Frontend: React, Vite, React Router e Context API (versões em `frontend/package.json`).
- Backend: Node.js 22, Express, ES Modules, JWT, Zod e PostgreSQL 16.
- Organização backend: `routes → controllers → services → repositories → PostgreSQL`.
- Desenvolvimento: Docker Compose com PostgreSQL; e-mail usa provider mock local, sem SMTP externo.
- Produção em `us-east-1`: frontend React/Vite e backend Node.js/Express publicados conjuntamente em EC2 Ubuntu 24.04, com Caddy servindo a SPA e encaminhando `/api` para o backend; PostgreSQL 16 local em EBS; Grafana Alloy → Grafana Cloud. Administração via SSM, SSH desativado e deploy via GitHub Actions/OIDC.
- Aplicação pública: `https://agora-techpark.duckdns.org`, com API disponível em `/api`. O frontend é construído com `VITE_API_URL=/api`, mantendo frontend e backend na mesma origem.
- Bootstrap AWS manual; deploy da aplicação automatizado. Terraform/CloudFormation/CDK não são requisito desta etapa.

Detalhes: [arquitetura](docs/ARCHITECTURE.md), [qualidade](docs/QUALITY.md), [CI/CD](docs/CI_CD.md), [produção AWS](docs/AWS_PRODUCTION.md) e [monitoramento](docs/MONITORING.md).

## Documentação

O ponto de entrada da documentação técnica é a [documentação navegável do projeto](docs/README.md), com acesso à [arquitetura](docs/ARCHITECTURE.md), aos [requisitos](docs/REQUIREMENTS.md) e aos [ADRs](docs/adr/README.md).

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
- E-mail em DEV: provider mock controlado (`EMAIL_PROVIDER=mock`), sem entrega externa.

## Qualidade e testes

```powershell
npm run lint
npm test
npm run test:coverage
$env:VITE_API_URL='/api'
npm run build
node scripts/validate-frontend-artifact.mjs frontend/dist
npm run audit
```

Os testes de integração usam PostgreSQL isolado no GitHub Actions. O SonarQube Cloud recebe os relatórios LCOV e bloqueia a promoção quando o Quality Gate reprova ou existem issues Critical/High.

## Segurança

Nunca versione `.env`, tokens, credenciais AWS, chaves privadas, dumps ou backups. Produção usa GitHub Environments, secrets e OIDC para obter credenciais AWS temporárias. Consulte [SECURITY.md](SECURITY.md) antes de publicar dados ou anexos.

## Licença

Este repositório ainda não possui licença. Código público sem `LICENSE` continua protegido por copyright; nenhuma licença será escolhida sem decisão explícita dos responsáveis.
