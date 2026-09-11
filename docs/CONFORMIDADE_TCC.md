# Matriz de conformidade do TCC â€” Ãgora Tech Park

Baseline tÃ©cnica de 04/09/2026. Esta matriz registra o estado observado antes das correÃ§Ãµes. Ela nÃ£o Ã© evidÃªncia de aprovaÃ§Ã£o acadÃªmica nem substitui resultados do GitHub Actions, SonarCloud, provedor de nuvem ou Grafana.

## Legenda

- âœ… **IMPLEMENTADO E VALIDADO** â€” existe e foi verificado por execuÃ§Ã£o ou consulta objetiva.
- ðŸŸ¡ **IMPLEMENTADO, PENDENTE DE VALIDAÃ‡ÃƒO** â€” existe, mas depende de ambiente ou serviÃ§o indisponÃ­vel.
- ðŸŸ  **PARCIAL** â€” cobre apenas parte do requisito ou apresenta divergÃªncia.
- âšª **DOCUMENTADO / PLANEJADO** â€” hÃ¡ intenÃ§Ã£o ou documentaÃ§Ã£o, sem implementaÃ§Ã£o comprovada.
- ðŸ”´ **AUSENTE / FALHANDO** â€” nÃ£o existe, estÃ¡ incorreto ou falhou no gate aplicÃ¡vel.
- ðŸ‘¤ **PENDÃŠNCIA HUMANA** â€” exige participaÃ§Ã£o, decisÃ£o ou credencial do grupo.

## Resumo executivo

**DecisÃ£o atual: NO-GO.** O sistema nÃ£o estÃ¡ apto Ã  entrega final nem ao deploy. Os bloqueadores sÃ£o: arquivo com possÃ­veis dados pessoais ainda recuperÃ¡vel no histÃ³rico pÃºblico, CI vermelho, instalaÃ§Ã£o limpa da raiz falhando, cobertura backend abaixo de 75%, comando padrÃ£o de cobertura frontend instÃ¡vel, integraÃ§Ã£o PostgreSQL falhando no CI, ausÃªncia de produÃ§Ã£o pÃºblica/HTTPS e ausÃªncia de evidÃªncia do Quality Gate e da observabilidade remota.

O repositÃ³rio mantÃ©m a arquitetura React + Vite, Express e PostgreSQL. Nenhuma mudanÃ§a arquitetural foi aplicada nesta baseline.

## Conformidade tÃ©cnica e acadÃªmica

| Requisito | Estado atual | EvidÃªncia objetiva | Lacuna / risco | PrÃ³xima aÃ§Ã£o mÃ­nima |
|---|---|---|---|---|
| RepositÃ³rio GitHub pÃºblico | âœ… IMPLEMENTADO E VALIDADO | API pÃºblica do GitHub: `GeovaniaLuiza/agora-tech-park-fullstack`, `visibility=public`, branch padrÃ£o `main` | A publicidade amplia o impacto do arquivo com possÃ­veis dados pessoais | Tratar o incidente de privacidade antes de qualquer outra publicaÃ§Ã£o |
| HistÃ³rico contÃ­nuo de commits | ðŸŸ  PARCIAL | `git log`: 19 commits, de 03/08/2026 a 01/09/2026, distribuÃ­dos em 6 dias; 3 autores, incluindo Dependabot | HistÃ³rico curto e concentrado; merges automÃ¡ticos nÃ£o comprovam evoluÃ§Ã£o contÃ­nua do grupo | Manter commits pequenos, autorais e vinculados a decisÃµes/testes |
| RevisÃ£o por PR | ðŸŸ  PARCIAL | HistÃ³rico contÃ©m merges de PRs | NÃ£o hÃ¡ evidÃªncia consolidada de revisÃ£o humana/aprovaÃ§Ã£o | Documentar o fluxo e usar revisÃ£o entre integrantes |
| DocumentaÃ§Ã£o essencial | ðŸŸ  PARCIAL | `README.md`, `docs/ARCHITECTURE.md`, `docs/RFC.md`, `docs/CI_CD.md`, `docs/MONITORING.md`, `docs/QUALITY.md` | VersÃµes do stack e resultados de testes estÃ£o desatualizados; RFC e requisitos estÃ£o incompletos | Atualizar apÃ³s estabilizar implementaÃ§Ã£o e infraestrutura |
| Wiki ou equivalente navegÃ¡vel | ðŸ”´ AUSENTE / FALHANDO | GitHub informa `has_wiki=false`; existe uma pasta `docs/`, mas ela nÃ£o estÃ¡ estruturada nem declarada como Wiki equivalente | O nÃºcleo comum da orientaÃ§Ã£o Web App torna a Wiki/equivalente obrigatÃ³ria | Estruturar e publicar uma Wiki junto ao repositÃ³rio |
| Requisitos e casos de uso completos | ðŸŸ  PARCIAL | Requisitos resumidos em `docs/RFC.md` e rotas/fluxos na aplicaÃ§Ã£o | RFs nÃ£o estÃ£o especificados com critÃ©rios de aceite e rastreabilidade | Criar documento de requisitos e matriz requisito â†’ fluxo â†’ teste |
| Arquitetura C4 ou equivalente | ðŸŸ  PARCIAL | DescriÃ§Ã£o textual em `docs/ARCHITECTURE.md` | NÃ£o hÃ¡ diagrama C4/equivalente verificÃ¡vel e a arquitetura documentada Ã© centrada em AWS | Documentar contexto, contÃªineres e implantaÃ§Ã£o efetiva |
| ADRs / decisÃµes arquiteturais | ðŸ”´ AUSENTE / FALHANDO | Nenhum diretÃ³rio ou registro ADR localizado | DecisÃµes relevantes nÃ£o sÃ£o rastreÃ¡veis | Criar ADRs somente para decisÃµes reais e atuais |
| ReferÃªncia acadÃªmica fornecida | âšª DOCUMENTADO / PLANEJADO | Tese de Nancy V. PÃ©rez, 2022, fornecida pelo usuÃ¡rio nesta auditoria | Ainda nÃ£o foi incorporada; nÃ£o constitui evidÃªncia tÃ©cnica | Usar apenas como fundamentaÃ§Ã£o, com autoria e referÃªncia bibliogrÃ¡fica completas |
| Link funcional pÃºblico e estÃ¡vel | ðŸ”´ AUSENTE / FALHANDO | Homepage do repositÃ³rio vazia; documentaÃ§Ã£o contÃ©m placeholders | Sem URL de produÃ§Ã£o validÃ¡vel | Definir infraestrutura no checkpoint e publicar somente apÃ³s GO |
| Frontend React + Vite | ðŸŸ  PARCIAL | `frontend/package.json`: React 19.2.8 e Vite 8.2.2; build local concluÃ­do | Build padrÃ£o incorporou `http://localhost:3002/api`; documentaÃ§Ã£o diz React 18 | Tornar a URL de produÃ§Ã£o obrigatÃ³ria e atualizar documentaÃ§Ã£o |
| Backend Express | âœ… IMPLEMENTADO E VALIDADO | `backend/package.json`: Express 5.2.1; 106 testes unitÃ¡rios passaram | Cobertura insuficiente e integraÃ§Ã£o remota falhando | Ampliar testes sem reduzir thresholds |
| PostgreSQL 16 | ðŸŸ¡ IMPLEMENTADO, PENDENTE DE VALIDAÃ‡ÃƒO | `docker-compose.yml` e job CI usam PostgreSQL 16; etapa de migrations do CI remoto passou | Docker local sem engine; job de integraÃ§Ã£o remoto falhou | Iniciar Docker e validar banco vazio, migrations e integraÃ§Ã£o |
| MigraÃ§Ãµes incrementais | ðŸŸ  PARCIAL | `database/migrations/001...016`; runner calcula SHA-256, usa lock e registra `schema_migrations` | Compose monta 001â€“013 e 016, omitindo 014 e 015; dois fluxos duplicados | Fazer Compose usar o runner Ãºnico e validar repetiÃ§Ã£o/checksum |
| Seed separado e seguro | ðŸŸ¡ IMPLEMENTADO, PENDENTE DE VALIDAÃ‡ÃƒO | `database/seed.sql` Ã© montado apenas pelo Compose de desenvolvimento; CD nÃ£o o executa | NÃ£o validado em banco vazio; contÃ©m credenciais demonstrativas conhecidas, aceitÃ¡veis somente em DEV | Validar isolamento e impedir execuÃ§Ã£o em produÃ§Ã£o |
| InstalaÃ§Ã£o limpa da raiz | ðŸ”´ AUSENTE / FALHANDO | `npm ci` falhou com `ERESOLVE`: ESLint 10.8.1 Ã— peer de `eslint-plugin-react` 7.37.5 | O job de qualidade nÃ£o inicia em ambiente limpo | Corrigir versÃµes compatÃ­veis sem usar `--legacy-peer-deps` |
| InstalaÃ§Ã£o limpa backend | âœ… IMPLEMENTADO E VALIDADO | `npm ci --prefix backend` concluÃ­do | `npm audit` reportou 1 vulnerabilidade moderada transitiva em `qs` | Atualizar dependÃªncia compatÃ­vel e repetir testes |
| InstalaÃ§Ã£o limpa frontend | âœ… IMPLEMENTADO E VALIDADO | `npm ci --prefix frontend` concluÃ­do, 0 vulnerabilidades | Nenhuma lacuna observada nesta etapa | Manter lockfile consistente |
| Lint local | âœ… IMPLEMENTADO E VALIDADO | `npm run lint` concluiu com cÃ³digo 0 | No CI remoto o passo Ã© ignorado porque o `npm ci` anterior falha | Corrigir instalaÃ§Ã£o limpa e revalidar no CI |
| Testes unitÃ¡rios backend | âœ… IMPLEMENTADO E VALIDADO | Vitest: 21 arquivos, 106 testes aprovados, 0 falhas | NÃ£o suprem integraÃ§Ã£o e cobertura obrigatÃ³ria | Preservar e ampliar suÃ­te |
| Cobertura backend â‰¥ 75% | ðŸ”´ AUSENTE / FALHANDO | 47,68% statements; 39,92% branches; 39,32% functions; 53,62% lines; comando saiu com cÃ³digo 1 | Abaixo de 75% em todas as mÃ©tricas; threshold atual de branches (40%) tambÃ©m falha | Priorizar repositÃ³rios, serviÃ§os e ramos crÃ­ticos |
| Testes unitÃ¡rios frontend | âœ… IMPLEMENTADO E VALIDADO | Vitest normal: 17 arquivos, 78 testes aprovados | O comando de cobertura usa timeout menor e falha | Corrigir desempenho/isolamento do teste de Dashboard |
| Cobertura frontend â‰¥ 25% | ðŸŸ  PARCIAL | Com timeout diagnÃ³stico de 15 s: 58,76% statements; 54,81% branches; 45,95% functions; 70,07% lines | `npm run test:coverage` padrÃ£o falha por timeout; resultado diagnÃ³stico nÃ£o substitui o gate oficial | Estabilizar o comando oficial sem reduzir thresholds |
| TDD verificÃ¡vel | ðŸŸ  PARCIAL | Existem testes de domÃ­nio, rotas e pÃ¡ginas | O histÃ³rico disponÃ­vel nÃ£o demonstra de forma suficiente ciclos teste-primeiro | Registrar prÃ³ximos incrementos com teste falhando â†’ implementaÃ§Ã£o â†’ refatoraÃ§Ã£o |
| TrÃªs fluxos de negÃ³cio completos | ðŸŸ  PARCIAL | CÃ³digo e testes cobrem autenticaÃ§Ã£o, indicadores/formulÃ¡rios e importaÃ§Ãµes | NÃ£o foram validados ponta a ponta em ambiente integrado/publicado | Criar testes de aceitaÃ§Ã£o e smoke dos trÃªs fluxos |
| CI no GitHub Actions | ðŸ”´ AUSENTE / FALHANDO | Workflow `.github/workflows/ci.yml`; execuÃ§Ã£o remota atual `33522551350` estÃ¡ vermelha | `npm ci` raiz, cobertura backend e integraÃ§Ã£o PostgreSQL falharam; Sonar foi ignorado | Corrigir em grupos e obter execuÃ§Ã£o verde no `main` |
| CD no GitHub Actions | ðŸ”´ AUSENTE / FALHANDO | `.github/workflows/cd-production.yml` existe, mas execuÃ§Ãµes atuais estÃ£o `skipped` | Fluxo Ã© exclusivamente AWS e nÃ£o hÃ¡ produÃ§Ã£o comprovada | Definir substituto no checkpoint; nÃ£o ativar deploy antes do GO |
| AWS removida com seguranÃ§a | ðŸ”´ AUSENTE / FALHANDO | Workflow, `deploy/aws/` e documentaÃ§Ã£o AWS continuam ativos no repositÃ³rio | Remover agora quebraria CD, proxy, serviÃ§o, backup, rollback e coleta | Manter atÃ© mapear substituiÃ§Ãµes e validar rollback |
| Cloudflare Pages como frontend | âšª DOCUMENTADO / PLANEJADO | Apenas preferÃªncia do enunciado | A orientaÃ§Ã£o oficial de Web App veda plataformas otimizadas apenas para frontend; Cloudflare Pages exige decisÃ£o conservadora | NÃ£o adotar automaticamente; preferir hospedagem controlÃ¡vel ou obter confirmaÃ§Ã£o acadÃªmica |
| SonarCloud configurado | ðŸŸ¡ IMPLEMENTADO, PENDENTE DE VALIDAÃ‡ÃƒO | `sonar-project.properties` e etapa com `sonar.qualitygate.wait=true` | API pÃºblica do project key retornou 404 e o job atual foi ignorado | Confirmar organizaÃ§Ã£o/projeto/token e executar apÃ³s CI base verde |
| Quality Gate aprovado | ðŸ”´ AUSENTE / FALHANDO | NÃ£o existe execuÃ§Ã£o remota atual com PASS | Sem evidÃªncia, nÃ£o pode ser declarado aprovado | Corrigir CI e validar no SonarCloud |
| DEV separado de produÃ§Ã£o | ðŸŸ  PARCIAL | Compose local, `.env.example` e documentaÃ§Ã£o distinguem DEV | Fluxo de migrations do Compose Ã© inconsistente; nÃ£o hÃ¡ DEV integrado validado nesta mÃ¡quina | Corrigir e validar do zero |
| PROD/STAGING separado | ðŸ”´ AUSENTE / FALHANDO | ConfiguraÃ§Ãµes AWS documentadas | Nenhum ambiente real, URL, DNS ou secret foi validado | Definir infraestrutura e variÃ¡veis no checkpoint |
| Deploy pÃºblico em nuvem | ðŸ”´ AUSENTE / FALHANDO | Nenhuma URL funcional encontrada | Requisito acadÃªmico obrigatÃ³rio nÃ£o atendido | Executar somente depois de `APROVADO PARA DEPLOY` |
| HTTPS pÃºblico | ðŸ”´ AUSENTE / FALHANDO | Caddy estÃ¡ configurado em `deploy/aws/`, mas nÃ£o hÃ¡ endpoint | ConfiguraÃ§Ã£o local nÃ£o comprova certificado/DNS | Validar externamente apÃ³s deploy autorizado |
| Observabilidade | ðŸŸ  PARCIAL | Pino, Prometheus, Alloy, dashboards e alertas existem em cÃ³digo/configuraÃ§Ã£o | ConfiguraÃ§Ã£o estÃ¡ vinculada Ã  AWS e nÃ£o prova ingestÃ£o remota | Adaptar apÃ³s decisÃ£o de infraestrutura e validar dados reais |
| Grafana Cloud recebendo dados | ðŸ”´ AUSENTE / FALHANDO | HÃ¡ quatro dashboards JSON em `monitoring/grafana/` | Nenhuma URL, sÃ©rie, log ou alerta remoto foi apresentado | Configurar credenciais no provedor e validar sem expÃ´-las |
| Logs estruturados e redaction | ðŸŸ  PARCIAL | Pino e testes de request logging; lista de redaction no logger | Alloy coleta journald sem filtro; cobertura de nomes sensÃ­veis precisa revisÃ£o | Filtrar unidade/serviÃ§o e testar redaction de variaÃ§Ãµes |
| MÃ©tricas HTTP/latÃªncia/erros | ðŸŸ¡ IMPLEMENTADO, PENDENTE DE VALIDAÃ‡ÃƒO | `prom-client`, mÃ©tricas de requests, duraÃ§Ã£o, login, formulÃ¡rios, e-mail e banco | Sem scrape remoto comprovado | Validar `/metrics` protegido e sÃ©ries no Grafana |
| MÃ©tricas CPU/memÃ³ria/disco | ðŸŸ  PARCIAL | MÃ©tricas padrÃ£o de processo e configuraÃ§Ã£o de agente | AusÃªncia de evidÃªncia remota; alertas nÃ£o cobrem RAM explicitamente | Completar regras e validar sÃ©ries reais |
| Health/liveness/readiness | âœ… IMPLEMENTADO E VALIDADO | `/api/health`, `/live`, `/ready`; readiness retorna 503 quando o banco crÃ­tico falha; testes unitÃ¡rios passaram | NÃ£o validado externamente | Incluir em integraÃ§Ã£o e smoke pÃ³s-deploy |
| Alertas operacionais | ðŸŸ  PARCIAL | Regras para API, banco, sintÃ©tico, 5xx, CPU e disco | Faltam evidÃªncias remotas e alerta explÃ­cito de RAM/latÃªncia/e-mail | Completar somente apÃ³s definir backend de mÃ©tricas |
| Backup PostgreSQL | ðŸŸ  PARCIAL | `deploy/aws/deploy-backend.sh` executa `pg_dump` antes de migration | Backup fica no mesmo host; nÃ£o hÃ¡ retenÃ§Ã£o externa nem teste de restauraÃ§Ã£o | Projetar destino gratuito/seguro e teste restaurÃ¡vel |
| Smoke tests | ðŸŸ  PARCIAL | `scripts/smoke-test.mjs` testa health, DB, HTML e login opcional | NÃ£o foi executado em produÃ§Ã£o; login pode ser omitido; nÃ£o testa endpoint protegido e CORS explicitamente | Tornar os checks crÃ­ticos obrigatÃ³rios e executar apÃ³s deploy |
| SeguranÃ§a de aplicaÃ§Ã£o | ðŸŸ  PARCIAL | Helmet, CORS, JWT, rate limit, validaÃ§Ã£o Zod, pool e queries parametrizadas | NÃ£o hÃ¡ varredura completa de supply chain/dados/produÃ§Ã£o; vulnerabilidade moderada no backend | Corrigir dependÃªncia e ampliar testes de abuso/configuraÃ§Ã£o |
| Dados pessoais/LGPD no repositÃ³rio | ðŸ”´ AUSENTE / FALHANDO | O arquivo `frontend/imgs/LocatÃ¡rios Perini Business 2026.xlsx` foi removido da Ã¡rvore atual, mas continua no commit `55faede`; a inspeÃ§Ã£o OOXML contou 251 padrÃµes de e-mail e 467 de CPF/CNPJ | Potencial incidente permanece no histÃ³rico pÃºblico | Seguir `docs/SECURITY_DATA_REMOVAL.md`; reescrever e publicar o histÃ³rico somente em checkpoints autorizados |
| Metadados pessoais em artefatos | ðŸŸ  PARCIAL | Duas planilhas tÃªm propriedades `creator`/`lastModifiedBy`; DOCX sem esses campos detectados | Metadados podem identificar autores/mÃ¡quinas | Sanitizar cÃ³pias destinadas Ã  publicaÃ§Ã£o e verificar novamente |
| E-mail transacional | ðŸŸ¡ IMPLEMENTADO, PENDENTE DE VALIDAÃ‡ÃƒO | Nodemailer, configuraÃ§Ã£o SMTP e Mailpit em DEV | Nenhum provedor/credencial de produÃ§Ã£o foi validado | Definir provedor no checkpoint e testar entrega sem segredos em logs |
| Secrets fora do cÃ³digo | ðŸŸ¡ IMPLEMENTADO, PENDENTE DE VALIDAÃ‡ÃƒO | `.gitignore`, `.env.example`, validaÃ§Ã£o de ambiente; nenhum `.env` real rastreado na Ã¡rvore atual | Secrets remotos nÃ£o sÃ£o consultÃ¡veis; arquivos binÃ¡rios exigem tratamento de dados | Configurar apenas via secrets do ambiente e executar scanner apropriado |
| Autoria individual | ðŸ‘¤ PENDÃŠNCIA HUMANA | Playbook exige prova individual atÃ© 30/11/2026 | NÃ£o Ã© automatizÃ¡vel | Cada integrante deve preparar explicaÃ§Ã£o e demonstraÃ§Ã£o das prÃ³prias contribuiÃ§Ãµes |
| OrientaÃ§Ãµes obrigatÃ³rias | ðŸ‘¤ PENDÃŠNCIA HUMANA | Playbook exige 5 orientaÃ§Ãµes, com marcos em 30/09 e 30/11/2026 | NÃ£o hÃ¡ registro acadÃªmico verificÃ¡vel no repositÃ³rio | Grupo deve manter comprovantes e pauta por orientaÃ§Ã£o |
| PÃ´ster PDF com QR code | ðŸ‘¤ PENDÃŠNCIA HUMANA | NÃ£o localizado no repositÃ³rio | Artefato e apresentaÃ§Ã£o dependem do grupo | Produzir apÃ³s URL estÃ¡vel e validar QR/link |
| Demo Day e avaliaÃ§Ãµes | ðŸ‘¤ PENDÃŠNCIA HUMANA | Datas oficiais: 10, 15 e 16/12/2026 | PresenÃ§a em uma noite distinta e avaliaÃ§Ãµes sÃ£o obrigaÃ§Ãµes humanas | Planejar escala e registrar submissÃµes dentro do prazo |

## CI/CD â€” resultado de aceite

**CI: FAIL.** O workflow Ã© automÃ¡tico para `push` e `pull_request` e contÃ©m lint, testes, cobertura, auditoria, build, Sonar e Quality Gate. A execuÃ§Ã£o remota atual falha antes de completar o fluxo; portanto, workflow existente nÃ£o equivale a CI funcionando.

**CD: FAIL.** O workflow AWS estÃ¡ condicionado ao sucesso do CI e a uma flag externa, mas as execuÃ§Ãµes atuais estÃ£o ignoradas. NÃ£o hÃ¡ deploy, health check ou smoke test pÃ³s-deploy bem-sucedido comprovado.

| Etapa | Configurada | ExecuÃ§Ã£o bem-sucedida atual |
|---|---:|---:|
| ExecuÃ§Ã£o automÃ¡tica de CI | Sim | NÃ£o |
| Lint | Sim | NÃ£o no ambiente limpo do CI |
| Testes backend | Sim | NÃ£o como pipeline completo |
| Testes frontend | Sim | Sim no job isolado atual |
| Coverage | Sim | NÃ£o â€” backend falha |
| Audit | Sim | NÃ£o â€” bloqueado pelo `npm ci` da raiz |
| Build | Sim | Sim no job isolado, mas artefato pode conter localhost |
| Sonar | Sim | NÃ£o â€” job ignorado |
| Quality Gate bloqueando deploy | Sim, por dependÃªncia entre jobs | Sem execuÃ§Ã£o PASS comprovada |
| Critical/High bloqueando produÃ§Ã£o | Sim, por script | Sem execuÃ§Ã£o comprovada |
| Deploy automÃ¡tico | Condicional | NÃ£o |
| Health check pÃ³s-deploy | Configurado no CD AWS | NÃ£o executado |
| Smoke test pÃ³s-deploy | Configurado no CD AWS | NÃ£o executado |

## InventÃ¡rio de ambientes

### DEV

| Componente | Estado real |
|---|---|
| Frontend | Vite em `http://localhost:5174`; executado fora do Compose |
| Backend | Express com fallback local em `http://localhost:3002`; executado fora do Compose |
| Database | PostgreSQL 16 no Compose, porta local 5435, volume `postgres_data`; engine local indisponÃ­vel durante a auditoria |
| Email | Mailpit somente no Compose DEV, SMTP em `127.0.0.1:1025`, interface em `127.0.0.1:8025` |
| Observability | Logs Pino e endpoint Prometheus implementados; Alloy/Grafana nÃ£o validados no DEV |

### PROD

| Componente | Estado real |
|---|---|
| Frontend | NÃ£o implantado; nÃ£o hÃ¡ URL real |
| Backend | NÃ£o implantado; nÃ£o hÃ¡ URL real |
| Database | NÃ£o hÃ¡ PostgreSQL persistente de produÃ§Ã£o validado |
| Email | NÃ£o hÃ¡ provedor real validado |
| Observability | NÃ£o hÃ¡ ingestÃ£o remota validada |

SeparaÃ§Ã£o DEV/PROD: **PARCIAL**. A configuraÃ§Ã£o prevÃª variÃ¡veis distintas e mantÃ©m Mailpit no DEV, mas nÃ£o existe ambiente produtivo funcional que permita comprovar banco, secrets, persistÃªncia, ausÃªncia de localhost ou estabilidade para o parceiro externo.

## URLs funcionais

```text
APPLICATION_URL=
API_URL=
HEALTH_URL=
GRAFANA_URL=
```

Os campos permanecem vazios porque nenhuma URL pÃºblica funcional foi comprovada. **DEPLOY: NÃƒO ATENDE. Disponibilidade pÃºblica e estÃ¡vel: NÃƒO ATENDE.**

## Coverage tÃ©cnico versus acadÃªmico

### Backend

| MÃ©trica | Resultado atual | Threshold tÃ©cnico | Meta acadÃªmica |
|---|---:|---:|---:|
| Statements | 47,68% | 45% | 75% |
| Branches | 39,92% | 40% | 75% nÃ£o confirmado por mÃ©trica |
| Functions | 39,32% | 30% | 75% nÃ£o confirmado por mÃ©trica |
| Lines | 53,62% | 50% | 75% |

O comando tÃ©cnico falha no threshold de branches. Como o Playbook nÃ£o define qual mÃ©trica representa isoladamente os 75%, todas sÃ£o apresentadas e nenhuma interpretaÃ§Ã£o favorÃ¡vel Ã© presumida. **Status acadÃªmico: NÃƒO CONFIRMADO â€” PENDÃŠNCIA ACADÃŠMICA DE COVERAGE.**

### Frontend

| MÃ©trica | Resultado diagnÃ³stico | Threshold tÃ©cnico | Meta acadÃªmica |
|---|---:|---:|---:|
| Statements | 58,76% | 55% | 25% |
| Branches | 54,81% | 50% | 25% nÃ£o confirmado por mÃ©trica |
| Functions | 45,95% | 40% | 25% nÃ£o confirmado por mÃ©trica |
| Lines | 70,07% | 65% | 25% |

Os valores foram obtidos apenas com timeout diagnÃ³stico de 15 segundos. O comando oficial `npm run test:coverage --prefix frontend` falhou; por isso, a meta nÃ£o Ã© declarada atendida. **Status acadÃªmico: NÃƒO CONFIRMADO.**

## Observabilidade â€” evidÃªncia funcional

| Item | SituaÃ§Ã£o |
|---|---|
| Dashboard | Arquivos JSON para API, Application, Infrastructure e PostgreSQL |
| URL | NÃ£o disponÃ­vel |
| Datasource | Loki/Prometheus planejados via Grafana Alloy; nÃ£o validados remotamente |
| Ãšltimos dados recebidos | NÃ£o comprovados |
| API / Application / Infrastructure / PostgreSQL | ConfiguraÃ§Ã£o presente; dashboards importados e dados de produÃ§Ã£o nÃ£o comprovados |
| Alertas mÃ­nimos | API down, database down, HTTP 5xx, CPU e disco configurados; sem evidÃªncia de disparo/recebimento |
| Alertas adicionais | RAM, latÃªncia e falhas de e-mail incompletos ou sem validaÃ§Ã£o |

NÃ£o hÃ¡ screenshots de produÃ§Ã£o a gerar nesta etapa. EvidÃªncias visuais serÃ£o legÃ­timas apenas depois que Grafana estiver recebendo dados reais, sem secrets.

## Checklist da demonstraÃ§Ã£o em produÃ§Ã£o

- [ ] Abrir aplicaÃ§Ã£o pÃºblica.
- [ ] Executar login.
- [ ] Navegar pelo dashboard.
- [ ] Demonstrar funcionalidade principal.
- [ ] Consultar PostgreSQL por meio da aplicaÃ§Ã£o.
- [ ] Demonstrar integraÃ§Ã£o frontend/backend.
- [ ] Demonstrar CI/CD verde.
- [ ] Mostrar SonarCloud.
- [ ] Mostrar Quality Gate aprovado.
- [ ] Mostrar Grafana com dados recentes.
- [ ] Mostrar health pÃºblico.
- [ ] Demonstrar e-mail real, quando aplicÃ¡vel.

## Matriz final de requisitos de entrega

Esta Ã© a tabela de aceite restrita aos trÃªs estados solicitados. Um requisito configurado, mas sem evidÃªncia funcional, nÃ£o recebe `ATENDIDO`.

| Requisito | EvidÃªncia | Status |
|---|---|---|
| RepositÃ³rio pÃºblico | GitHub pÃºblico `GeovaniaLuiza/agora-tech-park-fullstack` | âœ… ATENDIDO |
| HistÃ³rico de commits | 19 commits em 6 dias de desenvolvimento | PARCIAL |
| Link funcional | Nenhuma URL comprovada | NÃƒO ATENDIDO |
| ProduÃ§Ã£o pÃºblica | Nenhum teste externo possÃ­vel | NÃƒO ATENDIDO |
| Arquitetura documentada | `docs/ARCHITECTURE.md`, desatualizado em relaÃ§Ã£o ao destino de produÃ§Ã£o | PARCIAL |
| Wiki junto ao repositÃ³rio | Wiki desabilitada; pasta `docs/` nÃ£o constitui equivalente completo | NÃƒO ATENDIDO |
| Requisitos, casos de uso e decisÃµes | DocumentaÃ§Ã£o existente, porÃ©m incompleta/desatualizada | PARCIAL |
| TrÃªs fluxos de negÃ³cio completos | ImplementaÃ§Ã£o parcial sem validaÃ§Ã£o ponta a ponta em produÃ§Ã£o | PARCIAL |
| TDD | Testes presentes; histÃ³rico nÃ£o comprova integralmente teste-primeiro | PARCIAL |
| CI | GitHub Actions run `33522551350` com falhas | NÃƒO ATENDIDO |
| CD | Workflow AWS com execuÃ§Ãµes ignoradas | NÃƒO ATENDIDO |
| DEV separado | Compose/variÃ¡veis locais; fluxo de migrations inconsistente | PARCIAL |
| PROD separado | NÃ£o existe ambiente comprovado | NÃƒO ATENDIDO |
| Deploy fora de localhost | Nenhuma URL | NÃƒO ATENDIDO |
| HTTPS | Nenhum certificado ou endpoint | NÃƒO ATENDIDO |
| PostgreSQL persistente | Apenas volume DEV e configuraÃ§Ã£o AWS antiga | NÃƒO ATENDIDO |
| Sonar | ConfiguraÃ§Ã£o local; anÃ¡lise remota atual ausente | PARCIAL |
| Quality Gate | Nenhuma execuÃ§Ã£o PASS | NÃƒO ATENDIDO |
| Observabilidade | EstratÃ©gia e configuraÃ§Ã£o existentes, sem produÃ§Ã£o | PARCIAL |
| Grafana | JSONs locais, sem dashboard remoto comprovado | NÃƒO ATENDIDO |
| Logs | Pino implementado, sem ingestÃ£o remota | PARCIAL |
| MÃ©tricas | `prom-client` implementado, sem dados remotos | PARCIAL |
| Health Check | Implementado e testado localmente, sem URL pÃºblica | PARCIAL |
| Backup | `pg_dump` local ao host AWS, sem restauraÃ§Ã£o/off-site | PARCIAL |
| SeguranÃ§a e LGPD | Controles de aplicaÃ§Ã£o presentes; arquivo removido da Ã¡rvore, mas ainda recuperÃ¡vel no histÃ³rico pÃºblico | NÃƒO ATENDIDO |
| Backend coverage acadÃªmico | 47,68/39,92/39,32/53,62%; comando falha | NÃƒO ATENDIDO |
| Frontend coverage acadÃªmico | Resultado diagnÃ³stico acima de 25%, mas comando oficial falha | PARCIAL |

## Conformidade â€” requisitos de entrega

### RepositÃ³rio

Status: `ATENDIDO` quanto Ã  visibilidade; privacidade/LGPD em `NÃƒO ATENDIDO`.
URL: `https://github.com/GeovaniaLuiza/agora-tech-park-fullstack`

### AplicaÃ§Ã£o, backend e health

Status: `NÃƒO ATENDIDO`
Application URL: nÃ£o disponÃ­vel
Backend URL: nÃ£o disponÃ­vel
Health URL: nÃ£o disponÃ­vel

### CI/CD

CI: `FAIL`
CD: `FAIL`
Ãšltima execuÃ§Ã£o validada: GitHub Actions run `33522551350`, com falhas

### Ambientes

DEV: `PARCIAL`
PROD/STAGING: `NÃƒO ATENDIDO`

### Sonar

Quality Gate: nÃ£o comprovado
Critical: nÃ£o comprovado
High: nÃ£o comprovado
Coverage backend: nÃ£o atende Ã  meta acadÃªmica
Coverage frontend: resultado diagnÃ³stico suficiente, gate oficial falhando

### Observabilidade

Grafana: nÃ£o validado
Logs: implementaÃ§Ã£o local parcial
Metrics: implementaÃ§Ã£o local parcial
Alerts: configuraÃ§Ã£o parcial, sem execuÃ§Ã£o remota

### DevOps e infraestrutura

CI/CD: nÃ£o atendido
Ambientes: parcial
Deploy: nÃ£o atendido
Observabilidade: parcial

### Resultado geral

**NÃƒO ATENDE.**

### PendÃªncias reais

- Confirmar a natureza dos dados e executar, mediante autorizaÃ§Ãµes separadas, a limpeza local e a publicaÃ§Ã£o do histÃ³rico sanitizado conforme `docs/SECURITY_DATA_REMOVAL.md`.
- Corrigir instalaÃ§Ã£o limpa, cobertura backend, timeout frontend e integraÃ§Ã£o PostgreSQL.
- Obter CI verde, SonarCloud e Quality Gate aprovados.
- Publicar por CD em infraestrutura aceita, com URLs pÃºblicas, HTTPS e sem localhost.
- Validar PostgreSQL persistente, e-mail real, backup/restauraÃ§Ã£o e smoke tests.
- Importar dashboards, receber dados de produÃ§Ã£o e comprovar alertas.
- Atualizar Wiki, requisitos, C4/equivalente, ADRs, deploy e trade-offs conforme o sistema real.
- Cumprir orientaÃ§Ãµes, prova de autoria, pÃ´ster/QR e participaÃ§Ã£o no Demo Day.

## Gates executados nesta baseline

| Gate | Resultado |
|---|---|
| `npm ci` (raiz) | **FAIL** â€” conflito de peer dependency ESLint/plugin React |
| `npm ci --prefix backend` | **PASS** |
| `npm ci --prefix frontend` | **PASS** |
| `npm run lint` | **PASS local**, mas ainda bloqueado no CI limpo |
| Testes backend | **PASS** â€” 106/106 |
| Cobertura backend | **FAIL** â€” abaixo de 75% e abaixo do threshold atual de branches |
| Testes frontend | **PASS** â€” 78/78 |
| Cobertura frontend padrÃ£o | **FAIL** â€” timeout de um teste |
| Cobertura frontend diagnÃ³stica (`--testTimeout=15000`) | **PASS diagnÃ³stico** â€” todas as mÃ©tricas acima dos thresholds atuais |
| Build frontend | **PASS tÃ©cnico / FAIL para produÃ§Ã£o** â€” artefato contÃ©m fallback localhost |
| `npm audit --audit-level=high` | **PASS no critÃ©rio High/Critical**; backend ainda tem 1 Moderate |
| `docker compose config --quiet` | **PASS sintÃ¡tico** |
| IntegraÃ§Ã£o/migrations local | **NÃƒO EXECUTADO** â€” Docker Engine indisponÃ­vel |
| CI remoto atual | **FAIL** â€” run `33522551350` |
| CD remoto atual | **SKIPPED** |
| SonarCloud / Quality Gate | **SEM EVIDÃŠNCIA DE PASS** â€” projeto nÃ£o localizado pela consulta pÃºblica |

## ObservaÃ§Ãµes de integridade

- A modificaÃ§Ã£o preexistente em `backend/tests/event-import.test.js` pertence ao usuÃ¡rio e nÃ£o foi alterada nesta auditoria.
- Os arquivos `.bak` rastreados em `backend/src/` sÃ£o duplicaÃ§Ãµes que devem ser revisadas antes de eventual remoÃ§Ã£o; nenhuma exclusÃ£o foi realizada.
- Nenhuma credencial foi solicitada, impressa ou gravada.
- Nenhum deploy, mutaÃ§Ã£o de infraestrutura, alteraÃ§Ã£o de banco ou reescrita de histÃ³rico Git foi executado.
- Os nÃºmeros de padrÃµes pessoais foram registrados apenas de forma agregada; nenhum valor da planilha foi reproduzido.
- A planilha operacional foi removida da Ã¡rvore atual em 04/09/2026, mas a limpeza do histÃ³rico nÃ£o foi executada.

## Fontes oficiais do critÃ©rio

- [The Portfolio Playbook â€” Portfolio](https://github.com/CatolicaSC-Portfolio/The-Portfolio-Playbook/blob/main/Portfolio.md)
- [Direcionamentos gerais](https://github.com/CatolicaSC-Portfolio/The-Portfolio-Playbook/blob/main/directions/portfolio-directions-GERAL.md)
- [Linha de projeto â€” Web Apps](https://github.com/CatolicaSC-Portfolio/The-Portfolio-Playbook/blob/main/directions/portfolio-directions-webapp.md)

As trÃªs fontes responderam `HTTP 200` em 04/09/2026 e foram confrontadas com esta baseline.
