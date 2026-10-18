# Diagnóstico de ID na exportação de reservas

## Resultado

Não foi reproduzida uma rejeição de ID em um arquivo com A1="ID" e os 13
cabeçalhos informados. Nenhum código de produção foi alterado. A confirmação do
nome/caminho do arquivo exato enviado na tentativa relatada continua pendente.

Foram localizadas exportações reais em Downloads e executadas, sem modificá-las,
diretamente em `parseEventWorkbook`, a mesma função usada no preview HTTP.

| Arquivo local | Aba / dimensão | A1 bruto | Resultado do parser atual |
| --- | --- | --- | --- |
| Reservas 01.10 a15.10.xlsx | Exportação / A1:M116 | "ID" | Aceito; 115 linhas, 101 atividades, 98 possíveis eventos, 3 ignoradas |
| Reservas setembro.xlsx | Exportação / A1:M271 | "ID" | Aceito; 270 linhas, 251 atividades, 248 possíveis eventos, 3 ignoradas |
| Reservas de 19.10 a 25.10.xlsx | Exportação / A1:G42 | "Data " | Reproduz exatamente "Coluna 'ID' não encontrada na aba 'Exportação'."; não contém ID e tem 7 colunas |

O terceiro arquivo tem estrutura diferente daquela descrita pelo usuário. Sua
rejeição não demonstra a causa da falha relatada com o arquivo de 13 colunas.
Também não se conclui que esse foi o arquivo enviado em produção.

Nos dois arquivos de 13 colunas, A1 é uma string, tipo ExcelJS String (3), com
code points U+0049 U+0044. Não há BOM, NBSP, quebra de linha ou caractere invisível
em A1. O cabeçalho está na primeira linha. A representação dos cabeçalhos é:

```json
["ID","Data de início","Data de término","Horário","Sala","Tipo","Responsável","Cliente","Empresa","Site","Prédio / Torre","Andar","Status"]
```

SHA-256 dos arquivos aceitos, para distinguir cópias sem publicar conteúdo:

```text
Reservas 01.10 a15.10.xlsx: eb9635df90e1951f6694734a4dbafebb0cd6dff681a89cb1ff8fa61e2b794a4f
Reservas setembro.xlsx: d1037515a96b571a324c1cf6d643a7d343b51b30f4a733593e9797c10592644e
```

Os diagnósticos locais ignorados pelo Git em `tmp/reservation-headers-before.json`
e `tmp/reservation-real-files.json` registram nomes de abas, dimensões, tipos,
cabeçalhos brutos, code points, chaves normalizadas e contagens agregadas. Não
registram linhas de reservas, nomes de clientes/responsáveis ou outros dados
operacionais. Os arquivos XLSX reais não foram adicionados ao repositório.

## Fluxo

1. Frontend `uploadIndicatorImport` em `frontend/src/services/api.js`: POST
   `/api/indicator-imports/EVENTS/preview`, corpo XLSX binário e parâmetros de
   arquivo/centro. A tela é `IndicatorImportPage.jsx`.
2. `indicatorImportRoutes.js`: autenticação/autorização existentes e `express.raw`.
3. `indicatorImportController.preview`: encaminha corpo, MIME e query ao service.
4. `indicatorImportService.preview`: valida arquivo e chama `parseEventWorkbook`.
   Erros retornados pelo parser produzem resposta 422 antes da criação do batch.
5. `eventImportParser.parseEventWorkbook`: carrega com ExcelJS `workbook.xlsx.load`.
   Prioriza a aba Eventos. Se ela não existir, busca Exportação por nome exato e
   chama `reservationImportParser.parseReservationSheet`.
6. `parseReservationSheet`: lê exclusivamente a linha 1 com `eachCell`, cria um
   Map de nome normalizado para número de coluna ExcelJS (iniciado em 1) e valida
   os cabeçalhos por presença com `Map.has`. Não há `sheet_to_json`, header:1,
   índice zero tratado como falso ou conversão de ID do cabeçalho para número.

As colunas obrigatórias são ID, Data de início, Horário, Sala, Tipo e Status,
além de pelo menos Cliente ou Empresa. As 13 colunas são mapeadas quando presentes;
não foi acrescentada exigência para campos antes opcionais.

`indicatorImportUtils.cleanText` desembrulha células com text/richText/result,
normaliza Unicode NFC, aplica trim e consolida whitespace. `normalizedKey` usa
NFD, remove marcas diacríticas, converte para minúsculas pt-BR e consolida
caracteres fora de a-z/0-9 como separadores. ID normaliza para `id`. Os nomes
originais continuam disponíveis no mapeamento das 13 colunas.

## Testes e limite da conclusão

`backend/tests/reservation-export-headers.test.js` acrescenta quatro testes usando
workbooks sintéticos equivalentes à estrutura observada, com cabeçalhos definidos
independentemente da constante do parser:

- A1 ID, aba Exportação, 13 colunas, mapeamento de todos os valores, reserva
  confirmada válida e revisão pendente sem inclusão automática;
- BOM, whitespace e NBSP nos cabeçalhos;
- acentos Unicode decompostos e quebras de linha nos espaços;
- ausência real de ID produz INVALID_HEADERS, com a mensagem original e sem itens.

Os testes existentes continuam cobrindo reservas não confirmadas, consolidação,
campos opcionais, IDs conflitantes e revisão. Nenhuma regra de negócio foi mudada.

Não há correção funcional pronta para PR: falta identificar o XLSX exato da falha
e reproduzir sua rejeição com A1 ID. Se ele for uma das cópias já aceitas, será
necessário comparar seus bytes com o upload original e o parser efetivamente
implantado. Não foi feita requisição de upload em produção, alteração de banco,
migration, commit, push, PR ou deploy nesta investigação.

## Validação local

Todas as verificações solicitadas foram executadas, com PostgreSQL 16 de teste
local já preparado, sem executar migrations ou conectar a produção:

| Comando | Resultado final |
| --- | --- |
| npm.cmd test --prefix backend -- --maxWorkers=2 | 65 arquivos, 704 testes aprovados |
| npm.cmd run test:integration --prefix backend | 7 arquivos, 109 testes aprovados |
| npm.cmd test --prefix frontend -- --maxWorkers=1 | 25 arquivos, 452 testes aprovados |
| npm.cmd run lint | Aprovado |
| git diff --check | Aprovado |

A primeira execução de integração, concorrente com a suíte geral do backend,
teve quatro timeouts nos testes preexistentes de reutilização de e-mail. A repetição
do mesmo comando de integração, sem a suíte geral concorrente, passou integralmente.
Não foram alterados timeouts, CI, thresholds ou esses testes para contornar a falha.

Os quatro novos testes de cabeçalhos passaram na suíte geral do backend. O parser
real também foi executado novamente sobre os dois XLSX aceitos, com os mesmos
SHA-256 e sem erros de validação. Os dados reais não foram editados nem importados
em banco; somente seus buffers foram lidos pelo parser.
