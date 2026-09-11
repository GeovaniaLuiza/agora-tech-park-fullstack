# Sincronização do repositório com AWS — 2026-09-11

## Diagnóstico e escopo

Arquitetura remota informada pelo responsável: us-east-1, Amplify main/PRODUCTION sem AutoBuild, EC2 Ubuntu 24.04 com Node.js 22/Express/systemd, Caddy, PostgreSQL 16 local em EBS, SSM com SSH desativado, OIDC e Grafana Alloy/Grafana Cloud. Nenhum recurso remoto foi consultado ou alterado nesta revisão; não houve deploy, migration em produção, commit ou push.

Antes de editar, foram conferidos `git status`, `git diff --stat` e os diffs dos arquivos envolvidos. Havia 18 arquivos com modificações não staged, uma exclusão staged e documentos/testes não rastreados. Essas alterações anteriores foram preservadas. Entre elas estavam CI, Compose, Vite, serviço de API do frontend, manifests/lockfiles e ajustes de privacidade.

Problemas confirmados: ARN de jobs aplicado indevidamente às operações de branch do Amplify; escuta da API sem endereço explícito; variável do Caddy sem configuração reproduzível; ausência de validação do URL incorporado ao dist; documentação de arquiteturas divergentes; backup restrito ao pré-deploy/local.

## Inventário de referências de produção

| Arquivo/grupo | Situação e ação |
| --- | --- |
| `README.md` | Arquitetura adotada, domínio planejado, SSM/OIDC, bootstrap manual e build validado |
| `docs/ARCHITECTURE.md` | Topologia, ambientes e contrato de LISTEN_HOST atualizados |
| `docs/AWS_PRODUCTION.md` | Fonte operacional vigente: região/host, IAM, Caddy, Amplify, backup e bootstrap |
| `docs/CI_CD.md`, `DEPLOYMENT.md` | CI/CD e escopo correto de variáveis; artefato verificado antes do acesso AWS |
| `GUIA_EXECUCAO.md` | Build local com variável pública e verificação automática |
| `docs/MONITORING.md`, `deploy/aws/alloy*`, `monitoring/` | Alloy/Grafana Cloud vigentes; templates/dashboards preservados |
| `docs/QUALITY.md` | Medições antigas identificadas como históricas; referência a Router 6 corrigida conforme manifest atual |
| `DIAGNOSTICO_PRODUCAO_AWS.md` | Documento inteiro identificado como legado; alternativas RDS/PM2/CloudWatch preservadas como história |
| `FREE_TIER_VERIFICATION.md` | Documento inteiro identificado como legado; estimativas não representam verificação de custos da conta atual |
| `deploy/aws/github-deploy-policy.json` | Branch e jobs separados; leitura SSM não utilizada removida |
| `deploy/aws/github-oidc-trust-policy.json` | Trust restrito ao repositório/environment; sem alteração |
| `deploy/aws/agora-api.service`, `Caddyfile` | Serviços atuais preservados; ambiente Caddy passa a ter templates próprios |
| `deploy/aws/deploy-backend.sh` | Pipeline existente inspecionado; sem alteração funcional |
| `SECURITY.md`, `AUTH_ACCESS.md`, demais docs de domínio/dados | Sem outra arquitetura de produção vigente identificada; preservados |

A busca incluiu README, documentos Markdown versionados e arquivos de deploy. Não revisou documentos binários como fonte de instruções operacionais. RDS, PM2 e CloudWatch não são componentes vigentes da aplicação.

## Alterações e impacto

- IAM: `CreateDeployment`/`StartDeployment` no ARN da branch main; `GetJob` em jobs/*; remoção de `ListCommandInvocations`, não usado pelo workflow. Placeholders preservados. `GetCommandInvocation` mantém `Resource: "*"` por não suportar recurso específico, sem wildcard de ação. Referências: [Amplify](https://docs.aws.amazon.com/service-authorization/latest/reference/list_amplify.html), [SSM](https://docs.aws.amazon.com/service-authorization/latest/reference/list_ssm.html).
- Backend: `environment.js`, `server.js`, `environment.test.js` e dois exemplos de ambiente. Produção default/exigência `127.0.0.1`; DEV/test default `0.0.0.0` com override. Copiar o exemplo DEV para produção exige corrigir LISTEN_HOST. Não houve alteração no Compose.
- Caddy: novos `caddy.env.example` e `caddy.service.d/environment.conf`. Exemplo genérico, sem credenciais. Procedimento descreve substituição da atribuição manual existente e validação/restart posterior autorizado.
- Frontend: `scripts/validate-frontend-artifact.mjs` e testes reutilizados por CI/CD, sem dependência nova. Exige URL HTTPS pública terminada em `/api`, presente como literal completo em JS; rejeita localhost, loopback e faixas IPv4 privadas comuns. CI deixa de aceitar fallback `/api`; CD valida antes de acessar AWS e exige branch main.
- Build: `frontend/build/router-url-base.js`, teste e integração no Vite. Troca apenas o literal auxiliar do React Router por domínio reservado `.invalid`; não transforma URLs da aplicação. Necessário para a ausência literal de localhost no artefato. Revalidar ao atualizar Router.
- Qualidade: lint passa a incluir `frontend/build`; CI inclui testes isolados do backup. Nenhum limite de qualidade foi reduzido.
- Backup: testes do trecho real do pipeline com pg_dump simulado; documentação do gap. Nenhum timer, storage externo ou recurso pago criado.

## Validações locais

Ambiente: Windows, Node.js 24.16.0/npm 11.13.0 (dentro dos engines atuais); o CI e a produção continuam em Node.js 22. Validação Linux/Node 22 depende da próxima execução CI autorizada.

| Verificação | Resultado |
| --- | --- |
| Backend: configuração isolada | 12 testes aprovados |
| Backend: suíte com coverage | 125 testes, 23 arquivos aprovados |
| Frontend: transformação/rotas | 12 testes aprovados |
| Frontend: suíte com coverage e `--maxWorkers=2` | 83 testes, 18 arquivos aprovados |
| Validador de artefato | 12 cenários aprovados, incluindo URLs erradas/DEV e formatos de aspas do minificador |
| Backup isolado | 3 cenários aprovados: sucesso, falha do dump, falha do gzip |
| Build frontend | Aprovado com `https://agora-techpark.duckdns.org/api` |
| Dist | URL esperada encontrada no JS; nenhuma ocorrência de localhost ou endereços DEV bloqueados |
| IAM JSON | Parse e separação de ações/recursos validados localmente |
| Workflows YAML | Parse de CI e CD aprovado |
| Diff final | Revisado; `git diff --check` aprovado, alterações anteriores preservadas |
| Shell de deploy | `bash -n` aprovado; script completo não executado |
| systemd/Caddy | Inspeção estática; binários nativos indisponíveis neste Windows, WSL sem acesso. Comandos de validação no host documentados, não executados |
| npm audit | 0 vulnerabilidades em raiz/backend/frontend; repetido com acesso de rede autorizado após bloqueio do sandbox |
| Lint global | 6 erros existentes `react-hooks/set-state-in-effect` em arquivos não alterados nesta correção; bloqueia CI |

Cobertura (statements / branches / functions / lines): backend **47,64 / 40,39 / 39,12 / 53,59%**; frontend **59,12 / 54,88 / 46,38 / 70,34%**. Todos os thresholds atuais foram atendidos. A primeira execução frontend com paralelismo padrão teve timeout de 5 segundos no dashboard; execução com dois workers passou sem aumentar timeout nem alterar testes existentes.

Arquivos com lint pendente: `frontend/src/contexts/AuthContext.jsx:43`, `frontend/src/hooks/useForms.js:13`, `frontend/src/pages/AdminRequestsPage.jsx:27`, `frontend/src/pages/DashboardPage.jsx:56` e `:58`, `frontend/src/pages/VerifyEmailPage.jsx:21`. Não foram desabilitadas regras nem refatorados esses fluxos fora do escopo da infraestrutura.

## Riscos e dependências remotas

- O lint global precisa ser corrigido antes de obter CI verde e liberar CD. Sonar/integração PostgreSQL serão validados no CI; nenhuma migration foi executada nesta revisão.
- Confirmar no GitHub variáveis de repositório `VITE_API_URL` e `DEPLOY_ENABLED=false` durante configuração; variáveis de production, SONAR_TOKEN, proteções e ausência de override divergente da URL.
- No host, aplicar futuramente o ambiente Caddy versionado, verificar serviços, permissões, DNS/HTTPS, PostgreSQL somente em loopback, EBS, SSM e acesso ao repositório. IDs de EC2/Amplify e ARNs reais permanecem fora dos templates.
- AWS remoto: confirmar role/policy/trust conforme estado informado; app main/PRODUCTION, AutoBuild desativado e rewrite SPA. Não houve tentativa de redeploy ou alteração remota.
- EC2 única permanece ponto de falha. Backup pré-deploy local não substitui backup diário/off-site nem teste real de restore. O teste com pg_dump simulado comprova interrupção do pipeline, não recuperabilidade do banco real.
- Script atual não faz rollback de migrations. Reexecutar o mesmo SHA pode remover seu diretório de release antes do clone; não repetir deploy da release ativa sem corrigir esse comportamento. Revisar idempotência e recuperação antes da ativação do CD.
- A transformação do literal auxiliar do Router depende do formato da dependência; o build e o validador devem continuar bloqueando regressões.

## Classificação

**NÃO PRONTO PARA RETOMAR CONFIGURAÇÃO AWS** pelo critério de validações integralmente aprovadas: ajustes solicitados de arquitetura foram implementados, mas o lint global ainda bloqueia CI/CD. Não habilitar deploy com esse check reprovado. Recursos AWS e publicação continuam intocados.
