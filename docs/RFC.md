# RFC: Request for Comments — Projeto de Portfólio  
Engenharia de Software – Católica SC  

---

## 📌 Identificação

**Título do Projeto:**  
Plataforma de Indicadores e Governança do Ágora Tech Park  

**Linha de Projeto (Direction):**  
Web  

**Autor:**  
Geovania Luiza Francisco  

**Data da Proposta:**  
23/05/2026  

**Versão:**  
1.0  

---

# 1. Visão do Produto e Impacto (O Problema)

## 1.1 Contexto e Problema

O Centro de Inovação de Joinville – Ágora Tech Park realiza periodicamente a coleta de indicadores do ecossistema de inovação de forma manual e descentralizada. O processo envolve envio de e-mails, preenchimento de formulários externos e consolidação manual em planilhas Excel.

Esse fluxo gera:

- alto tempo operacional  
- erros humanos  
- baixa rastreabilidade  
- ausência de dashboards em tempo real  
- dificuldade de análise histórica  

A proposta deste projeto é substituir esse fluxo por uma plataforma web integrada de coleta, gestão e visualização de indicadores.

---

## 1.2 Origem da Demanda e Evidências

A demanda foi identificada no contexto do Ágora Tech Park, onde o processo atual depende de:

- e-mails manuais  
- planilhas Excel  
- formulários externos  

📌 Evidência de uso atual:

**Figura 1 — Formulário de Cadastro de Parceiro preenchido pelo demandante**  
Fonte: Elaborado pela autora (2026), com utilização de Microsoft Forms  

**Figura 2 — Planilha de Follow-up 2025**  
Fonte: Elaborado pela autora (2026), com utilização do Microsoft Excel  

**Figura 3 — Planilha de Follow-up 2026**  
Fonte: Elaborado pela autora (2026), com utilização do Microsoft Excel  

---

## 1.3 Benchmark

Foram analisadas soluções existentes:

| Solução | Função |
|--------|--------|
| Google Forms | Coleta de dados |
| Microsoft Forms | Formulários corporativos |
| Typeform | Experiência avançada |
| Power BI | Visualização de dados |
| Airtable | Gestão de dados |

---

## 🎯 Lacuna identificada

Nenhuma solução integra:

- coleta de dados  
- gestão de formulários  
- consolidação automática  
- dashboards institucionais  

---

## 1.4 Público-Alvo

- Pesquisadores (FAPESC/SCTI)  
- Gestores do Ágora Tech Park  
- Residentes (startups e empresas)  

---

## 1.5 Objetivos

### Objetivo Geral
Desenvolver uma plataforma web para automatizar a coleta e visualização de indicadores do ecossistema de inovação.

### Objetivos Específicos
- automatizar formulários  
- centralizar dados  
- gerar dashboards em tempo real  

---

## 1.6 KPIs

- ≥ 50% redução de tempo operacional  
- ≥ 70% redução de tarefas manuais  
- ≥ 80% taxa de resposta  
- ≥ 99% disponibilidade  

---

# 2. Engenharia de Requisitos

## 2.1 Personas

- Pesquisador (admin do sistema)  
- Gestor (consumidor de dados)  
- Residente (fornecedor de dados)  

---

## 2.2 Casos de Uso

- Login  
- Criar formulários  
- Responder formulários  
- Visualizar dashboards  
- Exportar relatórios  

---

## 2.3 Requisitos Funcionais

- RF01 a RF12 (autenticação, formulários, dashboards, exportação)

---

## 2.4 Requisitos Não Funcionais

- desempenho < 300ms  
- 99% disponibilidade  
- segurança com JWT  
- responsividade  

---

## 2.5 Regras de Negócio

- acesso restrito por perfil  
- respostas dentro do prazo  
- auditoria de dados  

---

## 2.6 Fora do Escopo

- IA preditiva  
- ERP  
- scraping de dados  
- app mobile nativo  

---

# 3. Arquitetura

## 3.1 C4 Model

- Contexto: usuários + sistema  
- Containers: frontend, backend, banco  
- Componentes: services, controllers, repositories  

---

## 3.2 Modelo de Dados

Tabelas:

- users  
- forms  
- questions  
- responses  
- indicators  

---

## 3.3 Stack

- React / Next.js  
- Node.js / NestJS  
- PostgreSQL  
- JWT  
- Chart.js  

---

# 4. UX / UI

## 4.1 Fluxo de navegação

Login → Dashboard → Formulários → Respostas → Relatórios

---

## 5. Referências

- SOMMERVILLE, Ian. Software Engineering. Pearson, 2016.  
- MARTIN, Robert C. Clean Architecture, 2017.  
- BROWN, Simon. C4 Model.  
- MICROSOFT Forms  
- POWER BI  
- GOOGLE Forms  
- TYPEFORM  
- AIRTABLE  