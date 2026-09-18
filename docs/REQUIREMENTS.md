# Requisitos do Sistema

## 1. Escopo

Este documento consolida, em 18/09/2026, os requisitos observáveis da implementação atual, dos testes automatizados e da documentação versionada do sistema. Ele é uma fotografia rastreável do repositório: uma função descrita apenas como proposta no RFC não é tratada aqui como implementada.

## 2. Perfis de usuário

| Perfil | Finalidade | Permissões principais observadas | Evidência no código |
|---|---|---|---|
| `ADMIN` | Governar acessos e cadastros institucionais. | Aprovar/rejeitar solicitações; criar, ativar, inativar, excluir e alterar perfis de usuários; vincular organizações; administrar organizações e centros; consultar auditoria. | `backend/src/routes/accessRoutes.js`, `organizationRoutes.js`, `indicatorManagementRoutes.js`; `frontend/src/config/access.js` |
| `PESQUISADOR` | Operar coletas e indicadores. | Criar, publicar, encerrar, duplicar e arquivar formulários; editar perguntas; administrar catálogo de indicadores; importar eventos e residentes. | `backend/src/routes/formRoutes.js`, `indicatorManagementRoutes.js`, `indicatorImportRoutes.js` |
| `GESTOR` | Consultar indicadores e registrar dados permitidos. | Consultar dashboard, indicadores, formulários e organizações; lançar valores manuais e registros de indicadores. | `backend/src/routes/dashboardRoutes.js`, `indicatorRoutes.js`, `indicatorManagementRoutes.js` |
| `RESIDENTE` | Fornecer dados de sua organização. | Consultar formulários destinados à sua organização, salvar rascunho e enviar respostas; consultar dados permitidos e o dashboard. | `backend/src/routes/responseRoutes.js`, `organizationRoutes.js`, `frontend/src/config/access.js` |

## 3. Requisitos Funcionais

### RF-001 — Autenticar e manter sessão

**Descrição**  
O sistema deve autenticar contas ativas por e-mail e senha, emitir JWT e restaurar a identidade pelo endpoint de sessão.

**Atores**  
ADMIN, PESQUISADOR, GESTOR e RESIDENTE.

**Pré-condições**  
Conta com e-mail confirmado, status `ACTIVE`, perfil válido e, para RESIDENTE, organização vinculada.

**Fluxo principal**

1. O usuário informa e-mail e senha.
2. A API valida a conta e retorna um token JWT.
3. O frontend armazena o token e consulta `/auth/me`.
4. O usuário é encaminhado à rota inicial do seu perfil.

**Critérios de aceite**

- Credenciais válidas de conta elegível retornam token e perfil público.
- Credenciais inválidas, conta pendente/inativa ou residente sem organização não iniciam sessão.
- Sessão não restaurável é removida no cliente.

**Evidências de implementação**  
`backend/src/routes/authRoutes.js`; `backend/src/services/authService.js`; `backend/src/middlewares/auth.js`; `frontend/src/contexts/AuthContext.jsx`; `frontend/src/pages/LoginPage.jsx`.

**Evidências de teste**  
`backend/tests/auth-access.test.js` (login, restrições de conta e `/me`); `frontend/src/contexts/AuthContext.test.jsx`; `frontend/src/pages/auth-pages.test.jsx`.

**Estado**  
Implementado e validado.

### RF-002 — Solicitar acesso, confirmar e recuperar credenciais

**Descrição**  
O sistema deve receber solicitação de acesso, confirmar o e-mail, permitir reenvio controlado da confirmação e permitir redefinição de senha por token.

**Atores**  
Solicitante, ADMIN e usuário cadastrado.

**Pré-condições**  
Para confirmação ou redefinição, o usuário recebe o link correspondente por e-mail; a aprovação é posterior à confirmação do e-mail.

**Fluxo principal**

1. O solicitante envia nome, e-mail, senha, organização solicitada e aceite.
2. A API cria solicitação em estado pendente de confirmação e envia token de verificação.
3. O solicitante confirma o e-mail; a solicitação fica disponível para análise administrativa.
4. Para recuperação, o usuário solicita e consome um token de redefinição de senha.

**Critérios de aceite**

- Solicitação duplicada não cria nova conta.
- Token inválido, expirado ou já usado é rejeitado.
- Reenvio e recuperação não revelam se o e-mail existe.

**Evidências de implementação**  
`backend/src/services/authService.js`; `backend/src/repositories/emailVerificationRepository.js`; `backend/src/repositories/passwordResetRepository.js`; `frontend/src/pages/RegisterRequestPage.jsx`, `VerifyEmailPage.jsx`, `ResendVerificationPage.jsx`, `ForgotPasswordPage.jsx` e `ResetPasswordPage.jsx`.

**Evidências de teste**  
`backend/tests/auth-access.test.js`; `backend/tests/email-verification-repository.test.js`; `frontend/src/pages/auth-pages.test.jsx`; `frontend/src/pages/resend-verification.test.jsx`; `frontend/src/pages/verify-email.test.jsx`.

**Estado**  
Implementado e validado.

### RF-003 — Administrar usuários e solicitações de acesso

**Descrição**  
O sistema deve permitir ao ADMIN analisar solicitações confirmadas, atribuir perfis e organizações, administrar status e vínculos de usuários e preservar ao menos um administrador ativo.

**Atores**  
ADMIN.

**Pré-condições**  
Sessão autenticada com perfil ADMIN; para aprovação de RESIDENTE, organização existente ou criação de organização autorizada.

**Fluxo principal**

1. O ADMIN consulta solicitações pendentes.
2. Aprova com perfil e vínculo necessário ou rejeita com justificativa.
3. O sistema registra auditoria e tenta notificar o interessado.
4. O ADMIN pode ajustar perfil, status e vínculos de usuários existentes.

**Critérios de aceite**

- Apenas ADMIN acessa as rotas administrativas.
- RESIDENTE não é ativado/aprovado sem organização.
- O último ADMIN ativo não pode ser inativado, excluído nem ter perfil alterado.

**Evidências de implementação**  
`backend/src/routes/accessRoutes.js`; `backend/src/services/accessService.js`; `backend/src/repositories/accessRepository.js`; `frontend/src/pages/AdminRequestsPage.jsx` e `AdminUsersPage.jsx`.

**Evidências de teste**  
`backend/tests/auth-access.test.js` (aprovação, autorização e proteção do último administrador); `backend/tests/integration/access-admin.integration.test.js`; `frontend/src/pages/AdminRequestsPage.test.jsx`.

**Estado**  
Implementado e validado.

### RF-004 — Administrar organizações e seus vínculos

**Descrição**  
O sistema deve cadastrar, consultar, atualizar e inativar organizações, além de vinculá-las a usuários residentes.

**Atores**  
ADMIN; RESIDENTE para consulta da própria organização; PESQUISADOR e GESTOR para consulta.

**Pré-condições**  
Autenticação; operações de escrita exigem ADMIN.

**Fluxo principal**

1. O ADMIN cadastra ou atualiza nome e CNPJ da organização.
2. O sistema valida os dados e evita CNPJ duplicado.
3. O ADMIN vincula a organização ao usuário quando aplicável.
4. A organização pode ser inativada.

**Critérios de aceite**

- RESIDENTE visualiza somente organização a que está vinculado.
- CNPJ inválido ou duplicado é recusado.
- Exclusão pela API corresponde a inativação, não a remoção física.

**Evidências de implementação**  
`backend/src/routes/organizationRoutes.js`; `backend/src/services/organizationService.js`; `backend/src/repositories/organizationRepository.js`; `frontend/src/App.jsx`.

**Evidências de teste**  
`backend/tests/auth-access.test.js` cobre a exigência de organização para RESIDENTE; teste específico do CRUD de organizações não localizado.

**Estado**  
Implementado sem teste suficiente.

### RF-005 — Configurar e publicar formulários de coleta

**Descrição**  
O sistema deve permitir a ADMIN e PESQUISADOR criar formulários, configurar perguntas e opções, definir público, publicar, reenviar convite, encerrar, duplicar e arquivar a coleta.

**Atores**  
ADMIN e PESQUISADOR; RESIDENTE como destinatário.

**Pré-condições**  
Usuário de gestão autenticado; publicação exige ao menos um residente elegível selecionado.

**Fluxo principal**

1. O gestor cria ou edita formulário e perguntas.
2. Define organizações e residentes destinatários.
3. Publica a coleta.
4. O sistema registra destinatários e envia convites.

**Critérios de aceite**

- GESTOR não cria formulários.
- Perguntas têm tipo validado e intervalo de datas é válido.
- Publicação sem residente elegível é recusada.

**Evidências de implementação**  
`backend/src/routes/formRoutes.js`; `backend/src/services/formService.js`; `backend/src/repositories/formRepository.js`; `frontend/src/App.jsx`; `frontend/src/hooks/useForms.js`.

**Evidências de teste**  
Partes cobertas: `backend/tests/form-recipient-permissions.test.js` valida destinatário elegível, rejeição de publicação sem residente e envio de convite; `backend/tests/validation.test.js` valida período e tipo de pergunta; `backend/tests/email-service.test.js` valida o convite; `frontend/src/App.test.jsx` cobre o salvamento de rascunho sem pergunta inicial vazia. Não foram localizados testes específicos para o CRUD completo de formulário/perguntas/opções, reenvio de convite, encerramento, duplicação e arquivamento.

**Estado**  
Implementado sem teste suficiente.

### RF-006 — Coletar respostas e atualizar valores de indicadores vinculados

**Descrição**  
O sistema deve permitir ao RESIDENTE salvar rascunho e enviar resposta de formulário da sua organização; perguntas vinculadas devem atualizar valores canônicos de indicadores na mesma transação.

**Atores**  
RESIDENTE; ADMIN e PESQUISADOR para reabrir resposta.

**Pré-condições**  
RESIDENTE ativo e vinculado à organização destinatária; formulário e perguntas disponíveis.

**Fluxo principal**

1. O RESIDENTE abre formulário destinado à organização.
2. Salva rascunho ou envia respostas obrigatórias.
3. A API grava resposta e respostas individuais.
4. Para perguntas vinculadas, atualiza `indicator_values` e consolidados.

**Critérios de aceite**

- RESIDENTE não responde por organização sem vínculo.
- Resposta enviada não é sobrescrita como nova submissão.
- Falha no processamento desfaz a transação de resposta e indicadores.

**Evidências de implementação**  
`backend/src/routes/responseRoutes.js`; `backend/src/services/responseService.js`; `backend/src/services/indicatorValueService.js`; `database/migrations/014_form_indicator_collection.sql`; `docs/FORMS_INDICATORS.md`.

**Evidências de teste**  
`backend/tests/auth-access.test.js`; `backend/tests/integration/form-indicators.integration.test.js`.

**Estado**  
Implementado e validado.

### RF-007 — Manter catálogo, valores e registros de indicadores

**Descrição**  
O sistema deve disponibilizar catálogo de definições, centros de inovação, valores manuais, aplicabilidade e registros operacionais usados nos cálculos de indicadores.

**Atores**  
ADMIN, PESQUISADOR e GESTOR conforme a operação; todos os perfis autenticados para consultas permitidas.

**Pré-condições**  
Autenticação; catálogo é editável por ADMIN/PESQUISADOR e lançamentos/registros por ADMIN/PESQUISADOR/GESTOR.

**Fluxo principal**

1. O usuário autorizado consulta metadados e valores.
2. Mantém definição, valor manual ou registro operacional conforme o perfil.
3. O sistema valida tipo, período e regras do indicador.
4. O sistema recalcula consolidados afetados e registra auditoria.

**Critérios de aceite**

- Indicadores automáticos ou derivados não aceitam lançamento manual.
- Valores respeitam tipo numérico, inteiro e percentual.
- Registros com datas ou tipo inválidos são recusados.

**Evidências de implementação**  
`backend/src/routes/indicatorManagementRoutes.js`; `backend/src/services/indicatorManagementService.js`; `backend/src/services/indicatorCalculationService.js`; `backend/src/repositories/indicatorManagementRepository.js`; `frontend/src/pages/IndicatorCatalogPage.jsx`.

**Evidências de teste**  
Partes cobertas: `backend/tests/indicator-value.test.js` valida normalização e limites de valores; `backend/tests/indicator-calculation.test.js` valida recálculos; `frontend/src/pages/IndicatorCatalogPage.test.jsx` exercita listagem, pesquisa, ordenação, criação, edição e exclusão de definições no frontend. Não foram localizados testes de rota ou integração específicos para centros, lançamentos manuais, registros operacionais, aplicabilidade e respectivas autorizações.

**Estado**  
Implementado sem teste suficiente.

### RF-008 — Consultar dashboards, histórico e exportar indicadores

**Descrição**  
O sistema deve exibir resumos e séries de indicadores filtráveis e permitir exportar relatório em planilha.

**Atores**  
ADMIN, PESQUISADOR, GESTOR e RESIDENTE para consulta; exportação conforme rotas autorizadas.

**Pré-condições**  
Usuário autenticado; filtros de ano, mês e origem válidos.

**Fluxo principal**

1. O usuário abre dashboard ou indicadores.
2. Seleciona filtros disponíveis.
3. A API entrega cartões, séries, histórico e origem do dado.
4. Quando autorizado, o usuário exporta planilha.

**Critérios de aceite**

- Período e origem inválidos são recusados.
- Dashboard mostra estados de carregamento, erro e vazio sem interromper a página.
- Exportação retorna XLSX com filtros selecionados.

**Evidências de implementação**  
`backend/src/routes/dashboardRoutes.js`; `backend/src/routes/indicatorRoutes.js`; `backend/src/services/dashboardService.js`; `backend/src/services/indicatorService.js`; `frontend/src/pages/DashboardPage.jsx`; `frontend/src/components/dashboard/`.

**Evidências de teste**  
`backend/tests/dashboard-service.test.js`; `backend/tests/dashboard-export.test.js`; `frontend/src/pages/DashboardPage.test.jsx`; `frontend/src/components/dashboard/DashboardChart.test.jsx`.

**Estado**  
Implementado e validado.

### RF-009 — Importar eventos e residentes com revisão humana

**Descrição**  
O sistema deve receber planilhas XLSX de eventos ou residentes, gerar prévia e avisos, permitir revisão/agrupamento e confirmar a importação; também deve gerar planilha oficial de indicadores quando solicitado.

**Atores**  
ADMIN e PESQUISADOR.

**Pré-condições**  
Usuário autorizado, arquivo dentro do limite e formato esperado, centro de inovação selecionado.

**Fluxo principal**

1. O usuário envia a planilha para prévia.
2. O sistema interpreta dados, cria lote e apresenta avisos sem importar automaticamente.
3. O usuário revisa itens e, para eventos, pode agrupá-los.
4. O usuário confirma a importação e pode solicitar a planilha oficial atualizada.

**Critérios de aceite**

- Upload não confirma nem persiste os registros finais sem confirmação explícita.
- Linhas inválidas, duplicidades e períodos descontínuos são sinalizados para revisão.
- Fórmulas potencialmente maliciosas são neutralizadas na exportação.

**Evidências de implementação**  
`backend/src/routes/indicatorImportRoutes.js`; `backend/src/services/indicatorImportService.js`; `backend/src/services/eventImportParser.js`; `backend/src/services/residentImportParser.js`; `backend/src/services/indicatorWorkbookExporter.js`; `database/migrations/016_indicator_imports.sql`; `frontend/src/pages/IndicatorImportPage.jsx`.

**Evidências de teste**  
`backend/tests/event-import.test.js`; `backend/tests/resident-import.test.js`; `backend/tests/indicator-workbook-export.test.js`; `frontend/src/pages/IndicatorImportPage.test.jsx`.

**Estado**  
Implementado e validado.

## 4. Requisitos Não Funcionais

| Requisito | Evidência comprovável |
|---|---|
| RNF-001 — Autenticação e segurança de sessão | JWT, hash de senha com `bcryptjs`, Helmet, CORS e limites de requisição em `backend/src/app.js`, `middlewares/auth.js` e `middlewares/rateLimits.js`; testes em `auth-access.test.js` e `rate-limits.test.js`. |
| RNF-002 — Controle de acesso por perfil | Middlewares `authenticate` e `authorize`, rotas com perfis explícitos e guardas no frontend em `backend/src/middlewares/auth.js`, `frontend/src/components/RouteGuards.jsx` e `config/access.js`. |
| RNF-003 — Persistência relacional | PostgreSQL é usado pelos repositórios; migrações versionadas em `database/migrations/001_initial_schema.sql` a `016_indicator_imports.sql`; integração em `backend/tests/integration/database-health.integration.test.js`. |
| RNF-004 — Validação e integridade de dados | Zod/validações de payload, SQL parametrizado nos repositórios, constraints/migrações e transação na integração formulário–indicador. Evidências: `middlewares/validate.js`, `middlewares/authValidation.js`, `responseService.js` e teste `form-indicators.integration.test.js`. |
| RNF-005 — Testabilidade e automação de qualidade | Scripts de testes/coverage nas três `package.json`, testes Vitest no backend/frontend e CI documentado em `docs/CONFORMIDADE_TCC.md`. |
| RNF-006 — Observabilidade e privacidade de logs | Logs estruturados e métricas Prometheus implementados em `backend/src/observability/`; testes `logger-privacy.test.js` e `observability.test.js`. |
| RNF-007 — Health e disponibilidade operacional | Endpoints `/api/health/live`, `/api/health/ready` e `/api/health` em `healthRoutes.js`; testes `health.test.js` e `health-service.test.js`. A meta histórica de 99% não possui medição apresentada e não é declarada atendida. |
| RNF-008 — Proteção de configuração sensível | Variáveis de ambiente, `.env.example`, validação de ambiente e orientação em `README.md`/`SECURITY.md`; a ausência de secrets remotos não é verificável apenas pelo repositório. |

Não há medição versionada que comprove desempenho inferior a 300 ms, disponibilidade de 99% ou atualização de dashboards em tempo real. Tais afirmações do RFC permanecem metas propostas, não requisitos atendidos.

## 5. Casos de Uso

### UC-001 — Solicitar e obter acesso

**Ator** Solicitante e ADMIN.  
**Pré-condições** Solicitante sem conta previamente criada.  
**Fluxo principal** Solicita cadastro; confirma e-mail; ADMIN analisa e aprova com perfil/organização; solicitante passa a poder autenticar-se.  
**Fluxos alternativos relevantes** E-mail duplicado; token expirado/usado; falha de envio; rejeição administrativa; ausência de organização para RESIDENTE.  
**Resultado esperado** Conta aprovada fica ativa com perfil e vínculo exigidos.  
**RFs relacionados** RF-002, RF-003.  
**Testes relacionados** `auth-access.test.js`, `email-verification-repository.test.js`, `AdminRequestsPage.test.jsx`.

### UC-002 — Autenticar e encerrar sessão

**Ator** Usuário ativo.  
**Pré-condições** Conta elegível e credenciais válidas.  
**Fluxo principal** Informa credenciais; recebe token; frontend consulta perfil e direciona à página inicial; usuário encerra sessão.  
**Fluxos alternativos relevantes** Credenciais inválidas, conta pendente/inativa, token expirado ou perfil sem organização.  
**Resultado esperado** Sessão autenticada somente para perfil elegível, ou acesso recusado.  
**RFs relacionados** RF-001.  
**Testes relacionados** `auth-access.test.js`, `AuthContext.test.jsx`, `auth-pages.test.jsx`.

### UC-003 — Governar usuários e organizações

**Ator** ADMIN.  
**Pré-condições** Sessão ADMIN.  
**Fluxo principal** Consulta usuários; cria/ajusta perfil e status; cria ou vincula organização; consulta auditoria.  
**Fluxos alternativos relevantes** CNPJ duplicado/inválido; tentativa de remover o último ADMIN ativo; tentativa de ativar RESIDENTE sem organização.  
**Resultado esperado** Cadastros e vínculos consistentes, com auditoria de ação crítica.  
**RFs relacionados** RF-003, RF-004.  
**Testes relacionados** `auth-access.test.js`, `access-admin.integration.test.js`; CRUD de organização específico não localizado.

### UC-004 — Configurar e publicar coleta

**Ator** ADMIN ou PESQUISADOR.  
**Pré-condições** Sessão com permissão de gestão.  
**Fluxo principal** Cria formulário; inclui perguntas; seleciona público residente; publica e envia convites.  
**Fluxos alternativos relevantes** Pergunta/tipo inválido, datas invertidas ou nenhum residente elegível.  
**Resultado esperado** Formulário ativo e destinado ao público selecionado.  
**RFs relacionados** RF-005.  
**Testes relacionados** `form-recipient-permissions.test.js`, `validation.test.js`, `email-service.test.js`.

### UC-005 — Responder formulário e consolidar indicador

**Ator** RESIDENTE.  
**Pré-condições** Usuário vinculado à organização destinatária e formulário disponível.  
**Fluxo principal** Abre o formulário; salva rascunho ou envia respostas; sistema grava resposta e atualiza indicador vinculado.  
**Fluxos alternativos relevantes** Organização sem vínculo, campo obrigatório ausente, resposta já enviada ou falha transacional.  
**Resultado esperado** Resposta persistida e valores vinculados consolidados de modo idempotente.  
**RFs relacionados** RF-006.  
**Testes relacionados** `auth-access.test.js`, `form-indicators.integration.test.js`.

### UC-006 — Manter dados de indicadores

**Ator** ADMIN, PESQUISADOR ou GESTOR, conforme operação.  
**Pré-condições** Sessão e permissão de edição.  
**Fluxo principal** Consulta catálogo; registra valor manual ou registro operacional; sistema valida e recalcula consolidados.  
**Fluxos alternativos relevantes** Tentativa de editar indicador automático/derivado ou valor fora do tipo/faixa.  
**Resultado esperado** Dados válidos persistidos com consolidação atualizada.  
**RFs relacionados** RF-007.  
**Testes relacionados** `indicator-value.test.js`, `indicator-calculation.test.js`, `IndicatorCatalogPage.test.jsx`.

### UC-007 — Consultar e exportar dashboard

**Ator** Usuário autenticado autorizado.  
**Pré-condições** Sessão válida e filtros válidos.  
**Fluxo principal** Abre dashboard; aplica filtros; consulta cartões e séries; exporta planilha quando necessário.  
**Fluxos alternativos relevantes** Filtro inválido ou falha isolada de seção do dashboard.  
**Resultado esperado** Visualização ou arquivo XLSX coerente com os filtros.  
**RFs relacionados** RF-008.  
**Testes relacionados** `dashboard-service.test.js`, `dashboard-export.test.js`, `DashboardPage.test.jsx`.

### UC-008 — Importar dados de eventos ou residentes

**Ator** ADMIN ou PESQUISADOR.  
**Pré-condições** Planilha XLSX no formato aceito e centro selecionado.  
**Fluxo principal** Envia arquivo; revisa prévia e avisos; ajusta/agrupa itens quando aplicável; confirma o lote; gera planilha oficial se necessária.  
**Fluxos alternativos relevantes** Duplicidade, linha inválida, período descontínuo, excesso de capacidade ou arquivo inválido.  
**Resultado esperado** Registros importados somente após confirmação humana.  
**RFs relacionados** RF-009.  
**Testes relacionados** `event-import.test.js`, `resident-import.test.js`, `indicator-workbook-export.test.js`, `IndicatorImportPage.test.jsx`.

## 6. Matriz de rastreabilidade

| Requisito | Caso de uso | Backend | Frontend | Teste | Estado |
|---|---|---|---|---|---|
| RF-001 | UC-002 | `authRoutes.js`, `authService.js`, `auth.js` | `LoginPage.jsx`, `AuthContext.jsx` | `auth-access.test.js`; `AuthContext.test.jsx` | Implementado e validado |
| RF-002 | UC-001 | `authRoutes.js`, `authService.js`, repositórios de tokens | páginas de cadastro/verificação/recuperação | `auth-access.test.js`; testes de verificação | Implementado e validado |
| RF-003 | UC-001, UC-003 | `accessRoutes.js`, `accessService.js` | `AdminRequestsPage.jsx`, `AdminUsersPage.jsx` | `auth-access.test.js`; `access-admin.integration.test.js` | Implementado e validado |
| RF-004 | UC-003 | `organizationRoutes.js`, `organizationService.js` | fluxo de organizações em `App.jsx` | não localizado (CRUD específico) | Implementado sem teste suficiente |
| RF-005 | UC-004 | `formRoutes.js`, `formService.js` | `App.jsx`, `useForms.js` | `form-recipient-permissions.test.js`; `validation.test.js`; cobertura de ciclo completo não localizada | Implementado sem teste suficiente |
| RF-006 | UC-005 | `responseRoutes.js`, `responseService.js`, `indicatorValueService.js` | fluxo residente em `App.jsx` | `form-indicators.integration.test.js`; `auth-access.test.js` | Implementado e validado |
| RF-007 | UC-006 | `indicatorManagementRoutes.js`, `indicatorManagementService.js` | `IndicatorCatalogPage.jsx` | `indicator-value.test.js`; `indicator-calculation.test.js`; `IndicatorCatalogPage.test.jsx`; testes de rota/integração para as demais operações não localizados | Implementado sem teste suficiente |
| RF-008 | UC-007 | `dashboardRoutes.js`, `dashboardService.js` | `DashboardPage.jsx`, componentes `dashboard/` | `dashboard-export.test.js`; `DashboardPage.test.jsx` | Implementado e validado |
| RF-009 | UC-008 | `indicatorImportRoutes.js`, `indicatorImportService.js` | `IndicatorImportPage.jsx` | `event-import.test.js`; `resident-import.test.js`; `IndicatorImportPage.test.jsx` | Implementado e validado |

## 7. Fora do escopo

### Fora do escopo atual

- IA preditiva.
- Integração com ERP.
- Scraping de dados.
- Aplicativo mobile nativo.

Esses itens constam no RFC e não possuem implementação correspondente localizada.

### Planejado ou meta não comprovada

- Redução mensurada de tempo operacional, tarefas manuais e taxa de resposta.
- Disponibilidade de 99%.
- Desempenho inferior a 300 ms.
- Dashboards em tempo real.

São objetivos/metas da proposta no RFC; não há medição ou mecanismo versionado que permita qualificá-los como atendidos.

### Não implementado ou não confirmado nesta auditoria

- Não foi localizado aplicativo mobile, módulo de IA, ERP ou scraper.
- Não foi localizada evidência de teste automatizado específico para o CRUD completo de organizações.
- Não há evidência de que a atualização de dashboards seja em tempo real; o dashboard consulta dados por requisições HTTP.

## 8. Resumo quantitativo de cobertura

| Métrica | Quantidade | Critério |
|---|---:|---|
| RFs documentados | 9 | RF-001 a RF-009. |
| RFs com alguma evidência de teste automatizado | 9 | Cada RF referencia ao menos um teste automatizado relacionado. |
| RFs com cobertura de teste considerada suficiente | 6 | RF-001, RF-002, RF-003, RF-006, RF-008 e RF-009 estão no estado “Implementado e validado”. |
| RFs com cobertura de teste insuficiente | 3 | RF-004, RF-005 e RF-007 têm implementação e alguma evidência, mas lacunas de cobertura explicitadas no requisito. |
| RFs funcionalmente parciais | 0 | Nenhuma das nove descrições apresenta funcionalidade identificada como incompleta; as ressalvas atuais são de teste. |
