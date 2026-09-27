# ADR-0004: Usar GitHub Actions com OIDC e AWS Systems Manager para deploy

- Status: Aceito
- Data: 2026-09-18

## Contexto

O projeto precisa promover apenas artefatos aprovados pelo CI, implantar frontend e backend em seus destinos de produção e evitar credenciais AWS permanentes ou acesso SSH como mecanismo principal de entrega.

## Decisão

Usar GitHub Actions para executar o CD somente após o sucesso do CI em um push para `main`. O workflow assume uma role AWS por OIDC, com credenciais temporárias, e aciona o deploy do backend na EC2 pelo AWS Systems Manager.

O backend é instalado em `/opt/agora/releases/<sha>`, e `/opt/agora/current` aponta para a release ativa por symlink. O runtime de deploy não é persistente: o workflow envia por SSM um bootstrap que busca o `RELEASE_SHA` exato em um repositório Git temporário, confere o SHA obtido, extrai `deploy/aws/deploy-backend.sh` daquele commit, valida a sintaxe com `bash -n` e executa a cópia temporária com `trap` de limpeza. O frontend usa o artefato `frontend-dist` produzido e validado pelo CI, publicado no Amplify. Ao final, o workflow executa smoke tests de produção.

## Consequências

- O GitHub não depende de access keys AWS fixas no fluxo principal de deploy.
- Cada release do backend é rastreável pelo SHA do commit.
- O modelo de releases e symlink permite recuperação da aplicação para uma release anterior quando as condições do script são atendidas; migrations não recebem rollback automático.
- O artefato do frontend implantado é o mesmo que passou pelo build e pelas validações do CI.
- O deploy depende de GitHub Actions, OIDC, Systems Manager, EC2 e Amplify.
- O runtime de deploy é efêmero: o script executado é sempre extraído do commit aprovado no início de cada deploy ou rollback, então não existe cópia persistente a sincronizar e o drift entre o Git e o host desaparece.
- O bootstrap precisa de `git` e de acesso de leitura ao repositório na EC2, e cada execução faz um `fetch` adicional antes do `clone` da release.
- Erro de `fetch`, de comparação de SHA, de extração ou de `bash -n` aborta antes de alterar a release ativa, e o `trap` remove o diretório temporário em sucesso e em falha.

## Alternativas consideradas

Credenciais AWS fixas e chave SSH privada são citadas na documentação como mecanismos que não fazem parte do fluxo adotado. Não há avaliação formal de outras plataformas de CD no repositório.

## Evidências

- `.github/workflows/ci.yml`: produção e validação do artefato `frontend-dist` e gates do CI.
- `.github/workflows/cd-production.yml`: dependência do CI, permissão OIDC, assunção de role, comando via Systems Manager, deploy no Amplify e smoke tests.
- `deploy/aws/deploy-backend.sh`: releases por SHA, symlink `current`, backup, migrations, restart, health e recuperação da aplicação.
- `docs/CI_CD.md`: contrato e limitações do fluxo de CI/CD.
- `docs/ARCHITECTURE.md`: deployment validado com GitHub Actions, OIDC, Systems Manager, Amplify e EC2.
