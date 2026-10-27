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


## Contrato de recuperação e bloqueio de rollback inseguro

A revisão de dependências para GHSA-mrhx-c7xc-m3w5 atualiza Zod de 4.6.5 para 4.6.6 no backend. A auditoria completa também exigiu body-parser 2.4.0 (GHSA-27r3-jxmh-p828), com qs 6.16.1 exigido por essa versão. Somente os fingerprints de backend/package.json e backend/package-lock.json foram substituídos após revisão dessas mudanças; código, migration, inventário e algoritmo de verificação permanecem iguais. `reviewedBackendCommit` identifica a base do código; `reviewedDependencyUpdate` registra separadamente a revisão das dependências sobre 133df35. O novo contrato recusa o manifesto vulnerável anterior mesmo com o mesmo código de revogação. Releases preparadas com o lockfile anterior precisam ser substituídas por uma recuperação aprovada com as dependências corrigidas; não reutilizar ou alterar manualmente uma release antiga para contornar a política. O bootstrap já extrai o contrato do SHA aprovado e não exige mudança nem artefato gerado versionado.

O runtime aprovado fornece seu próprio `scripts/verify-session-recovery.mjs` e `deploy/aws/session-recovery-contract.json`. A versão inicial do contrato fixa os fingerprints SHA-256 de todo o backend de `08b7ae3` (backend/src completo, package.json, package-lock.json e migration 022). Arquivos de texto são normalizados de CRLF para LF. Inventário divergente, código/dependências alterados, arquivos ausentes e symlinks nos caminhos protegidos são rejeitados. O verificador não importa nem executa código da candidata. A equivalência é conservadora: uma mudança funcionalmente segura também precisa de revisão/homologação antes de atualizar o contrato. Nunca gerar novos fingerprints automaticamente para aprovar código desconhecido.

O script exige recuperação preparada antes do clone, backup e migrations. Prioriza o link `/opt/agora/recovery` e depois considera a anterior, mas somente uma release com aprovação operacional para o SHA e contrato atuais pode ser selecionada. Exige release conjunta, SHA de 40 caracteres, HEAD correspondente ao diretório e equivalência com o contrato confiável. O contrato nunca é lido da candidata. A própria candidata de deploy é validada antes do backup/migrations. A recuperação é revalidada depois do build, entre dry-run e migrations, depois das migrations e imediatamente antes de restaurar, tanto em falha de restart/health quanto no rollback solicitado pelo smoke público.

O preflight distingue proteção já ativa pela existência de `/opt/agora/shared/session-revocation-required` ou de sessionSchema.js na ativa. A presença isolada da migration 022 não indica ativação. Essa classificação não grava marcador nem para serviços. O contrato da nova candidata não é usado para julgar a segurança da ativa: diferenças legítimas de dependências não causam parada nem impedem atualização quando existe recuperação aprovada para o contrato novo. Isso não aprova a ativa como rollback; ela continua sujeita ao contrato e à aprovação operacional se for selecionada para restauração.

Depois das migrations, de nova validação da recuperação e antes da troca de current, o script para a API antiga e grava atomicamente o requisito persistente. Isso introduz uma breve indisponibilidade planejada e impede a janela frontend novo/backend antigo. Falha ao persistir o requisito impede ativação. O marcador não é removido no rollback nem pela retenção.

Sem recuperação preparada durante a preparação de deploy, o script registra `SESSION_DEPLOY_NOT_READY` e aborta sem parar a API, trocar current ou criar o marcador. Se a recuperação desaparecer depois das migrations e antes do corte, a ativa também é preservada, mas as migrations executadas não são revertidas. Após o corte, nenhum caminho restaura a anterior por conveniência: registra `SESSION_RECOVERY_BLOCKED` quando não consegue recuperar com segurança, preserva o banco/requisito e tenta parar a API. Se a parada falhar, registra erro crítico e exige isolamento de tráfego. Erros inesperados durante o corte registram `SESSION_ACTIVATION_FAILED` e tentam parar a API, inclusive se current já foi alterado. Uma recuperação compatível cujo próprio restart/health falhar também deixa a API parada. O erro original do deploy/smoke não é convertido em sucesso.

### Preparação obrigatória da primeira implantação

Para o estado de produção informado (013f545, sem migration 022, marcador ou recovery), o resultado esperado é NO-GO antes de clone, backup, migrations ou parada. Não usar a própria 013f545 como recuperação após ativar a revogação. Preparar e homologar uma release distinta do SHA que será publicado, com backend compatível, dependências instaladas pelo lockfile, frontend construído, release.json correto e backend/.env ligado ao ambiente compartilhado.

Além dessa release, o runtime exige `/opt/agora/shared/session-recovery-approved.json`, fora da candidata, como arquivo regular privado (0600), pertencente à identidade que executa o deploy: root no bootstrap SSM. Symlinks são recusados. O arquivo não é gerado automaticamente pelo deploy. Seu conteúdo deve ser aprovado somente depois de reunir a evidência operacional:

```json
{
  "version": 1,
  "recoverySha": "<SHA completo da recuperação preparada>",
  "contractSha256": "<SHA-256 dos bytes do contrato aprovado>",
  "evidence": "<referência ao relatório de homologação>",
  "checks": {
    "databasePermissions": true,
    "isolatedRestore": true,
    "serviceReadability": true,
    "revocationReplay": true,
    "dependenciesInstalled": true
  }
}
```

Os checks atestam permissões reais da identidade PostgreSQL da API/runner, restore isolado sem regressão de gerações, leitura como agora, rejeição de JWTs revogados e instalação pelo lockfile. O verificador confere também presença dos artefatos e versões das dependências diretas instaladas; não executa código da candidata. Essa checagem não substitui a homologação nem comprova os bytes de cada dependência transitiva. A aprovação vincula SHA e hash do contrato: alteração de contrato exige nova revisão/aprovação. Não incluir credenciais ou JWTs no arquivo ou na evidência publicada.

Manter o CD bloqueado durante essa preparação: o job exige tanto `DEPLOY_ENABLED=true` quanto a variável de repositório `SESSION_REVOCATION_ROLLOUT_READY=true`. Valor ausente ou diferente de true bloqueia automaticamente. Liberar esse gate somente em mudança operacional autorizada, após a evidência, janela, backup/restore e recuperação estarem preparados. Isso não remove os gates de CI, Sonar, environment production, SHA ou preflight do host. Nenhuma variável remota foi alterada por esta implementação.

Antes da primeira ativação, falhas de clone, dependências, build, backup ou migrations deixam a API legada servindo e não criam o requisito persistente. A migration aplicada, sozinha, não significa que o novo autenticador emitiu/revogou tokens. O corte só começa com preparação válida e migrations bem-sucedidas. Rollback solicitado antes de existir marcador ou guarda de startup é recusado sem parar a ativa; ele não é um atalho para iniciar backend novo sem a 022.

### Procedimento operacional quando a recuperação é bloqueada

1. Tratar a API como em manutenção. Confirmar processo parado e ausência de tráfego operacional; se a parada falhou, isolar o acesso antes de prosseguir. Preservar logs SSM/journal, releases e current. Não remover o marcador persistente.
2. Não restaurar o banco para corrigir um problema de aplicação. Preservar session_version e schema_migrations, incluindo o registro/checksum da 022.
3. Preparar, sob o lock de deploy, uma release de recuperação com SHA aprovado, dentro de `/opt/agora/releases/<SHA>`. Usar o backend conhecido compatível, ligar backend/.env ao ambiente compartilhado aprovado, instalar suas dependências pelo lockfile e preparar frontend/dist com VITE_API_URL=/api e release.json com o SHA correto. O simples clone de uma release sem dependências e frontend construído não constitui recuperação pronta.
4. Usar o verificador e o contrato extraídos do runtime novo aprovado para conferir essa release. Homologar os checks acima e aprovar o arquivo operacional privado para esse SHA/hash. Não executar scripts de deploy/rollback de commits anteriores à proteção. Confirmar legibilidade dos arquivos pelo usuário de serviço `agora` e leitura de schema_migrations com a identidade da API. A inicialização continuará recusando coluna/registro/checksum incompatíveis.
5. Após a ativação da proteção, apontar `/opt/agora/recovery` para a release preparada, sob o mesmo lock, e repetir a ação de recuperação com o runtime novo aprovado e o SHA ainda ativo. Gerar o payload com `RELEASE_SHA=<SHA-do-runtime-novo-aprovado> RECOVERY_ACTIVE_SHA=<SHA-atual-de-current> node scripts/prepare-deploy-runtime.mjs rollback`, usando também uma cópia aprovada do gerador novo. O primeiro SHA determina o código/política buscados; o segundo somente identifica a release ativa a substituir. Enviar o payload pelo canal SSM autorizado e conferir seu resultado. Esse parâmetro separado só é aceito para rollback e não modifica o SHA de origem do runtime. Não trocar current manualmente para contornar a verificação. Se current já foi trocado para a recuperação e seu health falhou, investigar/corrigir sua configuração e usar um novo ciclo autorizado de recuperação; não reutilizar cegamente o SHA original. Antes da primeira ativação, usar exclusivamente o procedimento de primeiro deploy, que inclui a migration; rollback não a aplica.
6. Confirmar health/readiness, frontend/release.json e smoke autenticado com conta dedicada. Repetir testes de logout/replay do JWT, reset de senha, múltiplas abas, RBAC e bloqueios de usuário. Retomar tráfego somente com revogação comprovada.

Ausência de recuperação compatível e aprovada impede a primeira implantação e atualizações posteriores antes do corte. Mesmo com essa preparação, perda/corrupção da recuperação ou falha em seu restart/health após o corte pode causar indisponibilidade; a API será parada em vez de reabrir código que ignore revogações. Essa preparação não foi executada em produção por esta alteração.

### Backup e restauração sem ressuscitar JWTs

O backup pg_dump é anterior à migration e ao corte do serviço; não é um snapshot do estado de revogação no instante de uma falha posterior. A compressão validada não prova restauração. Rollback de aplicação não restaura banco, não remove a coluna, não zera versões e não restaura o diretório shared.

Restore lógico ou EBS é um procedimento excepcional, separado, com todos os emissores de JWT e tráfego operacional parados/isolados. Antes de qualquer restore, preservar em armazenamento restrito o estado de revogação mais recente, caso ainda seja confiável e acessível, junto com a identidade dos usuários e metadados das migrations. Após restaurar em ambiente isolado e aplicar o schema versionado, reconciliar usuários coincidentes pelo maior session_version conhecido; nunca diminuir/zerar gerações para fazer tokens passarem. Usuários excluídos ou com status alterado após o backup também precisam ser reconciliados, sem reativá-los implicitamente.

Se não for possível comprovar que nenhum estado de revogação regrediu — inclusive em restore de snapshot do host inteiro —, invalidar globalmente os JWTs antes de reabrir a API: substituir JWT_SECRET por um segredo novo, forte e externo ao backup em todos os emissores/instâncias, sem aceitar o segredo anterior nem reutilizar segredos restaurados. Recriar/preservar o requisito do host e utilizar somente backend compatível. Isso exige novo login de todos os usuários e não substitui a revogação por geração para os tokens emitidos após a recuperação. Rotação isolada com backend legado não é recuperação segura.

Homologar restore somente com banco/contas sintéticos: token revogado antes da falha deve continuar recusado; token assinado com segredo anterior deve falhar após recuperação; novo login deve emitir token da geração reconciliada e continuar sujeito a logout/reset. Não há restore automático, reconciliação automática de dados reais nem rotação automática de segredos nesta implementação. Os testes PostgreSQL cobrem a reconciliação monotônica pelo maior session_version conhecido (inclusive sua repetição após nova revogação) e a regressão simulada da geração seguida de invalidação por novo segredo, em schema descartável.
