# Investigação da reutilização de e-mail

## Fluxos encontrados

| Perfil na tela Administração > Usuários | Endpoint | Router / controller | Service | Repository |
| --- | --- | --- | --- | --- |
| Administrador (`ADMIN`) | `POST /api/admin/users` | `accessRoutes` / `accessController.createUser` | `accessService.createUser` | `accessRepository.createManagedUser` |
| Pesquisador (`PESQUISADOR`) | mesmo | mesmo | mesmo | mesmo |
| Gestor (`GESTOR`) | mesmo | mesmo | mesmo | mesmo |
| Residente (`RESIDENTE`) | mesmo | mesmo | mesmo | mesmo |

`RESEARCHER` não é um valor de perfil aceito; o identificador persistido é
`PESQUISADOR`. `AdminUsersPage.save` chama `services/api.createUser` para todos
os perfis. A rota exige autenticação e autorização ADMIN. A única condição
específica de perfil no cadastro exige organização para RESIDENTE. Se informada,
a organização precisa estar ativa. O repository sempre faz INSERT, deixa o banco
gerar um UUID novo e grava criação/auditoria/vínculo na mesma transação.

O cadastro público é um fluxo diferente: `POST /api/auth/register-request` passa por
`authRoutes`, `authController.registerRequest`, `authService.registerRequest` e
`userRepository.createPending`. Cria uma solicitação EMAIL_PENDING, sem perfil;
o perfil é definido na aprovação administrativa. Ele já consultava
`userRepository.findByEmail` antes da inserção.

## Disponibilidade e estado local

A consulta compartilhada é:

```sql
SELECT * FROM users
WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL;
```

Ela reserva e-mail para ACTIVE, INACTIVE, PENDING, EMAIL_PENDING e REJECTED.
Somente `deleted_at` preenchido libera o endereço. A migration 020 já instala
`idx_users_live_email_lower_unique`, com a mesma expressão e predicado, e remove
as duas proteções antigas de unicidade absoluta. Não houve alteração de migration.

O cadastro administrativo depende da inserção e traduz **qualquer** erro 23505 em
“Já existe um usuário com este e-mail.”, inclusive se causado por outra constraint
na transação. O índice garante unicidade em concorrência. Não existe verificação
de unicidade por perfil, nem reaproveitamento de ID.

Na continuação da investigação, `backend/src/services/accessService.js` foi
restaurado ao HEAD, retirando a centralização especulativa e a mudança no tratamento
de 23505. Os ajustes unitários dependentes em `access-service-lot5.test.js` e
`auth-access.test.js` também foram restaurados. A ausência de diferenças nesses
três arquivos foi confirmada por `git diff --exit-code`. Os testes ampliados de
integração foram preservados, sem commit, push ou PR.

Restringir a tradução de 23505 ao índice de e-mail pode ser uma melhoria independente
de precisão da mensagem. Isso não libera um endereço bloqueado por um índice
absoluto ou por uma conta apenas inativa, e não é uma correção funcional comprovada
do incidente. A mudança deve ser avaliada separadamente, com as constraints reais
do ambiente e os contratos de resposta; não foi mantida nesta investigação.

## Limite da conclusão sobre produção

O código inspecionado não contém uma condição que explique RESIDENTE funcionar
enquanto os demais perfis falham com um registro realmente excluído. O fluxo HTTP
local com PostgreSQL 16 e migrations 001–020 passou para os quatro perfis.
Os mesmos 27 testes de integração também passaram usando o `accessService` original
do HEAD, antes da centralização; o arquivo editado foi restaurado após essa prova.
Assim, a centralização proposta não comprova a causa do incidente em produção.
Para concluir a causa, é necessário correlacionar a
requisição com a versão implantada, o registro antigo e a constraint do conflito.
Não houve conexão nem alteração em produção nesta investigação.

Consultas somente de leitura, com o endereço parametrizado e sem divulgar os
dados pessoais dos usuários:

```sql
SELECT id, role, status, deleted_at FROM users WHERE LOWER(email)=LOWER($1);
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename='users';
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.users'::regclass;
SELECT filename, checksum, applied_at FROM schema_migrations
WHERE filename='020_user_email_soft_delete.sql';
```

`deleted_at IS NULL` com INACTIVE explica corretamente o bloqueio, mas não é
evidência de exclusão. Um índice absoluto remanescente ou outra versão da API são
hipóteses a verificar, não causas confirmadas. Não converter contas INACTIVE em
excluídas por inferência. Se for comprovada necessidade de mudar a migration,
interromper e relatar antes de alterá-la.

## Regressões cobertas

`tests/integration/user-email-reuse.integration.test.js` usa a aplicação Express
real via Supertest e PostgreSQL real; somente o envio externo de e-mail é simulado.
Para cada perfil, cobre conflitos case-insensitive nos cinco status não excluídos
e o ciclo HTTP de criação, inativação, tentativa bloqueada, exclusão e recriação.
Confere novo ID, novo registro ACTIVE sem deleted_at, registro antigo preservado,
auditoria, histórico, vínculos e invalidação dos tokens antigos. Também define
nova senha e confirma login na nova identidade, sem alterar JWT ou RBAC.
Mantém as regressões de rollback por falha de auditoria, concorrência e backfill
conservador da migration 020.

Validação local da etapa anterior, antes da restauração: **71 arquivos, 818 testes aprovados**, incluindo as sete
suítes de integração (109 testes). PostgreSQL 16, banco isolado com locale ICU
`pt-BR`, migrations 001–020 aplicadas pelo runner existente. Comando, executado
de `backend/` com DATABASE_URL apontando para esse banco e JWT_SECRET de teste:

```text
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot
```

O cluster inicial com locale `C` expôs uma falha de normalização de acentos no
teste de catálogo de centros. A repetição com ICU passou sem alterar código de
catálogo ou testes relacionados. `git diff --check` também passou. Não houve
execução de CI, Sonar ou deploy nesta tarefa.

## Inspeção pública de produção em 16/10/2026

Às 12:26:55 UTC (09:26:55 em São Paulo), a leitura HTTPS pública, solicitada com
Cache-Control no-cache, retornou HTTP 200 e Content-Type application/json em
`https://agora-techpark.duckdns.org/release.json`:

```json
{"sha":"b30b4c6c7dba4fa948e459079b6c175c3ee86782"}
```

O marcador coincide exatamente com o SHA solicitado. Last-Modified informado:
16/10/2026 00:09:06 UTC. Esse horário é o metadado do arquivo; não comprova restart
do backend nem horário do deploy. O marcador identifica o frontend servido, não
prova a versão carregada no processo Node. O SHA solicitado não está disponível
no banco de objetos Git local.

O HTML público referencia `/assets/index-BcAnAU5T.js`, inspecionado por GET sem
executar formulários ou enviar requisições de mutação. Nesse bundle:

| Perfil | Cadastro | organizationId | Demais campos |
| --- | --- | --- | --- |
| ADMIN | POST /api/admin/users | null | name, email, role=ADMIN |
| PESQUISADOR | POST /api/admin/users | null | name, email, role=PESQUISADOR |
| GESTOR | POST /api/admin/users | null | name, email, role=GESTOR |
| RESIDENTE | POST /api/admin/users | valor selecionado | name, email, role=RESIDENTE |

O estado inicial do formulário contém apenas name, email, role e organizationId.
Não há status, organizationIds ou identificador de usuário no payload de cadastro.
Não foi encontrada diferença de endpoint ou identidade por perfil. O botão Excluir
chama DELETE /api/admin/users/:id; Inativar chama PATCH /api/admin/users/:id/status
com status=INACTIVE. Isso prova o comportamento do bundle atual, mas não qual ação
foi executada na tentativa relatada, nem qual bundle estava no navegador naquele
momento. Não houve captura da requisição original.

## Evidências de produção ainda indisponíveis

| Item | Resultado |
| --- | --- |
| SHA no marcador público | Confirmado: b30b4c6c7dba4fa948e459079b6c175c3ee86782 |
| Symlink /opt/agora/current e release física | Não inspecionados; falta acesso operacional |
| Serviço carregado, cwd do processo, restart após deploy | Não confirmados |
| Migration 020, coluna deleted_at e definição da tabela | Não confirmadas em produção |
| Índices e constraints de e-mail, incluindo WHERE | Não consultados em produção |
| Registro antigo e classificação A/B/C/D | Não consultados; falta e-mail exato e acesso ao banco |
| Auditoria de criação, inativação, exclusão e perfil | Não consultada |
| Ação real DELETE versus INACTIVE | Não determinada |
| 23505 real, constraint, detail sanitizado, endpoint, horário e role | Não capturados; faltam acesso aos logs e correlação da tentativa |
| Causa raiz | Não confirmada |
| Arquivo que precisa mudar | Indeterminado |
| Nova migration ou reparo de dados históricos | Necessidade não demonstrada; nenhuma operação autorizada/executada |
| Correção de frontend ou backend | Não demonstrada |
| Pronto para correção | Não; aguardar evidências |

O ambiente desta sessão não expôs AWS CLI/GitHub CLI no PATH ou nos caminhos
padrão verificados, variáveis de acesso operacional, arquivos nas localizações
.aws/.ssh verificadas ou sessão de navegador disponível. Foi solicitado acesso
operacional de leitura ou saídas coletadas por alguém com acesso, além do e-mail,
horário aproximado e perfil da tentativa. Não solicitar nem transmitir senhas,
hashes, tokens ou chaves privadas. O e-mail não foi informado e não consta aqui.

No código local, o catch de 23505 descarta a causa ao criar o erro de negócio;
o logger também omite req.body e sanitiza err sem code/constraint/detail. Isso é
uma limitação potencial da investigação por logs da aplicação, não prova de que
os logs efetivos de produção são insuficientes. É necessário inspecionar os logs
disponíveis, inclusive PostgreSQL, com sanitização antes de exibir resultados.

A investigação remota foi interrompida neste limite de acesso. Nenhuma migration,
escrita em banco, exclusão/inativação de usuário, restart, deploy, commit, push ou
PR foi executado nesta etapa.
