# ADR-0003: Usar Caddy como reverse proxy e manter API em loopback

- Status: Aceito
- Data: 2026-09-18

## Contexto

A API precisa ser acessível publicamente por HTTPS sem expor diretamente o processo Node.js nem seu endpoint interno de métricas. O processo da aplicação também precisa de um contrato de rede consistente com o proxy e com a coleta local de telemetria.

## Decisão

Executar a API Express em `127.0.0.1:3000` e usar o Caddy como ponto público de entrada. O Caddy termina HTTPS e encaminha as requisições para a API em loopback. O caminho `/metrics` recebe resposta 404 no proxy antes de alcançar o Node.js.

## Consequências

- A porta do processo Node.js não precisa ser exposta publicamente.
- A configuração de produção rejeita outro endereço de escuta para a API, mantendo o contrato com o Caddy.
- Certificados, HTTPS e encaminhamento público ficam sob responsabilidade operacional do Caddy.
- O Alloy continua acessando `/metrics` localmente, enquanto o mesmo caminho permanece bloqueado no acesso público pelo proxy.
- A disponibilidade externa depende tanto da API quanto do Caddy.

## Alternativas consideradas

Não há comparação formal de outros reverse proxies nos documentos. A exposição direta das portas 3000 e 5432 é explicitamente excluída da configuração de rede adotada.

## Evidências

- `deploy/aws/Caddyfile`: proxy para `127.0.0.1:3000` e bloqueio externo de `/metrics`.
- `backend/src/config/environment.js`: uso de `127.0.0.1` por padrão em produção e rejeição de outro `LISTEN_HOST`.
- `deploy/aws/agora-api.service`: execução persistente da API pelo systemd.
- `docs/ARCHITECTURE.md`: Caddy como terminador HTTPS e API em loopback.
- `docs/MONITORING.md`: validação do health público e restrição pública de `/metrics`.
