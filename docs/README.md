# Documentação — Ágora Tech Park

Esta documentação técnica acompanha o código do Ágora Tech Park Fullstack e é mantida versionada no mesmo repositório. Use esta página como ponto de partida para desenvolvimento, avaliação e colaboração no projeto.

## 1. Visão geral do projeto

- [README principal](../README.md) — apresentação da plataforma, stack, execução local e comandos de qualidade.
- [RFC](RFC.md) — contexto do produto, objetivos, público, escopo e visão inicial de arquitetura.
- [Requisitos do sistema](REQUIREMENTS.md) — requisitos funcionais e não funcionais, casos de uso, rastreabilidade e limites de escopo.

## 2. Arquitetura e decisões técnicas

- [Arquitetura](ARCHITECTURE.md) — arquitetura atual, diagramas de contexto, containers e deployment, além de ambientes e operação.
- [Registros de Decisões Arquiteturais (ADRs)](adr/README.md) — índice das decisões arquiteturais aceitas, com contexto, consequências e evidências.

Consulte a arquitetura para a topologia e os diagramas atuais; os ADRs registram as decisões que a fundamentam, sem substituir a documentação operacional.

## 3. Requisitos e funcionalidades

- [Requisitos do sistema](REQUIREMENTS.md) — fonte de referência para comportamento esperado, requisitos e casos de uso.
- [RFC](RFC.md) — motivação do produto, regras de negócio e escopo.
- [Formulários e indicadores](FORMS_INDICATORS.md) — configuração, submissão, consistência e precedência no fluxo de coleta.
- [Dashboard institucional — carga 2025](DASHBOARD_INSTITUCIONAL_2025.md) — origem, persistência, APIs, interface e validação da carga institucional.
- [Prompt — Indicadores FAPESC/SCTI](PROMPT_INDICADORES_FAPESC_SCTI.md) — referência complementar para os indicadores FAPESC/SCTI.

## 4. Desenvolvimento e qualidade

- [CI/CD](CI_CD.md) — integração contínua, proteção da branch principal e entrega contínua.
- [Qualidade, testes e Sonar](QUALITY.md) — estratégia de testes, cobertura, análise de qualidade e dependências.
- [README principal](../README.md#desenvolvimento-local) — pré-requisitos, inicialização e endereços do ambiente local.

## 5. Produção e infraestrutura

- [Produção AWS de baixo custo](AWS_PRODUCTION.md) — arquitetura adotada, rede, preparação do host, deploy, banco, backup e ativação em produção.
- [Sincronização do repositório com AWS](AWS_REPOSITORY_ALIGNMENT.md) — inventário, alinhamento, validações e riscos relacionados às referências de produção.

## 6. Observabilidade e operação

- [Monitoramento e logs](MONITORING.md) — métricas, logs, health checks, dashboards, alertas, validação operacional e troubleshooting.

## 7. Segurança e dados

- [Remoção de dados pessoais do histórico Git](SECURITY_DATA_REMOVAL.md) — estado, pré-condições, procedimento e validação para remoção de dados pessoais do histórico.
- [Checkpoint — remoção de dados](DATA_REMOVAL_CHECKPOINT.md) — registro de risco, validação e procedimentos de recuperação e publicação futura.
- [Inventário de remoção de dados](DATA_REMOVAL_INVENTORY.json) — inventário estruturado que apoia a verificação da remoção de dados.

Documentos de segurança e dados não devem conter secrets, credenciais ou dados pessoais.

## 8. Documentação funcional complementar

Os documentos funcionais complementares estão reunidos na seção [Requisitos e funcionalidades](#3-requisitos-e-funcionalidades), para manter a navegação concentrada nas referências de produto e fluxos do sistema.

## 9. Como manter esta documentação

- Atualize [REQUIREMENTS.md](REQUIREMENTS.md) quando o comportamento funcional mudar.
- Crie ou atualize um [ADR](adr/README.md) quando uma decisão arquitetural relevante mudar.
- Atualize [ARCHITECTURE.md](ARCHITECTURE.md) quando a topologia ou os componentes mudarem.
- Atualize [MONITORING.md](MONITORING.md) quando a observabilidade mudar.
- Mantenha links relativos.
- Não documente secrets, credenciais ou dados pessoais.
- Revise os links antes dos commits.
