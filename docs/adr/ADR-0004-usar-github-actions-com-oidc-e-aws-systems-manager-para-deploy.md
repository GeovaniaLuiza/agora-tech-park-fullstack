# ADR-0004: Usar GitHub Actions com OIDC e AWS Systems Manager para deploy

- Status: Aceito
- Data: 2026-09-18

## Contexto

O projeto precisa promover apenas artefatos aprovados pelo CI, implantar frontend e backend em seus destinos de produção e evitar credenciais AWS permanentes ou acesso SSH como mecanismo principal de entrega.

## Decisão

Usar GitHub Actions para executar o CD somente após o sucesso do CI em um push para `main`. O workflow assume uma role AWS por OIDC, com credenciais temporárias, e aciona o deploy do backend na EC2 pelo AWS Systems Manager.

O backend é instalado em `/opt/agora/releases/<sha>`, e `/opt/agora/current` aponta para a release ativa por symlink. O workflow chama o script persistente `/opt/agora/bin/deploy-backend.sh`. O frontend usa o artefato `frontend-dist` produzido e validado pelo CI, publicado no Amplify. Ao final, o workflow executa smoke tests de produção.

## Consequências

- O GitHub não depende de access keys AWS fixas no fluxo principal de deploy.
- Cada release do backend é rastreável pelo SHA do commit.
- O modelo de releases e symlink permite recuperação da aplicação para uma release anterior quando as condições do script são atendidas; migrations não recebem rollback automático.
- O artefato do frontend implantado é o mesmo que passou pelo build e pelas validações do CI.
- O deploy depende de GitHub Actions, OIDC, Systems Manager, EC2 e Amplify.
- O script instalado no host precisa ser mantido operacionalmente; alterar sua cópia no repositório não atualiza automaticamente `/opt/agora/bin/deploy-backend.sh`.

## Alternativas consideradas

Credenciais AWS fixas e chave SSH privada são citadas na documentação como mecanismos que não fazem parte do fluxo adotado. Não há avaliação formal de outras plataformas de CD no repositório.

## Evidências

- `.github/workflows/ci.yml`: produção e validação do artefato `frontend-dist` e gates do CI.
- `.github/workflows/cd-production.yml`: dependência do CI, permissão OIDC, assunção de role, comando via Systems Manager, deploy no Amplify e smoke tests.
- `deploy/aws/deploy-backend.sh`: releases por SHA, symlink `current`, backup, migrations, restart, health e recuperação da aplicação.
- `docs/CI_CD.md`: contrato e limitações do fluxo de CI/CD.
- `docs/ARCHITECTURE.md`: deployment validado com GitHub Actions, OIDC, Systems Manager, Amplify e EC2.
