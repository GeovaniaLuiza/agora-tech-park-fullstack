# FREE TIER & CRÉDITOS AWS — Verificação Necessária
## Ágora Tech Park | 2026-08-07

---

## 1. TABELA DE SERVIÇOS PROPOSTOS

| Serviço | Plano | Região | Free Tier | Limite | Custo Estimado | Custo Pós-FT | Status |
|---------|-------|--------|-----------|--------|-----------------|-------------|--------|
| **AWS Amplify** | Hosting | us-east-1 | Sim | 100GB/mês, build livre | ~$0–5/mês | $0.015/GB acima | ✅ Recomendado |
| **EC2 t2.micro** | Linux/Node | us-east-1 | Sim | 750h/mês, 1 ano | $0/mês | ~$8–12/mês | ✅ Recomendado |
| **RDS PostgreSQL db.t3.micro** | Single-AZ | us-east-1 | Sim | 750h/mês, 20GB storage, 1 ano | $0/mês | ~$15–20/mês | ✅ Recomendado |
| **AWS Secrets Manager** | Credential Storage | us-east-1 | Não | 1 secret grátis/mês | ~$0.40/secret/mês | $0.40/secret | ⚠️ Opcional |
| **SSM Parameter Store** | Env Vars | us-east-1 | Sim | Ilimitado | $0/mês | $0/mês | ✅ Alternativa |
| **Route 53** | DNS | Global | Não | $0.50/hosted zone | ~$0.50–1.00/mês | $0.50/hosted zone | ❌ Se domínio custom |
| **CloudWatch Logs** | Logs | us-east-1 | Sim | 5GB/mês | ~$5/mês | $0.50/GB acima | ⚠️ Monitor |
| **Security Groups** | Firewall | us-east-1 | Sim | Ilimitado | $0/mês | $0/mês | ✅ Grátis |
| **Elastic IP** | Public IP | us-east-1 | Sim | 5 grátis se associated | $0 (associated) | $3.50/não associated | ✅ Não cobrar idle |
| **Data Transfer** | Saída de dados | us-east-1 | Parcial | 100GB/mês grátis | ~$4–10/mês | $0.09/GB acima | ⚠️ Monitor |

---

## 2. CHECKLIST — ANTES DE CRIAR INFRAESTRUTURA

### 2.1 Verificação de Conta AWS

**☐ Console AWS → Account:**
- [ ] Free Tier ativo? (Verificar https://aws.amazon.com/free/status)
- [ ] Região padrão? (recomendado: **us-east-1**)
- [ ] Billing habilitado?
- [ ] Créditos promocionais disponíveis?
  - Valor: _________
  - Expiração: _________

**☐ Verificar Orçamento/Alertas:**
- [ ] AWS Budgets criado? (Sim/Não)
- [ ] Alerta a US$ 1? (Sim/Não)
- [ ] Alerta a US$ 5? (Sim/Não)

### 2.2 Serviços a Criar

**☐ EC2:**
- [ ] t2.micro elegível ao Free Tier?
- [ ] Qual ami? (Amazon Linux 2023 ou Ubuntu 24.04 LTS)
- [ ] Security Group (SSH, HTTP, HTTPS)

**☐ RDS PostgreSQL:**
- [ ] db.t3.micro elegível?
- [ ] Single-AZ (sim/não)?
- [ ] Multi-AZ desabilitado?
- [ ] Backup automático 7 dias (sim)?
- [ ] Storage: 20GB (máx free tier)?

**☐ Amplify:**
- [ ] GitHub conectado?
- [ ] Repositório URL: ________________
- [ ] Branch: ________________

**☐ Networking:**
- [ ] VPC: default ou custom?
- [ ] Subnet pública (EC2)?
- [ ] Subnet privada com NAT (RDS)?
- [ ] Security Groups OK?

---

## 3. DECISÕES ANTES DE PROSSEGUIR

### 3.1 Email

**Opção A: Amazon SES (Recomendado se verificado)**
```
Custo: US$ 0.10 por 1000 emails
Limite Free Tier: 62.000 emails/dia (primeiros 30 dias em sandbox)
Desvantagem: Precisa de verificação de identidade
```

**Opção B: SMTP Externo (e.g., SendGrid, Brevo)**
```
Custo: Grátis até 100 emails/dia (SendGrid)
Vantagem: Sem configuração AWS complexa
Desvantagem: Conta externa
```

**Opção C: Desabilitado em PROD (Degradado)**
```
Custo: US$ 0
Vantagem: Simples, sem email
Desvantagem: Sem notificações
```

**☐ Escolha:** ________________

### 3.2 Domínio

**Opção A: AWS Route 53 + domínio custom**
```
Custo: ~US$ 12–15/ano (domínio) + US$ 0.50/mês (hosted zone)
URL: https://api.seudominio.com.br
Vantagem: Profissional, HTTPS nativo
```

**Opção B: URLs padrão da AWS (Free)**
```
EC2: ec2-54-XXX-XXX-XXX.us-east-1.compute.amazonaws.com
Amplify: xxxxx.amplifyapp.com
Custo: US$ 0
Desvantagem: URLs longas
```

**☐ Escolha:** ________________

### 3.3 Monitoramento

**Recomendado:**
- CloudWatch Logs (5GB/mês grátis)
- AWS Console (free)
- Health checks (free)

**Evitar (pagos):**
- Datadog, New Relic, Splunk
- Application Insights

**☐ Monitoramento:** CloudWatch Logs ✅

---

## 4. PASSOS PARA VERIFICAR FREE TIER

### 4.1 Verificar Elegibilidade

```bash
# No AWS Console, vá para:
# 1. Account → Service Limits
# 2. Procure por:
#    - EC2 On-Demand t2.micro Instances (Free Tier)
#    - RDS db.t3.micro (Free Tier)
#    - Amplify (Free Tier)

# Status esperado:
# ✅ Available (você está qualificado)
# ❌ None (você não está qualificado)
```

### 4.2 Verificar Créditos Promocionais

```
AWS Console → Billing → Credits
Valor disponível: _________
Expiração: _________
```

### 4.3 Criar AWS Budgets

```
AWS Console → Budgets → Create Budget

Name: Agora Tech Park Production
Amount: US$ 1.00 (limite mensal)
Alerts:
  - 50% ativado
  - 80% ativado
  - 100% ativado (crítico)
Notificação: seu@email.com
```

---

## 5. ESTIMATIVA DE CUSTO DETALHADA

### 5.1 Cenário 1: Com Free Tier Completo (Meses 1–12)

```
Amplify
├── Storage: 100GB/mês (FREE)
├── Banda: 15GB/mês out (FREE = 100GB/mês)
├── Build: 1000 build/mês (FREE)
└── Subtotal: US$ 0

EC2 t2.micro
├── Horário: 730h/mês (750h/mês free) × 12 = 100%
├── Storage EBS: 30GB @ US$ 0.10/GB = US$ 3/mês
├── Elastic IP: US$ 0 (associado)
└── Subtotal: US$ 0–3/mês × 12 = US$ 0–36

RDS db.t3.micro
├── Horário: 730h/mês (750h/mês free) × 12 = 100%
├── Storage: 20GB (free)
├── Backups: 20GB (free)
├── I/O: Included
└── Subtotal: US$ 0/mês × 12 = US$ 0

Data Transfer
├── EC2 → Amplify: ~10GB/mês (AWS internal = FREE)
├── EC2 → Internet: ~5GB/mês @ US$ 0.09/GB = US$ 0.45/mês
├── RDS → EC2: ~2GB/mês (AWS internal = FREE)
├── Subtotal: US$ 0.45/mês × 12 = US$ 5.40

CloudWatch Logs
├── Ingestão: 1GB/dia = 30GB/mês (5GB free)
├── Custo: (30–5GB) × US$ 0.50/GB = US$ 12.50/mês
├── Subtotal: US$ 12.50/mês × 12 = US$ 150

Miscellaneous (arredondamentos, API calls)
├── Subtotal: ~US$ 50/ano

TOTAL 12 MESES COM FREE TIER:
├── Cenário otimista: US$ 60–100
├── Cenário realista: US$ 150–250
└── Cenário pessimista (logs elevados): US$ 250–300
```

### 5.2 Cenário 2: Pós Free Tier (Mês 13+)

```
Amplify: US$ 3–5/mês (banda acima de 100GB)
EC2 t2.micro on-demand: US$ 8–12/mês
  └── + EBS gp3: US$ 3/mês
RDS db.t3.micro: US$ 15–20/mês
  └── + Backups: US$ 2–5/mês (se acima de 100GB)
Data Transfer out: US$ 5–10/mês (se > 100GB/mês)
CloudWatch Logs: US$ 10–15/mês
Miscellaneous: US$ 2–3/mês

TOTAL MÊS 13+: US$ 45–70/mês
```

### 5.3 Cenário 3: Problemas Comuns (Evitar)

| Problema | Custo/mês | Mitigação |
|----------|-----------|-----------|
| RDS Multi-AZ ativado | +US$ 100 | Não marcar Multi-AZ |
| NAT Gateway rodar | +US$ 32 | Não usar (EC2 em subnet pública) |
| ALB ativo | +US$ 16 | Não usar (Amplify + IP público EC2) |
| Data transfer elevado (>1TB) | +US$ 90 | Usar CloudFront (free tier) |
| Snapshots sem delete | +US$ 0.05–1/mês | Revisar snapshots antigos |
| EBS gp3 acima de 100GB | +US$ 0.10/GB | Manter <= 50GB |

---

## 6. AÇÃO REQUERIDA AGORA

**Você deve:**

1. ✅ Logar em https://console.aws.amazon.com
2. ✅ Ir para **Account → Free Tier Dashboard**
3. ✅ Verificar e nos informar:
   ```
   [ ] Free Tier ativo? (Sim/Não)
   [ ] Créditos disponíveis? US$ ________
   [ ] Expiração: __________
   [ ] Região padrão: __________
   ```
4. ✅ Ir para **Billing → Budgets**
5. ✅ Criar budget mensal de US$ 1 com alertas

6. **Responder os próximos passos:**
   - [ ] Aprovar arquitetura (Amplify + EC2 + RDS)?
   - [ ] Email: SES? SMTP externo? Degradado?
   - [ ] Domínio: Customizado (Route 53)? Ou AWS URLs?
   - [ ] Monitoramento: CloudWatch Logs? Ou None?

---

## 7. DOCUMENTAÇÃO DE REFERÊNCIA

- **AWS Free Tier:** https://aws.amazon.com/free/
- **AWS Pricing Calculator:** https://calculator.aws/
- **Free Tier Services:** https://aws.amazon.com/free/details/
- **AWS Budgets:** https://aws.amazon.com/aws-cost-management/aws-budgets/
- **RDS Free Tier:** https://aws.amazon.com/rds/free/
- **EC2 Free Tier:** https://aws.amazon.com/ec2/free/
- **Amplify Free Tier:** https://aws.amazon.com/amplify/pricing/

---

## Próximo: Você Informa

**Aguardando seu relatório de:**
1. Status do Free Tier (ativo/inativo)
2. Créditos disponíveis
3. Decisões de arquitetura (email, domínio, monitoramento)
4. Aprovação para criar infraestrutura
