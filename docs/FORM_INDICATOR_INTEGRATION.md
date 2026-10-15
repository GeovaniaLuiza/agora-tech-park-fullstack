# Formulários → indicadores — Fase 10

Data: 14/10/2026. Base: `main`, SHA `4f3f6f605ac0a8e09863023f5353d84d825bbb02`.
Trabalho local, sem commit, push, PR ou deploy. A Fase 11 não está concluída.

## Preservação do RBAC

Antes de iniciar foram executados `git branch --show-current`, `git status --short`,
`git diff --stat` e `git diff --check`. Foram encontrados somente estes nove arquivos:

- `backend/src/repositories/formRepository.js`
- `backend/src/services/formService.js`
- `frontend/src/config/access.js`
- `backend/tests/fixtures/rbac-endpoints.js`
- `backend/tests/rbac-form-scope.test.js`
- `backend/tests/rbac-http.test.js`
- `backend/tests/rbac-postgres.test.js`
- `docs/RBAC_HOMOLOGACAO.md`
- `frontend/src/rbac.test.jsx`

Todos foram preservados sem commit na branch `wip/rbac-final-hardening`, no worktree
`C:/Users/geova/Music/agora-tech-park-rbac-preserved`. Cópia adicional: stash
`RBAC final hardening - preservacao sem commit - 2026-10-14` (inclui arquivos novos).
A `main` voltou limpa e foi atualizada com `git pull --ff-only origin main`, sem
alteração do SHA acima. Nenhum merge do RBAC foi realizado. Arquivos de formulários
também aparecem nesta fase porque integram o domínio; os patches de RBAC continuam
exclusivamente no outro worktree.

## Arquitetura encontrada

Formulários usam `forms`, `questions`, `question_options`, `form_organizations`,
`form_respondents`, `responses` e `answers`. Há uma resposta por formulário e
organização, e uma resposta de pergunta por resposta principal. As migrations
001/008 estruturam os estados e edição; 012 adiciona destinatários individuais;
014 adiciona centro, ano e mês de referência ao formulário.

Os módulos `formRepository`, `formService`, `formController` e `formRoutes`
administram a coleta. `responseRepository`, `responseService`, `responseController`
e `responseRoutes` persistem rascunhos, submissões e reaberturas. ADMIN/PESQUISADOR
configuram e reabrem; RESIDENTE responde. A edição de resposta enviada exige
reabertura; rascunhos não publicam indicadores. A criação/edição de perguntas
fica em formulários DRAFT. Fechar/arquivar a coleta não invalida respostas já
submetidas; não foi criada exclusão de respostas.

Frontend: o editor e a tela de resposta estão em `frontend/src/App.jsx`; chamadas
em `frontend/src/services/api.js`. O editor já oferece catálogo de indicadores,
centro e competência. A publicação exige janela de coleta e destinatários.

Indicadores usam `indicator_definitions` (catálogo, tipos e regras),
`indicator_records` (registros operacionais por centro), `indicator_values`
(valores mensais/anuais por origem) e `indicator_applicability`.
`indicatorCalculationService.recompute` é o cálculo central existente;
`indicatorValueService` já tratava respostas. Importações têm seus próprios lotes
e registros; não foram modificadas.

O Dashboard institucional usa `dashboardRepository`/`indicatorRepository.summary`
para ler `indicator_values`. A origem LIVE prioriza FORM_RESPONSE,
SYSTEM_CALCULATION, MANUAL_ENTRY e importações, nessa ordem. O Dashboard
institucional mantém sua lista oficial de códigos; indicadores personalizados
continuam consultáveis no catálogo/listagem sem serem adicionados silenciosamente
aos cards institucionais.

## Relacionamento anterior: parcial

A pesquisa por `indicator_id`, `indicatorId`, `form_indicator`,
`question_indicator`, `mapping`, `metric`, `KPI`, `FORM_RESPONSE`, `source_type`
e `calculation_rule` encontrou integração explícita já existente:
`question_indicator_links`, criada na migration 011, e sua configuração no editor.
Não era necessário criar outra tabela de mapeamento.

O fluxo anterior era resposta → `indicator_values`, sem contribuição intermediária.
A chave consolidada não contém organização: uma segunda organização sobrescrevia
a primeira. O teste anterior usava UUIDs sem resposta/pergunta reais, portanto não
cobria o ciclo completo. Reabertura não retirava valores publicados e o cálculo
central só considerava MANUAL_ENTRY como entrada manual.

## Fluxo implementado

1. Autenticar usuário e conferir perfil atual, vínculo e organização ativa.
2. Resolver no banco a organização solicitada dentro dos vínculos do usuário,
   dos destinatários organizacionais e, quando existentes, dos destinatários individuais.
3. Validar coleta, janela, perguntas reais, opções e campos obrigatórios.
4. Persistir resposta e respostas individuais na transação existente.
5. Selecionar exclusivamente perguntas numéricas com vínculo ativo no banco.
6. Gravar/atualizar a contribuição em `indicator_records`.
7. Consolidar contribuições ativas do mesmo indicador/centro/ano/mês em
   `indicator_values`, com origem FORM_RESPONSE, e recalcular o anual.
8. Atualizar o resultado financeiro derivado existente, quando aplicável, e
   sincronizar o cálculo central anual dos indicadores afetados.
9. Registrar auditoria e confirmar tudo na mesma transação.
10. Indicadores e Dashboard consultam os valores pelo pipeline existente.

Reabertura retira as contribuições da consolidação, recalcula mensal/anual e
registra auditoria na mesma transação. Novo envio reativa/atualiza as mesmas
identidades. Uma pergunta opcional removida não deixa contribuição ativa.
Sem perguntas mapeadas e sem contribuições anteriores, não há publicação ou
recálculo de indicadores alheios.

## Migration e modelo de dados

Foram listadas todas as migrations: 001, 002, 003, 004, 005, 006, 007, 008,
009, 010, 011, 012, 013, 014, 015, 016, 017 e 018. Próximo número: 019.

Criada `database/migrations/019_form_indicator_contributions.sql`.
Nenhuma tabela nova. Em `indicator_records`:

| Coluna nova | Finalidade |
|---|---|
| `source_type` | FORM_RESPONSE nas contribuições; NULL nos registros anteriores |
| `response_id` | Resposta principal; permite chegar ao formulário |
| `question_id` | Pergunta original, estável durante o ciclo de reenvio |
| `indicator_id` | Indicador explicitamente mapeado |
| `organization_id` | Organização validada pelo backend |
| `numeric_value` | Valor individual NUMERIC(24,4) |

`record_type` passa a aceitar FORM_RESPONSE. As novas FKs usam RESTRICT para
preservar rastreabilidade. Uma CHECK exige todos os campos da contribuição,
incluindo centro e competência; registros dos tipos anteriores continuam válidos
com os novos campos nulos. Índice único parcial em resposta/pergunta/indicador,
inclusive para contribuições inativas. Índice parcial para consolidação de
contribuições ativas por centro, indicador e competência.

## Tipos e mapeamento

| Tipo real | Publicação automática |
|---|---|
| NUMBER | Sim, com mapeamento explícito e valor válido |
| DECIMAL | Sim, com mapeamento explícito e valor válido |
| TEXT | Não |
| OPTION | Não; nem mesmo opções que parecem números |

Sim/não, multiselect e data não existem como tipos próprios. Nenhuma conversão
semântica foi inferida. Indicadores TEXT/BOOLEAN/JSON ou sem agregação suportada
não aparecem entre os coletáveis e novos vínculos são recusados pelo backend.
Vínculos antigos de perguntas não numéricas não publicam automaticamente.

O catálogo define a agregação; não existe inferência por texto da pergunta nem
seletor de regra independente. O editor conserva a seleção existente, com texto
explicando que somente perguntas numéricas vinculadas publicam.

## Centro, organização e segurança

O centro vem exclusivamente de `forms.innovation_center_id`, configurado pela
equipe responsável. Não existe fallback para Joinville na publicação. Todos os
16 centros usam a mesma chave de isolamento e o cálculo central recebe o centro
explicitamente. Consultas existentes sem filtro ainda conservam seu default
histórico de Joinville; isso não determina o centro da contribuição.

O `organizationId` recebido é apenas uma solicitação de contexto: o backend exige
vínculo ativo e organização ativa, consulta destinatários e usa o ID retornado pelo
banco na persistência. Quando há `form_respondents`, o residente não pode trocar
a organização que lhe foi atribuída, mesmo tendo outro vínculo ativo. Formulários
antigos sem destinatários individuais preservam sua elegibilidade organizacional.

Contribuições mantêm organização individual. Valores consolidados FORM_RESPONSE
têm `organization_id=NULL` e `source_id=NULL`, pois representam o centro e podem
reunir várias organizações/respostas. A rastreabilidade completa fica nos registros
e na auditoria. Editar A não altera a contribuição de B; o total institucional
muda conforme a regra de agregação configurada.

Campos extras do residente (`indicatorId`, `indicator_id`, `centerId`,
`innovation_center_id`, `source_type`, valor consolidado) não comandam publicação.
Perguntas, tipos e mapeamentos são recarregados do banco. A origem é constante do
backend. As rotas genéricas de cadastro rejeitam FORM_RESPONSE para impedir leitura
de contribuições de outras organizações ou edição fora do fluxo de respostas.

## Competência e origem

Competência explícita: `forms.indicator_year` e `forms.indicator_month`.
Centro/ano/mês são opcionais em conjunto para formulários sem integração e
obrigatórios ao publicar formulário com perguntas mapeadas. Não se usa
`submitted_at` para determinar o período. A janela de resposta é independente.
Intervalos consolidados cobrem o mês civil ou o ano civil correspondente.

FORM_RESPONSE já existia nas constraints, filtros e labels de `indicator_values`
e no catálogo. Foi reutilizado, sem nova origem no Dashboard. O resultado
financeiro derivado mantém SYSTEM_CALCULATION.

## Agregações e idempotência

| Regra explícita | Contribuições do mês | Consolidação anual |
|---|---|---|
| SUM | Soma dos valores ativos | Soma dos valores mensais |
| COUNT | Número de contribuições ativas | Soma das contagens mensais |
| AVERAGE (AVG) | Média dos valores ativos | Média dos valores mensais presentes |
| LAST_VALUE | Última contribuição alterada; desempate por UUID | Último mês presente |

Agregação mensal usa `indicator_definitions.aggregation_type`; anual usa
`annual_aggregation`. AVERAGE anual segue a média dos meses da arquitetura atual,
sem ponderação por número de respondentes. COUNT conta contribuições numéricas
válidas, sem inferir significado de texto ou seleção. Posição mensal/anual usa
LAST_VALUE; acumulado anual usa SUM. MAX/MIN e outras regras do catálogo geral
não foram habilitadas neste fluxo sem suporte completo de consulta/consolidação.

A chave única resposta/pergunta/indicador impede duplicação. UPSERT altera a
contribuição existente; repetir exatamente o mesmo valor não modifica sua ordem
de atualização em LAST_VALUE. Consolidação substitui o total calculado, sem
incrementar o total anterior. Advisory locks transacionais serializam a criação
de resposta por formulário/organização e a publicação por centro/ano. Não se usa
lock global entre centros. Reabertura conserva o registro inativo e retira seus
valores do consolidado. O cálculo central também é atualizado para evitar que
um anual SYSTEM_CALCULATION antigo reapareça como fallback.

## Dados existentes e limites

A migration não atualiza formulários, respostas, registros ou valores existentes.
Não há backfill ou retroprocessamento automático. Formulários sem mapeamento
continuam funcionando. Valores antigos FORM_RESPONSE com `source_id` preenchido
não são sobrescritos ao colidirem com uma nova publicação do mesmo indicador,
centro e ano (inclusive em outro mês, pois há consolidação anual): o backend retorna
409 `LEGACY_FORM_VALUES_REQUIRE_REVIEW` e desfaz
a submissão inteira. Reabrir resposta que ainda sustenta valor legado também
exige revisão. Recuperar/recompor essas contribuições requer decisão e autorização
específica; nenhum script de backfill foi executado.

Mudar regras do catálogo não dispara retroprocessamento geral. Próximas submissões
usam a configuração explícita atual. Não foi criado mecanismo para congelar
versões de regras ou converter respostas qualitativas.

## Arquivos da Fase 10

- `backend/src/repositories/formRepository.js`
- `backend/src/repositories/indicatorManagementRepository.js`
- `backend/src/repositories/indicatorValueRepository.js`
- `backend/src/repositories/responseRepository.js`
- `backend/src/services/formService.js`
- `backend/src/services/indicatorManagementService.js`
- `backend/src/services/indicatorValueService.js`
- `backend/src/services/responseService.js`
- `frontend/src/App.jsx`
- `database/migrations/019_form_indicator_contributions.sql`
- `backend/tests/form-service-lot2.test.js`
- `backend/tests/indicator-value-lot2.test.js`
- `backend/tests/response-service-lot2.test.js`
- `backend/tests/integration/form-indicators.integration.test.js`
- `backend/tests/integration/form-contributions.integration.test.js`
- `docs/FORM_INDICATOR_INTEGRATION.md`

## Validação

PostgreSQL 16 isolado: container `agora-phase10-pg16`, volume
`agora-phase10-pg16-data`, banco phase10, porta local 55436.
Todas as 19 migrations foram aplicadas do zero com sucesso.

O teste de integração anterior passou a criar usuário, organização, formulário,
pergunta e resposta reais. A suíte nova usa autenticação JWT real, endpoints de
submissão/reabertura, banco real, consulta de indicadores e Dashboard. Cobre
valores inválidos/rollback, perguntas sem vínculo, origem, competência explícita,
manipulação de payload, destinatários com múltiplos vínculos, organizações inativas,
perfis sem acesso, reenvio, exclusão de pergunta opcional, agregações, concorrência,
isolamento entre centros/organizações, legado e proteção das rotas genéricas.

Resultados finais:

| Verificação | Resultado |
|---|---|
| PostgreSQL | 16.14, 19 migrations aplicadas do zero |
| `npm.cmd test --prefix frontend -- --maxWorkers=1` | 395 testes, 25 arquivos, todos passando |
| `npm.cmd test --prefix backend -- --maxWorkers=2` | 632 testes, 63 arquivos, todos passando |
| `npm.cmd run test:integration --prefix backend` | 63 testes, 5 arquivos, todos passando |
| `npm.cmd run lint` | Aprovado |
| `git diff --check` | Aprovado |
| Container e volume temporários | Removidos; consultas finais não encontraram os recursos |

A integração ganhou 25 cenários reais no arquivo novo e fortaleceu o teste de
idempotência existente, inclusive repetindo o mesmo valor. Foi validada a consulta
do Dashboard institucional por HTTP com um código oficial do catálogo, além da
consulta direta ao repositório para indicador personalizado.

Uma primeira execução completa do backend, concorrente com o frontend, teve
timeout no teste preexistente de rate limit de preview de importação. A repetição
completa sem concorrência passou: 632/632, mantendo timeout original de 5000 ms.
Não foram excluídos ou ignorados testes. A última integração também validou a
proteção de valores legados quando a publicação tenta outro mês do mesmo ano.

Timeout, cobertura, CI e Sonar permanecem sem alterações. Os números da rodada
de RBAC não devem ser usados como resultado da main: seus testes estão preservados
no outro worktree e não foram incorporados nesta fase.

## Decisões pendentes

- Homologação funcional da retirada imediata de contribuição ao reabrir.
- Autorização e estratégia de reconciliação de valores legados, caso existam.
- Regras explícitas futuras para OPTION, sim/não, multiselect ou datas.
- Semântica de indicadores anuais coletados repetidamente e eventual versionamento
  das regras de agregação; atualmente a competência mensal é sempre explícita.
- Decisões de GESTOR, RESIDENTE, múltiplas organizações e sessão aberta continuam
  pertencendo à Fase 11. Esta implementação não as declara resolvidas.

## Situação da fase

O escopo técnico da Fase 10 está implementado e validado pelos comandos acima.
O encerramento oficial depende de homologação funcional, especialmente do ciclo
de reabertura e da aplicação das regras explícitas a cada indicador real. Valores
legados que colidam com novas publicações exigem revisão autorizada; não se
declara sua reconciliação concluída. A Fase 11 permanece aberta e separada.
Nenhum commit, push, PR ou deploy foi realizado.
