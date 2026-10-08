const missing = 'Não informado';
export const reportMonths = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const hasValue = (value) => value !== null && value !== undefined && value !== '';
const number = (value) => hasValue(value) && typeof value !== 'object' && Number.isFinite(Number(value)) ? Number(value) : null;
const valueOf = (row) => row?.value ?? row?.text_value ?? row?.json_value ?? null;
const sourceLabels = { SPREADSHEET_IMPORT: 'Planilha oficial', FORM_RESPONSE: 'Formulário', MANUAL_ENTRY: 'Lançamento manual', SYSTEM_CALCULATION: 'Cálculo do sistema', LIVE: 'Consolidado de origens' };
const aggregationLabels = { RECORDED_ANNUAL: 'Consolidado anual da planilha', SUM: 'Soma mensal', COUNT: 'Contagem consolidada', AVERAGE: 'Média mensal', LAST_VALUE: 'Último valor disponível', DERIVED: 'Consolidado calculado', CALCULATED: 'Consolidado calculado', MANUAL: 'Valor anual informado' };

export function reportValue(value, row) {
  if (!hasValue(value)) return 'Sem dados';
  if (typeof value === 'object') return JSON.stringify(value);
  const numeric = number(value);
  if (numeric === null) return String(value);
  if (row.value_type === 'CURRENCY' || row.unit === 'BRL') return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numeric);
  if (['PERCENT', 'PERCENTAGE'].includes(row.value_type) || row.unit === 'PERCENT') return new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(numeric);
  return new Intl.NumberFormat('pt-BR').format(numeric);
}

export function reportDate(value, time = false) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return missing;
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', ...(time ? { timeStyle: 'short' } : {}) }).format(date);
}

// This is a transient presentation of the existing summary, never a new data source.
// The current schema has no targets, baselines, validation or action-plan fields.
export function buildIndicatorReport(rows, filters = {}, user = {}, previous = [], generated = new Date()) {
  const year = String(filters.year || rows[0]?.year || filters.period?.match(/^\d{4}/)?.[0] || generated.getFullYear());
  const month = Number(filters.period?.match(/^\d{4}-(0[1-9]|1[0-2])$/)?.[1]) || null;
  const period = month ? `${reportMonths[month - 1]} de ${year}` : `Consolidado anual de ${year}`;
  const selected = (row) => month ? row.monthly_values?.find((entry) => Number(entry.month) === month) : row;
  const indicators = rows.map((row) => {
    const record = selected(row);
    const value = valueOf(record);
    const numericType = !['TEXT', 'BOOLEAN', 'JSON'].includes(row.value_type);
    const series = reportMonths.map((_, index) => numericType ? number(valueOf(row.monthly_values?.find((entry) => Number(entry.month) === index + 1))) : null);
    const old = previous.find((entry) => entry.code === row.code);
    const oldValue = old && numericType && old.value_type === row.value_type && old.unit === row.unit ? number(valueOf(selected(old))) : null;
    const numeric = numericType ? number(value) : null;
    const origin = record?.source;
    return {
      code: row.code || missing, name: row.name || row.code || missing, category: row.category || missing,
      unit: row.unit || missing, result: reportValue(value, row), hasData: hasValue(value),
      target: missing, attainment: missing, status: hasValue(value) ? 'Não avaliado (sem meta)' : 'Sem dados',
      source: sourceLabels[origin] || origin || missing, updated: reportDate(record?.updated_at),
      periodicity: { MONTHLY: 'Mensal', ANNUAL: 'Anual', EVENT: 'Por evento' }[row.periodicity] || missing,
      aggregation: aggregationLabels[row.consolidation_basis || row.annual_aggregation || row.aggregation_type] || 'Consolidado anual',
      series, history: numeric !== null && oldValue !== null ? `${row.name}: ${Number(year) - 1}: ${reportValue(oldValue, row)}; ${year}: ${reportValue(numeric, row)}; diferença: ${reportValue(numeric - oldValue, row)}.` : null,
    };
  });
  const withData = indicators.filter((row) => row.hasData).length;
  const withoutData = indicators.length - withData;
  const historical = indicators.flatMap((row) => row.history ? [row.history] : []);
  const chartPriority = /FATURAMENTO|COLABORADORES|EMPRESAS_ATIVAS|STARTUPS_ATIVAS|RESIDENTES|EVENTOS|PROJETOS|VISITANTES|CAPACITACOES/;
  const charts = indicators.filter((row) => row.series.filter((value) => value !== null).length >= 2).sort((a, b) => Number(chartPriority.test(b.code)) - Number(chartPriority.test(a.code)));
  const actions = indicators.flatMap((row) => [
    { point: row.name, action: 'Cadastrar metas', responsible: missing, deadline: missing, priority: missing, status: missing },
    ...(!row.hasData ? [{ point: row.name, action: 'Consolidar resultados', responsible: missing, deadline: missing, priority: missing, status: missing }] : []),
    ...(row.periodicity === 'Mensal' && row.series.filter((value) => value !== null).length < 2 ? [{ point: row.name, action: 'Estabelecer rotina de atualização', responsible: missing, deadline: missing, priority: missing, status: missing }] : []),
  ]);
  return {
    generated, generatedLabel: reportDate(generated, true), center: rows[0]?.center_name || missing,
    user: user.name || user.email || missing, year, period,
    filters: { Centro: rows[0]?.center_name || missing, 'Identificador do centro': filters.centerId || missing, Ano: year, Período: period, Categoria: filters.categoryLabel || filters.category || 'Todas', Origem: sourceLabels[filters.sourceType || 'LIVE'] || filters.sourceType, Busca: filters.name || 'Não aplicada', Códigos: filters.codes || 'Todos os retornados pela consulta' },
    indicators, charts, actions,
    cards: [['Total de indicadores', indicators.length], ['Indicadores com dados', withData], ['Indicadores sem dados', withoutData], ['Indicadores atingidos', missing], ['Parcialmente atingidos', missing], ['Indicadores não atingidos', missing], ['Percentual geral de atingimento', missing]],
    note: 'A avaliação de atingimento não foi calculada porque não há metas cadastradas para os indicadores selecionados.',
    base: `No período ${period}, o recorte contém ${indicators.length} indicadores: ${withData} com dados e ${withoutData} sem dados. Não há metas cadastradas para os indicadores selecionados. Resultados disponíveis não são classificados como atingidos ou não atingidos.`,
    analysis: [
      ['Principais achados', `${withData} de ${indicators.length} indicadores têm resultados no período selecionado.`],
      ['Pontos críticos', `${withoutData} indicadores sem resultados; avaliação de atingimento indisponível por ausência de metas.`],
      ['Indicadores sem dados', indicators.filter((row) => !row.hasData).map((row) => `${row.code}: ${row.name}`).join('; ') || 'Nenhum indicador sem dados neste recorte.'],
      ['Comparação histórica', historical.join('\n') || 'Não disponível para este relatório.'],
      ['Impacto na tomada de decisão', withData ? 'Os resultados disponíveis permitem acompanhar o recorte selecionado. A ausência de metas limita a avaliação de desempenho. Não são inferidas causas ou tendências.' : 'A ausência de resultados e metas impede a avaliação de desempenho neste recorte. Não são inferidas causas ou tendências.'],
    ],
  };
}
