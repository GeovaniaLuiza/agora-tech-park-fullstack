# Qualidade, testes e Sonar

## Estado de referência

Em 12 de agosto de 2026, a suíte local validada possuía 86 testes backend e 70 testes frontend, além de um teste de integração PostgreSQL. A cobertura medida foi:

| Projeto | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| backend | 47,31% | 46,42% | 34,92% | 53,89% |
| frontend | 58,52% | 54,14% | 42,31% | 67,91% |

Os thresholds de regressão ficam abaixo dessa medição (`backend: 45/40/30/50`; `frontend: 55/50/40/65`). A meta para código novo no Sonar é 80%, sem criar testes artificiais.

## Estratégia

Prioridade backend: autenticação, RBAC, criação/publicação de formulários, respostas, indicadores, notificações, middlewares, validações e health/observabilidade. Repositories são cobertos por integração quando o comportamento depende do PostgreSQL.

Prioridade frontend: contexts, services, validações, componentes e fluxos críticos. Testes devem observar comportamento acessível, não detalhes internos.

ESLint 9 foi adicionado somente como dependência de desenvolvimento para tornar regras objetivas no CI; não aumenta o bundle nem o runtime. `@vitest/coverage-v8` reutiliza o runner já adotado e gera LCOV sem introduzir outro framework. O custo financeiro é zero; a manutenção fica em PRs semanais do Dependabot e revisão de mudanças major.

## SonarQube Cloud

Foi escolhido SonarQube Cloud porque o repositório público dispensa manter servidor, banco, atualizações, backups e RAM adicional na EC2. O impacto operacional é baixo; o custo deve ser confirmado no plano vigente antes do onboarding. SonarQube Server só passa a ser preferível se houver requisito de isolamento ou política que impeça análise SaaS.

Configuração:

1. importe o repositório no SonarQube Cloud e desative Automatic Analysis;
2. confirme `sonar.projectKey` e `sonar.organization` em `sonar-project.properties` ou defina as variáveis `SONAR_PROJECT_KEY` e `SONAR_ORGANIZATION` no GitHub;
3. grave o token somente no secret `SONAR_TOKEN`;
4. configure Quality Gate para código novo com cobertura ≥ 80%, duplicação ≤ 3% e sem falhas de Reliability/Security de severidade High ou Blocker;
5. torne o check `SonarQube Cloud Quality Gate` obrigatório na proteção de `main`.

O scanner aguarda o Quality Gate. `scripts/check-sonar-quality.mjs` consulta também os modelos Legacy (`BLOCKER/CRITICAL`) e MQR (`BLOCKER/HIGH`) e falha com qualquer issue aberta correspondente.

## Dependências

`npm run audit` bloqueia vulnerabilidades High/Critical. O frontend conserva React Router 6; advisories Moderate remanescentes devem ser acompanhados até uma atualização compatível, sem forçar uma migração quebradora para v7. Dependabot abre PRs semanais agrupados.
