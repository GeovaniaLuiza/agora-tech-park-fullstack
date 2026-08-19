# Monitoramento e logs

## Escolha

Grafana Cloud Free com Grafana Alloy é a opção preferida para uma EC2 pequena: evita operar Grafana, Prometheus e Loki no mesmo host, reduz consumo de RAM, atualizações e persistência local. Limites e preço do plano precisam ser conferidos na conta antes da ativação. Self-hosted só é indicado com capacidade dedicada e responsabilidade por backup/upgrade.

`pino`/`pino-http` foram escolhidos para JSON e redaction com baixo overhead; `prom-client` expõe o formato Prometheus e métricas padrão sem manter um servidor Prometheus dentro da aplicação. São três dependências runtime pequenas, sem licença SaaS própria, mas exigem atualizações de segurança. Alloy concentra coleta de host/PostgreSQL/journald em um único agente operacional.

Alloy coleta métricas de host, `/metrics`, PostgreSQL e journald e envia por TLS. Credenciais ficam em arquivo de ambiente `0600`, nunca no repositório. `/metrics` escuta pela API local e exige bearer token em produção; não deve ser publicado diretamente por Caddy.

## Logs

A API emite JSON estruturado para stdout/journald com evento, nível, timestamp, ambiente e request ID. Pino remove authorization, cookie, senha, hash, JWT, tokens, DATABASE_URL e senha SMTP. Caddy também usa JSON. Não adicione payloads ou objetos `process.env` a logs.

Consultas úteis:

```bash
journalctl -u agora-api --since "30 minutes ago" --output=json
systemctl status agora-api alloy caddy postgresql
curl -fsS http://127.0.0.1:3000/api/health
```

## Dashboards e alertas

Importe os quatro JSON de `monitoring/dashboards` e selecione a datasource Prometheus do stack Grafana Cloud. As regras em `monitoring/alerts/agora-alerts.yml` cobrem API down, DB down, 5xx > 5%, CPU > 90%, disco > 85% e health externo. Os períodos de 3–15 minutos reduzem ruído.

O alerta `AgoraHealthCheckFailed` só produz série quando o Grafana Cloud Synthetic Monitoring estiver configurado para `https://API_DOMAIN/api/health`. Não se deve criar alerta de métrica sem fonte ativa. Configure um contact point real e execute um teste controlado antes de considerar alertas operacionais.

## Retenção e custo

Defina filtros no Alloy para não enviar logs desnecessários, acompanhe ingestão e limites semanalmente no início e configure alerta de uso da conta Grafana. Backups de PostgreSQL não devem ser enviados ao Loki.
