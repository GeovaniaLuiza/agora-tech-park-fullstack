# Revogação e ciclo de vida das sessões

## Persistência no PostgreSQL

A migration `022_user_session_version.sql` adiciona `users.session_version`, inteiro não negativo com valor inicial zero. O login emite um JWT HS256 com `sub`, `sv`, um `jti` aleatório e a validade absoluta configurada por `JWT_EXPIRES_IN` (padrão: 8 horas). A atividade não renova essa validade e não há refresh token.

Em cada requisição autenticada, a API verifica a assinatura e a expiração, carrega o perfil atual não excluído e compara `sv` com `session_version`. Uma versão diferente retorna `401 / SESSION_REVOKED`. A versão é interna: não integra o perfil público. A API responde com `Cache-Control: no-store`.

O logout incrementa a versão da conta e registra a auditoria na mesma transação. Isso encerra **todas as sessões da conta, inclusive em outros dispositivos**. Um UPDATE condicionado à versão autenticada impede que um logout atrasado incremente novamente a versão e invalide um login posterior. A redefinição de senha incrementa a versão na transação que altera a senha, consome o link e registra a auditoria. Falha na auditoria desfaz a operação inteira.

Foi escolhida uma geração por usuário, em vez de uma denylist por JWT: armazenamento constante por conta, sem tokens ou hashes persistidos, sem limpeza periódica e com revogação compartilhada entre instâncias e reinicializações da API. A contrapartida é a ausência de logout individual por dispositivo. Para oferecer essa funcionalidade futuramente, será necessária uma tabela de sessões por dispositivo.

JWTs existentes sem `sv` pertencem à geração zero. Continuam sujeitos à validade original e deixam de funcionar após o primeiro logout ou reset de senha da conta. A migration deve preceder o código novo; não há fallback que ignore a versão caso a coluna ou o banco esteja indisponível. Reverter para código antigo removeria a aplicação da revogação e não é um rollback seguro sem uma estratégia adicional de invalidação de tokens.

As regras de `INACTIVE`, soft delete (`deleted_at`), e-mail confirmado, vínculo ativo de residente e RBAC continuam sendo verificadas. O logout não altera status, papel, vínculos ou exclusão da conta. Não foram alteradas as permissões existentes do dashboard.

Antes de abrir a porta HTTP, `server.js` executa uma checagem somente de leitura: a migration `022` deve estar registrada em `schema_migrations` com o checksum do arquivo desta release, e a coluna efetiva deve ser `integer NOT NULL DEFAULT 0`. Ausência, inconsistência ou indisponibilidade do banco encerra a inicialização com código 1 e fecha o pool. A checagem não aplica migrations. O script de deploy já executa o runner antes de trocar a release e reiniciar o serviço; a checagem também protege a inicialização direta por Node/systemd.

O artefato do backend deve incluir `database/migrations/022_user_session_version.sql`, e o usuário da API precisa de leitura em `schema_migrations`. A checagem usa o arquivo efetivo da release, seguindo o mesmo cálculo de checksum do runner.

## Navegador

O token continua em `sessionStorage` por padrão e em `localStorage` quando “Lembrar-me” está marcado. Essa escolha mantém a compatibilidade, mas os tokens continuam acessíveis a JavaScript da mesma origem; não equivale a um cookie HttpOnly.

O logout remove imediatamente token e identidade locais, sem aguardar a API. Um sinal aleatório sem credenciais em `localStorage` comunica a saída às outras abas da mesma origem, incluindo abas com token em `sessionStorage`. A aba receptora limpa sua sessão sem emitir outro logout. Se o armazenamento compartilhado estiver bloqueado, a limpeza local continua funcionando, e as demais abas dependem da próxima revalidação/resposta da API.

As rotas protegidas aguardam `/auth/me` na inicialização. Retomar foco, visibilidade ou navegação de histórico provoca revalidação; a checagem em segundo plano não desmonta um formulário enquanto a API responde. Falhas de verificação bloqueiam a operação até recuperação, preservando o token para nova tentativa. `401` protegido encerra a sessão, inclusive nos downloads CSV/PDF/XLSX. Erros de credenciais nos endpoints públicos não encerram outra sessão válida.

Quando uma falha de verificação bloqueia a rota, seus componentes são desmontados. A recuperação confirma a sessão novamente, mas não restaura alterações de formulário que existiam apenas na memória desses componentes.

A expiração do JWT também tem um temporizador local para remover a interface mesmo sem nova requisição. A decodificação local serve apenas ao prazo visual; assinatura, versão e permissão são verificadas na API. Respostas atrasadas de restauração, login e avatar não podem restabelecer a identidade após logout. Um `401` atrasado de um token anterior não apaga um login mais novo.

Se a API estiver indisponível no logout, a saída local ocorre, mas a revogação remota não pode ser garantida: uma cópia do JWT pode continuar válida até expirar ou até outra revogação bem-sucedida. Requisições que já passaram pela autenticação antes do commit da revogação podem concluir; as próximas são rejeitadas.

## Validação

- `backend/tests/session-security.test.js`: gerações, legado, expiração, assinatura/algoritmo, status, RBAC e indisponibilidade do banco.
- `backend/tests/session-repository.test.js`: transações, auditoria, logout repetido/atrasado e consumo inválido de reset.
- `backend/tests/session-schema.test.js` e `server-startup.test.js`: migration registrada e compatível antes de abrir HTTP, bloqueio de inicialização e fechamento do pool em falha.
- `backend/tests/integration/session-security.integration.test.js`: HTTP e PostgreSQL reais, dois tokens, logout, novo login, reset, rollback, RBAC, `INACTIVE`, soft delete e rotas sem autenticação.
- `backend/tests/integration/session-schema.integration.test.js`: aplicação da `022` sobre conta existente com geração zero; recusa de inicialização antes do registro e diante de checksum, tipo, nulabilidade ou default incompatíveis, em schema descartável.
- `frontend/src/contexts/session-security.test.jsx`: rotas vazias, logout entre abas, remoção imediata, expiração, recuperação, respostas atrasadas e `401` nas exportações.

Os testes de integração novos exigem `NODE_ENV=test` e banco local descartável com nome terminado em `_test`; os dados sintéticos ficam em um schema exclusivo. As migrations são aplicadas pelo runner versionado nesse banco de teste. Não executar essas verificações contra dados reais.

Antes de uma publicação futura, verificar também com duas abas reais (com e sem “Lembrar-me”), sessão anônima nova, histórico do navegador e API indisponível durante logout. Esta alteração não autoriza deploy nem aplicação manual da migration em produção.
