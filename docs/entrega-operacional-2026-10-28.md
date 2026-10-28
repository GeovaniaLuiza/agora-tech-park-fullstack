# Registro de entrega operacional — Ágora Tech Park Fullstack

## Identificação da entrega

| Campo | Registro |
| --- | --- |
| Projeto | Ágora Tech Park Fullstack |
| Data | 28/10/2026 |
| Natureza | Entrega operacional aceita com ressalvas |
| Versão implantada | `895d1f2c96e09e0696914368506f10bd71c65983` |
| Versão de recuperação | `f1d19f5ea5617b7008dc43796292772d1f9c2743` |
| Pipeline | GitHub Actions CD Production #287, concluído com sucesso |
| Ambiente | AWS EC2, região `us-east-1` |

Este documento formaliza a entrega operacional realizada e aceita com ressalvas em 28/10/2026, com base nas informações fornecidas pelo responsável. Seu registro não representa nova verificação do ambiente de produção.

## Evidências técnicas registradas

- API, PostgreSQL e e-mail operacionais.
- Serviços `agora-api` e `caddy` ativos.
- Login, logout e navegação administrativa verificados.
- Endpoint protegido sem autenticação retorna HTTP 401.
- Backup PostgreSQL executado manualmente e validado com `gzip -t`.
- Backup automático diário habilitado.
- Homologação isolada com **207/207 testes de implantação/recuperação** e **17/17 cenários PostgreSQL/API** aprovados.

A verificação funcional do logout não comprova a rejeição de um JWT antigo após logout em produção. A validação do arquivo com `gzip -t` não comprova a restauração do banco. Os resultados da homologação isolada não encerram as pendências abaixo.

## Ressalvas e pendências

Todas as atividades desta seção permanecem pendentes neste registro.

| Pendência | Situação em 28/10/2026 |
| --- | --- |
| Teste HTTP conclusivo de rejeição de JWT antigo após logout em produção | Pendente |
| Verificação da primeira execução automática do backup | Pendente; execução programada para 29/10/2026 às 03h, horário de Brasília |
| Teste de restauração de backup real em ambiente isolado | Pendente |
| Validação de cópia externa independente dos backups | Pendente |
| Avaliação posterior dos PRs #101, #106, #107, #108, #123 e #125 | Pendente |

## Decisão formal

O responsável autorizou expressamente o **aceite operacional com ressalvas em 28/10/2026**.

O **aceite integral de segurança permanece pendente**. O aceite operacional não implica a conclusão das pendências registradas nem o encerramento integral do projeto.

## Limites desta formalização

Esta formalização é exclusivamente documental. Não autoriza alterações em código-fonte, dependências, workflows, configurações de implantação ou arquivos de ambiente, nem acesso ou alterações na AWS ou execução de deploy.

Commit, push e abertura de PR dependem de nova autorização. Este documento não deve conter credenciais, JWTs, dados pessoais ou segredos.
