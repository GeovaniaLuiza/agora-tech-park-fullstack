# Identidade individual das respostas

## Modelo e levantamento

`responses` (001/008) contém id, form_id, organization_id, answered_by, created_at,
status, submitted_at, reopened_at, reopened_by e updated_at. Não possui created_by.
As FKs são form_id → forms (CASCADE), organization_id → organizations (NO ACTION),
answered_by → users (NO ACTION) e reopened_by → users (SET NULL). A unicidade
anterior era (form_id,organization_id), com índices separados de formulário,
organização e answered_by, além de (status,organization_id,form_id).

`answers` (001) referencia responses com CASCADE e questions com NO ACTION; possui
unicidade (response_id,question_id) e índice por response_id.

`form_respondents` (012) referencia forms e users com CASCADE e organizations com
NO ACTION. Guarda estado de entrega e resposta, timestamps e erro. Sua unicidade
(form_id,user_id) define uma organização de representação por convite individual.
Os índices são (form_id,status) e (user_id,form_id).

`users_organizations` permite vários vínculos por usuário. A autorização da coleta
legada sem form_respondents aceita as organizações destinatárias com vínculo ativo;
por isso a nova identidade preserva a distinção entre organizações do mesmo usuário.
Não é expandida a quantidade de organizações representadas por um convite atual.

`indicator_records` (019) referencia responses, questions, indicator_definitions e
organizations com RESTRICT. A chave da contribuição é
(response_id,question_id,indicator_id), exclusiva para FORM_RESPONSE. As migrations
014/019 definem período de coleta e contribuições, sem nenhuma alteração nesta correção.

## Novo modelo

Migration incremental **021_response_respondent_identity.sql**:

- adiciona respondent_user_id → users(id), ON DELETE RESTRICT;
- substitui a unicidade absoluta por (form_id,organization_id,respondent_user_id);
- acrescenta índice de histórico por proprietário e organização;
- mantém todos os IDs, respostas, vínculos e contribuições existentes.

answered_by já era gravado em toda persistência, inclusive rascunhos: representa
o último escritor, não exclusivamente quem concluiu. Esse significado é preservado.
respondent_user_id identifica o proprietário desde a criação do draft e não muda
em salvamentos, conclusão ou reabertura. Para operações do residente, ambas as
identidades vêm de req.user.sub, preenchido pelo middleware de autenticação.

## Backfill e históricos ambíguos

Somente atribuir o proprietário ao answered_by registrado quando existir auditoria
RESPONSE_SUBMITTED ou RESPONSE_DRAFT_SAVED desse mesmo ator para o ID da resposta,
sem ator divergente ou desconhecido. Quando existem convites individuais, exigir
que correspondam ao usuário/organização e que não haja outro destinatário dessa
mesma organização. Sem convites, a auditoria consistente permite recuperar legado.

Ausência de auditoria, autores conflitantes, múltiplos destinatários ou convite
incompatível deixam respondent_user_id NULL. Não escolher o primeiro residente,
o único usuário atualmente ativo, ou o último ator de um histórico contraditório.
O backfill desabilita somente o trigger update_responses_updated_at na transação
da migration e o reabilita antes do fim, preservando também timestamps originais.

Históricos NULL permanecem consultáveis pela equipe via histórico e responseId.
Não são expostos como resposta própria de residentes nem reivindicados ao salvar.
Uma nova gravação no mesmo formulário/organização retorna 409
LEGACY_RESPONSE_REVIEW_REQUIRED enquanto houver histórico não resolvido. Essa
barreira impede duplicar contribuições ou apagar conteúdo antigo por inferência.
Reabertura automática de resposta sem proprietário também não é permitida.

Antes de implantar, ensaiar a migration em uma cópia isolada dos dados e realizar
inventário/revisão administrativa dos casos que permaneceriam ambíguos. O SQL abaixo
é de somente leitura e se aplica ao schema já migrado no ensaio, não ao schema 020.
A correção não faz reparo arbitrário desses registros, não duplica uma resposta
histórica para todos os convidados e não recalcula contribuições na migration.

O rollout precisa impedir gravações pela versão antiga da API durante a migration
e até o início da versão nova. A versão antiga não conhece respondent_user_id e
ainda localiza respostas apenas por organização; não há garantia de compatibilidade
para versões antigas e novas escrevendo simultaneamente. Essa janela operacional
deve ser planejada antes de qualquer implantação; nenhum deploy é feito aqui.

```sql
SELECT id,form_id,organization_id,answered_by,status,created_at,updated_at
FROM responses WHERE respondent_user_id IS NULL;
```

## API, segurança e indicadores

As URLs de leitura, rascunho e conclusão são mantidas. A leitura e o histórico de
residentes filtram pelo usuário autenticado; a escrita usa chave e lock da mesma
identidade tripla. userId, respondent_user_id, answered_by e responseId no payload
não escolhem o proprietário nem direcionam a escrita a outra resposta.

Na leitura, a query opcional responseId permite seleção explícita à equipe. Para
residentes, continua sujeita ao proprietário autenticado: um ID alheio retorna
404. A equipe mantém seus papéis e acesso existentes; quando há várias respostas
e nenhum responseId, a consulta retorna 409 RESPONSE_SELECTION_REQUIRED, em vez
de devolver uma resposta arbitrária. O histórico da equipe fornece os IDs.

Nenhuma mudança de frontend é necessária para o fluxo individual nas URLs atuais.
Não foi adicionado seletor de usuário. Os testes também cobrem o mesmo usuário
em organizações distintas no fluxo legado autorizado pelo modelo atual.

processLinkedAnswers e as fórmulas SUM/COUNT/AVERAGE/LAST_VALUE não mudam. Cada nova
response tem ID próprio; a unicidade por response/question/indicator evita
duplicação em reenvios. Reabrir A retira somente sua contribuição, preservando B;
reenviar A atualiza seu registro existente. A verificação do dashboard usa a
consolidação existente, sem fórmulas novas.

## Verificações

Testes PostgreSQL/HTTP em response-isolation.integration.test.js: drafts isolados,
conclusões independentes, IDs/autorias/answers, tentativa de ID alheio, payload
forjado, histórico, papéis, único respondente, múltiplas organizações, concorrência,
barreira de legado e as quatro estratégias de contribuição/reabertura/reenvio.

response-identity-migration.integration.test.js testa backfill positivo/negativo,
atores conflitantes/desconhecidos, múltiplos destinatários, FKs, unicidade tripla,
preservação de IDs/answers/referências/timestamps e reativação do trigger.

Nenhuma migration antiga é editada. Aplicação e testes somente em PostgreSQL 16
temporário; nenhum acesso ou alteração em produção, commit, push, PR ou deploy.

## Resultado da validação local

PostgreSQL **16.6**, banco temporário exclusivo forms_isolation_validation, com
migrations 001–021 aplicadas pelo runner existente. migrate:dry confirmou ausência
de pendências e consistência dos checksums após os testes.

| Comando | Resultado |
| --- | --- |
| npm.cmd test --prefix backend -- --maxWorkers=2 | 64 arquivos, 702 testes aprovados |
| npm.cmd run test:integration --prefix backend | 9 arquivos, 103 testes aprovados |
| npm.cmd test --prefix frontend -- --maxWorkers=1 | 25 arquivos, 452 testes aprovados |
| npm.cmd run lint | Aprovado |
| git diff --check | Aprovado |

A execução focada também passou: 28 testes, incluindo os novos testes HTTP,
migration e service. Os dois residentes selecionados da mesma organização mantêm
drafts e conclusões independentes, com IDs e answers separados e answered_by
correto. O backend usa exclusivamente a identidade autenticada para a propriedade.

As primeiras execuções dos testes novos revelaram apenas ajustes nas próprias
fixtures: excluir responses antes de forms para respeitar a FK NO ACTION de
answers.question_id, e converter PostgreSQL numeric (string) ao comparar o card
do dashboard. Após esses ajustes, todos os comandos acima passaram. Não foram
alterados timeouts, configurações de CI, thresholds ou fórmulas de indicadores.

Frontend, JWT, RBAC, migrations anteriores e as demais worktrees permanecem sem
alterações funcionais desta correção. Os logs locais ficam no tmp ignorado pelo
Git da worktree original. Não há dados ou credenciais de produção nos testes.

Pronto para revisão em PR, sem formalização nesta etapa. A futura implantação
depende do inventário dos casos históricos e da janela sem gravações da API antiga
descritos acima. Nenhuma consulta a dados de produção foi feita para presumir
quantos registros precisarão de revisão.
