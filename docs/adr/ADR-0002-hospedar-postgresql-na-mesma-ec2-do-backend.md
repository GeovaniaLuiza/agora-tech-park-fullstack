# ADR-0002: Hospedar PostgreSQL na mesma EC2 do backend nesta etapa

- Status: Aceito
- Data: 2026-09-18

## Contexto

A arquitetura vigente foi definida para uma etapa de baixo custo e carga pequena. A aplicação precisa de PostgreSQL persistente, mas a operação de um serviço de banco separado adicionaria recursos e custo à implantação atual.

## Decisão

Executar o PostgreSQL 16 na mesma instância EC2 do backend, escutando somente em `127.0.0.1:5432`, com persistência em volume EBS. O deploy cria um backup local antes das migrations. RDS não integra a arquitetura desta etapa.

## Consequências

- A arquitetura tem menor complexidade operacional e de custo nesta etapa.
- O PostgreSQL não é exposto diretamente à internet.
- Aplicação e banco compartilham CPU, memória, disco e domínio de falha da EC2.
- O backup pré-migration permanece no mesmo host e não protege contra a perda conjunta da EC2 ou do volume.
- Backup off-site e teste de restauração continuam pendentes e exigem uma estratégia futura.

## Alternativas consideradas

O Amazon RDS é citado na documentação operacional como componente que não entra nesta etapa sem nova aprovação de custo. Isso não representa rejeição definitiva: sua adoção pode ser reavaliada em uma evolução da arquitetura.

## Evidências

- `docs/ARCHITECTURE.md`: PostgreSQL 16 local à EC2, em loopback, e limites atuais de backup e restauração.
- `docs/AWS_PRODUCTION.md`: PostgreSQL em `127.0.0.1:5432`, volume EBS, compartilhamento de recursos e domínio de falha.
- `deploy/aws/agora-api.service`: dependência do serviço da API em relação ao PostgreSQL local.
- `deploy/aws/deploy-backend.sh`: criação e retenção local do backup antes das migrations.
- `docs/CONFORMIDADE_TCC.md`: PostgreSQL em produção validado e backup off-site/restauração registrados como pendências.
