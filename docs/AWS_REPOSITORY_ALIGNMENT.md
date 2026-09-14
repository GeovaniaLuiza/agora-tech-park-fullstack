# Sincronização do repositório com AWS — 2026-09-11

## Diagnóstico e escopo original — 2026-09-11

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

Ambiente: Windows, Node.js 24.16.0/npm 11.13.0 (dentro dos engines atuais); o CI e a produção continuam em Node.js 22. A validação remota em Linux/Node.js 22 foi concluída com sucesso, conforme a revalidação de 2026-09-13 abaixo.

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
| Lint global | Pendência da revisão local original superada; check remoto aprovado em 2026-09-13 |

Cobertura (statements / branches / functions / lines): backend **47,64 / 40,39 / 39,12 / 53,59%**; frontend **59,12 / 54,88 / 46,38 / 70,34%**. Todos os thresholds atuais foram atendidos. A primeira execução frontend com paralelismo padrão teve timeout de 5 segundos no dashboard; execução com dois workers passou sem aumentar timeout nem alterar testes existentes.

Esses valores de cobertura são as medições locais registradas e permanecem preservados; a aprovação dos checks remotos não os substitui nem comprova conformidade acadêmica. O backend continua abaixo do requisito de **75% de cobertura definido pelo Playbook**.

## Revalidação remota — 2026-09-13

Conforme os resultados remotos confirmados pelo responsável, o CI do **PR #16** foi executado com sucesso em **Linux/GitHub Actions com Node.js 22**:

| Verificação remota | Resultado |
| --- | --- |
| Lint and dependency audit | PASS |
| Backend unit tests | PASS |
| Frontend tests and build | PASS |
| PostgreSQL integration tests | PASS |
| SonarQube Cloud Quality Gate | PASS |

`SONAR_TOKEN` está configurado como GitHub Repository Secret; seu valor não foi solicitado nem registrado. Nenhum deploy AWS foi executado e `DEPLOY_ENABLED` continua não habilitado. Os resultados acima validam o alinhamento do repositório/PR para merge, sem autorizar a ativação de produção/CD.

Esta atualização é exclusivamente documental. Não executar deploy, migrations, comandos AWS ou history rewrite nesta tarefa; não restaurar a planilha operacional removida.

## Riscos e dependências remotas

- Lint, SonarQube Cloud e integração PostgreSQL estão aprovados no CI remoto. Essa aprovação não elimina os riscos operacionais abaixo nem autoriza CD.
- Manter `DEPLOY_ENABLED` não habilitado. Antes de uma futura ativação autorizada, revisar `VITE_API_URL`, variáveis de production, proteções e ausência de override divergente da URL. `SONAR_TOKEN` já está configurado como GitHub Repository Secret.
- No host, aplicar futuramente o ambiente Caddy versionado, verificar serviços, permissões, DNS/HTTPS, PostgreSQL somente em loopback, EBS, SSM e acesso ao repositório. IDs de EC2/Amplify e ARNs reais permanecem fora dos templates.
- AWS remoto: confirmar role/policy/trust conforme estado informado; app main/PRODUCTION, AutoBuild desativado e rewrite SPA. Não houve tentativa de redeploy ou alteração remota.
- EC2 única permanece ponto de falha. Backup pré-deploy local não substitui backup diário/off-site nem teste real de restore. O teste com pg_dump simulado comprova interrupção do pipeline, não recuperabilidade do banco real.
- `deploy/aws/deploy-backend.sh` não faz rollback de migrations. Reexecutar o mesmo SHA pode remover seu diretório de release antes do clone; não repetir deploy da release ativa sem corrigir esse comportamento. Revisar a idempotência da reexecução do mesmo SHA e a recuperação antes da ativação do CD.
- A planilha operacional `frontend/imgs/Locatários Perini Business 2026.xlsx` foi removida da árvore, mas permanece no histórico Git até sanitização controlada. Não restaurar o arquivo nem executar history rewrite nesta tarefa.
- A transformação do literal auxiliar do Router depende do formato da dependência; o build e o validador devem continuar bloqueando regressões.

## Classificação

- **ALINHAMENTO DO REPOSITÓRIO/PR VALIDADO PARA MERGE:** os checks remotos do PR #16 passaram em Linux/GitHub Actions com Node.js 22. A cobertura do backend permanece abaixo dos 75% exigidos pelo Playbook; não se declara conformidade acadêmica de cobertura.
- **PRODUÇÃO/CD NÃO DEVE SER ATIVADA:** `DEPLOY_ENABLED` continua não habilitado. Permanecem abertas a revisão da idempotência do deploy, a implantação de backup diário/off-site com restore testado, a sanitização controlada do histórico Git e as verificações operacionais remotas descritas acima. Nenhum deploy AWS foi executado.
