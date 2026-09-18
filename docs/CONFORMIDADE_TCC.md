# Matriz de conformidade do TCC â€” Ãgora Tech Park

Baseline tÃ©cnica de 04/09/2026, com evidÃªncias de CI/CD, produÃ§Ã£o e observabilidade atualizadas em 18/09/2026. Esta matriz registra o estado observado antes das correÃ§Ãµes e as validaÃ§Ãµes posteriores explicitamente identificadas. Ela nÃ£o Ã© evidÃªncia de aprovaÃ§Ã£o acadÃªmica nem substitui resultados do GitHub Actions, SonarCloud, provedor de nuvem ou Grafana.

## Legenda

- âœ… **IMPLEMENTADO E VALIDADO** â€” existe e foi verificado por execuÃ§Ã£o ou consulta objetiva.
- ðŸŸ¡ **IMPLEMENTADO, PENDENTE DE VALIDAÃ‡ÃƒO** â€” existe, mas depende de ambiente ou serviÃ§o indisponÃ­vel.
- ðŸŸ  **PARCIAL** â€” cobre apenas parte do requisito ou apresenta divergÃªncia.
- âšª **DOCUMENTADO / PLANEJADO** â€” hÃ¡ intenÃ§Ã£o ou documentaÃ§Ã£o, sem implementaÃ§Ã£o comprovada.
- ðŸ”´ **AUSENTE / FALHANDO** â€” nÃ£o existe, estÃ¡ incorreto ou falhou no gate aplicÃ¡vel.
- ðŸ‘¤ **PENDÃŠNCIA HUMANA** â€” exige participaÃ§Ã£o, decisÃ£o ou credencial do grupo.

## Resumo executivo

**DecisÃ£o atual: PARCIAL â€” produÃ§Ã£o funcional e tecnicamente validada, com pendÃªncias de seguranÃ§a/LGPD e de entrega acadÃªmica/documental.** CI #43 e CD Production #48 passaram; deploy, backend e frontend estÃ£o funcionando, a API e o health sÃ£o pÃºblicos via HTTPS, PostgreSQL e e-mail foram validados, e o Quality Gate passou. Isso nÃ£o representa aprovaÃ§Ã£o final: o arquivo com possÃ­veis dados pessoais permanece recuperÃ¡vel no histÃ³rico pÃºblico e constitui bloqueador real de seguranÃ§a/LGPD enquanto o histÃ³rico nÃ£o for sanitizado. A meta acadÃªmica de coverage backend, a documentaÃ§Ã£o obrigatÃ³ria e obrigaÃ§Ãµes acadÃªmicas/humanas tambÃ©m permanecem pendentes. Dashboards finais, alertas, SLO, retenÃ§Ã£o e backup/restauraÃ§Ã£o continuam parciais, sem invalidar a produÃ§Ã£o e a ingestÃ£o remota jÃ¡ comprovadas.

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
| Arquitetura C4 ou equivalente | âœ… IMPLEMENTADO E VALIDADO | `docs/ARCHITECTURE.md` contÃ©m trÃªs diagramas Mermaid verificÃ¡veis: visÃ£o de contexto e visÃ£o de containers equivalentes ao C4, alÃ©m da visÃ£o de deployment; componentes, ambientes e fluxos correspondem Ã  produÃ§Ã£o validada | Nenhuma lacuna observada neste requisito | Manter os diagramas alinhados Ã  arquitetura efetivamente implantada |
| ADRs / decisÃµes arquiteturais | ðŸ”´ AUSENTE / FALHANDO | Nenhum diretÃ³rio ou registro ADR localizado | DecisÃµes relevantes nÃ£o sÃ£o rastreÃ¡veis | Criar ADRs somente para decisÃµes reais e atuais |
| ReferÃªncia acadÃªmica fornecida | âšª DOCUMENTADO / PLANEJADO | Tese de Nancy V. PÃ©rez, 2022, fornecida pelo usuÃ¡rio nesta auditoria | Ainda nÃ£o foi incorporada; nÃ£o constitui evidÃªncia tÃ©cnica | Usar apenas como fundamentaÃ§Ã£o, com autoria e referÃªncia bibliogrÃ¡fica completas |
| Link funcional pÃºblico e estÃ¡vel | ðŸŸ  PARCIAL | API pÃºblica `https://agora-techpark.duckdns.org/api` e health pÃºblico validados; frontend implantado no AWS Amplify e smoke test concluÃ­do | O CD usa a variÃ¡vel GitHub `PRODUCTION_FRONTEND_URL`, mas seu valor nÃ£o estÃ¡ versionado nem documentado no repositÃ³rio | Registrar a URL real do Amplify e manter smoke checks periÃ³dicos |
| Frontend React + Vite | ðŸŸ  PARCIAL | React 19.2.8 e Vite 8.2.2; job de testes/build e validaÃ§Ã£o do artefato passou no CI #43; artefato foi implantado no AWS Amplify pelo CD #48 | DocumentaÃ§Ã£o ainda informa React 18; URL do frontend nÃ£o registrada | Atualizar documentaÃ§Ã£o e registrar a URL do Amplify |
| Backend Express | âœ… IMPLEMENTADO E VALIDADO | Express 5.2.1; 163 testes unitÃ¡rios passando; `agora-api.service` ativo e habilitado na EC2; API responde HTTP 200 | Meta acadÃªmica de coverage Ã© avaliada separadamente | Preservar testes, health e serviÃ§o systemd |
| PostgreSQL 16 | âœ… IMPLEMENTADO E VALIDADO | PostgreSQL 16 em produÃ§Ã£o na EC2; `postgresql.service` ativo e habilitado; integraÃ§Ã£o PostgreSQL passou no CI #43; exporter Alloy conectado | Backup/restauraÃ§Ã£o e off-site sÃ£o requisitos separados | Manter integraÃ§Ã£o e validar restauraÃ§Ã£o separadamente |
| MigraÃ§Ãµes incrementais | ðŸŸ  PARCIAL | `database/migrations/001...016`; runner calcula SHA-256, usa lock e registra `schema_migrations`; migrations e integraÃ§Ã£o PostgreSQL passaram no CI #43 | Compose DEV monta 001â€“013 e 016, omitindo 014 e 015; dois fluxos duplicados permanecem | Fazer Compose usar o runner Ãºnico e validar repetiÃ§Ã£o/checksum no DEV |
| Seed separado e seguro | ðŸŸ¡ IMPLEMENTADO, PENDENTE DE VALIDAÃ‡ÃƒO | `database/seed.sql` Ã© montado apenas pelo Compose de desenvolvimento; CD nÃ£o o executa | NÃ£o validado em banco vazio; contÃ©m credenciais demonstrativas conhecidas, aceitÃ¡veis somente em DEV | Validar isolamento e impedir execuÃ§Ã£o em produÃ§Ã£o |
| InstalaÃ§Ã£o limpa da raiz | âœ… IMPLEMENTADO E VALIDADO | `npm ci`, lint e auditoria passaram no job `Lint and dependency audit` do CI #43 | Nenhuma falha de instalaÃ§Ã£o observada nessa execuÃ§Ã£o | Manter lockfile e job verde |
| InstalaÃ§Ã£o limpa backend | âœ… IMPLEMENTADO E VALIDADO | `npm ci --prefix backend` e testes passaram no CI #43 | Nenhuma falha de instalaÃ§Ã£o observada nessa execuÃ§Ã£o | Manter lockfile consistente |
| InstalaÃ§Ã£o limpa frontend | âœ… IMPLEMENTADO E VALIDADO | `npm ci --prefix frontend`, testes, coverage e build passaram no CI #43 | Nenhuma falha de instalaÃ§Ã£o observada nessa execuÃ§Ã£o | Manter lockfile consistente |
| Lint local | âœ… IMPLEMENTADO E VALIDADO | `npm run lint` concluiu localmente e no job `Lint and dependency audit` do CI #43 | Nenhuma lacuna observada nesta etapa | Manter o gate no CI |
| Testes unitÃ¡rios backend | âœ… IMPLEMENTADO E VALIDADO | 163 testes unitÃ¡rios aprovados; job `Backend unit tests` passou no CI #43 | NÃ£o substituem a meta acadÃªmica de coverage | Preservar e ampliar suÃ­te |
| Cobertura backend â‰¥ 75% | ðŸŸ  PARCIAL | `npm run test:coverage --prefix backend` passou no CI #43 nos thresholds tÃ©cnicos configurados | NÃ£o foram fornecidos percentuais atuais que comprovem a meta acadÃªmica de 75% | Registrar o relatÃ³rio atual e elevar/comprovar a meta acadÃªmica |
| Testes unitÃ¡rios frontend | âœ… IMPLEMENTADO E VALIDADO | Job `Frontend tests and build` passou no CI #43, incluindo o comando oficial de coverage | Quantidade atual de testes nÃ£o registrada nesta matriz | Registrar a contagem atual nas evidÃªncias |
| Cobertura frontend â‰¥ 25% | âœ… IMPLEMENTADO E VALIDADO | O comando oficial `npm run test:coverage --prefix frontend` passou no CI #43 com thresholds configurados acima de 25% | Percentuais exatos da execuÃ§Ã£o #43 nÃ£o foram registrados nesta matriz | Anexar o relatÃ³rio atual como evidÃªncia quantitativa |
| TDD verificÃ¡vel | ðŸŸ  PARCIAL | Existem testes de domÃ­nio, rotas e pÃ¡ginas | O histÃ³rico disponÃ­vel nÃ£o demonstra de forma suficiente ciclos teste-primeiro | Registrar prÃ³ximos incrementos com teste falhando â†’ implementaÃ§Ã£o â†’ refatoraÃ§Ã£o |
| TrÃªs fluxos de negÃ³cio completos | ðŸŸ  PARCIAL | CÃ³digo e testes cobrem autenticaÃ§Ã£o, indicadores/formulÃ¡rios e importaÃ§Ãµes | NÃ£o foram validados ponta a ponta em ambiente integrado/publicado | Criar testes de aceitaÃ§Ã£o e smoke dos trÃªs fluxos |
| CI no GitHub Actions | âœ… IMPLEMENTADO E VALIDADO | CI #43 passou: lint/audit, testes backend, testes/build frontend, integraÃ§Ã£o PostgreSQL e SonarQube Cloud Quality Gate | Nenhuma lacuna funcional observada nessa execuÃ§Ã£o | Manter o `main` protegido por CI verde |
| CD no GitHub Actions | âœ… IMPLEMENTADO E VALIDADO | CD Production #48 passou: backend via AWS Systems Manager, frontend no AWS Amplify e smoke tests de produÃ§Ã£o | A evidÃªncia comprova a execuÃ§Ã£o #48, nÃ£o disponibilidade contÃ­nua futura | Monitorar execuÃ§Ãµes e preservar rollback |
| AWS removida com seguranÃ§a | âšª DOCUMENTADO / PLANEJADO | AWS permanece como infraestrutura de produÃ§Ã£o validada: EC2, Systems Manager e Amplify foram usados no CD #48 | RemoÃ§Ã£o nÃ£o Ã© compatÃ­vel com a arquitetura produtiva atual e nÃ£o foi autorizada como migraÃ§Ã£o | Manter a infraestrutura validada; reavaliar remoÃ§Ã£o somente com destino substituto e autorizaÃ§Ã£o |
| Cloudflare Pages como frontend | âšª DOCUMENTADO / PLANEJADO | Apenas preferÃªncia do enunciado | A orientaÃ§Ã£o oficial de Web App veda plataformas otimizadas apenas para frontend; Cloudflare Pages exige decisÃ£o conservadora | NÃ£o adotar automaticamente; preferir hospedagem controlÃ¡vel ou obter confirmaÃ§Ã£o acadÃªmica |
| SonarCloud configurado | âœ… IMPLEMENTADO E VALIDADO | Job `SonarQube Cloud Quality Gate` passou no CI #43 | Resultado refere-se Ã  execuÃ§Ã£o validada | Manter token, projeto e gate operacionais |
| Quality Gate aprovado | âœ… IMPLEMENTADO E VALIDADO | Quality Gate passou no CI #43, apÃ³s os jobs de qualidade, testes, build e integraÃ§Ã£o | AprovaÃ§Ã£o acadÃªmica final nÃ£o decorre automaticamente do gate | Preservar o bloqueio do pipeline por Quality Gate |
| DEV separado de produÃ§Ã£o | ðŸŸ  PARCIAL | Compose local, `.env.example` e documentaÃ§Ã£o distinguem DEV | Fluxo de migrations do Compose Ã© inconsistente; nÃ£o hÃ¡ DEV integrado validado nesta mÃ¡quina | Corrigir e validar do zero |
| PROD/STAGING separado | ðŸŸ  PARCIAL | ProduÃ§Ã£o validada em AWS EC2/Amplify com configuraÃ§Ã£o distinta do DEV | Ambiente STAGING nÃ£o foi comprovado | Documentar produÃ§Ã£o e decidir/validar staging conforme o critÃ©rio acadÃªmico |
| Deploy pÃºblico em nuvem | âœ… IMPLEMENTADO E VALIDADO | CD Production #48 implantou backend na AWS EC2 via Systems Manager e frontend no AWS Amplify; smoke tests passaram | URL do frontend nÃ£o registrada nesta matriz | Registrar URL do Amplify e manter validaÃ§Ã£o pÃ³s-deploy |
| HTTPS pÃºblico | âœ… IMPLEMENTADO E VALIDADO | `caddy.service` ativo e habilitado; Caddy serve `https://agora-techpark.duckdns.org/api` e `/api/health` por HTTPS; endpoint respondeu HTTP 200 | Nenhuma lacuna observada na validaÃ§Ã£o informada | Monitorar certificado e disponibilidade |
| Observabilidade | ðŸŸ  PARCIAL | Em 18/09/2026, Alloy 1.19.2 ativo e habilitado no systemd da EC2 Ubuntu 24.04; configuraÃ§Ã£o validada; mÃ©tricas, logs e conexÃ£o do exporter PostgreSQL comprovados em produÃ§Ã£o | Dashboards finais, alertas, SLO e retenÃ§Ã£o nÃ£o foram validados | Validar dashboards, alertas e requisitos operacionais restantes |
| Grafana Cloud recebendo dados | âœ… IMPLEMENTADO E VALIDADO | Grafana Explore exibiu a mÃ©trica `agora_process_process_cpu_seconds_total` via Prometheus e logs `{service="agora-api"}` via Loki em 18/09/2026 | Nenhuma lacuna de ingestÃ£o observada nesta validaÃ§Ã£o; dashboards e alertas sÃ£o avaliados separadamente | Preservar evidÃªncias sem expor credenciais e monitorar continuidade da ingestÃ£o |
| Logs estruturados e redaction | âœ… IMPLEMENTADO E VALIDADO | Pino em journald; Alloy filtra somente `agora-api.service`; Loki recebeu JSON com `application="agora-tech-park"`, `environment="production"`, `service="agora-api"` e redaction `[REDACTED]` | A validaÃ§Ã£o comprova o fluxo e uma ocorrÃªncia de redaction, nÃ£o todas as variaÃ§Ãµes possÃ­veis de dados sensÃ­veis | Manter testes de regressÃ£o da redaction e o filtro da unit |
| MÃ©tricas HTTP/latÃªncia/erros | ðŸŸ  PARCIAL | API expÃµe `/metrics`; Alloy coleta `127.0.0.1:3000` e o remote write ao Grafana Cloud foi validado ponta a ponta | A evidÃªncia apresentada comprova uma sÃ©rie real de CPU de processo, mas nÃ£o cada sÃ©rie HTTP, latÃªncia e erro | Validar no Explore as sÃ©ries HTTP, latÃªncia e erros |
| MÃ©tricas CPU/memÃ³ria/disco | ðŸŸ  PARCIAL | Grafana Explore exibiu `agora_process_process_cpu_seconds_total` com `instance="127.0.0.1:3000"`, `job="prometheus.scrape.agora_api"` e `service="agora-api"` | MemÃ³ria, disco e alerta explÃ­cito de RAM nÃ£o foram comprovados | Completar regras e validar as sÃ©ries restantes |
| Health/liveness/readiness | âœ… IMPLEMENTADO E VALIDADO | `/api/health`, `/live`, `/ready`; readiness retorna 503 quando o banco crÃ­tico falha; health local e `https://agora-techpark.duckdns.org/api/health` retornaram 200; smoke de produÃ§Ã£o passou | Nenhuma lacuna funcional observada nos checks executados | Manter monitoramento e smoke pÃ³s-deploy |
| Alertas operacionais | ðŸŸ  PARCIAL | Regras para API, banco, sintÃ©tico, 5xx, CPU e disco; backend remoto de mÃ©tricas validado | Faltam evidÃªncias de disparo/recebimento e alerta explÃ­cito de RAM/latÃªncia/e-mail | Validar regras e entrega das notificaÃ§Ãµes |
| Backup PostgreSQL | ðŸŸ  PARCIAL | `deploy/aws/deploy-backend.sh` executa `pg_dump` antes de migration | Backup fica no mesmo host; nÃ£o hÃ¡ retenÃ§Ã£o externa nem teste de restauraÃ§Ã£o | Projetar destino gratuito/seguro e teste restaurÃ¡vel |
| Smoke tests | âœ… IMPLEMENTADO E VALIDADO | No CD #48, `scripts/smoke-test.mjs` validou HTTP 200 do health, status `ok`/`degraded`, banco `up`, HTTP 200 do frontend apÃ³s redirects e HTML com `<!doctype html>` | NÃ£o hÃ¡ evidÃªncia de que `SMOKE_EMAIL` e `SMOKE_PASSWORD` estavam presentes no #48; sem ambos, o script ignora o login. O script nÃ£o testa CORS | Registrar se o login foi executado e adicionar check de CORS se exigido |
| SeguranÃ§a de aplicaÃ§Ã£o | ðŸŸ  PARCIAL | Helmet, CORS, JWT, rate limit, Zod, queries parametrizadas e auditoria de dependÃªncias High/Critical aprovada no CI #43 | NÃ£o hÃ¡ evidÃªncia de varredura completa de supply chain, dados e produÃ§Ã£o | Ampliar testes de abuso e configuraÃ§Ã£o |
| Dados pessoais/LGPD no repositÃ³rio | ðŸ”´ AUSENTE / FALHANDO | O arquivo `frontend/imgs/LocatÃ¡rios Perini Business 2026.xlsx` foi removido da Ã¡rvore atual, mas continua no commit `55faede`; a inspeÃ§Ã£o OOXML contou 251 padrÃµes de e-mail e 467 de CPF/CNPJ | Potencial incidente permanece no histÃ³rico pÃºblico | Seguir `docs/SECURITY_DATA_REMOVAL.md`; reescrever e publicar o histÃ³rico somente em checkpoints autorizados |
| Metadados pessoais em artefatos | ðŸŸ  PARCIAL | Duas planilhas tÃªm propriedades `creator`/`lastModifiedBy`; DOCX sem esses campos detectados | Metadados podem identificar autores/mÃ¡quinas | Sanitizar cÃ³pias destinadas Ã  publicaÃ§Ã£o e verificar novamente |
| E-mail transacional | âœ… IMPLEMENTADO E VALIDADO | Gmail SMTP via Nodemailer validado em produÃ§Ã£o; `nodemailer.verify()` e envio real passaram; health reporta `email="up"`; Mailpit permanece exclusivo do DEV | Nenhuma lacuna funcional observada na validaÃ§Ã£o informada | Monitorar entrega e manter secrets fora dos logs |
| Secrets fora do cÃ³digo | ðŸŸ¡ IMPLEMENTADO, PENDENTE DE VALIDAÃ‡ÃƒO | `.gitignore`, `.env.example`, validaÃ§Ã£o de ambiente; nenhum `.env` real rastreado na Ã¡rvore atual | Secrets remotos nÃ£o sÃ£o consultÃ¡veis; arquivos binÃ¡rios exigem tratamento de dados | Configurar apenas via secrets do ambiente e executar scanner apropriado |
| Autoria individual | ðŸ‘¤ PENDÃŠNCIA HUMANA | Playbook exige prova individual atÃ© 30/11/2026 | NÃ£o Ã© automatizÃ¡vel | Cada integrante deve preparar explicaÃ§Ã£o e demonstraÃ§Ã£o das prÃ³prias contribuiÃ§Ãµes |
| OrientaÃ§Ãµes obrigatÃ³rias | ðŸ‘¤ PENDÃŠNCIA HUMANA | Playbook exige 5 orientaÃ§Ãµes, com marcos em 30/09 e 30/11/2026 | NÃ£o hÃ¡ registro acadÃªmico verificÃ¡vel no repositÃ³rio | Grupo deve manter comprovantes e pauta por orientaÃ§Ã£o |
| PÃ´ster PDF com QR code | ðŸ‘¤ PENDÃŠNCIA HUMANA | NÃ£o localizado no repositÃ³rio | Artefato e apresentaÃ§Ã£o dependem do grupo | Produzir apÃ³s URL estÃ¡vel e validar QR/link |
| Demo Day e avaliaÃ§Ãµes | ðŸ‘¤ PENDÃŠNCIA HUMANA | Datas oficiais: 10, 15 e 16/12/2026 | PresenÃ§a em uma noite distinta e avaliaÃ§Ãµes sÃ£o obrigaÃ§Ãµes humanas | Planejar escala e registrar submissÃµes dentro do prazo |

## CI/CD â€” resultado de aceite

**CI: PASS.** A execuÃ§Ã£o CI #43 concluiu com sucesso os jobs `Lint and dependency audit`, `Backend unit tests`, `Frontend tests and build`, `PostgreSQL integration tests` e `SonarQube Cloud Quality Gate`.

**CD: PASS.** A execuÃ§Ã£o CD Production #48 implantou o backend na AWS EC2 via Systems Manager, publicou o frontend no AWS Amplify e concluiu os smoke tests de produÃ§Ã£o.

| Etapa | Configurada | ExecuÃ§Ã£o bem-sucedida atual |
|---|---:|---:|
| ExecuÃ§Ã£o automÃ¡tica de CI | Sim | Sim â€” CI #43 |
| Lint | Sim | Sim â€” CI #43 |
| Testes backend | Sim | Sim â€” 163 testes no CI #43 |
| Testes frontend | Sim | Sim â€” CI #43 |
| Coverage | Sim | Sim nos thresholds tÃ©cnicos; meta acadÃªmica backend de 75% nÃ£o comprovada |
| Audit | Sim | Sim â€” critÃ©rio High/Critical no CI #43 |
| Build | Sim | Sim â€” artefato validado no CI #43 e implantado pelo CD #48 |
| Sonar | Sim | Sim â€” CI #43 |
| Quality Gate bloqueando deploy | Sim, por dependÃªncia entre jobs | Sim â€” PASS no CI #43 |
| Critical/High bloqueando produÃ§Ã£o | Sim, por `check-sonar-quality.mjs` | Sim â€” no CI #43, o script aprovou o Quality Gate e nÃ£o encontrou issues abertas nos filtros legados `BLOCKER,CRITICAL` nem MQR `BLOCKER,HIGH` |
| Deploy automÃ¡tico | Condicional | Sim â€” CD Production #48 |
| Health check pÃ³s-deploy | Configurado no CD AWS | Sim â€” CD #48 e URL pÃºblica HTTP 200 |
| Smoke test pÃ³s-deploy | Configurado no CD AWS | Sim â€” CD #48 |

## InventÃ¡rio de ambientes

### DEV

| Componente | Estado real |
|---|---|
| Frontend | Vite em `http://localhost:5174`; executado fora do Compose |
| Backend | Express com fallback local em `http://localhost:3002`; executado fora do Compose |
| Database | PostgreSQL 16 no Compose, porta local 5435, volume `postgres_data`; engine local indisponÃ­vel durante a auditoria |
| Email | Mailpit somente no Compose DEV, SMTP em `127.0.0.1:1025`, interface em `127.0.0.1:8025` |
| Observability | Logs Pino e endpoint Prometheus implementados; o ambiente DEV nÃ£o foi revalidado em 18/09/2026 |

### PROD

| Componente | Estado real |
|---|---|
| Frontend | Implantado no AWS Amplify pelo CD Production #48; HTML validado pelo smoke test; URL lida de `PRODUCTION_FRONTEND_URL`, cujo valor nÃ£o estÃ¡ versionado |
| Backend | Implantado na AWS EC2; `agora-api.service` ativo e habilitado; releases em `/opt/agora/releases` e symlink `/opt/agora/current`; API pÃºblica responde HTTP 200 |
| Database | PostgreSQL 16 em produÃ§Ã£o na EC2; `postgresql.service` ativo e habilitado; integraÃ§Ã£o CI e conexÃ£o do exporter validadas |
| HTTPS | `caddy.service` ativo e habilitado; API e health pÃºblicos servidos por HTTPS |
| Email | Gmail SMTP via Nodemailer validado com `verify()`, envio real e health `email="up"` |
| Observability | Alloy 1.19.2; `alloy.service` ativo e habilitado na EC2; remote write Prometheus e envio Loki ao Grafana Cloud validados em 18/09/2026; dashboards e alertas permanecem pendentes |

SeparaÃ§Ã£o DEV/PROD: **IMPLEMENTADA E VALIDADA para os ambientes comprovados**. O DEV mantÃ©m Mailpit, enquanto a produÃ§Ã£o usa AWS EC2/Amplify, PostgreSQL 16 e Gmail SMTP. O ambiente STAGING e a validaÃ§Ã£o integrada atual do DEV nÃ£o foram comprovados; por isso, o requisito agregado de ambientes permanece parcial.

## URLs funcionais

```text
APPLICATION_URL=AWS Amplify (valor de PRODUCTION_FRONTEND_URL nÃ£o versionado)
API_URL=https://agora-techpark.duckdns.org/api
HEALTH_URL=https://agora-techpark.duckdns.org/api/health
GRAFANA_URL=
```

A API e o health pÃºblicos foram validados via HTTPS, e o frontend implantado no Amplify passou no smoke test do CD #48. O workflow usa `PRODUCTION_FRONTEND_URL`, mas o valor nÃ£o estÃ¡ presente no repositÃ³rio; a URL do Grafana tambÃ©m nÃ£o foi registrada. **DEPLOY TÃ‰CNICO: ATENDE. DOCUMENTAÃ‡ÃƒO COMPLETA DAS URLs: PARCIAL.**

## Coverage tÃ©cnico versus acadÃªmico

### Backend

| MÃ©trica | Resultado da baseline de 04/09/2026 | Threshold tÃ©cnico | Meta acadÃªmica |
|---|---:|---:|---:|
| Statements | 47,68% | 45% | 75% |
| Branches | 39,92% | 40% | 75% nÃ£o confirmado por mÃ©trica |
| Functions | 39,32% | 30% | 75% nÃ£o confirmado por mÃ©trica |
| Lines | 53,62% | 50% | 75% |

Os percentuais acima sÃ£o histÃ³ricos da baseline de 04/09/2026. O comando oficial de coverage backend passou no CI #43 nos thresholds tÃ©cnicos atuais, mas os percentuais dessa execuÃ§Ã£o nÃ£o foram fornecidos. Como o Playbook nÃ£o define qual mÃ©trica representa isoladamente os 75%, nenhuma interpretaÃ§Ã£o favorÃ¡vel Ã© presumida. **Status acadÃªmico: NÃƒO CONFIRMADO â€” PENDÃŠNCIA ACADÃŠMICA DE COVERAGE.**

### Frontend

| MÃ©trica | Resultado diagnÃ³stico da baseline | Threshold tÃ©cnico | Meta acadÃªmica |
|---|---:|---:|---:|
| Statements | 58,76% | 55% | 25% |
| Branches | 54,81% | 50% | 25% nÃ£o confirmado por mÃ©trica |
| Functions | 45,95% | 40% | 25% nÃ£o confirmado por mÃ©trica |
| Lines | 70,07% | 65% | 25% |

Os valores quantitativos acima foram obtidos na baseline com timeout diagnÃ³stico de 15 segundos. Posteriormente, o comando oficial `npm run test:coverage --prefix frontend` passou no CI #43 e os thresholds tÃ©cnicos configurados sÃ£o superiores Ã  meta acadÃªmica de 25%. **Status acadÃªmico: ATENDIDO quanto Ã  coverage frontend.**

## Observabilidade â€” evidÃªncia funcional

| Item | SituaÃ§Ã£o |
|---|---|
| Dashboard | Arquivos JSON para API, Application, Infrastructure e PostgreSQL; dashboards finais nÃ£o validados |
| URL | URL nÃ£o registrada na matriz; acesso ao Grafana Cloud Explore validado em 18/09/2026 |
| Alloy | VersÃ£o 1.19.2 na EC2 Ubuntu 24.04; `alloy.service` ativo, habilitado no systemd e configuraÃ§Ã£o aprovada por `alloy validate`; sem novos erros no journal apÃ³s a correÃ§Ã£o da autenticaÃ§Ã£o |
| Datasource | Prometheus remote write e Loki via Grafana Alloy validados ponta a ponta no Grafana Cloud em produÃ§Ã£o |
| Ãšltimos dados recebidos | Em 18/09/2026, mÃ©trica real `agora_process_process_cpu_seconds_total` e log real de `GET /api/health` com `statusCode=200` observados no Explore |
| Logs | Consulta `{service="agora-api"}` validada; JSON preservado, labels de aplicaÃ§Ã£o/ambiente/serviÃ§o observados e redaction `[REDACTED]` comprovada |
| PostgreSQL exporter | ConexÃ£o estabelecida com PostgreSQL 16.15.0; usuÃ¡rio dedicado de observabilidade com `pg_monitor`, sem privilÃ©gios administrativos da aplicaÃ§Ã£o |
| API / Application / Infrastructure / PostgreSQL | IngestÃ£o de mÃ©tricas da API, logs da aplicaÃ§Ã£o e conexÃ£o do exporter PostgreSQL comprovadas; dashboards consolidados e todas as sÃ©ries de infraestrutura nÃ£o comprovados |
| Alertas mÃ­nimos | API down, database down, HTTP 5xx, CPU e disco configurados; sem evidÃªncia de disparo/recebimento |
| Alertas adicionais | RAM, latÃªncia e falhas de e-mail incompletos ou sem validaÃ§Ã£o |

Arquitetura validada em 18/09/2026: Node/Express `/metrics` â†’ Grafana Alloy â†’ Grafana Cloud Prometheus; Pino/journald â†’ Grafana Alloy â†’ Grafana Cloud Loki; PostgreSQL exporter â†’ Grafana Alloy â†’ Grafana Cloud Prometheus.

Nenhum screenshot foi incorporado Ã  matriz. A validaÃ§Ã£o funcional foi realizada no Grafana Cloud Explore com dados reais, sem registrar secrets.

## Checklist da demonstraÃ§Ã£o em produÃ§Ã£o

Os itens abaixo permanecem como roteiro de apresentaÃ§Ã£o presencial; uma validaÃ§Ã£o tÃ©cnica automatizada nÃ£o marca, por si sÃ³, a demonstraÃ§Ã£o acadÃªmica como concluÃ­da.

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
| Link funcional | API e health pÃºblicos via HTTPS; frontend no Amplify, com valor de `PRODUCTION_FRONTEND_URL` nÃ£o versionado | PARCIAL |
| ProduÃ§Ã£o pÃºblica | Backend EC2 e frontend Amplify implantados; CD #48 e smoke tests passaram | âœ… ATENDIDO |
| Arquitetura documentada | `docs/ARCHITECTURE.md` com diagramas Mermaid de contexto, containers e deployment equivalentes ao C4 e coerentes com a produÃ§Ã£o validada | âœ… ATENDIDO |
| Wiki junto ao repositÃ³rio | Wiki desabilitada; pasta `docs/` nÃ£o constitui equivalente completo | NÃƒO ATENDIDO |
| Requisitos, casos de uso e decisÃµes | DocumentaÃ§Ã£o existente, porÃ©m incompleta/desatualizada | PARCIAL |
| TrÃªs fluxos de negÃ³cio completos | ImplementaÃ§Ã£o parcial sem validaÃ§Ã£o ponta a ponta em produÃ§Ã£o | PARCIAL |
| TDD | Testes presentes; histÃ³rico nÃ£o comprova integralmente teste-primeiro | PARCIAL |
| CI | CI #43 passou em todos os jobs informados | âœ… ATENDIDO |
| CD | CD Production #48 implantou backend/frontend e concluiu smoke tests | âœ… ATENDIDO |
| DEV separado | Compose/variÃ¡veis locais; fluxo de migrations inconsistente | PARCIAL |
| PROD separado | ProduÃ§Ã£o AWS distinta do DEV validada; STAGING nÃ£o comprovado | PARCIAL |
| Deploy fora de localhost | Backend EC2 e frontend Amplify; API pÃºblica validada | âœ… ATENDIDO |
| HTTPS | Caddy e endpoints pÃºblicos HTTPS validados | âœ… ATENDIDO |
| PostgreSQL persistente | PostgreSQL 16 ativo e habilitado na EC2; integraÃ§Ã£o CI e exporter validados | âœ… ATENDIDO |
| Sonar | Job SonarQube Cloud passou no CI #43 | âœ… ATENDIDO |
| Quality Gate | ExecuÃ§Ã£o PASS no CI #43 | âœ… ATENDIDO |
| Observabilidade | Prometheus e Loki validados no Grafana Cloud em produÃ§Ã£o; dashboards finais e alertas ainda nÃ£o comprovados | PARCIAL |
| Grafana | Dados reais de Prometheus e Loki observados no Explore; dashboards finais nÃ£o comprovados | PARCIAL |
| Logs | Pino/journald â†’ Alloy â†’ Loki validado, com JSON, labels e redaction observados | âœ… ATENDIDO |
| MÃ©tricas | `/metrics` â†’ Alloy â†’ Prometheus validado com sÃ©rie real; conjunto completo de sÃ©ries operacionais nÃ£o comprovado | PARCIAL |
| Health Check | HTTP 200 local e em `https://agora-techpark.duckdns.org/api/health`; smoke #48 e Loki confirmaram o fluxo | âœ… ATENDIDO |
| Backup | `pg_dump` local ao host AWS, sem restauraÃ§Ã£o/off-site | PARCIAL |
| SeguranÃ§a e LGPD | Controles de aplicaÃ§Ã£o presentes; arquivo removido da Ã¡rvore, mas ainda recuperÃ¡vel no histÃ³rico pÃºblico | NÃƒO ATENDIDO |
| Backend coverage acadÃªmico | Comando tÃ©cnico passou no CI #43; percentuais atuais nÃ£o comprovam 75% | PARCIAL |
| Frontend coverage acadÃªmico | Comando oficial passou no CI #43 com thresholds superiores a 25% | âœ… ATENDIDO |

## Conformidade â€” requisitos de entrega

### RepositÃ³rio

Status: `ATENDIDO` quanto Ã  visibilidade; privacidade/LGPD em `NÃƒO ATENDIDO`.
URL: `https://github.com/GeovaniaLuiza/agora-tech-park-fullstack`

### AplicaÃ§Ã£o, backend e health

Status tÃ©cnico: `ATENDIDO`; registro completo de URLs: `PARCIAL`
Application URL: AWS Amplify; valor de `PRODUCTION_FRONTEND_URL` nÃ£o versionado
Backend URL: `https://agora-techpark.duckdns.org/api`
Health URL: `https://agora-techpark.duckdns.org/api/health`

### CI/CD

CI: `PASS` â€” execuÃ§Ã£o #43
CD: `PASS` â€” CD Production #48
Ãšltimas execuÃ§Ãµes validadas: CI #43 e CD Production #48

### Ambientes

DEV: `PARCIAL`
PROD: `ATENDIDO`
STAGING: `NÃƒO COMPROVADO`

### Sonar

Quality Gate: `PASS` no CI #43
Critical/High: `check-sonar-quality.mjs` passou no CI #43 sem issues abertas nos filtros legados `BLOCKER,CRITICAL` e MQR `BLOCKER,HIGH`; o audit de dependÃªncias High/Critical tambÃ©m passou
Coverage backend: gate tÃ©cnico passou; meta acadÃªmica de 75% nÃ£o comprovada
Coverage frontend: comando oficial passou com thresholds superiores a 25%

### Observabilidade

Grafana: ingestÃ£o Prometheus/Loki validada no Explore; dashboards finais nÃ£o comprovados
Logs: fluxo de produÃ§Ã£o validado ponta a ponta, com estrutura JSON e redaction observadas
Metrics: remote write validado com sÃ©rie real; cobertura das sÃ©ries operacionais permanece parcial
Alerts: configuraÃ§Ã£o parcial, sem evidÃªncia de disparo/recebimento

### DevOps e infraestrutura

CI/CD: atendido nas execuÃ§Ãµes #43/#48
Ambientes: parcial
Deploy: atendido tecnicamente
Observabilidade: parcial

### Resultado geral

**PARCIAL â€” produÃ§Ã£o funcional e tecnicamente validada, com pendÃªncias de seguranÃ§a/LGPD e de entrega acadÃªmica/documental.** O deploy funcional nÃ£o representa aprovaÃ§Ã£o final, e a recuperabilidade de possÃ­veis dados pessoais no histÃ³rico pÃºblico permanece bloqueador real atÃ© a sanitizaÃ§Ã£o.

### PendÃªncias reais

- Confirmar a natureza dos dados e executar, mediante autorizaÃ§Ãµes separadas, a limpeza local e a publicaÃ§Ã£o do histÃ³rico sanitizado conforme `docs/SECURITY_DATA_REMOVAL.md`.
- Comprovar a meta acadÃªmica de 75% de coverage backend com o relatÃ³rio atual.
- Registrar a URL pÃºblica do frontend e manter as evidÃªncias de CI #43, CD #48, Sonar e Quality Gate.
- Validar backup/restauraÃ§Ã£o e destino off-site; PostgreSQL persistente, e-mail real e smoke tests jÃ¡ foram comprovados.
- Validar dashboards finais, sÃ©ries operacionais ainda nÃ£o observadas, alertas, SLO e retenÃ§Ã£o; a ingestÃ£o de mÃ©tricas e logs de produÃ§Ã£o jÃ¡ foi comprovada.
- Atualizar Wiki, requisitos, ADRs, URLs e trade-offs conforme o sistema real.
- Cumprir orientaÃ§Ãµes, prova de autoria, pÃ´ster/QR e participaÃ§Ã£o no Demo Day.

## Gates executados na baseline e validaÃ§Ãµes posteriores

| Gate | Resultado |
|---|---|
| `npm ci` (raiz) | **PASS** â€” CI #43 |
| `npm ci --prefix backend` | **PASS** â€” CI #43 |
| `npm ci --prefix frontend` | **PASS** â€” CI #43 |
| `npm run lint` | **PASS** â€” CI #43 |
| Testes backend | **PASS** â€” 163 testes no CI #43 |
| Cobertura backend | **PASS tÃ©cnico** no CI #43; meta acadÃªmica de 75% nÃ£o comprovada |
| Testes frontend | **PASS** â€” CI #43; contagem atual nÃ£o registrada nesta matriz |
| Cobertura frontend padrÃ£o | **PASS** â€” CI #43 |
| Cobertura frontend diagnÃ³stica (`--testTimeout=15000`) | EvidÃªncia histÃ³rica superada pelo **PASS** do comando oficial no CI #43 |
| Build frontend | **PASS** â€” artefato validado no CI #43 e implantado no Amplify pelo CD #48 |
| `npm audit --audit-level=high` | **PASS no critÃ©rio High/Critical** â€” CI #43 |
| `docker compose config --quiet` | **PASS sintÃ¡tico** |
| IntegraÃ§Ã£o/migrations local | **NÃƒO EXECUTADO** â€” Docker Engine indisponÃ­vel |
| IntegraÃ§Ã£o PostgreSQL no CI | **PASS** â€” CI #43 |
| CI remoto atual | **PASS** â€” CI #43 |
| CD remoto atual | **PASS** â€” CD Production #48 |
| SonarCloud / Quality Gate | **PASS** â€” CI #43; script sem issues abertas nos filtros `BLOCKER,CRITICAL` e `BLOCKER,HIGH` |
| Deploy backend | **PASS** via AWS Systems Manager â€” CD #48 |
| Deploy frontend | **PASS** no AWS Amplify â€” CD #48 |
| Smoke tests de produÃ§Ã£o | **PASS** â€” CD #48 |

## ObservaÃ§Ãµes de integridade

- A modificaÃ§Ã£o preexistente em `backend/tests/event-import.test.js` pertence ao usuÃ¡rio e nÃ£o foi alterada nesta auditoria.
- Os arquivos `.bak` rastreados em `backend/src/` sÃ£o duplicaÃ§Ãµes que devem ser revisadas antes de eventual remoÃ§Ã£o; nenhuma exclusÃ£o foi realizada.
- Nenhuma credencial foi solicitada, impressa ou gravada.
- Nesta revisÃ£o documental, nenhum deploy, mutaÃ§Ã£o de infraestrutura, alteraÃ§Ã£o de banco ou reescrita de histÃ³rico Git foi executado; as evidÃªncias de deploy registradas vieram do CD Production #48 jÃ¡ concluÃ­do.
- Os nÃºmeros de padrÃµes pessoais foram registrados apenas de forma agregada; nenhum valor da planilha foi reproduzido.
- A planilha operacional foi removida da Ã¡rvore atual em 04/09/2026, mas a limpeza do histÃ³rico nÃ£o foi executada.

## Fontes oficiais do critÃ©rio

- [The Portfolio Playbook â€” Portfolio](https://github.com/CatolicaSC-Portfolio/The-Portfolio-Playbook/blob/main/Portfolio.md)
- [Direcionamentos gerais](https://github.com/CatolicaSC-Portfolio/The-Portfolio-Playbook/blob/main/directions/portfolio-directions-GERAL.md)
- [Linha de projeto â€” Web Apps](https://github.com/CatolicaSC-Portfolio/The-Portfolio-Playbook/blob/main/directions/portfolio-directions-webapp.md)

As trÃªs fontes responderam `HTTP 200` em 04/09/2026 e foram confrontadas com esta baseline.
