# Dashboard institucional — carga 2025

## Fonte oficial

O histórico institucional é importado exclusivamente no backend a partir de
`frontend/imgs/Indicadores Rede de Centros de Inovação 2025_Joinville.xlsx`, aba `CI JOINVILLE`.
O arquivo não é servido nem processado pelo navegador.

- SHA-256 validado: `2126B3372D3F341CF8A0FFA3B22749944E087ACEFE5495A1028C7FC0354D84AE`.
- Resultado atual: 42 definições e 368 valores mensais, anuais, textuais e estruturados.
- As células monetárias `B17` e `B19` estão armazenadas como texto na origem; o importador as converte e registra a advertência no histórico da importação.

## Persistência e importação

A migration `011_dashboard_institutional_indicators.sql` cria `indicator_definitions`, `indicator_values`,
`spreadsheet_imports` e `question_indicator_links`. A última tabela permite vincular perguntas dos formulários
a códigos técnicos, sem usar o texto da pergunta como chave.

```powershell
# validação sem escrita
npm.cmd run indicators:validate --prefix backend

# carga transacional e idempotente por hash
npm.cmd run indicators:import --prefix backend
```

O endpoint administrativo `POST /api/admin/spreadsheet-imports` aceita `{ "validateOnly": true }` para validação
e `{ "reprocess": true }` para reprocessamento explicitamente autorizado. Importações persistidas geram auditoria.

## APIs e RBAC

Os endpoints abaixo aceitam `year`, `month`, `category`, `sourceType`, `startDate` e `endDate`, conforme aplicável:

- `GET /api/dashboard/operational-summary`
- `GET /api/dashboard/institutional-summary`
- `GET /api/dashboard/companies`
- `GET /api/dashboard/financial`
- `GET /api/dashboard/projects`
- `GET /api/dashboard/engagement`
- `GET /api/dashboard/export` (download do arquivo Excel oficial)
- `GET /api/indicators` e `GET /api/indicators/history`
- `GET /api/indicators/export/pdf|excel|csv`

O Dashboard institucional e sua exportação são restritos a `ADMIN`, `PESQUISADOR` e `GESTOR`.
A tela de indicadores mantém o acesso agregado já autorizado ao `RESIDENTE`, sem exportação e sem dados individuais de outras organizações.

## Interface

`/dashboard` combina o resumo operacional atual com KPIs e séries oficiais de 2025. Os filtros históricos afetam
os blocos institucionais; o resumo operacional continua mostrando o estado corrente e é identificado dessa forma.
`/indicators` lista todas as definições importadas, com busca, período, unidade, origem e exportação autorizada.

Há estados independentes de carregamento, vazio e erro por seção, gráficos com resumo acessível e layout responsivo.
Toda consolidação e seleção de períodos ocorre no backend; o React apenas formata e apresenta os contratos da API.

## Validação

Os testes verificam conversões brasileiras, hash, totais oficiais, resultado negativo de junho, filtros,
formatação, estados de erro e renderização dos gráficos. Execute:

```powershell
npm.cmd test --prefix backend
npm.cmd test --prefix frontend
npm.cmd run build --prefix frontend
```
