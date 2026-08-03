# Guia Completo: Desenvolvimento Local + Deploy AWS

## PARTE 1: EXECUÇÃO LOCAL (DESENVOLVIMENTO)

### 1.1 Pré-requisitos

**Software Necessário:**
- Node.js 20+ ([Download](https://nodejs.org/))
- Docker & Docker Compose ([Download](https://www.docker.com/products/docker-desktop))
- Git ([Download](https://git-scm.com/))
- VS Code (recomendado) ([Download](https://code.visualstudio.com/))

**Verificar Instalações:**
```bash
node --version        # v20.x ou superior
npm --version         # v10.x ou superior
docker --version      # 24.x ou superior
docker compose --version  # v2.x ou superior
```

### 1.2 Passo-a-Passo: Setup Local Completo

#### **Passo 1: Clone o Repositório**
```bash
# Via HTTPS
git clone https://github.com/seu-usuario/agora-tech-park-fullstack.git
cd agora-tech-park-fullstack

# Ou via SSH (se chave configurada)
git clone git@github.com:seu-usuario/agora-tech-park-fullstack.git
cd agora-tech-park-fullstack
```

#### **Passo 2: Inicie o Banco de Dados (PostgreSQL)**
```bash
# Inicie os containers Docker
docker compose up -d

# Verifique se o PostgreSQL está rodando
docker compose ps
# Resultado esperado:
# CONTAINER ID   IMAGE              STATUS
# xxxxxxx        postgres:16-alpine Up 2 minutes
```

**O que acontece:**
- PostgreSQL iniciado na porta `5432`
- Schema criado automaticamente (`database/migrations/001_initial_schema.sql`)
- Dados iniciais inseridos (`database/seed.sql`)
- Volume `postgres_data` cria persistência entre restarts

#### **Passo 3: Instale Dependências**
```bash
# Instala npm modules da raiz
npm install

# Instala dependências do backend
npm install --prefix backend

# Instala dependências do frontend
npm install --prefix frontend

# Ou use o script do package.json da raiz
npm run install:all
```

**Dependências Principais:**

Backend:
```json
{
  "express": "^4.21.2",        // Framework web
  "pg": "^8.13.1",              // Driver PostgreSQL
  "jsonwebtoken": "^9.0.2",     // JWT para autenticação
  "bcryptjs": "^2.4.3",         // Hash de senhas
  "helmet": "^8.0.0",           // Headers de segurança
  "cors": "^2.8.5",             // CORS
  "express-rate-limit": "^7.5.0" // Rate limiting
}
```

Frontend:
```json
{
  "react": "^18.3.1",           // Framework UI
  "react-dom": "^18.3.1",       // React para DOM
  "vite": "^6.0.7",             // Build tool
  "lucide-react": "^0.468.0"    // Ícones
}
```

#### **Passo 4: Configure Variáveis de Ambiente**

**Backend:**
```bash
# Copie o template
copy backend\.env.example backend\.env
# Ou em Linux/Mac
# cp backend/.env.example backend/.env

# Edite backend\.env (recomendado usar VS Code)
# Conteúdo padrão:
```

**backend\.env:**
```env
# Servidor
PORT=3001
NODE_ENV=development

# Banco de Dados (Docker Compose)
DATABASE_URL=postgresql://agora:agora_dev@localhost:5432/agora_indicadores

# JWT
JWT_SECRET=sua-chave-secreta-muito-segura-min-32-chars
JWT_EXPIRES_IN=8h

# CORS
CLIENT_URL=http://localhost:5173
```

**Frontend (arquivo .env.local):**
```bash
# Dentro da pasta frontend/
echo "VITE_API_URL=http://localhost:3001/api" > .env.local
```

#### **Passo 5: Inicie Frontend + Backend**
```bash
# Da raiz do projeto
npm run dev

# Resultado esperado:
# [0] API em http://localhost:3001
# [1] Local: http://localhost:5173/
# [1] Network: use --host to expose
```

**Explicação:**
- `concurrently` executa backend e frontend em paralelo
- Backend: Node.js (port 3001)
- Frontend: Vite dev server (port 5173)
- Hot reload ativado em ambos

#### **Passo 6: Acesse a Aplicação**

```
Frontend (Interface):  http://localhost:5173
Backend (API):         http://localhost:3001/api
Health Check:          http://localhost:3001/api/health
```

**Teste a Aplicação:**
```bash
# Health check (sem autenticação)
curl http://localhost:3001/api/health
# Resultado: {"status":"ok"}

# Login com credenciais padrão (do seed.sql)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email":"admin@example.com",
    "password":"password123"
  }'
# Resultado: {"token":"eyJhbGc...","user":{...}}
```

### 1.3 Estrutura de Pastas Local

```
agora-tech-park-fullstack/
├── .git/
├── .gitignore
├── backend/
│   ├── src/
│   │   ├── server.js           ← Ponto de entrada do backend
│   │   ├── app.js              ← Config Express
│   │   ├── routes/
│   │   │   ├── authRoutes.js
│   │   │   ├── formRoutes.js
│   │   │   ├── responseRoutes.js
│   │   │   ├── organizationRoutes.js
│   │   │   └── indicatorRoutes.js
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── middlewares/
│   │   │   ├── auth.js         ← JWT validation
│   │   │   ├── errorHandler.js
│   │   │   └── validate.js
│   │   └── db/
│   │       └── pool.js         ← Conexão PostgreSQL
│   ├── .env.example
│   ├── .env                    ← Criar via copy .env.example
│   ├── package.json
│   └── .gitignore
├── frontend/
│   ├── src/
│   │   ├── main.jsx            ← Ponto de entrada
│   │   ├── App.jsx             ← Componente raiz
│   │   ├── components/         ← Componentes React
│   │   ├── services/api.js     ← Chamadas HTTP
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx ← Auth global
│   │   ├── hooks/
│   │   └── styles/global.css
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   ├── .env.local              ← Variáveis frontend
│   └── .gitignore
├── database/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   ├── seed.sql                ← Dados iniciais
│   ├── ERD.md                  ← Diagrama ER
│   └── schema.sql
├── docker-compose.yml          ← Config PostgreSQL
├── package.json                ← Scripts globais
├── GUIA_EXECUCAO.md
├── DEPLOYMENT.md               ← Este arquivo
├── README.md
└── .gitignore
```

### 1.4 Parar a Execução Local

```bash
# Parar frontend + backend
Ctrl+C  # (no terminal)

# Parar PostgreSQL
docker compose down
# (dados persistem em postgres_data volume)

# Parar e remover volumes (apaga dados do banco)
docker compose down -v
```

---

## PARTE 2: DEPLOY NA AWS

### 2.1 Arquitetura AWS Recomendada

```
┌─────────────────────────────────────────────────────┐
│                    AWS Cloud                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ CloudFront (CDN)                             │  │
│  │ - Cache de static files                      │  │
│  │ - DDoS protection                            │  │
│  └────────────────┬─────────────────────────────┘  │
│                   │                                 │
│  ┌────────────────▼─────────────────────────────┐  │
│  │ Application Load Balancer (ALB)              │  │
│  │ - Redireciona HTTP → HTTPS                   │  │
│  │ - SSL/TLS via AWS Certificate Manager        │  │
│  └────────────────┬─────────────────────────────┘  │
│                   │                                 │
│  ┌────────────────▼─────────────────────────────┐  │
│  │ Auto Scaling Group (ASG)                     │  │
│  │ ┌──────────┐  ┌──────────┐  ┌──────────┐    │  │
│  │ │ EC2      │  │ EC2      │  │ EC2      │    │  │
│  │ │(Node.js) │  │(Node.js) │  │(Node.js) │    │  │
│  │ │Frontend+ │  │Frontend+ │  │Frontend+ │    │  │
│  │ │Backend   │  │Backend   │  │Backend   │    │  │
│  │ └──────────┘  └──────────┘  └──────────┘    │  │
│  └────────────────┬─────────────────────────────┘  │
│                   │                                 │
│  ┌────────────────▼─────────────────────────────┐  │
│  │ RDS PostgreSQL (Multi-AZ)                    │  │
│  │ - Backups automáticos                        │  │
│  │ - Failover automático                        │  │
│  │ - Security Group restritivo                  │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ Route 53 (DNS)                               │  │
│  │ - seu-dominio.com → CloudFront               │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 2.2 Opção A: Deploy Simplificado (Single EC2 + RDS)

Recomendado para MVP/prototipagem.

#### **Passo 1: Criar Instância EC2**

**Via AWS Console:**
1. Acesse https://console.aws.amazon.com/ec2/
2. Clique em "Launch Instance"
3. **AMI:** Ubuntu 22.04 LTS (Free Tier eligible)
4. **Instance Type:** t3.micro (Free Tier) ou t3.small (pequeno tráfego)
5. **Storage:** 30 GB (EBS gp3)
6. **Security Group:** Criar novo
   - Inbound SSH: 22 (seu IP)
   - Inbound HTTP: 80 (0.0.0.0/0)
   - Inbound HTTPS: 443 (0.0.0.0/0)
   - Outbound: All (padrão)
7. **Key Pair:** Criar ou usar existente (salve em local seguro!)

**Via AWS CLI:**
```bash
# Criar security group
aws ec2 create-security-group \
  --group-name agora-sg \
  --description "Security group for Agora Tech Park"

# Abrir portas
aws ec2 authorize-security-group-ingress \
  --group-name agora-sg \
  --protocol tcp \
  --port 22 \
  --cidr 0.0.0.0/0  # ⚠️ Restringir para seu IP em produção!

aws ec2 authorize-security-group-ingress \
  --group-name agora-sg \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-name agora-sg \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0

# Criar instância
aws ec2 run-instances \
  --image-id ami-0885b1f6bd170450c \
  --instance-type t3.small \
  --key-name sua-chave-aws \
  --security-groups agora-sg \
  --block-device-mappings DeviceName=/dev/sda1,Ebs={VolumeSize=30,VolumeType=gp3}
```

#### **Passo 2: Conectar via SSH**

```bash
# Permissão da chave (Linux/Mac)
chmod 400 sua-chave.pem

# SSH
ssh -i sua-chave.pem ubuntu@seu-ip-ec2-público
# Após conectar, você estará no terminal da EC2
```

#### **Passo 3: Instalar Dependências na EC2**

```bash
# Atualizar pacotes
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar Git
sudo apt install -y git

# Instalar PM2 (process manager)
sudo npm install -g pm2

# Instalar Nginx (reverse proxy + static files)
sudo apt install -y nginx

# Verificar instalações
node --version
npm --version
nginx --version
pm2 --version
```

#### **Passo 4: Criar RDS PostgreSQL**

**Via AWS Console:**
1. Acesse https://console.aws.amazon.com/rds/
2. Clique em "Create database"
3. **Engine:** PostgreSQL 16
4. **Template:** Free tier
5. **DB Instance Identifier:** agora-prod
6. **Master username:** postgres
7. **Master password:** (gere uma senha forte!)
8. **DB Instance Class:** db.t3.micro (Free Tier)
9. **Storage:** 20 GB gp3
10. **Multi-AZ:** Ativado (backup automático)
11. **Backup:** 7 dias retenção
12. **Delete Protection:** Ativado
13. Clique em "Create database"

**Após criação:**
- Anote o **Endpoint** (ex: `agora-prod.xxxxxxx.us-east-1.rds.amazonaws.com:5432`)
- Anote o **Master Username** e **Password**

#### **Passo 5: Permitir Conexão EC2 → RDS**

```bash
# Na EC2, obtenha o Security Group da RDS
# No console AWS RDS, procure por "Security group rules"

# Adicione regra de inbound no RDS:
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxxx \  # Security group da RDS
  --protocol tcp \
  --port 5432 \
  --source-group sg-yyyyyyy     # Security group da EC2
```

#### **Passo 6: Inicializar Schema no RDS**

```bash
# Da EC2, conecte ao RDS
psql -h agora-prod.xxxxxxx.us-east-1.rds.amazonaws.com \
     -U postgres \
     -d postgres

# No psql:
CREATE DATABASE agora_indicadores;
\c agora_indicadores

-- Cole o conteúdo de database/migrations/001_initial_schema.sql
-- Cole o conteúdo de database/seed.sql

\q
```

#### **Passo 7: Clone o Repositório na EC2**

```bash
# Na EC2
cd /home/ubuntu
git clone https://github.com/seu-usuario/agora-tech-park-fullstack.git
cd agora-tech-park-fullstack

# Instale dependências
npm run install:all

# Crie .env para backend
nano backend/.env
```

**Conteúdo de backend/.env (produção):**
```env
PORT=3001
NODE_ENV=production

# RDS PostgreSQL
DATABASE_URL=postgresql://postgres:sua-senha@agora-prod.xxxxxxx.us-east-1.rds.amazonaws.com:5432/agora_indicadores

# JWT (gere uma chave forte)
JWT_SECRET=gere-com-openssl-rand-hex-32-chars-minimo
JWT_EXPIRES_IN=8h

# CORS (seu domínio)
CLIENT_URL=https://seu-dominio.com
```

#### **Passo 8: Inicie Backend com PM2**

```bash
# Da pasta /home/ubuntu/agora-tech-park-fullstack
pm2 start backend/src/server.js --name "agora-api" --env production

# Verifique
pm2 list
pm2 logs agora-api

# Configure autostart no reboot
pm2 startup
pm2 save
```

#### **Passo 9: Build e Serve Frontend com Nginx**

```bash
# Na EC2, compile o React
npm run build --prefix frontend

# Copie para pasta do Nginx
sudo cp -r frontend/dist/* /var/www/html/

# Configure Nginx como reverse proxy
sudo nano /etc/nginx/sites-available/default
```

**Conteúdo de /etc/nginx/sites-available/default:**
```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name seu-dominio.com www.seu-dominio.com;

    # Arquivos estáticos do React
    location / {
        root /var/www/html;
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }

    # API backend
    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check
    location /api/health {
        access_log off;
        proxy_pass http://localhost:3001/api/health;
    }
}
```

```bash
# Teste configuração Nginx
sudo nginx -t

# Reinicie Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

#### **Passo 10: Configurar SSL com Let's Encrypt**

```bash
# Instale Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtenha certificado SSL
sudo certbot --nginx -d seu-dominio.com -d www.seu-dominio.com

# Responda às perguntas (aceite todos)

# Verifique renovação automática
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

#### **Passo 11: Apontar Domínio para EC2**

1. Acesse seu registrador de domínio (GoDaddy, Namecheap, etc.)
2. Vá para gerenciar DNS
3. Crie registros A:
   - **Nome:** seu-dominio.com → **IP:** IP público EC2
   - **Nome:** www.seu-dominio.com → **IP:** IP público EC2

Ou use **Route 53 (AWS DNS):**

```bash
aws route53 create-hosted-zone \
  --name seu-dominio.com \
  --caller-reference $(date +%s)

# Obtenha o nameserver (NS records)
aws route53 list-hosted-zones

# Configure no seu registrador (aponte NS records para Route 53)

# Crie registro A
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "seu-dominio.com",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{"Value": "IP-EC2"}]
      }
    }]
  }'
```

---

### 2.3 Opção B: Deploy com Docker + ECS + RDS (Recomendado para Escala)

#### **Passo 1: Criar ECR (Elastic Container Registry)**

```bash
# Crie repositório para backend
aws ecr create-repository --repository-name agora-backend

# Crie repositório para frontend
aws ecr create-repository --repository-name agora-frontend

# Obtenha URL (exemplo: 123456789.dkr.ecr.us-east-1.amazonaws.com)
aws ecr describe-repositories
```

#### **Passo 2: Build e Push Docker Images**

**Dockerfile para Backend:**

```dockerfile
# backend/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copie package.json
COPY backend/package*.json ./

# Instale dependências
RUN npm ci --only=production

# Copie código
COPY backend/src ./src

# Expor porta
EXPOSE 3001

# Comando
CMD ["node", "src/server.js"]
```

**Dockerfile para Frontend:**

```dockerfile
# frontend/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend .
RUN npm run build

# Stage 2: Nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Build e Push:**

```bash
# Login no ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

# Build backend
docker build -f backend/Dockerfile -t agora-backend .
docker tag agora-backend:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/agora-backend:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/agora-backend:latest

# Build frontend
docker build -f frontend/Dockerfile -t agora-frontend .
docker tag agora-frontend:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/agora-frontend:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/agora-frontend:latest
```

#### **Passo 3: Criar ECS Cluster e Services**

```bash
# Criar cluster
aws ecs create-cluster --cluster-name agora-cluster

# Criar task definition (backend)
# Salve em ecs-task-backend.json:
```

**ecs-task-backend.json:**
```json
{
  "family": "agora-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "agora-backend",
      "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/agora-backend:latest",
      "portMappings": [
        {
          "containerPort": 3001,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "PORT",
          "value": "3001"
        },
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "DATABASE_URL",
          "value": "postgresql://postgres:senha@agora-prod.xxxxxxx.us-east-1.rds.amazonaws.com:5432/agora_indicadores"
        },
        {
          "name": "JWT_SECRET",
          "value": "sua-chave-secreta"
        },
        {
          "name": "CLIENT_URL",
          "value": "https://seu-dominio.com"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/agora-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

```bash
# Registre task definition
aws ecs register-task-definition --cli-input-json file://ecs-task-backend.json

# Crie service
aws ecs create-service \
  --cluster agora-cluster \
  --service-name agora-backend-service \
  --task-definition agora-backend \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx,subnet-yyyyy],securityGroups=[sg-zzzzz],assignPublicIp=ENABLED}"
```

---

### 2.4 Checklist de Segurança para Deploy

- [ ] **Database**
  - [ ] Multi-AZ habilitado no RDS
  - [ ] Backups automáticos (7+ dias)
  - [ ] Encryption at rest
  - [ ] Security group restritivo (apenas EC2/ECS)

- [ ] **Application**
  - [ ] NODE_ENV=production
  - [ ] JWT_SECRET alterado (min 32 chars)
  - [ ] CORS restrito ao seu domínio
  - [ ] Rate limit ativado
  - [ ] Helmet headers ativados

- [ ] **Network**
  - [ ] SSL/TLS com certificado válido
  - [ ] HTTP → HTTPS redirect
  - [ ] Security groups restritivos
  - [ ] WAF (Web Application Firewall) no ALB

- [ ] **Monitoring**
  - [ ] CloudWatch logs ativados
  - [ ] Alertas para CPU > 80%
  - [ ] Alertas para memória > 90%
  - [ ] Alertas para erro de banco
  - [ ] Health checks configurados

- [ ] **Backup**
  - [ ] Backup diário do banco
  - [ ] Teste de restore mensal
  - [ ] Snapshots de volume EBS

---

## PARTE 3: CONFIGURAÇÃO DE DOMÍNIO

### 3.1 Registrar Domínio

**Opção A: AWS Route 53**
```bash
aws route53 register-domain \
  --domain-name seu-dominio.com \
  --duration-in-years 1 \
  --registrant-contact '...'
# Custoso: ~$12/ano
```

**Opção B: Registradores Baratos**
- Namecheap: ~$0.99/ano (primeiro ano)
- GoDaddy: ~$2.99/ano
- Hostinger: ~$1.99/ano

### 3.2 Apontar Domínio para Aplicação

**Se usando Route 53 na AWS:**

```bash
# 1. Crie hosted zone
aws route53 create-hosted-zone \
  --name seu-dominio.com \
  --caller-reference agora-$(date +%s)

# 2. Obtenha nameservers
ZONE_ID=$(aws route53 list-hosted-zones --query 'HostedZones[?Name==`seu-dominio.com.`].Id' --output text | cut -d'/' -f3)

aws route53 get-hosted-zone --id $ZONE_ID

# 3. Configure no registrador (aponte NS records)

# 4. Crie registro A apontando para ALB/EC2
aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "seu-dominio.com",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{"Value": "seu-ip-publico-ou-alb"}]
      }
    }]
  }'
```

**Se usando registrador externo (Namecheap, etc.):**

1. Faça login no painel de controle
2. Vá para "Manage DNS"
3. Edite registros A:
   ```
   @ (raiz)      → IP do ALB/EC2
   www           → IP do ALB/EC2
   ```
4. Espere 24-48h para propagação

### 3.3 Configurar Subdomínios (Opcional)

```bash
# API em api.seu-dominio.com
aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "api.seu-dominio.com",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "seu-dominio.com"}]
      }
    }]
  }'

# Admin em admin.seu-dominio.com
aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "admin.seu-dominio.com",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{"Value": "seu-ip-publico"}]
      }
    }]
  }'
```

---

## PARTE 4: CI/CD PIPELINE (AUTOMÁTICO)

### 4.1 GitHub Actions (Recomendado)

**.github/workflows/deploy.yml:**

```yaml
name: Deploy to AWS

on:
  push:
    branches: [main, production]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm run install:all

      - name: Test backend
        run: npm run test --prefix backend

      - name: Build frontend
        run: npm run build --prefix frontend

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1

      - name: Build and push backend image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -f backend/Dockerfile -t $ECR_REGISTRY/agora-backend:$IMAGE_TAG .
          docker push $ECR_REGISTRY/agora-backend:$IMAGE_TAG

      - name: Build and push frontend image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -f frontend/Dockerfile -t $ECR_REGISTRY/agora-frontend:$IMAGE_TAG .
          docker push $ECR_REGISTRY/agora-frontend:$IMAGE_TAG

      - name: Update ECS service
        run: |
          aws ecs update-service \
            --cluster agora-cluster \
            --service agora-backend-service \
            --force-new-deployment
```

---

## PARTE 5: MONITORAMENTO E LOGS

### 5.1 CloudWatch Logs

```bash
# Visualizar logs do backend
aws logs tail /ecs/agora-backend --follow

# Visualizar logs do RDS
aws logs tail /aws/rds/instance/agora-prod/error --follow

# Exportar logs para análise
aws logs create-export-task \
  --log-group-name /ecs/agora-backend \
  --from 1609459200000 \
  --to 1609545600000 \
  --destination my-s3-bucket \
  --destination-prefix agora-logs
```

### 5.2 Alertas

```bash
# CPU > 80%
aws cloudwatch put-metric-alarm \
  --alarm-name agora-high-cpu \
  --alarm-description "Alert when CPU > 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:123456789:alerts
```

---

## PARTE 6: ROLLBACK E TROUBLESHOOTING

### 6.1 Reverter Deploy

```bash
# Se usando ECS
aws ecs update-service \
  --cluster agora-cluster \
  --service agora-backend-service \
  --task-definition agora-backend:2  # Versão anterior
  --force-new-deployment
```

### 6.2 Troubleshooting Comum

| Problema | Solução |
|----------|---------|
| **Site não carrega** | Verificar Security Groups, Route 53 propagação (24-48h) |
| **API retorna 502** | `pm2 logs agora-api`, verificar DATABASE_URL, RDS conectividade |
| **Banco não conecta** | Verificar Security Group RDS, DATABASE_URL, credenciais |
| **SSL erro** | `sudo certbot renew --dry-run`, verificar domínio em Route 53 |
| **Memória insuficiente** | Aumentar EC2 size, configurar swap, limpar logs antigos |

---

## RESUMO DE CUSTOS (Estimativa Mensal)

| Serviço | Free Tier | Pago |
|---------|-----------|------|
| **EC2** (t3.micro) | 1 ano grátis | $8-15 após |
| **RDS** (db.t3.micro) | 1 ano grátis | $15-25 após |
| **Route 53** | - | $0.50 + $0.40/M queries |
| **Data Transfer** | 1GB grátis | $0.09/GB |
| **S3** (backups) | 5GB grátis | $0.023/GB |
| **CloudWatch** | 10 alarms grátis | $0.10/alarm |
| **TOTAL (1º ano)** | ~Grátis | ~$35-50/mês |
| **TOTAL (anos > 1)** | - | ~$60-80/mês |

---

## CHECKLIST FINAL

- [ ] Backend testado localmente
- [ ] Frontend testado localmente
- [ ] PostgreSQL sincronizado
- [ ] .gitignore atualizado (não commit .env)
- [ ] AWS account criada e configurada
- [ ] EC2/RDS criadas
- [ ] Domínio registrado e apontado
- [ ] SSL configurado
- [ ] PM2/ECS rodando
- [ ] Nginx/ALB funcionando
- [ ] Backups configurados
- [ ] Alertas configurados
- [ ] CI/CD pipeline ativo
- [ ] Testes em produção OK
- [ ] Logs monitorados
