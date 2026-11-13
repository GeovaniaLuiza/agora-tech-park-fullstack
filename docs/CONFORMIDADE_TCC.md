# Matriz de conformidade do TCC — Ágora Tech Park

Baseline técnica de 04/09/2026, com evidências de CI/CD e produção atualizadas em 18/09/2026 e homologação do dashboard consolidado de observabilidade em 23/09/2026. Esta matriz registra o estado observado antes das correções e as validações posteriores explicitamente identificadas. Ela não é evidência de aprovação acadêmica nem substitui resultados do GitHub Actions, SonarCloud, provedor de nuvem ou Grafana.

## Validação técnica de 05/10/2026 — Issue #37 / SEC-01

- **Arquivo sensível:** `frontend/imgs/Locatários Perini Business 2026.xlsx`.
- **Introdução:** commit `55faede`, mensagem "Tela de importar planilha de residentes no frontend".
- **Remoção da árvore atual:** commit `7af0840`, mensagem "chore: align AWS production architecture and CI validation".
- **Main atual: saneada quanto ao arquivo alvo.** A árvore atual de `origin/main` não contém mais o arquivo; isso não comprova a sanitização de todas as refs históricas.
- **Blob histórico identificado:** `54b236f1796d100c64259e54bfff3d43854005b5`.
- **Refs históricas de PR:** a auditoria de refs remotas confirmou que `55faede` continua alcançável, incluindo `refs/pull/8/head` até `refs/pull/29/head`.
- **SEC-01: pendente de confirmação server-side.** Em 12/11/2026, duas validações independentes em clones `--mirror` novos não encontraram mais `refs/pull/8/*`, o commit `55faede` nem o blob `54b236f1796d100c64259e54bfff3d43854005b5`. O fetch direto de `55faede` retornou `upload-pack: not our ref`, e o blob não apareceu em `git rev-list --all --objects`. Diante dessa evidência, não há indicação técnica atual para executar rewrite local. O GitHub Support foi acionado formalmente em 12/11/2026 pelo ticket `#4997778`. O encerramento formal permanece condicionado à confirmação do Support quanto a caches, garbage collection e eventuais objetos server-side residuais.

Este registro atualiza a evidência de segurança da matriz, preservando as demais validações e a baseline histórica. Nenhum conteúdo da planilha ou dado pessoal é reproduzido nesta validação.

## Legenda

- ✅ **IMPLEMENTADO E VALIDADO** — existe e foi verificado por execução ou consulta objetiva.
- 🟡 **IMPLEMENTADO, PENDENTE DE VALIDAÇÃO** — existe, mas depende de ambiente ou serviço indisponível.
- 🟠 **PARCIAL** — cobre apenas parte do requisito ou apresenta divergência.
- ⚪ **DOCUMENTADO / PLANEJADO** — há intenção ou documentação, sem implementação comprovada.
- 🔴 **AUSENTE / FALHANDO** — não existe, está incorreto ou falhou no gate aplicável.
- 👤 **PENDÊNCIA HUMANA** — exige participação, decisão ou credencial do grupo.
- ⚪ **NÃO APLICÁVEL / DECISÃO REGISTRADA** — item analisado, mas não constitui requisito técnico pendente ou foi substituído por decisão arquitetural validada.

## Resumo executivo

> Nota de vigência: este documento inclui evidências históricas e registros de conformidade anteriores. A arquitetura ativa de produção é EC2 Ubuntu 24.04 + Caddy + backend Node.js/Express + PostgreSQL 16 + GitHub Actions + OIDC + Systems Manager. Qualquer menção ao Amplify em CD Production #48 ou em evidências antigas é histórica e não representa a produção atual. Em 12/11/2026, duas validações independentes em clones mirror frescos não localizaram mais a ref histórica `refs/pull/8/*`, o commit `55faede` ou o blob alvo, e o GitHub recusou o fetch direto do commit com `not our ref`. A SEC-01 permanece aberta somente para confirmação formal do GitHub Support sobre caches e objetos server-side residuais.

**Decisão atual: PARCIAL — produção funcional e tecnicamente validada, com uma pendência externa de segurança/LGPD e uma lacuna acadêmica/metodológica de TDD ainda registrada.** Deploy, backend, frontend, API, health, PostgreSQL, e-mail, CI/CD, testes, Quality Gate, backup/restore e observabilidade essencial foram validados. A árvore atual está saneada quanto ao arquivo alvo e, em 12/11/2026, dois clones mirror independentes confirmaram que o commit `55faede` e o blob histórico não são mais alcançáveis pelas refs Git atualmente anunciadas nem fetcháveis diretamente pelo GitHub. Não há indicação técnica atual para rewrite local. A SEC-01 permanece aberta apenas até confirmação do GitHub Support sobre caches e objetos server-side residuais. A prova individual de autoria, as orientações obrigatórias, o pôster e as atividades acadêmicas de apresentação foram informados como concluídos.

Em 05/10/2026, o fechamento técnico da Issue #57 validou a observabilidade de produção com Grafana Cloud, Grafana Alloy, Prometheus e Loki, incluindo ingestão de métricas e logs, dashboard consolidado, alerta de indisponibilidade da API, entrega de notificação, SLO e retenção. Os quatro dashboards específicos, séries adicionais de host e alertas ainda não testados permanecem registrados como melhorias operacionais complementares, sem bloquear o atendimento do requisito acadêmico documentado.

O repositório mantém a arquitetura React + Vite, Express e PostgreSQL na produção atual, sem reintrodução do Amplify. Nenhuma mudança arquitetural foi aplicada nesta baseline além da consolidação documental.

## Conformidade técnica e acadêmica

| Requisito | Estado atual | Evidência objetiva | Lacuna / risco | Próxima ação mínima |
|---|---|---|---|---|
| Repositório GitHub público | ✅ IMPLEMENTADO E VALIDADO | API pública do GitHub: `GeovaniaLuiza/agora-tech-park-fullstack`, `visibility=public`, branch padrão `main` | A publicidade amplia o impacto do arquivo com possíveis dados pessoais | Tratar o incidente de privacidade antes de qualquer outra publicação |
| Histórico contínuo de commits | ✅ IMPLEMENTADO E VALIDADO | Em 10/11/2026, `git rev-list --count HEAD` registrou 261 commits; o histórico apresenta atividade em 40 datas distintas entre 03/08/2026 e 10/11/2026. `git shortlog -sne HEAD` identificou 254 commits associados à autora principal em duas identidades Git e 7 commits do Dependabot | A continuidade do histórico está comprovada; autoria individual e revisão humana por PR são avaliadas separadamente | Manter commits pequenos, rastreáveis e vinculados a alterações, testes ou decisões reais |
| Revisão por PR | ✅ IMPLEMENTADO E VALIDADO | O histórico Git comprova uso recorrente de Pull Requests e merges. No PR #145, outro integrante realizou revisão explícita pelo recurso de review do GitHub e registrou aprovação antes do merge, enquanto os 6 checks automatizados permaneceram aprovados | A evidência comprova revisão humana por pares em Pull Request; não implica que todos os PRs históricos tenham recebido revisão humana | Manter revisão por pares nos próximos PRs relevantes e preservar a evidência de aprovação no histórico do GitHub |
| Documentação essencial | ✅ IMPLEMENTADO E VALIDADO | `README.md`, `docs/ARCHITECTURE.md`, `docs/RFC.md`, `docs/REQUIREMENTS.md`, `docs/adr/`, `docs/CI_CD.md`, `docs/MONITORING.md` e `docs/QUALITY.md`; URLs atuais, arquitetura vigente e principais decisões/trade-offs estão documentados; `docs/README.md` funciona como índice navegável da documentação | Referências à arquitetura anterior são preservadas apenas como histórico quando aplicável | Manter a documentação atualizada conforme evolução da implantação e infraestrutura |
| Wiki ou equivalente navegável | ✅ IMPLEMENTADO E VALIDADO | `docs/README.md` funciona como índice navegável da documentação versionada no repositório, com 24 links locais verificados e nenhum link quebrado; o `README.md` principal referencia esse ponto de entrada | A GitHub Wiki permanece desabilitada, mas o requisito é atendido pelo equivalente navegável mantido junto ao código | Manter o índice e os links atualizados quando documentos forem criados, movidos ou removidos |
| Requisitos e casos de uso completos | ✅ IMPLEMENTADO E VALIDADO | `docs/REQUIREMENTS.md` documenta 9 RFs, 8 RNFs e 8 casos de uso, com critérios de aceite e matriz de rastreabilidade | RF-004, RF-005 e RF-007 possuem cobertura automatizada insuficiente, explicitada no documento | Manter a matriz de rastreabilidade alinhada à evolução do sistema |
| Arquitetura C4 ou equivalente | ✅ IMPLEMENTADO E VALIDADO | `docs/ARCHITECTURE.md` contém três diagramas Mermaid verificáveis: visão de contexto e visão de containers equivalentes ao C4, além da visão de deployment; componentes, ambientes e fluxos correspondem à produção validada | Nenhuma lacuna observada neste requisito | Manter os diagramas alinhados à arquitetura efetivamente implantada |
| ADRs / decisões arquiteturais | ✅ IMPLEMENTADO E VALIDADO | `docs/adr/` contém seis Architecture Decision Records aceitos e um índice, documentando decisões arquiteturais reais sobre separação frontend/backend, PostgreSQL, Caddy, CI/CD, e-mail e observabilidade | Nenhuma lacuna observada neste requisito | Manter os ADRs atualizados quando decisões arquiteturais relevantes forem alteradas |
| Referência acadêmica fornecida | ⚪ NÃO APLICÁVEL / DECISÃO REGISTRADA | Tese de Nancy V. Pérez, 2022, fornecida como material de apoio à auditoria | A referência pode ser utilizada como fundamentação acadêmica, mas não constitui requisito técnico, funcional ou evidência de implementação do sistema | Incorporar somente se for útil à fundamentação teórica, com autoria e referência bibliográfica completas |
| Link funcional público e estável | ✅ IMPLEMENTADO E VALIDADO | Frontend, API e health estão disponíveis em `https://agora-techpark.duckdns.org`; a arquitetura vigente usa EC2/Caddy na mesma origem, com evidências de deploy e smoke tests preservadas | Disponibilidade contínua futura depende da operação normal do ambiente produtivo, sem lacuna funcional observada na validação atual | Manter a URL pública documentada e preservar smoke checks periódicos |
| Frontend React + Vite | ✅ IMPLEMENTADO E VALIDADO | React 19.2.8 e Vite 8.2.2; job de testes/build e validação do artefato passou no CI #43; atualmente o frontend é servido pela EC2/Caddy na mesma origem da aplicação | As referências ao Amplify permanecem apenas como registro histórico da arquitetura anterior | Manter documentação alinhada à arquitetura atual EC2/Caddy |
| Backend Express | ✅ IMPLEMENTADO E VALIDADO | Express 5.2.1; CI #340, commit `3eca8be`, aprovou 69 arquivos e 749 testes backend; `agora-api.service` ativo e habilitado na EC2; API responde HTTP 200 | Meta acadêmica de coverage é avaliada separadamente | Preservar testes, health e serviço systemd |
| PostgreSQL 16 | ✅ IMPLEMENTADO E VALIDADO | PostgreSQL 16 em produção na EC2; `postgresql.service` ativo e habilitado; integração PostgreSQL validada no CI; exporter Alloy conectado; em 09/11/2026 foi executado restore lógico isolado de `pg_dump`, com 24 tabelas públicas restauradas e 22 migrations confirmadas, incluindo `022_user_session_version.sql` | Nenhuma lacuna crítica observada na restauração lógica executada; o teste foi realizado em banco temporário isolado e removido ao final | Manter integração, backups e testes periódicos de restauração |
| Migrações incrementais | ✅ IMPLEMENTADO E VALIDADO | `database/migrations/001...022`; runner único calcula SHA-256, usa lock e registra `schema_migrations`; em 10/11/2026 um banco DEV vazio foi criado via Docker Compose e recebeu com sucesso as 22 migrations; nova execução retornou `No pending migrations`, comprovando idempotência | Nenhuma lacuna funcional observada na validação atual | Manter o runner único e os testes de repetição/checksum |
| Seed separado e seguro | ✅ IMPLEMENTADO E VALIDADO | `database/seed.sql` contém apenas dados demonstrativos; não é executado automaticamente pelo Compose, CI/CD ou deploy. Em 10/11/2026 foi validado em banco DEV temporário com 22 migrations aplicadas; a primeira execução inseriu os dados esperados e a segunda retornou apenas `INSERT 0 0`, mantendo as mesmas contagens | As credenciais demonstrativas conhecidas permanecem aceitáveis somente em DEV/teste e não devem ser reutilizadas em produção | Manter execução manual e restrita a ambientes não produtivos |
| Instalação limpa da raiz | ✅ IMPLEMENTADO E VALIDADO | `npm ci`, lint e auditoria passaram no job `Lint and dependency audit` do CI #43 | Nenhuma falha de instalação observada nessa execução | Manter lockfile e job verde |
| Instalação limpa backend | ✅ IMPLEMENTADO E VALIDADO | `npm ci --prefix backend` e testes passaram no CI #43 | Nenhuma falha de instalação observada nessa execução | Manter lockfile consistente |
| Instalação limpa frontend | ✅ IMPLEMENTADO E VALIDADO | `npm ci --prefix frontend`, testes, coverage e build passaram no CI #43 | Nenhuma falha de instalação observada nessa execução | Manter lockfile consistente |
| Lint local | ✅ IMPLEMENTADO E VALIDADO | `npm run lint` concluiu localmente e no job `Lint and dependency audit` do CI #43 | Nenhuma lacuna observada nesta etapa | Manter o gate no CI |
| Testes unitários backend | ✅ IMPLEMENTADO E VALIDADO | CI #340, commit `3eca8be`: 69 arquivos de teste backend e 749 testes aprovados no job `Backend unit tests` | A aprovação integral da suíte atual não substitui a avaliação específica dos thresholds de coverage | Preservar e ampliar a suíte |
| Cobertura backend ≥ 75% | ✅ IMPLEMENTADO E VALIDADO | CI #340, commit `3eca8be`, executado após o merge do PR #155: 69 arquivos de teste backend e 749 testes aprovados; artifact `backend-coverage` gerado com sucesso. A validação anterior de 05/10/2026 registrou Statements 79.38%, Branches 75.83%, Functions 76.00% e Lines 84.04% | A execução atual confirma aprovação integral da suíte executada e preserva a geração do artifact de cobertura; os percentuais históricos permanecem como evidência quantitativa conhecida | Preservar o threshold e os artifacts de coverage gerados pelo CI |
| Testes unitários frontend | ✅ IMPLEMENTADO E VALIDADO | CI #340, commit `3eca8be`: 26 arquivos de teste frontend e 495 testes aprovados no job `Frontend tests and build`; artifact `frontend-coverage` gerado com sucesso | Nenhuma falha observada na suíte atual | Preservar a suíte e o artifact de coverage |
| Cobertura frontend ≥ 25% | ✅ IMPLEMENTADO E VALIDADO | CI #340, commit `3eca8be`: job `Frontend tests and build` aprovado, com 26 arquivos e 495 testes; artifact `frontend-coverage` gerado. O threshold acadêmico configurado permanece acima de 25% | Os percentuais exatos da execução #340 não foram transcritos para esta matriz | Preservar o threshold e anexar o relatório de coverage quando necessário |
| TDD verificável | 🟡 PARCIAL | O projeto possui ampla suíte automatizada, coverage acima dos thresholds acadêmicos e CI validado; o direcionamento Web Apps do Portfolio Playbook estabelece TDD e cobertura mínima de 75% no backend e 25% no frontend | Os thresholds de cobertura estão atendidos, porém o histórico disponível não permite comprovar integralmente ciclos teste-primeiro ao longo do desenvolvimento | Preservar os thresholds e demonstrar TDD de forma explícita nos próximos incrementos, com teste escrito antes da implementação |
| Três fluxos de negócio completos | ✅ IMPLEMENTADO E VALIDADO | Em 10/11/2026 foram validados manualmente em produção três fluxos ponta a ponta: autenticação e acesso ao Dashboard; importação de empresas residentes com validação, revisão, confirmação e atualização de indicadores; e importação de eventos com validação, preview, revisão, confirmação e atualização de indicadores | A validação comprova os três fluxos selecionados em produção; outros casos de uso possuem validações próprias | Preservar as evidências de demonstração e manter testes automatizados dos fluxos |
| CI no GitHub Actions | ✅ IMPLEMENTADO E VALIDADO | CI #340, commit `3eca8be`, concluído com sucesso em 13/11/2026: lint/dependency audit, backend unit tests, frontend tests/build, PostgreSQL integration tests e SonarQube Cloud Quality Gate aprovados | Execução atual sem falhas | Manter `main` protegida por CI verde |
| CD no GitHub Actions | ✅ IMPLEMENTADO E VALIDADO | CD Production #48 passou: backend via AWS Systems Manager, frontend no AWS Amplify e smoke tests de produção | A evidência comprova a execução #48, não disponibilidade contínua futura | Monitorar execuções e preservar rollback |
| AWS removida com segurança | ⚪ NÃO APLICÁVEL / DECISÃO REGISTRADA | A AWS permanece como infraestrutura de produção validada. EC2 e Systems Manager integram a arquitetura vigente; o Amplify foi utilizado apenas historicamente | A remoção da AWS não constitui pendência da arquitetura atual e não foi autorizada como migração; a infraestrutura produtiva vigente está validada | Manter a infraestrutura atual e reavaliar eventual migração somente mediante requisito, destino substituto e autorização |
| Cloudflare Pages como frontend | ⚪ NÃO APLICÁVEL / DECISÃO REGISTRADA | Cloudflare Pages foi considerada como alternativa de hospedagem, mas a arquitetura vigente utiliza EC2/Caddy na mesma origem, já validada em produção | A alternativa não adotada não constitui lacuna de conformidade; a decisão arquitetural vigente prioriza hospedagem controlável e integração same-origin | Manter EC2/Caddy enquanto permanecer a arquitetura aprovada; reavaliar somente diante de novo requisito arquitetural |
| SonarCloud configurado | ✅ IMPLEMENTADO E VALIDADO | Job `SonarQube Cloud Quality Gate` passou no CI #43 | Resultado refere-se à execução validada | Manter token, projeto e gate operacionais |
| Quality Gate aprovado | ✅ IMPLEMENTADO E VALIDADO | Quality Gate passou no CI #43, após os jobs de qualidade, testes, build e integração | Aprovação acadêmica final não decorre automaticamente do gate | Preservar o bloqueio do pipeline por Quality Gate |
| DEV separado de produção | ✅ IMPLEMENTADO E VALIDADO | Ambiente DEV validado localmente em 10/11/2026: PostgreSQL 16 via Docker Compose na porta 5435, backend Express na porta 3002, frontend Vite na porta 5174 e provider de e-mail `mock`; health retornou `status=ok`, `api=up`, `database=up`, `email=up`, e o frontend respondeu HTTP 200 | Nenhuma lacuna funcional observada na separação DEV/PROD | Manter variáveis e infraestrutura DEV isoladas da produção |
| PROD separado de DEV | ✅ IMPLEMENTADO E VALIDADO | Produção validada em AWS EC2/Caddy, PostgreSQL 16 e configuração própria, distinta do ambiente DEV local | STAGING não é requisito identificado em `docs/REQUIREMENTS.md` e não integra a arquitetura atual | Manter produção isolada do DEV e documentar novos ambientes somente quando houver requisito explícito |
| Deploy público em nuvem | ✅ IMPLEMENTADO E VALIDADO | Atualmente frontend e backend são publicados conjuntamente na AWS EC2/Caddy; como evidência histórica, o CD Production #48 implantou backend via Systems Manager e frontend no AWS Amplify e concluiu smoke tests | A evidência histórica do #48 não representa disponibilidade contínua futura | Manter a URL pública atual documentada e preservar validação pós-deploy |
| HTTPS público | ✅ IMPLEMENTADO E VALIDADO | `caddy.service` ativo e habilitado; Caddy serve `https://agora-techpark.duckdns.org/api` e `/api/health` por HTTPS; endpoint respondeu HTTP 200 | Nenhuma lacuna observada na validação informada | Monitorar certificado e disponibilidade |
| Observabilidade | ✅ IMPLEMENTADO E VALIDADO no escopo da Issue #57 | Ingestão Prometheus/Loki via Alloy comprovada em 18/09/2026; dashboard consolidado homologado em 23/09/2026; métricas e logs chegando ao Grafana Cloud, alerta da API, entrega de notificação, SLO e retenção validados em 05/10/2026 | Quatro dashboards específicos e demais séries e alertas não foram validados integralmente | Preservar as evidências e validar separadamente os itens complementares |
| Grafana Cloud recebendo dados | ✅ IMPLEMENTADO E VALIDADO | Em 18/09/2026, Explore exibiu CPU do processo via Prometheus e logs da API via Loki; em 23/09/2026, os datasources `grafanacloud-bluegerbil2886-prom` e `grafanacloud-bluegerbil2886-logs` exibiram dados reais no dashboard consolidado | Nenhuma lacuna de ingestão observada nessas validações; alertas são avaliados separadamente | Preservar evidências sem expor credenciais e monitorar continuidade da ingestão |
| Logs estruturados e redaction | ✅ IMPLEMENTADO E VALIDADO | Pino em journald; Alloy filtra somente `agora-api.service`; Loki recebeu JSON com `application="agora-tech-park"`, `environment="production"`, `service="agora-api"` e redaction `[REDACTED]` | A validação comprova o fluxo e uma ocorrência de redaction, não todas as variações possíveis de dados sensíveis | Manter testes de regressão da redaction e o filtro da unit |
| Métricas HTTP/latência/erros | ✅ IMPLEMENTADO E VALIDADO | Em 23/09/2026, o dashboard consolidado exibiu requests por minuto, latência média/p95 e painel de HTTP 5xx; o painel de 5xx exibiu `0 req/s`, coerente com a ausência de erros no período observado | Não foi provocado erro HTTP 5xx real; esse teste adicional não integra o requisito acadêmico mínimo de observabilidade documentado | Manter a coleta e, como melhoria operacional, validar cenário controlado de 5xx quando conveniente |
| Métricas CPU/memória/disco | ✅ ATENDIDO NO ESCOPO ACADÊMICO | CPU do processo Node e memória RSS foram observadas no Grafana em 18/09/2026 e 23/09/2026; a infraestrutura de métricas Prometheus/Alloy permanece operacional | Não há evidência de teste específico de disco nem de alerta explícito de RAM; esses itens permanecem como melhorias operacionais complementares, não como bloqueadores do requisito acadêmico documentado | Preservar CPU/memória e evoluir métricas de host/disco conforme necessidade operacional |
| Health/liveness/readiness | ✅ IMPLEMENTADO E VALIDADO | `/api/health`, `/live`, `/ready`; readiness retorna 503 quando o banco crítico falha; health local e `https://agora-techpark.duckdns.org/api/health` retornaram 200; smoke de produção passou | Nenhuma lacuna funcional observada nos checks executados | Manter monitoramento e smoke pós-deploy |
| Alertas operacionais | ✅ IMPLEMENTADO E VALIDADO para indisponibilidade da API (Issue #57) | `Agora API unavailable` testado em 05/10/2026: `Normal -> Pending -> Alerting`, notificação `Firing` e `Delivery outcome: Delivered successfully` no contact point `agora-production-email`; após restauração, `Alerting -> Normal` e notificação `Resolved` | Demais regras versionadas para banco, sintético, 5xx, CPU e disco sem teste comprovado; RAM do processo Node, latência e e-mail continuam incompletos ou sem validação | Manter o alerta validado e testar separadamente as demais regras |
| SLO de disponibilidade | ✅ IMPLEMENTADO E VALIDADO | `Agora API availability`, target 99%, janela de 28 dias, SLI baseado em `up`; em 05/10/2026, 28d SLI observado de 100.0% e Remaining error budget de 100% | A janela configurada do SLO não comprova 28 dias completos de histórico retido | Acompanhar SLI e orçamento de erro |
| Retenção de observabilidade | ✅ IMPLEMENTADO E VALIDADO | Grafana Cloud Free: métricas Prometheus e logs Loki com retenção de 14 dias, validada em 05/10/2026 | Retenção de 14 dias distinta da janela de 28 dias do SLO | Acompanhar retenção e limites do plano |
| Backup e recuperação | ✅ IMPLEMENTADO E VALIDADO | Dumps PostgreSQL locais existem em `/opt/agora/backups`; todos os arquivos existentes passaram em `gzip -t`; AWS Backup protege o EBS de produção diariamente com retenção de 14 dias; backup on-demand e restauração para novo volume EBS foram concluídos com sucesso; em 09/11/2026 o dump lógico do deploy `c36fe84f3a7041559352d26c4680e2a4a48737fe` foi restaurado em banco temporário isolado, com 24 tabelas públicas e 22 migrations verificadas, seguido da remoção do banco temporário | O restore lógico foi validado sem substituir ou alterar o banco de produção; o teste não representa o RTO completo da aplicação | Manter o plano AWS Backup e repetir periodicamente os testes de restauração lógica e de infraestrutura |
| Smoke tests | ✅ IMPLEMENTADO E VALIDADO | No CD #48, `scripts/smoke-test.mjs` validou HTTP 200 do health, status `ok`/`degraded`, banco `up`, HTTP 200 do frontend após redirects e HTML com `<!doctype html>` | Não há evidência de que `SMOKE_EMAIL` e `SMOKE_PASSWORD` estavam presentes no #48; sem ambos, o script ignora o login. O script não testa CORS | Registrar se o login foi executado e adicionar check de CORS se exigido |
| Segurança de aplicação | ✅ IMPLEMENTADO E VALIDADO | Helmet, CORS, JWT, rate limit, Zod, queries parametrizadas e auditoria de dependências High/Critical aprovada no CI; em 10/11/2026 foram validados no GitHub o Dependency graph, Dependabot alerts, Dependabot security updates, Secret Protection e Push protection | A SEC-01/LGPD histórica é tratada separadamente; em 12/11/2026 o objeto histórico deixou de ser reproduzível em dois clones mirror frescos, restando confirmação formal do GitHub Support quanto a caches/objetos server-side | Manter controles ativos, preservar auditorias no CI e revisar alertas de dependências e secrets continuamente |
| Dados pessoais/LGPD no repositório | 🟡 PARCIAL — SEC-01 pendente de confirmação server-side | A árvore atual está saneada quanto ao arquivo alvo. Em 12/11/2026, dois clones mirror novos não localizaram `refs/pull/8/*`, o commit `55faede` nem o blob `54b236f1796d100c64259e54bfff3d43854005b5`; o fetch direto do commit retornou `upload-pack: not our ref` e `git rev-list --all --objects` não encontrou o blob. O GitHub Support foi acionado no ticket `#4997778` em 12/11/2026 | A exposição histórica não é mais reproduzível pelas refs Git atualmente anunciadas, porém ainda não há confirmação formal do GitHub Support sobre caches, garbage collection e objetos server-side residuais | Aguardar resposta formal do ticket `#4997778` e encerrar a SEC-01 somente após confirmação do GitHub Support |
| Metadados pessoais em artefatos | ✅ IMPLEMENTADO E VALIDADO | Na árvore atual rastreada pelo Git foram verificados três artefatos Office: `docs/plataforma_de_indicadores.docx` e `frontend/imgs/Indicadores Rede de Centros de Inovação 2026_Joinville.xlsx` não possuem `docProps/core.xml`; `frontend/imgs/estatisticas.xlsx` possuía `lastModifiedBy` e teve esse metadado removido em 10/11/2026, com verificação posterior de `creator` e `lastModifiedBy` vazios | A validação cobre os artefatos Office atualmente rastreados; novos arquivos devem ser verificados antes da publicação | Manter verificação de metadados em novos DOCX/XLSX/PPTX adicionados ao repositório |
| E-mail transacional | ✅ IMPLEMENTADO E VALIDADO | Gmail SMTP via Nodemailer validado em produção; `nodemailer.verify()` e envio real passaram; health reporta `email="up"`; DEV/test usam provider mock sem SMTP externo | Nenhuma lacuna funcional observada na validação informada | Monitorar entrega e manter secrets fora dos logs |
| Secrets fora do código | ✅ IMPLEMENTADO E VALIDADO | `.gitignore`, `.env.example`, validação de ambiente e ausência de `.env` real rastreado na árvore atual; `SONAR_TOKEN` armazenado como GitHub Actions Secret; variáveis não sensíveis separadas em GitHub Variables; Secret Protection e Push protection habilitados em 10/11/2026 | A validação comprova a configuração atual; a SEC-01 histórica permanece tratada separadamente | Manter secrets apenas em mecanismos próprios do ambiente e preservar Secret Protection/Push protection ativos |
| Autoria individual | ✅ CONCLUÍDO / ATENDIDO | O histórico Git registra 163 commits autorais sem merges pelo filtro `--author="Geovania"` e contribuições em backend, frontend, testes, documentação, CI/CD, deploy e scripts. A prova/apresentação individual foi informada pela responsável como realizada e concluída | A evidência técnica permanece preservada no repositório; eventuais registros acadêmicos formais devem ser mantidos no meio institucional apropriado | Preservar commits, PRs e demais comprovantes da prova de autoria |
| Orientações obrigatórias | ✅ CONCLUÍDO / ATENDIDO | As orientações obrigatórias foram informadas pela responsável como realizadas e concluídas | Os comprovantes acadêmicos não precisam necessariamente estar versionados no repositório | Preservar atas, pautas ou demais comprovantes no meio institucional apropriado |
| Pôster PDF com QR code | ✅ IMPLEMENTADO E VALIDADO | Pôster final em PDF A0 vertical validado quanto às dimensões, estrutura, conteúdo e QR Code funcional para acesso à aplicação pública | Alguns rótulos internos dos diagramas utilizam 18–19 pt, mas o conteúdo principal permanece legível e o pôster atende ao conjunto dos requisitos essenciais do guia oficial | Preservar a versão final do PDF e realizar teste do QR antes da apresentação |
| Demo Day e avaliações | ✅ CONCLUÍDO / ATENDIDO | A responsável informou em 13/11/2026 que as atividades acadêmicas correspondentes ao pôster, Demo Day e avaliações já foram realizadas e concluídas; o calendário anteriormente registrado indicava 10, 15 e 16/12/2026 | Há divergência entre o calendário originalmente registrado e a conclusão informada; não inferir data efetiva de realização sem comprovante | Preservar os registros acadêmicos e evidências da participação |

## CI/CD — resultado de aceite

**CI: PASS.** A execução CI #340, commit `3eca8be`, concluiu com sucesso os jobs `Lint and dependency audit`, `Backend unit tests`, `Frontend tests and build`, `PostgreSQL integration tests` e `SonarQube Cloud Quality Gate`.

**CD: PASS.** A execução CD Production #48 implantou o backend na AWS EC2 via Systems Manager, publicou o frontend no AWS Amplify e concluiu os smoke tests de produção.

| Etapa | Configurada | Execução bem-sucedida atual |
|---|---:|---:|
| Execução automática de CI | Sim | Sim — CI #340, commit `3eca8be` |
| Lint | Sim | Sim — CI #43 |
| Testes backend | Sim | Sim — CI #340: 69 arquivos e 749 testes aprovados |
| Testes frontend | Sim | Sim — CI #340: 26 arquivos e 495 testes aprovados |
| Coverage | Sim | Sim — CI #43 como evidência histórica; backend validado localmente em 05/10/2026 com 75% atendidos nas quatro métricas |
| Audit | Sim | Sim — critério High/Critical no CI #43 |
| Build | Sim | Sim — artefato validado no CI #43 e implantado pelo CD #48 |
| Sonar | Sim | Sim — CI #43 |
| Quality Gate bloqueando deploy | Sim, por dependência entre jobs | Sim — PASS no CI #43 |
| Critical/High bloqueando produção | Sim, por `check-sonar-quality.mjs` | Sim — no CI #43, o script aprovou o Quality Gate e não encontrou issues abertas nos filtros legados `BLOCKER,CRITICAL` nem MQR `BLOCKER,HIGH` |
| Deploy automático | Condicional | Sim — CD Production #48 |
| Health check pós-deploy | Configurado no CD AWS | Sim — CD #48 e URL pública HTTP 200 |
| Smoke test pós-deploy | Configurado no CD AWS | Sim — CD #48 |

## Inventário de ambientes

### DEV

| Componente | Estado real |
|---|---|
| Frontend | Vite em `http://localhost:5174`; executado fora do Compose |
| Backend | Express com fallback local em `http://localhost:3002`; executado fora do Compose |
| Database | PostgreSQL 16 via Docker Compose, porta local 5435 e volume `postgres_data`; ambiente recriado do zero e validado em 10/11/2026 |
| Email | Provider mock controlado por padrão, sem SMTP externo; o Compose não provisiona serviço de e-mail |
| Observability | Logs Pino e endpoint Prometheus implementados; backend DEV validado em 10/11/2026 com health operacional |

### PROD

| Componente | Estado real |
|---|---|
| Frontend | Atualmente servido pela EC2/Caddy em `https://agora-techpark.duckdns.org`; o CD Production #48 permanece como evidência histórica da implantação anterior no AWS Amplify |
| Backend | Implantado na AWS EC2; `agora-api.service` ativo e habilitado; releases em `/opt/agora/releases` e symlink `/opt/agora/current`; API pública responde HTTP 200 |
| Database | PostgreSQL 16 em produção na EC2; `postgresql.service` ativo e habilitado; integração CI e conexão do exporter validadas |
| Backup | AWS Backup configurado para o EBS de produção, com execução diária e retenção de 14 dias; backup on-demand e restore para volume EBS isolado validados com sucesso |
| HTTPS | `caddy.service` ativo e habilitado; API e health públicos servidos por HTTPS |
| Email | Gmail SMTP via Nodemailer validado com `verify()`, envio real e health `email="up"` |
| Observability | Alloy 1.19.2; `alloy.service` ativo e habilitado na EC2; remote write Prometheus e envio Loki validados em 18/09/2026; dashboard consolidado homologado em 23/09/2026; em 05/10/2026, métricas e logs chegando ao Grafana Cloud, alerta da API e entrega de notificação, SLO e retenção validados; produção restaurada após teste controlado; quatro dashboards específicos e demais alertas continuam sem validação final |

Separação DEV/PROD: **IMPLEMENTADA E VALIDADA**. Em 10/11/2026, o DEV foi recriado e validado localmente com PostgreSQL 16 via Docker Compose, migrations 001–022, backend Express em `localhost:3002`, frontend Vite em `localhost:5174` e provider de e-mail `mock`. O health retornou `status=ok`, com API, banco e e-mail disponíveis, e o frontend respondeu HTTP 200. A produção permanece separada em AWS EC2/Caddy, PostgreSQL 16 e Gmail SMTP. Nenhum requisito de STAGING foi identificado em `docs/REQUIREMENTS.md`; por isso ele não é tratado como pendência de conformidade.

## URLs funcionais

```text
APPLICATION_URL=https://agora-techpark.duckdns.org
API_URL=https://agora-techpark.duckdns.org/api
HEALTH_URL=https://agora-techpark.duckdns.org/api/health
GRAFANA_URL=
```

A API, o health e o frontend atuais usam a mesma origem pública `https://agora-techpark.duckdns.org` via EC2/Caddy. Como evidência histórica, o frontend implantado anteriormente no Amplify passou no smoke test do CD #48. **DEPLOY TÉCNICO: ATENDE. DOCUMENTAÇÃO DAS URLs: ATENDE.**

## Coverage técnico versus acadêmico

### Backend

| Métrica | Resultado local de 05/10/2026 | Threshold exigido | Status |
|---|---:|---:|---:|
| Statements | 79.38% | 75% | APROVADO |
| Branches | 75.83% | 75% | APROVADO |
| Functions | 76.00% | 75% | APROVADO |
| Lines | 84.04% | 75% | APROVADO |

Validação final local em 05/10/2026 com `npm run test:coverage --prefix backend`: **Test Files: 45 passed; Tests: 357 passed**. O threshold atual exigido é 75% em Statements, Branches, Functions e Lines, atendido nas quatro métricas. `repository-postgres-lot6.test.js`: 8 testes aprovados com PostgreSQL real. Migrations: sem pendências na validação local. Esta evidência supera a baseline de cobertura backend de 04/09/2026 e não representa uma nova execução de CI ou Sonar. **Status acadêmico: ATENDIDO quanto à cobertura backend.**

### Frontend

| Métrica | Resultado diagnóstico da baseline | Threshold técnico | Meta acadêmica |
|---|---:|---:|---:|
| Statements | 58,76% | 55% | 25% |
| Branches | 54,81% | 50% | 25% não confirmado por métrica |
| Functions | 45,95% | 40% | 25% não confirmado por métrica |
| Lines | 70,07% | 65% | 25% |

Os valores quantitativos acima foram obtidos na baseline com timeout diagnóstico de 15 segundos. Posteriormente, o comando oficial `npm run test:coverage --prefix frontend` passou no CI #43 e os thresholds técnicos configurados são superiores à meta acadêmica de 25%. **Status acadêmico: ATENDIDO quanto à coverage frontend.**

## Observabilidade — evidência funcional

| Item | Situação |
|---|---|
| Dashboard | `Agora Tech Park - Production Overview` (UID `agora-production-overview`) importado e homologado no Grafana Cloud em 23/09/2026; quatro dashboards específicos versionados sem validação final |
| URL | URL não registrada na matriz; acesso ao Grafana Cloud Explore validado em 18/09/2026 |
| Alloy | Versão 1.19.2 na EC2 Ubuntu 24.04; `alloy.service` ativo, habilitado no systemd e configuração aprovada por `alloy validate`; sem novos erros no journal após a correção da autenticação |
| Datasource | Prometheus `grafanacloud-bluegerbil2886-prom` e Loki `grafanacloud-bluegerbil2886-logs` validados com dados reais no dashboard em 23/09/2026; `DS_LOKI` filtra fontes terminadas em `-logs` e exclui a fonte de histórico de alertas |
| Últimos dados recebidos | Em 23/09/2026, dashboard exibiu API e PostgreSQL `UP`, requests, latência média/p95, CPU e memória RSS do processo Node, conexões `active`, `idle` e `unknown`, e logs Pino reais no Loki |
| Painéis sem erros | Em 23/09/2026, Erros HTTP 5xx exibiu `0 req/s` e Erros nos logs (5 min) exibiu linha em zero na ausência de registros Pino com `level >= 50`; fallback `vector(0)` validado operacionalmente, sem teste real de falha |
| Logs | Consulta `{service="agora-api"}` validada; em 23/09/2026, painel mostrou logs Pino estruturados reais no Loki, inclusive registros com `level` 30, sem reproduzir conteúdo dos logs |
| PostgreSQL exporter | Conexão estabelecida com PostgreSQL 16.15.0; usuário dedicado de observabilidade com `pg_monitor`, sem privilégios administrativos da aplicação |
| API / Application / Infrastructure / PostgreSQL | Dashboard consolidado operacional com métricas reais da API e PostgreSQL e logs da aplicação; quatro dashboards específicos e demais séries de infraestrutura não foram validados integralmente |
| Alertas mínimos | ✅ VALIDADO em 05/10/2026: `Agora API unavailable`; query `last_over_time(up{job="prometheus.scrape.agora_api"}[5m])`, condição `IS BELOW 1`, evaluation interval `1m`, pending period `1m`, contact point `agora-production-email`; demais alertas de banco, HTTP 5xx, CPU e disco sem teste comprovado |
| Entrega de notificação | ✅ VALIDADA: notificação `Firing` gerada e Grafana registrou `Delivery outcome: Delivered successfully`; após recuperação, notificação `Resolved` gerada |
| Teste operacional controlado | ✅ VALIDADO: interrupção temporária de `agora-api.service`, `Normal -> Pending -> Alerting`; serviço e produção restaurados, `Alerting -> Normal` |
| SLO | ✅ VALIDADO: `Agora API availability`, target 99%, janela 28 dias, SLI baseado na métrica Prometheus `up`; labels `team_name=agora-tech-park`, `service_name=agora-api`, `environment=production`; 28d SLI observado 100.0% e Remaining error budget 100% em 05/10/2026 |
| Retenção | ✅ VALIDADA no Grafana Cloud Free: métricas Prometheus 14 dias e logs Loki 14 dias; a janela do SLO é distinta da retenção, e o SLI observado não comprova 28 dias completos de histórico retido |
| Alertas adicionais | RAM, latência e falhas de e-mail incompletos ou sem validação |

Arquitetura validada em 18/09/2026: Node/Express `/metrics` → Grafana Alloy → Grafana Cloud Prometheus; Pino/journald → Grafana Alloy → Grafana Cloud Loki; PostgreSQL exporter → Grafana Alloy → Grafana Cloud Prometheus.

Em 23/09/2026, foram realizadas capturas de tela manuais do Grafana Cloud com API e PostgreSQL `UP`, requests, latência, conexões PostgreSQL, logs Pino no Loki, painéis de 5xx e erros nos logs em zero e datasources Prometheus e Loki selecionados corretamente. Nenhuma captura foi incorporada ou versionada nesta matriz.

## Checklist da demonstração em produção

Os itens abaixo permanecem como roteiro de apresentação presencial; uma validação técnica automatizada não marca, por si só, a demonstração acadêmica como concluída.

- [ ] Abrir aplicação pública.
- [ ] Executar login.
- [ ] Navegar pelo dashboard.
- [ ] Demonstrar funcionalidade principal.
- [ ] Consultar PostgreSQL por meio da aplicação.
- [ ] Demonstrar integração frontend/backend.
- [ ] Demonstrar CI/CD verde.
- [ ] Mostrar SonarCloud.
- [ ] Mostrar Quality Gate aprovado.
- [ ] Mostrar Grafana com dados recentes.
- [ ] Mostrar health público.
- [ ] Demonstrar e-mail real, quando aplicável.

## Matriz final de requisitos de entrega

Esta é a tabela de aceite restrita aos três estados solicitados. Um requisito configurado, mas sem evidência funcional, não recebe `ATENDIDO`.

| Requisito | Evidência | Status |
|---|---|---|
| Repositório público | GitHub público `GeovaniaLuiza/agora-tech-park-fullstack` | ✅ ATENDIDO |
| Histórico de commits | 261 commits distribuídos em 40 datas entre 03/08/2026 e 10/11/2026; continuidade do desenvolvimento comprovada | ✅ ATENDIDO |
| Link funcional | Frontend, API e health públicos via HTTPS na mesma origem `https://agora-techpark.duckdns.org` | ✅ ATENDIDO |
| Produção pública | Frontend e backend atualmente publicados na EC2/Caddy; CD #48 e smoke tests permanecem como evidência histórica da arquitetura anterior | ✅ ATENDIDO |
| Arquitetura documentada | `docs/ARCHITECTURE.md` com diagramas Mermaid de contexto, containers e deployment equivalentes ao C4 e coerentes com a produção validada | ✅ ATENDIDO |
| Wiki junto ao repositório | `docs/README.md` fornece índice navegável da documentação versionada, referenciado pelo `README.md` principal; 24 links locais foram validados sem destinos quebrados | ✅ ATENDIDO |
| Requisitos, casos de uso e decisões | `docs/REQUIREMENTS.md`, `docs/adr/` e `docs/RFC.md` | ✅ ATENDIDO |
| Três fluxos de negócio completos | Autenticação, importação de residentes e importação de eventos validadas ponta a ponta em produção em 10/11/2026, incluindo confirmação das importações e atualização dos indicadores | ✅ ATENDIDO |
| TDD | O direcionamento Web Apps do Portfolio Playbook exige TDD. O projeto possui testes automatizados, coverage acima dos thresholds acadêmicos e CI validado, porém o histórico disponível não comprova integralmente ciclos teste-primeiro ao longo do desenvolvimento | NÃO ATENDIDO |
| CI | CI #340, commit `3eca8be`, passou em lint/dependency audit, backend unit tests, frontend tests/build, PostgreSQL integration tests e SonarQube Cloud Quality Gate | ✅ ATENDIDO |
| CD | CD Production #48 implantou backend/frontend e concluiu smoke tests | ✅ ATENDIDO |
| DEV separado | PostgreSQL local via Docker Compose, backend em 3002 e frontend em 5174 validados em 10/11/2026; health `ok` e frontend HTTP 200 | ✅ ATENDIDO |
| PROD separado | Produção AWS distinta do DEV validada, com configuração, banco e runtime próprios | ✅ ATENDIDO |
| Deploy fora de localhost | Frontend e backend na EC2/Caddy; aplicação pública validada | ✅ ATENDIDO |
| HTTPS | Caddy e endpoints públicos HTTPS validados | ✅ ATENDIDO |
| PostgreSQL persistente | PostgreSQL 16 ativo e habilitado na EC2; integração CI e exporter validados | ✅ ATENDIDO |
| Sonar | Job SonarQube Cloud passou no CI #43 | ✅ ATENDIDO |
| Quality Gate | Execução PASS no CI #43 | ✅ ATENDIDO |
| Observabilidade | Dashboard consolidado homologado em 23/09/2026; Grafana Cloud, Alloy, Prometheus e Loki com métricas e logs recebidos, alerta da API e entrega de notificação, SLO e retenção validados em 05/10/2026 (Issue #57); itens complementares permanecem registrados separadamente | ✅ ATENDIDO no escopo da Issue #57 |
| Alertas e entrega de notificação | `Agora API unavailable`: teste controlado com `Firing`, entrega registrada como `Delivered successfully`, recuperação e `Resolved`; produção restaurada | ✅ ATENDIDO para indisponibilidade da API |
| SLO | `Agora API availability`: target 99%, janela 28 dias, SLI `up`, 28d SLI observado 100.0% e orçamento restante 100% | ✅ ATENDIDO |
| Retenção de observabilidade | Grafana Cloud Free: Prometheus 14 dias e Loki 14 dias | ✅ ATENDIDO |
| Grafana | `Agora Tech Park - Production Overview` importado e homologado no Grafana Cloud em 23/09/2026, com dados reais de Prometheus e Loki; os quatro dashboards específicos permanecem como artefatos complementares sem validação final | ✅ ATENDIDO |
| Logs | Pino/journald → Alloy → Loki validado, com JSON, labels e redaction observados | ✅ ATENDIDO |
| Métricas | Requests, latência média/p95, CPU/memória RSS do processo e PostgreSQL foram observados no dashboard em 23/09/2026; séries adicionais de host/disco permanecem complementares | ✅ ATENDIDO |
| Health Check | HTTP 200 local e em `https://agora-techpark.duckdns.org/api/health`; smoke #48 e Loki confirmaram o fluxo | ✅ ATENDIDO |
| Backup | `pg_dump` local existente e AWS Backup diário do EBS de produção com retenção de 14 dias; backup on-demand e restore para novo volume EBS concluídos com sucesso | ✅ ATENDIDO |
| Segurança e LGPD | Controles de aplicação presentes; árvore atual saneada; em 12/11/2026 dois clones mirror frescos não localizaram mais a ref histórica, o commit ou o blob alvo, e o fetch direto retornou `not our ref`; GitHub Support acionado no ticket `#4997778`; SEC-01 permanece pendente apenas de confirmação formal sobre caches/objetos server-side | NÃO ATENDIDO |
| Backend coverage acadêmico | CI #340 confirmou 69 arquivos de teste e 749 testes backend aprovados, com artifact `backend-coverage` gerado; a validação quantitativa histórica de 05/10/2026 permanece em Statements 79.38%, Branches 75.83%, Functions 76.00% e Lines 84.04%, acima do threshold de 75% nas quatro métricas | ✅ ATENDIDO |
| Frontend coverage acadêmico | CI #340 confirmou 26 arquivos e 495 testes frontend aprovados, com artifact `frontend-coverage` gerado e threshold acadêmico configurado acima de 25% | ✅ ATENDIDO |

## Conformidade — requisitos de entrega

### Repositório

Status: `ATENDIDO` quanto à visibilidade; privacidade/LGPD em `NÃO ATENDIDO`.
URL: `https://github.com/GeovaniaLuiza/agora-tech-park-fullstack`

### Aplicação, backend e health

Status técnico: `ATENDIDO`; registro completo de URLs: `ATENDIDO`
Application URL: https://agora-techpark.duckdns.org
Backend URL: `https://agora-techpark.duckdns.org/api`
Health URL: `https://agora-techpark.duckdns.org/api/health`

### CI/CD

CI: `PASS` — execução #340, commit `3eca8be`
CD: `PASS` — CD Production #48
Últimas execuções validadas: CI #340, commit `3eca8be`, e CD Production #48

### Ambientes

DEV: `ATENDIDO`
PROD: `ATENDIDO`
STAGING: `NÃO EXIGIDO PELOS REQUISITOS DOCUMENTADOS`

### Sonar

Quality Gate: `PASS` no CI #340, commit `3eca8be`
Critical/High: `check-sonar-quality.mjs` passou no CI #43 sem issues abertas nos filtros legados `BLOCKER,CRITICAL` e MQR `BLOCKER,HIGH`; o audit de dependências High/Critical também passou
Coverage backend: validado localmente em 05/10/2026; Statements 79.38%, Branches 75.83%, Functions 76.00%, Lines 84.04%; threshold de 75% atendido nas quatro métricas (evidência local, sem nova validação Sonar)
Coverage frontend: comando oficial passou com thresholds superiores a 25%

### Observabilidade

Grafana: dashboard consolidado homologado em 23/09/2026 com Prometheus e Loki; quatro dashboards específicos sem validação final
Logs: fluxo de produção validado ponta a ponta, com estrutura JSON e redaction observadas
Metrics: requests, latência, CPU/memória RSS do processo e PostgreSQL observados; demais séries operacionais permanecem parciais
Alerts: `Agora API unavailable` validado em 05/10/2026, com `Firing`, entrega registrada como `Delivered successfully`, recuperação e `Resolved`; demais alertas sem teste comprovado
SLO: `Agora API availability` validado, target 99%, janela 28 dias, SLI baseado em `up`, 28d SLI observado 100.0% e Remaining error budget 100%
Retenção: validada no Grafana Cloud Free, Prometheus 14 dias e Loki 14 dias
Teste operacional: controlado, com interrupção temporária de `agora-api.service`; serviço e produção restaurados

### DevOps e infraestrutura

CI/CD: atendido nas execuções #43/#48
Ambientes: atendido
Deploy: atendido tecnicamente
Observabilidade: atendida no escopo da Issue #57 em 05/10/2026; dashboards específicos, demais séries e alertas complementares permanecem sem validação integral

### Resultado geral

**PARCIAL — produção funcional e tecnicamente validada, com uma pendência externa de segurança/LGPD e uma lacuna acadêmica/metodológica de TDD ainda registrada.** A exposição histórica da SEC-01 não foi reproduzida em duas validações independentes com clones mirror frescos em 12/11/2026: a ref `refs/pull/8/*`, o commit `55faede` e o blob alvo não estavam disponíveis, e o GitHub recusou o fetch direto do commit com `not our ref`. Não há indicação técnica atual para rewrite local. A SEC-01 permanece aberta somente até confirmação formal do GitHub Support sobre caches e objetos server-side residuais. A prova individual de autoria, as orientações obrigatórias, o pôster e as atividades acadêmicas de apresentação foram informados como concluídos. Permanece registrada a lacuna metodológica de TDD.

### Pendências reais

- Issue #37 / SEC-01: em 12/11/2026, duas validações independentes em clones mirror frescos confirmaram que `refs/pull/8/*`, o commit `55faede` e o blob alvo não são mais fornecidos pelas refs Git atuais; o fetch direto do commit retornou `upload-pack: not our ref`. Não há indicação técnica atual para rewrite local. O GitHub Support foi acionado formalmente pelo ticket `#4997778`, aberto em 12/11/2026. Aguardar confirmação quanto a caches, garbage collection e eventuais objetos server-side residuais antes de encerrar a SEC-01.
- TDD verificável: as metas de cobertura estão atendidas, porém o histórico disponível não comprova integralmente ciclos teste-primeiro durante o desenvolvimento. A lacuna é metodológica/acadêmica e não invalida os testes, coverage ou funcionamento atual do sistema.
- Obrigações acadêmicas/humanas: prova individual de autoria, orientações obrigatórias, pôster e atividades acadêmicas de apresentação foram informados pela responsável como concluídos. A evidência técnica de autoria permanece preservada no histórico Git, incluindo 163 commits autorais sem merges e contribuições em backend, frontend, testes, documentação, CI/CD, deploy e scripts. Manter os respectivos comprovantes acadêmicos no meio institucional apropriado.

### Melhorias operacionais não bloqueadoras

- Os quatro dashboards específicos, séries adicionais de host/disco e alertas ainda não testados podem ser evoluídos posteriormente. O dashboard consolidado, métricas e logs, alerta de indisponibilidade da API, entrega de notificação, SLO e retenção já foram validados no escopo acadêmico documentado.

## Gates executados na baseline e validações posteriores

| Gate | Resultado |
|---|---|
| `npm ci` (raiz) | **PASS** — CI #43 |
| `npm ci --prefix backend` | **PASS** — CI #43 |
| `npm ci --prefix frontend` | **PASS** — CI #43 |
| `npm run lint` | **PASS** — CI #43 |
| Testes backend | **PASS** — CI #340, commit `3eca8be`: 69 arquivos e 749 testes aprovados |
| Cobertura backend | **PASS** local em 05/10/2026 — `npm run test:coverage --prefix backend`; 45 arquivos e 357 testes aprovados; Statements 79.38%, Branches 75.83%, Functions 76.00%, Lines 84.04%; threshold de 75% nas quatro métricas atendido |
| Testes frontend | **PASS** — CI #340, commit `3eca8be`: 26 arquivos e 495 testes aprovados |
| Cobertura frontend padrão | **PASS** — CI #43 |
| Cobertura frontend diagnóstica (`--testTimeout=15000`) | Evidência histórica superada pelo **PASS** do comando oficial no CI #43 |
| Build frontend | **PASS** — artefato validado no CI #43 e implantado no Amplify pelo CD #48 |
| `npm audit --audit-level=high` | **PASS no critério High/Critical** — CI #43 |
| `docker compose config --quiet` | **PASS sintático** |
| Integração/migrations local | **PASS** na validação local de 05/10/2026 — `repository-postgres-lot6.test.js`: 8 testes aprovados com PostgreSQL real; migrations sem pendências |
| Integração PostgreSQL no CI | **PASS** — CI #340, commit `3eca8be`: 11 arquivos e 137 testes aprovados |
| CI remoto atual | **PASS** — CI #340, commit `3eca8be` |
| CD remoto atual | **PASS** — CD Production #48 |
| SonarCloud / Quality Gate | **PASS** — CI #340, commit `3eca8be`; Quality Gate aprovado |
| Deploy backend | **PASS** via AWS Systems Manager — CD #48 |
| Deploy frontend | **PASS** no AWS Amplify — CD #48 |
| Smoke tests de produção | **PASS** — CD #48 |

## Observações de integridade

- A modificação preexistente em `backend/tests/event-import.test.js` pertence ao usuário e não foi alterada nesta auditoria.
- Os arquivos `.bak` rastreados em `backend/src/` são duplicações que devem ser revisadas antes de eventual remoção; nenhuma exclusão foi realizada.
- Nenhuma credencial foi solicitada, impressa ou gravada.
- Nesta revisão documental, nenhum deploy, mutação de infraestrutura, alteração de banco ou reescrita de histórico Git foi executado; as evidências de deploy registradas vieram do CD Production #48 já concluído.
- Os números de padrões pessoais foram registrados apenas de forma agregada; nenhum valor da planilha foi reproduzido.
- A remoção local da planilha foi registrada na baseline de 04/09/2026 e sua ausência da árvore de `origin/main` foi confirmada posteriormente. Em 12/11/2026, duas validações independentes em clones mirror frescos não localizaram mais `refs/pull/8/*`, o commit `55faede` nem o blob histórico; o GitHub também recusou o fetch direto do commit com `not our ref`. A evidência atual não indica necessidade de rewrite local. A SEC-01 permanece aberta somente para confirmação formal do GitHub Support sobre caches e objetos server-side residuais.

## Fontes oficiais do critério

- [The Portfolio Playbook — Portfolio](https://github.com/CatolicaSC-Portfolio/The-Portfolio-Playbook/blob/main/Portfolio.md)
- [Direcionamentos gerais](https://github.com/CatolicaSC-Portfolio/The-Portfolio-Playbook/blob/main/directions/portfolio-directions-GERAL.md)
- [Linha de projeto — Web Apps](https://github.com/CatolicaSC-Portfolio/The-Portfolio-Playbook/blob/main/directions/portfolio-directions-webapp.md)

As três fontes responderam `HTTP 200` em 04/09/2026 e foram confrontadas com esta baseline.

## Atualização da validação técnica — 13/11/2026

Versão avaliada: commit `0f69ad85835cd352704d7d70811fe82d7adf1a51`, da branch `main`.

| Verificação | Resultado |
|---|---|
| Frontend | 495 testes aprovados, em 26 arquivos |
| Backend | 749 testes aprovados, em 69 arquivos |
| Integração PostgreSQL | 137 testes aprovados, em 11 arquivos |
| Cobertura backend | Instruções: 87,68%; ramificações: 84,49%; funções: 87,88%; linhas: 91,60% |
| Cobertura frontend | Instruções: 77,05%; ramificações: 78,06%; funções: 69,12%; linhas: 85,25% |
| Lint e build frontend | Aprovados; build com VITE_API_URL=/api |
| Validação do artefato frontend | 14 testes aprovados; bundle validado sem endereços de desenvolvimento |
| Auditoria de dependências | Zero vulnerabilidades reportadas na raiz, backend e frontend |
| CI nº 336 | Cinco jobs aprovados, incluindo SonarQube Cloud Quality Gate |
| CD Production nº 353 | Deploy e smoke tests aprovados; vínculo com o commit implantado ainda não conferido nesta revisão |

As suítes locais de frontend, backend e integração passaram com `--maxWorkers=1`. Os testes adicionais de deploy e recuperação apresentaram falhas no Windows; o job correspondente de qualidade passou no ambiente Linux do CI nº 336.

Esta atualização complementa as evidências históricas. Permanecem somente a ressalva de TDD não integralmente comprovado e a confirmação externa da SEC-01. A prova individual de autoria, as orientações obrigatórias, o pôster e as atividades acadêmicas de apresentação foram informados como concluídos. A decisão global permanece PARCIAL.
