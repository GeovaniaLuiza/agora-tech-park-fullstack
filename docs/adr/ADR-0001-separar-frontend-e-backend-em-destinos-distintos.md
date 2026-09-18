# ADR-0001: Separar frontend e backend em destinos distintos

- Status: Aceito
- Data: 2026-09-18

## Contexto

A aplicação possui uma SPA React/Vite, que gera artefatos estáticos, e uma API Node.js/Express, que exige execução persistente e acesso ao PostgreSQL. A arquitetura de produção precisava publicar esses componentes conforme suas diferentes necessidades de execução.

## Decisão

Hospedar o frontend React/Vite no AWS Amplify e o backend Node.js/Express em uma instância AWS EC2. O frontend consome a API pública por HTTPS. Frontend e backend são publicados em hosts distintos, e a URL da API é incorporada ao artefato do frontend durante o build.

## Consequências

- O frontend pode ser publicado como artefato estático pelo Amplify, enquanto a API permanece como serviço gerenciado pelo systemd na EC2.
- Frontend e backend possuem fluxos de implantação distintos e precisam manter suas URLs e a configuração de CORS coerentes.
- A disponibilidade de uma camada não implica a disponibilidade da outra; os smoke tests precisam verificar ambas.
- A implantação passa a depender do Amplify para o frontend e da EC2 para o backend.

## Alternativas consideradas

Os documentos não registram uma comparação formal com uma implantação dos dois componentes no mesmo host. Cloudflare Pages aparece na matriz de conformidade apenas como orientação ou possibilidade não adotada, e não integra a arquitetura vigente.

## Evidências

- `docs/ARCHITECTURE.md`: visões de containers e deployment com React/Vite no Amplify e Node.js/Express na EC2.
- `docs/CI_CD.md`: fluxo de publicação do artefato Vite aprovado no Amplify e implantação separada do backend.
- `.github/workflows/cd-production.yml`: etapas distintas de deploy do backend via Systems Manager e do frontend via Amplify.
- `docs/AWS_PRODUCTION.md`: arquitetura adotada e configuração operacional do Amplify.
- `deploy/aws/Caddyfile`: publicação da API hospedada na EC2.
