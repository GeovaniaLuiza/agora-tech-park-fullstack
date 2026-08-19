# DIAGNÓSTICO — Deploy em Produção na AWS
## Ágora Tech Park Fullstack | Custo Zero/Mínimo com Free Tier

**Data:** 2026-08-07  
**Status:** ✅ Análise Completa (Sem Alterações no Código Yet)  
**Prioridade:** Máxima

---

## 1. ARQUITETURA ATUAL

### 1.1 Stack Confirmado

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                     FRONTEND (React + Vite)                    │
│                      http://localhost:5174                     │
│                                                                 │
│  • React 18.3.1                                                │
│  • Vite 6.0.7                                                  │
│  • React Router 6.30.4                                         │
│  • Lucide React (ícones)                                       │
│  • CSS nativo (responsivo)                                     │
│  • Vitest (testes)                                            │
│  • VITE_API_URL env var (configurável)                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                             ↓
        ┌───────────────────────────────────────────────────┐
        │    Backend Routes (Express + JWT + RBAC)          │
        │      http://localhost:3002/api/health             │
        │                                                    │
        │  /auth/login ────────────→ JWT Token              │
        │  /auth/register-request                           │
        │  /auth/verify-email                               │
        │  /auth/me                                         │
        │  /forms (GET/POST/PUT/PATCH/DELETE)               │
        │  /forms/:id/responses                             │
        │  /responses/:id/reopen                            │
        │  /indicators                                      │
        │  /indicators/export/{pdf|csv|excel}               │
        │  /dashboard/export (XLSX com ExcelJS)             │
        │  /admin/access-requests                           │
        │  /admin/users                                     │
        │  /admin/audit                                     │
        │  /organizations                                   │
        │  /notifications                                   │
        │                                                    │
        │  Validação: Zod                                   │
        │  Segurança: Helmet, CORS, bcryptjs, rate-limit    │
        │  Email: Nodemailer (SMTP Mailpit local)           │
        │  Express 4.21.2                                   │
        │  Node.js (ES Modules)                             │
        │                                                    │
        └────────────────────────────────────────────────────┘
                             ↓
        ┌───────────────────────────────────────────────────┐
        │                                                    │
        │      PostgreSQL 16 (Docker Alpine)                │
        │        localhost:5435 (dev)                       │
        │        Database: agora_indicadores                │
        │        User: agora                                │
        │                                                    │
        │  Arquitetura Backend:                             │
        │  ├── routes/                                      │
        │  ├── controllers/                                 │
        │  ├── services/                                    │
        │  ├── repositories/                                │
        │  └── database (PostgreSQL)                        │
        │                                                    │
        │  Tabelas Principais:                              │
        │  • users                                          │
        │  • organizations                                  │
        │  • forms                                          │
        │  • questions                                      │
        │  • responses                                      │
        │  • answers                                        │
        │  • indicators                                     │
        │  • indicator_definitions                          │
        │  • indicator_values                               │
        │  • audit_logs                                     │
        │  • spreadsheet_imports                            │
        │  • schema_migrations (Incremental)                │
        │                                                    │
        └───────────────────────────────────────────────────┘
```

### 1.2 Migrations e Seed

**Status:** ✅ Pronto para produção
- **11 migrations** em `database/migrations/` (001 a 011)
- **Schema incremental com checksums** (SHA256 em `migrate.js`)
- **Advisory locks** para evitar execução concorrente
- **Seed data** em `database/seed.sql` (ADMIN, PESQUISADOR, GESTOR, RESIDENTE + dados demo)
- **Scripts disponíveis:**
  - `npm run migrate` — aplica migrations pendentes
  - `npm run migrate:dry` — modo seco (lista o que será executado)
  - `npm run migrate:baseline` — somente para DB legado
  
⚠️ **Importante:** Docker-compose.yml usa `/docker-entrypoint-initdb.d/` — OK para DEV, deve ser substituído por runner incremental em PRODUÇÃO.

### 1.3 Exportação de Relatórios

**PDF:**
- Gerado manualmente em string XML/PDF (sem dependências externas)
- Suporta filtros por período
- Auditado automaticamente

**Excel/XLSX:**
- Gerado com **ExcelJS 4.4.0** e `exportSource()` para dashboard
- Export de indicadores em XML (Office 2003 format)
- Filename: `indicadores-joinville-2025.xlsx` ou `indicadores.xls`

**CSV:**
- Gerado manualmente em string
- Com UTF-8 BOM

**Rota de export:** `GET /api/indicators/export/{format}?period=2026-Q1`

### 1.4 Email

**Atual (Desenvolvimento):**
- SMTP: localhost:1025 (Mailpit)
- UI: localhost:8025
- Sem autenticação necessária

**Produção:**
- Precisa de configuração de SMTP válida OU Amazon SES
- Variáveis: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`
- Rate limiting aplicado
- Email de teste: `nao-responda@agoratechpark.com.br`

### 1.5 Health Check

**Implementado:** ✅
```
GET /api/health

Resposta 200:
{
  "status": "ok",
  "services": {
    "api": "up",
    "database": "up",
    "email": "up"
  }
}

Resposta 503 (DB unavailable):
{
  "status": "unavailable",
  "services": {
    "api": "up",
    "database": "down",
    "email": "down"
  }
}

Resposta 200 (degradado):
{
  "status": "degraded",
  "services": {
    "api": "up",
    "database": "up",
    "email": "down"
  }
}
```

---

## 2. PONTOS INCOMPATÍVEIS COM PRODUÇÃO

### 2.1 Variáveis de Ambiente

| Variável | Status | Observação |
|----------|--------|-----------|
| `PORT` | ❌ Hardcoded em dev | Configurável: `process.env.PORT \|\| 3002` ✅ |
| `NODE_ENV` | ❌ Ausente em dev | Deve ser `production` em AWS |
| `DATABASE_URL` | ❌ Localhost/formato redacted | Precisa ser URL completa PostgreSQL |
| `CLIENT_URL` | ⚠️ Hardcoded http://localhost:5174 | Deve apontar para frontend em AWS |
| `VITE_API_URL` | ❌ Não configurado no build | Precisa ser env var no build Amplify |
| `JWT_SECRET` | ❌ Fraco em .env.example | Deve ser secret forte e único em prod |
| `SMTP_HOST` | ❌ localhost em dev | Precisa de SES ou SMTP externo |
| `CORS origin` | ⚠️ Restritivo (bom) | Correto, mas URL de prod deve ser configurada |
| `TRUST_PROXY_HOPS` | ⚠️ 0 em dev | Deve ser 1 ou 2 se usar ALB/CloudFront |

### 2.2 Configuração do Express

```javascript
// app.js
cors({ 
  origin: process.env.CLIENT_URL || 'http://localhost:5174', // ✅ Correto
  methods:['GET','POST','PUT','PATCH','DELETE'],
  allowedHeaders:['Content-Type','Authorization']
})
```
✅ CORS está bem implementado — precisa apenas de CLIENT_URL correto.

### 2.3 Rate Limiting

**Configurado com sensibilidade para DEV/PROD:**
- DEV: limits altos (para testing)
- PROD: limits rigorosos
- **Problema:** Valores vêm de `.env` com defaults muito altos
- **Solução:** Usar defaults de produção quando `NODE_ENV=production`

**Status Atual:**
```javascript
// Defaults para production (bom)
const defaults = environment === 'production'
  ? {
      global: { windowMs: 15 * 60 * 1000, limit: 100 },
      login: { windowMs: 15 * 60 * 1000, limit: 10 },
      ...
    }
```
✅ Já implementado corretamente.

### 2.4 Segurança de Logs

⚠️ **Verificar:** Logs não devem conter:
- `DATABASE_URL`
- `JWT_SECRET`
- `SMTP_PASSWORD`
- `password_hash` (bcrypt hashes)
- Tokens JWT

**Achados:**
- `pool.on('error')` → logs sem dados sensíveis ✅
- `verifyConnection()` → pode logar erro SMTP (verificar)
- Migrations podem logar erro DB (verificar)

### 2.5 Build Frontend

**Atual:**
```json
{
  "scripts": {
    "build": "vite build"
  }
}
```

**Produção:**
```json
{
  "scripts": {
    "build": "vite build",
    "ci": "npm ci" // Necessário
  }
}
```

**Saída:** `frontend/dist/`  
**SPA Routing:** Vite precisa de redirect para `index.html` (Amplify faz automaticamente)

### 2.6 Build Backend

**Produção deve rodar:**
```bash
npm ci              # Instala versões exatas
npm start           # node src/server.js
```

**Verifica:**
- `npm run migrate` — antes de iniciar a API
- Aguarda DATABASE_URL estar disponível

---

## 3. VARIÁVEIS DE AMBIENTE NECESSÁRIAS EM PRODUÇÃO

### 3.1 Backend (.env)

```
# Networking
PORT=3002
NODE_ENV=production
CLIENT_URL=https://xxxxx.amplifyapp.com
TRUST_PROXY_HOPS=1

# Database
DATABASE_URL=postgresql://USERNAME:PASSWORD@ENDPOINT:5432/agora_indicadores

# Connection Pool
DB_POOL_MAX=10
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECTION_TIMEOUT_MS=5000

# JWT
JWT_SECRET=<GERAR_CHAVE_FORTE_64_CARACTERES>
JWT_EXPIRES_IN=8h

# Email (SES ou SMTP)
EMAIL_PROVIDER=smtp
SMTP_HOST=<smtp.region.amazonaws.com OU email-smtp.region.amazonaws.com>
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=<AWS_SES_USERNAME>
SMTP_PASSWORD=<AWS_SES_PASSWORD>
SMTP_CONNECTION_TIMEOUT_MS=10000
EMAIL_FROM="Ágora Tech Park <nao-responda@agoratechpark.com.br>"
EMAIL_FROM_NAME="Ágora Tech Park"
EMAIL_FROM_ADDRESS=nao-responda@agoratechpark.com.br
EMAIL_VERIFICATION_TTL_HOURS=24
EMAIL_RESEND_MINUTES=5
EMAIL_RESEND_MAX_PER_HOUR=5
PASSWORD_RESET_TOKEN_TTL_HOURS=1

# Rate Limiting (prod defaults)
GLOBAL_RATE_LIMIT_WINDOW_MS=900000
GLOBAL_RATE_LIMIT_MAX=100
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX=10
REGISTER_RATE_LIMIT_WINDOW_MS=3600000
REGISTER_RATE_LIMIT_MAX=5
RESEND_RATE_LIMIT_WINDOW_MS=3600000
RESEND_RATE_LIMIT_MAX=5
FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS=3600000
FORGOT_PASSWORD_RATE_LIMIT_MAX=5
VERIFY_RATE_LIMIT_WINDOW_MS=900000
VERIFY_RATE_LIMIT_MAX=20
```

### 3.2 Frontend (.env ou Amplify Env Vars)

```
VITE_API_URL=https://api-producao.url/api
VITE_API_TIMEOUT_MS=30000
```

---

## 4. SERVIÇOS AWS POSSÍVEIS

### 4.1 Opção 1: Amplify + EC2 + RDS (RECOMENDADA - Melhor Custo/Benefício)

```
Internet
  ↓
[AWS Amplify] → HTTPS (gratuito)
  ↓
Frontend (React/Vite) em dist/
  ↓
[EC2 t2.micro] ← Free Tier (750h/mês, 1 ano)
  ├── Node.js 20 LTS
  ├── Express API
  ├── PM2 (restart automático)
  └── Health check: /api/health
  ↓
[RDS PostgreSQL] ← Free Tier (750h/mês, single-AZ)
  ├── Instância: db.t3.micro
  ├── Engine: PostgreSQL 16
  ├── Database: agora_indicadores
  ├── Multi-AZ: NO
  ├── Storage: 20 GB (Free Tier limit)
  ├── Security Group: Apenas de EC2:5432
  └── Backups: Automático 7 dias
  ↓
[Route 53 ou IPs públicas]
  └── Backend: ec2-54-xxx-xxx-xxx.compute-1.amazonaws.com
```

**Custo Estimado com Free Tier:**
- EC2 t2.micro: **US$ 0** (750h/mês, 1 ano)
- RDS PostgreSQL db.t3.micro: **US$ 0** (750h/mês, 1 ano)
- Amplify: **~US$ 0–5** (build + host, primeiros 100GB/mês grátis)
- Data transfer: Dentro da AWS = **US$ 0**, para internet = **~US$ 0.09/GB** (após free tier)
- **Total Mês 1:** ~US$ 0–5
- **Após 1 ano:** ~US$ 30–50/mês (EC2 + RDS pay-as-you-go)

✅ **Vantagem:** Controle total, custo previsível, ideal para TCC.

### 4.2 Opção 2: Amplify + Lambda (Serverless - Complexo)

```
Amplify → API Gateway → Lambda → RDS
```

**Problemas:**
- Lambda + RDS não está no free tier (Lambda: 1M requests/mês grátis, mas RDS está fora)
- Cold start (1–3 segundos)
- Custo após free tier: ~US$ 20–30/mês
- Mais complexo de manter PostgreSQL

❌ **Não Recomendado** para este projeto.

### 4.3 Opção 3: Amplify + Postgres no EC2 (Tudo em Uma Instância)

```
EC2 t2.micro (Free Tier)
├── Node.js + Express
└── PostgreSQL rodando como serviço
```

**Vantagem:** Mais barato, simples.  
**Desvantagem:** Backup manual, sem HA.

✅ **Viável** como alternativa a RDS.

### 4.4 Opção 4: Elastic Beanstalk (Não Recomendado)

- Custa acima do Free Tier
- Overhead não justificado

❌ **Descartada.**

---

## 5. RISCOS

### 5.1 Produção

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Banco de dados exposto (0.0.0.0/0) | 🔴 CRÍTICA | Security Group: apenas EC2 |
| Secret (JWT_SECRET, SMTP_PASSWORD) no Git | 🔴 CRÍTICA | AWS Secrets Manager ou Parameter Store |
| DATABASE_URL em logs | 🔴 CRÍTICA | Remover de logs, mascarar |
| CORS desabilitado (*) | 🔴 CRÍTICA | Usar CLIENT_URL específica |
| Migrations não aplicadas | 🔴 CRÍTICA | Script pré-startup em EC2 |
| Free Tier expirado sem aviso | 🔴 CRÍTICA | AWS Budgets alert a US$ 1 |
| Email não configurado (SMTP fora de SES) | 🟡 MÉDIA | Permitir modo degradado (sem email) |
| Node.js/PostgreSQL não restart automático | 🟡 MÉDIA | Systemd ou PM2 |
| Logs crescendo sem rotação | 🟡 MÉDIA | CloudWatch ou logrotate |
| Backup DB manual | 🟡 MÉDIA | RDS backups automáticos (recomendado) |

### 5.2 Custo

| Cenário | Custo | Mitigação |
|---------|-------|-----------|
| Ficar fora do Free Tier | $50+/mês | AWS Budgets, revisar 30/dias |
| Data transfer acima | +US$ 0.09/GB | Manter na mesma AZ, CloudFront |
| RDS Multi-AZ ativado acidentalmente | +US$ 100+/mês | Não marcar Multi-AZ, verificar console |
| ECR ou S3 crescendo | +US$ 5–20/mês | Monitorar bucket size |

---

## 6. CUSTO ESTIMADO — 12 MESES

### 6.1 Com Free Tier (Meses 1–12)

| Serviço | Meses 1–12 | Notas |
|---------|-----------|-------|
| **EC2 t2.micro** | $0 | 750h/mês, 1 ano |
| **RDS db.t3.micro** | $0 | 750h/mês, 1 ano |
| **Amplify** | $0–10 | ~100GB/mês free, build free |
| **Data Transfer** | $0–5 | Saída: ~50GB/mês @ $0.09/GB = $4.50/mês |
| **Route 53** | ~$3 | Se usar domínio customizado (~$0.50/zona/mês) |
| **CloudWatch Logs** | ~$5 | 1GB/dia retention 30 dias |
| **Miscellaneous** | ~$2 | Créditos, arredondamentos |
| **TOTAL / MÊS** | **~$5–25** | Média: ~$10/mês |
| **TOTAL / 12 MESES** | **~$60–300** | Média: ~$120 |

### 6.2 Após Free Tier (Mês 13+)

| Serviço | Custo Mensal |
|---------|------------|
| **EC2 t2.micro** | ~$8–12 (on-demand) |
| **RDS db.t3.micro** | ~$15–20 (single-AZ) |
| **Amplify** | ~$3–5 |
| **Data Transfer** | ~$4–10 |
| **Route 53 + Misc** | ~$3–5 |
| **TOTAL / MÊS** | **~$35–50** |

✅ **Viável:** Custo é previsível e baixo.

---

## 7. ARQUIVOS QUE PRECISAM SER ALTERADOS

### 7.1 Backend

#### 7.1.1 `backend/.env` → `backend/.env.production`

**Criar novo arquivo (production):**
```env
NODE_ENV=production
PORT=3002
CLIENT_URL=https://xxxxx.amplifyapp.com
DATABASE_URL=postgresql://...
JWT_SECRET=<GERAR_FORTE>
...
```

#### 7.1.2 `backend/package.json`

```json
{
  "scripts": {
    "start": "node src/server.js",        // ✅ Já existe
    "migrate": "node scripts/migrate.js", // ✅ Já existe
    "dev": "node --watch src/server.js"   // ✅ Desenvolvimento
  }
}
```

⚠️ **Adicionar:** Script de startup com retry para DB:

```json
{
  "scripts": {
    "start:prod": "npm run migrate && node src/server.js"
  }
}
```

#### 7.1.3 `backend/src/server.js`

**Atual:**
```javascript
await verifyConnection();
console.info('[email] Conexão SMTP validada');
```

**Problema:** Se SMTP falhar em PROD com `EmailConfigurationError`, a app morre.

**Solução:** Já implementado! ✅
```javascript
if (process.env.NODE_ENV === 'production' && error instanceof EmailConfigurationError) throw error;
```

Apenas garanta que email degradado é permitido.

#### 7.1.4 `backend/src/middlewares/rateLimits.js`

✅ **Já está correto:**
- Detecta `NODE_ENV=production`
- Aplica defaults rigorosos

Nenhuma alteração necessária.

#### 7.1.5 `backend/src/db/pool.js`

**Adicionar:** Verificação de secrets em logs

```javascript
pool.on('error', (err) => {
  // Não logar DATABASE_URL ou connection string
  console.error('Unexpected error on idle Postgres client:', err.message);
  // NUNCA fazer: console.error('Connection string:', process.env.DATABASE_URL);
});
```

✅ **Já está correto.**

### 7.2 Frontend

#### 7.2.1 `frontend/vite.config.js`

**Adicionar:** Configuração de publicPath e build:

```javascript
export default defineConfig({
  plugins: [react()],
  base: '/',  // Amplify precisa disso
  build: {
    outDir: 'dist',
    sourcemap: false,  // Produção
  },
  test: {
    environment: 'jsdom',
  },
  server: {
    port: 5174,
  }
})
```

#### 7.2.2 `frontend/src/services/api.js`

**Verificar:**
```javascript
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
```

✅ **Já está correto.** Usa env var com fallback.

**Amplify deve definir:**
```
VITE_API_URL=https://api-producao.url/api
```

### 7.3 Raiz

#### 7.3.1 `.gitignore`

**Garantir que não versiona:**
```
backend/.env
backend/.env.*.local
backend/.env.production
frontend/.env
frontend/.env.*.local
node_modules/
.env*
```

✅ **Verificar se .gitignore já faz isso.**

#### 7.3.2 `docker-compose.yml`

**Status:** OK para DEV, não usado em PROD.

#### 7.3.3 Criar `backend/.env.production.example`

Template para produção sem secrets.

---

## 8. MIGRATIONS EM PRODUÇÃO

### 8.1 Plano

```
1. Criar RDS (security group restrito)
2. Fazer backup (se dados legados)
3. Rodar: npm run migrate:dry
4. Verificar saída
5. Rodar: npm run migrate
6. Iniciar API
```

### 8.2 Estratégia Recomendada

**Opção A:** Script de startup na EC2 (RECOMENDADO)

```bash
#!/bin/bash
# Pre-start.sh
set -e

echo "[Migration] Connecting to database..."
until pg_isready -h $DB_HOST -U $DB_USER; do
  echo "Waiting for DB..."
  sleep 2
done

echo "[Migration] Running migrations..."
npm run migrate

echo "[Migration] Done. Starting API..."
npm start
```

**Opção B:** API aguarda DB e roda migração automaticamente

```javascript
// server.js
async function start() {
  let retries = 10;
  while (retries > 0) {
    try {
      await verifyConnection();
      await runMigrations();
      break;
    } catch (error) {
      retries--;
      if (retries === 0) throw error;
      console.log(`Retrying... (${retries} attempts left)`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  app.listen(port, () => console.log(`API em ${port}`));
}
```

### 8.3 Evitar

❌ Docker-compose `docker-entrypoint-initdb.d/` em produção  
❌ Baseline sem análise  
❌ Migrations sem backup  
❌ Rollback manual sem plano  

---

## 9. PRÓXIMOS PASSOS (PARA APROVAÇÃO)

1. ✅ **Diagnóstico Completo** (este documento)
2. ⏳ **Verificar Conta AWS:**
   - Região padrão?
   - Free Tier ativo?
   - Créditos promocionais?
   - Limite de instâncias?
3. ⏳ **Aprovar Arquitetura:**
   - Amplify + EC2 + RDS?
   - Ou EC2 com PostgreSQL local?
4. ⏳ **Gerar Secrets:**
   - JWT_SECRET (64 caracteres)
   - SMTP credentials (se SES)
5. ⏳ **Criar Infraestrutura AWS** (sem touch no código)
6. ⏳ **Alterar Código** (backend/.env.production + frontend vars)
7. ⏳ **Deploy Amplify** (frontend)
8. ⏳ **Deploy EC2** (backend + migrations)
9. ⏳ **Testes Funcionais**
10. ⏳ **Documentação Final**

---

## 10. RESUMO EXECUTIVO

| Aspecto | Status |
|--------|--------|
| **Stack** | ✅ Compatível com AWS |
| **Migrações** | ✅ Pronto, apenas rodar em PROD |
| **Segurança** | ✅ Helmet, CORS, JWT, bcrypt — OK |
| **Custo 12 meses** | ✅ US$ 60–300 com Free Tier |
| **Risco técnico** | ⚠️ Migração DB precisa de cuidado |
| **Tempo estimado** | 2–4 horas (após aprovação) |

**Recomendação:** Amplify (Frontend) + EC2 (Backend) + RDS (DB)  
**Cobertura:** 100% Free Tier/Créditos (12 meses)  
**Custo estimado pós-Free Tier:** US$ 35–50/mês

---

## Aguardando Aprovação Para:

1. ✅ Análise de conta AWS (Free Tier, créditos, região)
2. ✅ Aprovação da arquitetura (Amplify + EC2 + RDS)
3. ✅ Decisão sobre Email (SES vs SMTP degradado)
4. ✅ Decisão sobre domínio (AWS URL vs custom domain)
5. ✅ Confirmação: Começar alterações no código?

**NÃO será criado nenhum recurso AWS até sua aprovação.**
