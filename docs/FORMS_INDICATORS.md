# Formulários e indicadores

O formulário é a camada de coleta; `answers` preserva a evidência informada e `indicator_values` é a camada canônica consumida pelas telas de Indicadores, Dashboard e relatórios.

```text
Form -> Question -> QuestionIndicatorLink
                     |
Response -> Answer --+-> IndicatorValue -> Indicadores / Dashboard / relatórios
```

## Configuração

- ADMIN e PESQUISADOR selecionam definições ativas do catálogo.
- A pergunta é vinculada por `indicator_id`; textos e códigos não participam do matching.
- Um mesmo indicador não pode ser vinculado duas vezes ao mesmo formulário.
- O formulário registra separadamente o prazo de resposta e a competência (`indicator_year` e `indicator_month`).
- Perguntas comuns, sem vínculo, continuam persistindo apenas em `answers`.

## Submissão e consistência

A submissão abre uma transação PostgreSQL, persiste a resposta e as respostas individuais, processa os vínculos, atualiza os valores e grava a auditoria. Qualquer falha desfaz toda a operação.

Valores de formulário usam `source_type = FORM_RESPONSE` e `source_id = responses.id`. O upsert usa a chave natural de indicador, centro, ano, mês e origem; reprocessamento ou correção atualiza o valor existente.

O consolidado anual é recalculado a partir dos meses conforme `annual_aggregation`. `RESULTADO_ANUAL_CENTRO` é recalculado no backend como receita menos despesas.

## Precedência

Na fonte consolidada (`LIVE`), a precedência é:

1. resposta de formulário;
2. cálculo do sistema;
3. lançamento manual;
4. importação de planilha.

Os dados importados permanecem armazenados e podem ser consultados explicitamente pela origem `SPREADSHEET_IMPORT`.
