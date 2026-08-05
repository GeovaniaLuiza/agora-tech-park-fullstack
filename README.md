# Ágora Tech Park — Plataforma de Indicadores

Interface web responsiva para coleta, acompanhamento e visualização de indicadores de residentes, construída a partir das telas de referência fornecidas.

## Stack

- **Frontend:** React + Vite, CSS responsivo e componentes reutilizáveis
- **Backend:** Node.js, Express, PostgreSQL, JWT, RBAC, Helmet, rate limit, CORS e dotenv

## Executar localmente

Pré-requisito: Node.js 20 ou superior.

```bash
docker compose up -d
npm install
npm run install:all
copy backend\.env.example backend\.env
npm run dev
```

Abra `http://localhost:5174`. A API fica em `http://localhost:3002/api`.

## Rotas de exemplo

| Método | Rota | Finalidade |
| --- | --- | --- |
| GET | `/api/health` | Verifica a API |
| GET | `/api/forms` | Lista formulários |
| GET | `/api/forms/:id` | Busca um formulário |
| POST | `/api/forms` | Cria formulário |
| PUT | `/api/forms/:id` | Atualiza formulário |
| DELETE | `/api/forms/:id` | Exclui formulário |

O banco é inicializado automaticamente pelo Docker com schema, chaves estrangeiras, restrições, índices e dados demonstrativos. As queries parametrizadas ficam em `backend/src/repositories`.

## Banco de dados e segurança

- Migração: `database/migrations/001_initial_schema.sql`
- Dados iniciais: `database/seed.sql`
- Autenticação: `POST /api/auth/login`, JWT com expiração de 8h e RBAC (`ADMIN`, `PESQUISADOR`, `GESTOR`, `RESIDENTE`).
- Proteções: hash de senha bcrypt, queries parametrizadas, Helmet, CORS restritivo, rate limit, payload limitado a 100 KB, validação de entradas e mensagens de erro genéricas.

## Testes

```bash
npm run test --prefix backend
```

Os testes verificam health check/headers de segurança e validação de payload. Para ver os mockups isoladamente: `/#login` e `/#respond`.

## Indicadores institucionais de 2025

O Dashboard e a tela de Indicadores usam a carga oficial da aba `CI JOINVILLE`, persistida no PostgreSQL.
Para validar ou importar a planilha no backend:

```powershell
npm.cmd run indicators:validate --prefix backend
npm.cmd run indicators:import --prefix backend
```

O processo é transacional, registra a origem `SPREADSHEET_IMPORT`, audita a operação e impede duplicidade por hash.
Consulte [a documentação do Dashboard](docs/DASHBOARD_INSTITUCIONAL_2025.md) para endpoints, RBAC e validações.

## Executar testes
Copy-Item backend\.env.example backend\.env

docker compose up -d

npm.cmd install

npm.cmd run install:all

npm.cmd run dev

npm.cmd run test --prefix backend

npm.cmd install
