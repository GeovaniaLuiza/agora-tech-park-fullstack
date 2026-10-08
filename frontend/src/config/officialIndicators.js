// Presentation groups only. Codes reference existing indicator_definitions;
// names, units, aggregation rules and values always come from the API.
export const indicatorBlocks = [
  { name: 'Empresas e Startups', codes: ['NOVAS_STARTUPS', 'STARTUPS_ATIVAS', 'NOVAS_EMPRESAS', 'EMPRESAS_ATIVAS', 'NOVAS_EMPRESAS_ATIVAS', 'EMPRESAS_ATIVAS_TOTAL', 'EMPRESAS_PRE_INCUBADAS', 'EMPRESAS_PRE_ACELERADAS', 'EMPRESAS_INCUBADAS', 'EMPRESAS_ACELERADAS', 'COLABORADORES_EMPRESAS'] },
  { name: 'Financeiro', codes: ['FATURAMENTO_EMPRESAS', 'ARRECADACAO_EMPRESAS', 'RECEITA_TOTAL_CENTRO', 'DESPESAS_TOTAL_CENTRO', 'RESULTADO_ANUAL_CENTRO', 'DESPESAS_CUSTEADAS_RECEITA_PROPRIA', 'MASSA_SALARIAL_NOVAS_STARTUPS', 'MASSA_SALARIAL_STARTUPS_ATIVAS', 'MASSA_SALARIAL_EMPRESAS_ATIVAS'] },
  { name: 'Projetos', codes: ['PROJETOS_SUBMETIDOS', 'PROJETOS_GANHOS', 'VALOR_PROJETOS_GANHOS'] },
  { name: 'Eventos e Capacitações', codes: ['EVENTOS_REALIZADOS', 'CAPACITACOES_REALIZADAS', 'EMPRESAS_CAPACITADAS', 'PESSOAS_CAPACITADAS', 'VALOR_PROJETOS_CAPACITACAO'] },
  { name: 'Residentes', codes: ['EMPRESAS_RESIDENTES', 'OCUPACAO_PREDIO'] },
  { name: 'Ecossistema e Relacionamentos', codes: ['VISITANTES_CENTRO', 'EQUIPE_CENTRO', 'FUNCOES_ATIVAS', 'PROGRAMAS_INICIADOS', 'MANTENEDORES', 'IES_REGIAO', 'IES_ATENDIDAS', 'MUNICIPIOS_REGIAO', 'MUNICIPIOS_ATENDIDOS', 'ENTIDADES_REGIAO', 'ENTIDADES_ATENDIDAS', 'GRANDES_EMPRESAS_REGIAO', 'GRANDES_EMPRESAS_ATENDIDAS', 'GRANDES_EMPRESAS_APOIADAS', 'FASE_CENTRO', 'INSTALACOES_CENTRO', 'LEI_INOVACAO_EXISTENTE'] },
];

export const overviewCodes = ['EMPRESAS_ATIVAS_TOTAL', 'STARTUPS_ATIVAS', 'EMPRESAS_RESIDENTES', 'EVENTOS_REALIZADOS'];
export const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const hasValue = (value) => value !== null && value !== undefined && value !== '';
export const numericValue = (value) => hasValue(value) && Number.isFinite(Number(value)) ? Number(value) : null;

export function periodValue(item, month = '') {
  const record = month ? item.monthly_values?.find((entry) => Number(entry.month) === Number(month)) : item;
  return record?.value ?? record?.text_value ?? record?.json_value ?? null;
}

export function annualRule(item) {
  return ({ RECORDED_ANNUAL: 'Consolidado anual da planilha', SUM: 'Soma mensal', COUNT: 'Contagem consolidada', AVERAGE: 'Média mensal', LAST_VALUE: 'Último valor disponível', DERIVED: 'Consolidado calculado', CALCULATED: 'Consolidado calculado', MANUAL: 'Valor anual informado' })[item.consolidation_basis || item.annual_aggregation || item.aggregation_type] || 'Consolidado anual';
}
