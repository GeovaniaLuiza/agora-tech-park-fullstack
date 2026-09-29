# ADR-0001: Separar frontend e backend em destinos distintos

- Status: Superseded
- Data: 2026-09-18

## Contexto

A aplicação possui uma SPA React/Vite, que gera artefatos estáticos, e uma API Node.js/Express, que exige execução persistente e acesso ao PostgreSQL. A arquitetura de produção precisava publicar esses componentes conforme suas diferentes necessidades de execução.

## Decisão

Esta decisão foi válida para a arquitetura anterior: frontend React/Vite hospedado no AWS Amplify e backend Node.js/Express em uma instância AWS EC2. A arquitetura atual substituiu essa separação por uma release conjunta na EC2, com Caddy servindo a SPA e encaminhando `/api` para o backend na mesma origem.

## Consequências

- O frontend pode ser publicado como artefato estático pelo Amplify, enquanto a API permanece como serviço gerenciado pelo systemd na EC2.
- Frontend e backend possuem fluxos de implantação distintos e precisam manter suas URLs e a configuração de CORS coerentes.
- A disponibilidade de uma camada não implica a disponibilidade da outra; os smoke tests precisam verificar ambas.
- A implantação passa a depender do Amplify para o frontend e da EC2 para o backend.

## Alternativas consideradas

Os documentos não registram uma comparação formal com uma implantação dos dois componentes no mesmo host. Cloudflare Pages aparece na matriz de conformidade apenas como orientação ou possibilidade não adotada, e não integra a arquitetura vigente.

## Evidências

- `docs/ARCHITECTURE.md`: na versão vigente à época da decisão, registrava containers e deployment com React/Vite no Amplify e Node.js/Express na EC2.
- `docs/CI_CD.md`: na versão vigente à época da decisão, registrava a publicação do artefato Vite no Amplify e a implantação separada do backend.
- `.github/workflows/cd-production.yml`: na versão vigente à época da decisão, possuía etapas distintas de deploy do backend via Systems Manager e do frontend via Amplify.
- `docs/AWS_PRODUCTION.md`: na versão vigente à época da decisão, registrava a configuração operacional do Amplify.
- `deploy/aws/Caddyfile`: publicação da API hospedada na EC2.

## Substituição da decisão

Este ADR foi supersedido pela arquitetura atualmente adotada, na qual frontend React/Vite e backend Node.js/Express são publicados conjuntamente na EC2. O Caddy serve `frontend/dist` e encaminha `/api` para o backend na mesma origem.

As referências a AWS Amplify, hosts distintos e fluxos separados permanecem neste ADR como registro histórico da decisão anterior.
