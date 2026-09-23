# Monitoramento e logs

## Estado validado em produção

Em 18/09/2026, a produção usa AWS EC2 com Ubuntu 24.04, API Node.js/Express em `127.0.0.1:3000`, PostgreSQL 16 somente local, Caddy publicando a API por HTTPS e Grafana Alloy 1.19.2 enviando métricas e logs ao Grafana Cloud. A arquitetura evita operar Prometheus, Loki e Grafana na EC2.

Os serviços `agora-api.service`, `postgresql.service`, `caddy.service` e `alloy.service` foram comprovados como `active` e `enabled`. O Alloy está instalado, sua configuração foi validada com `alloy validate` e, após a correção da autenticação, não houve novos erros no journal.

O ambiente usa Grafana Cloud; plano, limites, retenção e custos devem ser conferidos na conta. Foi observado um período de trial, portanto o plano não deve ser presumido como Free.

Configuração operacional do Alloy:

- configuração ativa: `/etc/alloy/config.alloy`;
- variáveis adicionais: `/etc/alloy/alloy.env`, com permissão `0600`;
- drop-in systemd: `/etc/systemd/system/alloy.service.d/override.conf`.

Nunca registre ou versione `GRAFANA_CLOUD_API_TOKEN`, `METRICS_TOKEN`, `DATABASE_URL` com senha, `SMTP_PASSWORD` ou qualquer outro secret.

## Métricas

Fluxo validado ponta a ponta em 18/09/2026:

```text
Node/Express /metrics
    ↓
Grafana Alloy
    ↓
Grafana Cloud Prometheus
```

A API expõe `http://127.0.0.1:3000/metrics`; em produção, o scrape do Alloy usa bearer token. A consulta `agora_process_process_cpu_seconds_total` retornou dados reais no Grafana Explore com `instance="127.0.0.1:3000"`, `job="prometheus.scrape.agora_api"` e `service="agora-api"`. Isso comprova o `remote_write` para a métrica de CPU do processo, não todas as séries operacionais.

O código também oferece métricas padrão de processo, requisições e latência HTTP, disponibilidade/conexões/tamanho do banco e contadores da aplicação. Em 23/09/2026, o dashboard consolidado exibiu séries reais de requisições, latência média e p95, CPU e memória RSS do processo Node, disponibilidade e conexões PostgreSQL. O exporter Unix do Alloy oferece métricas de host, como CPU, memória e disco; as demais séries de host, tamanho do banco e aplicação ainda precisam de validação específica.

O PostgreSQL segue o fluxo `PostgreSQL → prometheus.exporter.postgres → Grafana Alloy → Grafana Cloud Prometheus`. O journal do Alloy registrou `Established new database connection` e PostgreSQL 16.15.0. O usuário `grafana_reader` tem `LOGIN`, pertence a `pg_monitor` e possui `CONNECT` no database `agora`; não é superuser e não possui `CREATEDB` nem `CREATEROLE`. A senha e a URL completa de conexão não devem ser documentadas.

## Logs

Fluxo validado ponta a ponta em 18/09/2026:

```text
Pino
    ↓
stdout/journald
    ↓
Grafana Alloy
    ↓
Grafana Cloud Loki
```

O Alloy coleta especificamente `_SYSTEMD_UNIT=agora-api.service` e aplica os labels `application="agora-tech-park"`, `environment="production"` e `service="agora-api"`. A consulta `{service="agora-api"}` retornou no Grafana Explore um log real gerado por `GET /api/health`, com `statusCode=200`, JSON preservado, request ID, `responseTime` e redaction `[REDACTED]`.

A API usa Pino em JSON e redige campos sensíveis; não adicione payloads ou objetos `process.env` a logs. O Caddy também gera logs JSON em stdout, mas a configuração atual do Alloy não possui source para `caddy.service`. Portanto, esses logs não são enviados ao Loki pelo pipeline versionado.

## Health e exposição

`curl http://127.0.0.1:3000/api/health` retornou HTTP 200, e essa chamada foi posteriormente observada no Loki. O health público está disponível em `https://agora-techpark.duckdns.org/api/health`.

O `deploy/aws/Caddyfile` bloqueia `/metrics` com resposta 404 antes do proxy. Assim, o endpoint fica acessível ao Alloy pela interface local e não é publicado pelo Caddy versionado. Ele deve permanecer restrito à interface local.

## Dashboards e alertas

Existem cinco dashboards versionados em `monitoring/dashboards`: API, aplicação, infraestrutura, PostgreSQL e `monitoring/dashboards/production-overview.json`. Os quatro primeiros referenciam métricas HTTP/latência, de negócio, host e banco; sua validação final permanece pendente. O dashboard consolidado **Agora Tech Park - Production Overview**, UID `agora-production-overview`, reúne disponibilidade, tráfego, desempenho, processo Node, PostgreSQL e logs da API em uma única visão. Ele foi importado e homologado no Grafana Cloud em 23/09/2026.

O dashboard unificado contém exatamente estes dez painéis:

1. API up/down;
2. Requests por minuto;
3. Erros HTTP 5xx;
4. Latência da API (média e p95);
5. CPU do processo Node;
6. Memória RSS do processo Node;
7. PostgreSQL up/down;
8. Conexões PostgreSQL, separadas por `state`;
9. Logs recentes da API;
10. Quantidade de erros nos logs Pino (`level >= 50`) em janelas de 5 minutos.

Na homologação de 23/09/2026, o dashboard importado usou `grafanacloud-bluegerbil2886-prom` em `DS_PROMETHEUS` e `grafanacloud-bluegerbil2886-logs` em `DS_LOKI`, ambos validados com dados reais. O filtro regex `.*-logs$` da variável `DS_LOKI` manteve a fonte Loki correta e excluiu `grafanacloud-bluegerbil2886-alert-state-history` da seleção.

### Evidências operacionais de 23/09/2026

- **Disponibilidade:** API up/down e PostgreSQL up/down exibiram `UP`.
- **Métricas da API:** Requests por minuto mostrou dados reais; Latência da API exibiu séries de média e p95. Os painéis de CPU e memória RSS do processo Node e sua telemetria correspondente foram validados.
- **Erros HTTP 5xx:** o painel exibiu `0 req/s` quando não havia erros, em vez de `No data`. Isso valida a apresentação de zero, não um teste real de resposta 5xx.
- **PostgreSQL:** Conexões PostgreSQL exibiu séries `active`, `idle` e `unknown`.
- **Logs centralizados:** Logs recentes da API mostrou logs Pino estruturados reais no Grafana Cloud Loki, incluindo registros com `level` 30; nenhum conteúdo específico dos logs é reproduzido aqui.
- **Erros nos logs (5 min):** na ausência de logs Pino com `level >= 50`, o painel exibiu linha em zero; o fallback `vector(0)` foi validado operacionalmente. Isso não representa teste de geração de erro.

Foram realizadas capturas de tela manuais do Grafana Cloud em 23/09/2026 mostrando API e PostgreSQL `UP`, requests, latência, conexões PostgreSQL, logs Pino no Loki, 5xx e erros nos logs em zero, e Prometheus e Loki selecionados corretamente. As capturas não estão versionadas neste repositório.

As regras em `monitoring/alerts/agora-alerts.yml` cobrem API down, banco down, falhas no health externo, HTTP 5xx acima de 5%, CPU do host acima de 90% e disco acima de 85%; não há regra versionada para memória do processo Node. O disparo e o recebimento ainda não foram comprovados. Synthetic Monitoring não está validado como ativo; o alerta de health externo depende dele. SLO e retenção também permanecem pendentes.

## Validação operacional

Comandos seguros no host:

```bash
systemctl is-active alloy
systemctl is-enabled alloy
systemctl status alloy --no-pager
journalctl -u alloy.service -n 100 --no-pager -l
journalctl -u agora-api.service -n 100 --no-pager -l
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS -H "Authorization: Bearer <METRICS_TOKEN>" http://127.0.0.1:3000/metrics
```

`<METRICS_TOKEN>` é apenas um placeholder. Nunca digite o valor real em documentação, histórico compartilhado ou commit.

No Grafana Explore:

```promql
agora_process_process_cpu_seconds_total
```

O resultado esperado é uma série da API com os labels `instance="127.0.0.1:3000"`, `job="prometheus.scrape.agora_api"` e `service="agora-api"`.

```logql
{service="agora-api"}
```

O resultado esperado são logs JSON da unidade `agora-api.service`, incluindo requisições reais com request ID, status e tempo de resposta.

## Troubleshooting

Erro observado: `401 Unauthorized / authentication error: invalid token`.

A causa foi o uso inicial do UUID/ID administrativo do token em vez da credencial secreta `glc_...`. Revogue o token exposto ou incorreto, crie um novo Cloud Access Policy token e use somente a credencial secreta apresentada na criação. Nunca versione ou imprima o token. Depois, reinicie conforme o procedimento operacional e confirme no journal do Alloy que não surgiram novos erros de autenticação.

## Pendências

- importar e validar os quatro dashboards específicos de API, aplicação, infraestrutura e PostgreSQL; o dashboard consolidado de produção já foi homologado em 23/09/2026;
- provocar alertas de forma controlada e confirmar o recebimento;
- configurar e validar Synthetic Monitoring, se exigido;
- definir SLO;
- confirmar retenção, plano, limites e política definitiva de custos do Grafana Cloud;
- validar no Grafana as demais séries operacionais ainda não observadas, incluindo disco, host, tamanho do banco e métricas de aplicação; não foram executados testes reais de indisponibilidade da API, falha do PostgreSQL ou resposta HTTP 5xx.
