# Importação de Eventos e Exportação de Reservas

## Evidência da operação

Inspeção local de `Reservas 01.10 a15.10.xlsx`, sem importar seus dados no sistema:

- Aba `Exportação`, cabeçalho na linha 1, 13 colunas e 115 linhas de dados.
- Colunas: ID, Data de início, Data de término, Horário, Sala, Tipo, Responsável,
  Cliente, Empresa, Site, Prédio / Torre, Andar, Status.
- Status observados: **Confirmada: 112**, **Pré-reservada: 3**.
- Cliente vazio em 76 linhas; Empresa presente em todas as linhas.
- Datas de 01/10/2026 a 15/10/2026, armazenadas como datas Excel.
- Horários no formato `HH:mm - HH:mm`; IDs distintos nas reservas de várias salas.
- A hipótese cliente/empresa + início + horário encontra 18 pares. Alguns apresentam
  tipos diferentes, demonstrando que essa chave isolada não é suficiente.
- Com a regra abaixo: 14 pares consolidados, **98 eventos confirmados** e
  **3 pré-reservas ignoradas**, totalizando 101 registros no preview e 115 linhas lidas.

`backend/tests/fixtures/reservation-homologation-rows.json` preserva as datas,
horários, estados, células vazias e relações entre os valores. Os IDs, clientes,
empresas, pessoas, salas, tipos, sites, prédios e andares são substituídos por
identificadores sintéticos. O arquivo original não é copiado para o repositório.
O script `scripts/anonymize-reservations.mjs` permite reproduzir essa transformação.
Casos adicionais sintéticos nos testes cobrem cancelamentos, estados desconhecidos,
campos ausentes, datas inválidas, revisão e conflitos de IDs.

## Reconhecimento e status

A aba `Eventos` tem prioridade absoluta e continua exigindo as oito colunas exatas,
na ordem e na linha anteriores. Uma aba Eventos inválida não é contornada usando
Exportação. Sem Eventos, a aba Exportação é reconhecida automaticamente.

Exportação permite colunas reordenadas e colunas adicionais. Exige na linha 1:
ID, Data de início, Horário, Sala, Tipo, Status e pelo menos Cliente ou Empresa.
As outras colunas são opcionais; valores disponíveis são preservados.

A lista positiva de status contém somente **Confirmada**, após normalização de
espaços, acentos e maiúsculas. Essa regra deriva do valor encontrado no arquivo.
Pré-reservada, cancelamentos, vazio e qualquer estado desconhecido são ignorados,
inclusive quando uma requisição de revisão tenta forçar sua inclusão. Não há
reconhecimento por substring de "confirmada" nem adivinhação de outros estados.
Nenhum evento entra no indicador antes da revisão e confirmação final.

## Consolidação e reprocessamento

### Lote atual e descarte

Cada combinação de centro e tipo (`EVENTS` ou `RESIDENTS`) tem no máximo um
lote atual, compartilhado entre os gestores. O marcador `is_current` possui
índice único parcial. A criação de lote e o descarte usam o mesmo bloqueio
transacional do centro usado na confirmação, impedindo uploads concorrentes
de criarem dois lotes atuais.

`GET /api/indicator-imports/:type/draft?centerId=...` retorna somente o lote
atual em `VALIDATED`, `WITH_WARNINGS` ou `REVIEW_PENDING`. Estados terminais
não são retomáveis. A tela apresenta arquivo, status e data, e exige a escolha
entre **Continuar importação** e **Descartar e iniciar nova**. Continuar abre
a revisão do lote exibido com suas decisões salvas.

`POST /api/indicator-imports/batches/:id/cancel` marca o lote pendente atual
como `CANCELLED` e registra `INDICATOR_IMPORT_CANCELLED` na mesma transação.
Não exclui o lote, seu draft ou registros/valores de indicadores. Lotes
confirmados e lotes históricos não podem ser descartados por esse endpoint.
Novo upload com lote atual pendente retorna `409 IMPORT_ACTIVE_EXISTS`, mesmo
com `reprocess=true`. Após descarte, é possível iniciar uma nova geração.
A proteção contra repetir um arquivo já confirmado permanece.

A migration `017_current_indicator_import.sql` mantém todos os lotes e status
existentes. Marca somente o lote mais recente por `created_at`, com desempate
por `updated_at` e ID, para cada centro/tipo. Os pendentes mais antigos ficam
preservados para auditoria, sem serem promovidos ao concluir ou descartar o
atual. O marcador permanece no lote terminal até a criação da próxima geração.
Revisão e confirmação também recusam lotes históricos.

A migration precisa ser aplicada antes de iniciar o backend desta versão.
No primeiro rollout, evitar novos uploads entre a aplicação da migration e a
troca do backend: a versão anterior não preenche `is_current`. A aplicação em
produção e qualquer janela operacional devem seguir o procedimento de deploy.

### Reprocessamento dos registros confirmados

A chave de atividade combina, em JSON e com hash SHA-256:

1. Cliente, ou Empresa quando Cliente está vazio;
2. Empresa;
3. Data de início completa;
4. Data de término completa, quando disponível;
5. Horário completo;
6. Tipo;
7. Site.

Textos são normalizados com a mesma função de chave usada pelo importador.
Sala, andar, prédio, responsável e ID não participam da chave: podem variar por
recurso. Cada linha original permanece em `reservations`, com seu ID e metadados.
As salas distintas são concatenadas em Local e as linhas reunidas em sourceRows.
Dados sem identidade, data, horário válido ou ID não são consolidados
automaticamente. IDs usados em atividades conflitantes exigem revisão/ignoramento.
Término inválido ou anterior ao início também exige revisão.

Horários, tipos, empresas, sites ou períodos diferentes permanecem separados.
Não são juntados períodos adjacentes ou sobrepostos: faltam identificadores de uma
atividade principal para justificar essa junção. Agrupamento manual conserva as
restrições de identidade; o fluxo antigo de Eventos mantém sua regra anterior.

A substituição por hash do mesmo arquivo permanece. Para reservas, dentro da
mesma transação e bloqueio do centro, eventos ativos da fonte RESERVATIONS são
substituídos por chave de atividade igual **ou** interseção dos IDs originais.
Isso cobre arquivos reordenados, exportações sobrepostas e mudanças de dados com
IDs preservados. A chave original permanece durante a revisão. Não se substituem
Eventos do formato antigo, registros manuais, Residentes ou dados de outro centro.

## Mapeamento e persistência

| Exportação | Modelo interno / PostgreSQL |
| --- | --- |
| Cliente; fallback Empresa | name |
| Data de início | startAt → event_at |
| Sala(s) | location |
| Tipo | subtype |
| Data de término | endAt → extra.endAt |
| Horário revisado | schedule → extra.schedule |
| ID(s) | sourceIds → extra.sourceIds |
| Linhas originais | sourceRows → source_rows |
| Empresa, Cliente, Responsável, datas, Horário, Site, Prédio / Torre, Andar, Status, Sala, Tipo e ID por linha | reservations → extra.reservations |
| Sem equivalente operacional | theme/mode vazios; participants/participatingCompanies nulos |

Todos os registros confirmados usam `indicator_records.record_type=EVENT`.
Não existe cálculo paralelo: `recompute` atualiza EVENTOS_REALIZADOS nos mesmos
indicator_values mensais e anuais. Detalhamento, filtros, Indicadores, Dashboard
e download XLSX usam as fontes existentes. Residentes não são recalculados pela
confirmação de Eventos.

## Interface e revisão

A tela informa os dois formatos e o formato detectado. Mostra linhas lidas,
registros encontrados, eventos identificados, válidos, avisos, revisão necessária,
ignorados, incluídos e inválidos ainda incluídos. Ignorados contam linhas de origem;
eventos identificados contam atividades consolidadas confirmadas.

O fluxo Arquivo → Validação → Preview → Revisão → Confirmar → Indicadores
atualizados → Baixar XLSX permanece. Incluir elegíveis, ignorar individual/em lote,
salvar e retomar revisão e confirmação final permanecem disponíveis. Os dados
originais das reservas podem ser consultados no preview. Horário e término podem
ser corrigidos, mantendo os valores originais para rastreabilidade.

Sem reservas confirmadas, o preview informa explicitamente a ausência e a
confirmação fica bloqueada. Erros de aba e colunas são estruturais, sem serem
convertidos em erro de tamanho. MIME, assinatura XLSX, autenticação, autorização,
limite de 200 MB e tratamento de payload grande permanecem.

## Limites do relatório operacional

- Cliente/Empresa pode representar uma organização, não um título de evento.
  Atividades realmente distintas com todos os componentes da chave idênticos são
  indistinguíveis neste relatório. Um ID de atividade principal resolveria isso.
- Um evento em períodos diferentes permanece separado; consolidá-lo exige uma
  definição operacional adicional.
- Confirmada significa reserva confirmada, não comprovação da realização física.
  A seleção na revisão é a decisão do usuário sobre contabilização.
- Uma exportação diferente contendo apenas cancelamentos/pré-reservas não apaga
  eventos de um lote anteriormente confirmado. Alterar eventos históricos a partir
  de uma exportação parcial de recursos exige uma regra operacional específica.
- Não há deduplicação automática entre o formato antigo e reservas: faltam IDs
  compartilhados, e preservar os eventos antigos é requisito desta alteração.

## Validação

Regressões em backend/tests/reservation-import.test.js, nos testes de repository,
na suíte PostgreSQL existente e em frontend/src/pages/IndicatorImportPage.test.jsx.
A suíte PostgreSQL usa schemas locais temporários e verifica persistência, revisão,
mensal/anual, Dashboard, filtros de centro/ano/mês, reprocessamento do mesmo XLSX
e de XLSX reordenado, preservação de Eventos antigos e de Residentes.

Comandos: `npm.cmd test --prefix frontend -- --maxWorkers=2`,
`npm.cmd test --prefix backend -- --maxWorkers=2`,
`npm.cmd run test:integration --prefix backend -- --maxWorkers=2`,
`npm.cmd run lint`, `git diff --check`, `git status --short`, `git diff --stat`.
Para PostgreSQL, configurar DATABASE_URL para um banco **local de testes**.

Resultado em 13/10/2026: frontend **247/247**, backend **556/556** (incluindo
PostgreSQL) e integração **38/38**. PostgreSQL local: banco `agora_test`, usuário
`postgres`, porta 5432. Lint e `git diff --check` passaram. Uma execução concorrente
do frontend atingiu o timeout existente de 5 segundos em um teste de detalhamento;
a repetição completa sem concorrência passou, sem alterar configurações/limites.
O parser foi executado em memória no XLSX real e produziu os mesmos 98 eventos,
3 ignorados e 14 grupos da fixture anonimizada. Nenhum dado real foi persistido.

## Arquivos desta alteração

- backend/src/services/eventImportParser.js
- backend/src/services/reservationImportParser.js
- backend/src/services/indicatorImportService.js
- backend/src/services/indicatorImportUtils.js
- backend/src/repositories/indicatorImportRepository.js
- frontend/src/pages/IndicatorImportPage.jsx
- frontend/src/pages/IndicatorImportPage.test.jsx
- backend/tests/event-import-real-format.test.js
- backend/tests/indicator-import-lot3.test.js
- backend/tests/indicator-import-repository.test.js
- backend/tests/import-confirm-postgres.test.js
- backend/tests/reservation-import.test.js
- backend/tests/fixtures/indicator-import-workbooks.js
- backend/tests/fixtures/reservation-homologation-rows.json
- scripts/anonymize-reservations.mjs
- docs/EVENT_RESERVATION_IMPORT.md

Sem alterações de produção, Quality Gate, thresholds, workflows ou configurações
do Sonar.
