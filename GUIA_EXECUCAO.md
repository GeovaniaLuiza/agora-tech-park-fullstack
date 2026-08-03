# Guia de Execução - Ágora Tech Park

## 1. COMO EXECUTAR O PROJETO

### 1.1 Pré-requisitos

- **Node.js 20+** — [Download](https://nodejs.org/)
- **Docker & Docker Compose** — [Download](https://www.docker.com/products/docker-desktop)
- **PostgreSQL** — Executado via Docker (automático)

### 1.2 Instalação e Inicialização

```bash
# 1. Clone o repositório (ou navegue até a pasta do projeto)
cd agora-tech-park-fullstack

# 2. Inicie o PostgreSQL com Docker
docker compose up -d

# 3. Verifique se o banco iniciou
docker compose ps  # PostgreSQL deve estar "Up"

# 4. Instale as dependências (frontend + backend)
npm install
npm run install:all

# 5. Configure o arquivo .env do backend
copy backend\.env.example backend\.env
# Edite backend\.env conforme necessário (veja seção de Variáveis de Ambiente)

# 6. Inicie frontend + backend simultaneamente
npm run dev
```

### 1.3 Acesso à Aplicação

Após executar `npm run dev`, a aplicação estará disponível em:

- **Frontend (UI):** http://localhost:5173
- **Backend (API REST):** http://localhost:3001/api
- **PostgreSQL:** localhost:5432 (credenciais no docker-compose.yml)

### 1.4 Parar a Execução

```bash
# Para o Node.js (frontend + backend)
Pressione Ctrl+C no terminal

# Para o PostgreSQL
docker compose down
```

---

## 2. ARQUITETURA E FLUXO DE DADOS

### 2.1 Estrutura do Projeto

```
agora-tech-park-fullstack/
├── frontend/                    # React + Vite + CSS
│   ├── src/
│   │   ├── App.jsx             # Componente principal (roteamento)
│   │   ├── components/         # Componentes React (FormCard, StatCard, etc.)
│   │   ├── services/api.js     # Chamadas HTTP ao backend
│   │   ├── contexts/           # Context API (autenticação)
│   │   └── styles/global.css   # Estilos globais
│   ├── package.json
│   └── vite.config.js
├── backend/                     # Node.js + Express
│   ├── src/
│   │   ├── server.js           # Inicia o servidor
│   │   ├── app.js              # Configura Express e rotas
│   │   ├── routes/             # Definição de endpoints
│   │   ├── controllers/        # Lógica de negócio
│   │   ├── services/           # Serviços auxiliares
│   │   ├── repositories/       # Queries ao banco de dados
│   │   ├── db/pool.js          # Conexão PostgreSQL
│   │   ├── middlewares/        # Auth, validação, erro
│   │   └── models/             # Tipos/interfaces (se houver)
│   ├── package.json
│   └── .env.example
├── database/                    # Scripts SQL
│   ├── schema.sql              # Estrutura das tabelas (DDL)
│   ├── seed.sql                # Dados iniciais (DML)
│   └── migrations/001_*        # Migrações
├── docker-compose.yml          # Configuração do PostgreSQL
├── package.json                # Scripts globais
└── README.md
```

### 2.2 Fluxo de Dados: Frontend → Backend → PostgreSQL

```
[Navegador]
    ↓
[React App (Frontend)]
    ↓
[frontend/services/api.js] — Faz requisição HTTP (com JWT no header)
    ↓
[Backend Express]
    ├→ app.js (Configura CORS, autenticação, rate limit)
    ├→ routes/*.js (Mapeia URL para controller)
    ├→ middlewares/auth.js (Valida JWT)
    ├→ controllers/*.js (Lógica de negócio)
    └→ repositories/*.js (Query parametrizada)
    ↓
[PostgreSQL]
    ├→ Executa query (com proteção contra SQL injection)
    ├→ Retorna dados (JSON)
    └→ Gera resposta HTTP
    ↓
[Frontend] — Atualiza estado React com dados
    ↓
[UI atualizada para o usuário]
```

---

## 3. CONSISTÊNCIA DE DADOS: BACKEND ↔ POSTGRESQL

### 3.1 Camada de Repositório (Queries ao Banco)

Os arquivos em `backend/src/repositories/` implementam queries parametrizadas:

```javascript
// Exemplo: backend/src/repositories/formRepository.js
export async function getForms(userId) {
  const query = `
    SELECT id, title, description, status 
    FROM forms 
    WHERE created_by = $1
    ORDER BY created_at DESC
  `;
  const result = await db.query(query, [userId]);
  return result.rows;
}

export async function createForm(title, description, createdBy) {
  const query = `
    INSERT INTO forms (title, description, created_by, status)
    VALUES ($1, $2, $3, 'DRAFT')
    RETURNING id, title, description, status, created_at
  `;
  const result = await db.query(query, [title, description, createdBy]);
  return result.rows[0];
}
```

**Benefícios:**
- ✅ **Proteção contra SQL Injection:** Uso de placeholders (`$1, $2, $3`)
- ✅ **Type Safety:** PostgreSQL valida tipos de dados
- ✅ **Atomicidade:** Transações garantem consistência

### 3.2 Fluxo de Persistência: Exemplo Prático

#### Cenário: Criar um Novo Formulário

**1. Frontend (React)**
```javascript
// frontend/src/App.jsx
const handleCreateForm = async (title, description) => {
  try {
    const response = await api.createForm(title, description);
    // State atualizado → UI recarregada
  } catch (error) {
    console.error('Erro ao criar formulário:', error);
  }
};
```

**2. Chamada HTTP (api.js)**
```javascript
// frontend/src/services/api.js
export async function createForm(title, description) {
  const response = await fetch(`${BASE_URL}/forms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({ title, description })
  });
  return response.json();
}
```

**3. Backend (Express)**
```javascript
// backend/src/routes/formRoutes.js
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { title, description } = req.body;
    const userId = req.user.id;
    
    // Validação básica
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Título é obrigatório' });
    }
    
    const form = await formService.createForm(title, description, userId);
    res.status(201).json(form);
  } catch (error) {
    next(error); // Passa para middleware de erro
  }
});
```

**4. Service (Lógica de Negócio)**
```javascript
// backend/src/services/formService.js
export async function createForm(title, description, userId) {
  // Validações adicionais
  if (description && description.length > 5000) {
    throw new Error('Descrição muito longa');
  }
  
  // Chama repositório
  return await formRepository.createForm(title, description, userId);
}
```

**5. Repositório (Query ao Banco)**
```javascript
// backend/src/repositories/formRepository.js
export async function createForm(title, description, createdBy) {
  const query = `
    INSERT INTO forms (title, description, created_by, status)
    VALUES ($1, $2, $3, 'DRAFT')
    RETURNING id, title, description, status, created_at
  `;
  const result = await pool.query(query, [title, description, createdBy]);
  return result.rows[0];
}
```

**6. PostgreSQL (Persistência)**
```sql
-- Tabela: forms
CREATE TABLE forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'DRAFT',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Registro inserido ✓
INSERT INTO forms (title, description, created_by, status) 
VALUES ('Pesquisa 2024', 'Coleta de dados', 'user-123', 'DRAFT');
```

**Resultado:**
- Dados persistidos no PostgreSQL ✓
- Resposta JSON retorna ao frontend ✓
- React atualiza state e UI ✓

---

## 4. VARIÁVEIS DE AMBIENTE

### Backend (.env)

```env
# Servidor
PORT=3001
NODE_ENV=development

# Banco de Dados
DATABASE_URL=postgresql://agora:agora_dev@localhost:5432/agora_indicadores

# JWT
JWT_SECRET=chave-secreta-muito-segura-min-32-chars
JWT_EXPIRES_IN=8h

# CORS
CLIENT_URL=http://localhost:5173
```

### Geração de Chave JWT Segura

```bash
# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 5. OPERAÇÕES DE BANCO DE DADOS

### 5.1 Inicializar Banco (Automático via Docker)

```bash
# O docker-compose executa automaticamente:
# 1. database/migrations/001_initial_schema.sql (DDL)
# 2. database/seed.sql (DML com dados iniciais)

docker compose up -d
# Verifique: docker compose logs postgres
```

### 5.2 Conectar ao PostgreSQL

```bash
# Via psql (se PostgreSQL instalado localmente)
psql -h localhost -U agora -d agora_indicadores

# Dentro do psql
SELECT * FROM forms;
SELECT COUNT(*) FROM users;
\dt  # Lista todas as tabelas
```

### 5.3 Executar Migração Manual

```bash
# Se precisar aplicar schema manualmente
docker exec -i agora-tech-park-postgres psql -U agora -d agora_indicadores < database/migrations/001_initial_schema.sql
```

### 5.4 Backup e Restore

```bash
# Backup
docker compose exec postgres pg_dump -U agora agora_indicadores > backup.sql

# Restore
docker compose exec -i postgres psql -U agora agora_indicadores < backup.sql
```

---

## 6. SEGURANÇA E INTEGRIDADE

### 6.1 Proteções Implementadas

| Proteção | Implementação | Localização |
|----------|----------------|------------|
| **SQL Injection** | Queries parametrizadas (`$1, $2, ...`) | `backend/src/repositories/` |
| **Autenticação** | JWT (Bearer token) | `backend/src/middlewares/auth.js` |
| **Autorização** | RBAC (roles: ADMIN, PESQUISADOR, etc.) | `backend/src/middlewares/auth.js` |
| **Hash de Senha** | bcrypt com salt | `backend/src/services/authService.js` |
| **Headers de Segurança** | Helmet | `backend/src/app.js` |
| **CORS Restritivo** | Whitelist de origem | `backend/src/app.js` |
| **Rate Limit** | Máx 100 req/15min | `backend/src/app.js` |
| **Validação de Entrada** | Tipos e tamanhos de dados | `backend/src/middlewares/validate.js` |

### 6.2 Constraints de Banco de Dados

```sql
-- Chaves estrangeiras
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE

-- Constraints de integridade
UNIQUE (email)
UNIQUE (form_id, organization_id)
CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)

-- Índices (performance)
CREATE INDEX idx_forms_created_by ON forms(created_by);
CREATE INDEX idx_responses_form_id ON responses(form_id);
```

---

## 7. FLUXO DE AUTENTICAÇÃO

### 7.1 Login

```
[Frontend] POST /auth/login {email, password}
    ↓
[Backend] valida email + bcrypt.compare(password, hash)
    ↓
[PostgreSQL] SELECT * FROM users WHERE email = $1
    ↓
[Backend] gera JWT com expiração 8h
    ↓
[Frontend] armazena token em localStorage
    ↓
[Frontend/Backend] envia token em Authorization: Bearer <token> em todas as requisições
```

### 7.2 Requisição Autenticada

```javascript
// Todo GET/POST/PUT/DELETE inclui JWT
const headers = {
  'Authorization': `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json'
};
```

---

## 8. TESTES

### 8.1 Executar Testes Backend

```bash
npm run test --prefix backend
# Testes incluem: health check, headers de segurança, validação
```

### 8.2 Testar Endpoint Manualmente

```bash
# Health check
curl http://localhost:3001/api/health

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'

# Listar formulários (requer token)
curl http://localhost:3001/api/forms \
  -H "Authorization: Bearer <seu-token>"
```

---

## 9. TROUBLESHOOTING

| Problema | Solução |
|----------|---------|
| **Erro: "connection refused"** | Verifique `docker compose ps` → PostgreSQL ativo? |
| **JWT inválido** | Token expirou (8h). Faça login novamente. |
| **CORS error** | Verifique `CLIENT_URL` em `.env` corresponde a `http://localhost:5173` |
| **Porta 5173 em uso** | `lsof -i :5173` (Linux/Mac) ou `Get-NetTCPConnection -LocalPort 5173` (Windows) |
| **Banco desatualizado** | `docker compose down -v` (apaga dados) → `docker compose up -d` |
| **Node_modules corrompido** | `rm -rf node_modules package-lock.json` → `npm install` |

---

## 10. CHECKLIST DE DEPLOY

- [ ] Variáveis `.env` configuradas com valores de produção
- [ ] `JWT_SECRET` alterado (mínimo 32 caracteres)
- [ ] `NODE_ENV=production`
- [ ] PostgreSQL com backup diário
- [ ] CORS configurado com domínio real
- [ ] Certificados SSL/TLS ativados
- [ ] Rate limit testado
- [ ] Logs configurados (não expo em produção)
- [ ] Testes executados: `npm run test --prefix backend`

---

## 11. DOCUMENTAÇÃO ADICIONAL

- **API REST:** Veja `backend/src/routes/` para endpoints
- **Schema SQL:** `database/schema.sql`
- **Dados Iniciais:** `database/seed.sql`
- **Componentes React:** `frontend/src/components/`
- **Contexto de Auth:** `frontend/src/contexts/AuthContext.jsx`
