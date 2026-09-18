# ADR-0006: Centralizar observabilidade em Grafana Alloy e Grafana Cloud

- Status: Aceito
- Data: 2026-09-18

## Contexto

A produção precisa enviar métricas da API, do host e do PostgreSQL, além dos logs estruturados da aplicação, sem operar Prometheus, Loki e Grafana na mesma EC2 pequena que executa backend e banco.

## Decisão

Executar Grafana Alloy na EC2 como agente central de coleta e encaminhar a telemetria ao Grafana Cloud. O Alloy:

- coleta métricas Prometheus da API em loopback;
- executa o componente `prometheus.exporter.postgres` e coleta suas métricas;
- coleta métricas do host;
- lê do journald os logs da unidade `agora-api.service`, produzidos em JSON pelo Pino;
- envia métricas por Prometheus `remote_write` e logs para o Loki do Grafana Cloud.

Grafana, Prometheus e Loki não são operados localmente na EC2.

## Consequências

- A EC2 não assume a operação local da pilha completa de observabilidade.
- Métricas e logs ficam centralizados no Grafana Cloud.
- A observabilidade depende da disponibilidade, dos limites e das políticas de retenção do Grafana Cloud.
- Credenciais de telemetria precisam permanecer fora do repositório.
- Dashboards finais, disparo e recebimento de alertas, SLO e retenção continuam pendentes; a decisão não declara essas capacidades como concluídas.
- A configuração versionada coleta logs da API, mas não encaminha os logs do Caddy ao Loki.

## Alternativas consideradas

A documentação registra que a arquitetura evita operar Prometheus, Loki e Grafana na EC2. Não há comparação formal com outras plataformas de observabilidade.

## Evidências

- `deploy/aws/alloy.config`: scrapes da API, host e PostgreSQL, leitura do journald, `remote_write` e envio ao Loki.
- `deploy/aws/agora-api.service`: saída padrão e de erro direcionada ao journald.
- `docs/MONITORING.md`: fluxos ponta a ponta validados para Prometheus e Loki, além dos itens ainda pendentes.
- `docs/ARCHITECTURE.md`: Alloy na EC2, Grafana Cloud externo e ausência de Grafana local.
- `docs/CONFORMIDADE_TCC.md`: recebimento de métricas e logs reais no Grafana Cloud comprovado em produção.
