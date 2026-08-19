import * as repository from '../repositories/indicatorManagementRepository.js';

const codeByStage = Object.freeze({
  PRE_INCUBATION: 'EMPRESAS_PRE_INCUBADAS',
  PRE_ACCELERATION: 'EMPRESAS_PRE_ACELERADAS',
  INCUBATION: 'EMPRESAS_INCUBADAS',
  ACCELERATION: 'EMPRESAS_ACELERADAS',
});

const isoDate = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const monthBounds = (year, month) => ({
  start: isoDate(year, month, 1),
  end: isoDate(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate()),
});
const datePart = (value) => value ? new Date(value).toISOString().slice(0, 10) : null;
const monthOf = (value) => value ? new Date(value).getUTCMonth() + 1 : null;
const yearOf = (value) => value ? new Date(value).getUTCFullYear() : null;
const isStockActive = (record, start, end) => record.active
  && (!record.start_date || datePart(record.start_date) <= end)
  && (!record.end_date || datePart(record.end_date) >= start);

function automaticValues(records, center, year, month) {
  const { start, end } = monthBounds(year, month);
  const type = (name) => records.filter((item) => item.record_type === name);
  const stocks = (name) => type(name).filter((item) => isStockActive(item, start, end));
  const events = type('EVENT').filter((item) => item.active && yearOf(item.event_at) === year && monthOf(item.event_at) === month);
  const programs = type('PROGRAM').filter((item) => item.active && yearOf(item.start_date) === year && monthOf(item.start_date) === month);
  const openInnovation = type('OPEN_INNOVATION').filter((item) => item.active && item.year === year && item.month === month);
  const development = stocks('DEVELOPMENT_COMPANY');
  const values = {
    EVENTOS_REALIZADOS: events.length,
    PROGRAMAS_INICIADOS: programs.length,
    FUNCOES_ATIVAS: stocks('FUNCTION').length,
    MANTENEDORES: stocks('MAINTAINER').length,
    IES_REGIAO: stocks('IES').filter((item) => item.in_region).length,
    IES_ATENDIDAS: stocks('IES').filter((item) => item.served).length,
    MUNICIPIOS_REGIAO: stocks('MUNICIPALITY').filter((item) => item.in_region).length,
    MUNICIPIOS_ATENDIDOS: stocks('MUNICIPALITY').filter((item) => item.served).length,
    ENTIDADES_REGIAO: stocks('ENTITY').filter((item) => item.in_region).length,
    ENTIDADES_ATENDIDAS: stocks('ENTITY').filter((item) => item.served).length,
    GRANDES_EMPRESAS_REGIAO: stocks('LARGE_COMPANY').filter((item) => item.in_region).length,
    GRANDES_EMPRESAS_ATENDIDAS: stocks('LARGE_COMPANY').filter((item) => item.served).length,
    EMPRESAS_RESIDENTES: stocks('RESIDENT_COMPANY').length,
    GRANDES_EMPRESAS_APOIADAS: new Set(openInnovation.map((item) => item.name.trim().toLocaleLowerCase('pt-BR'))).size,
  };
  Object.entries(codeByStage).forEach(([stage, code]) => {
    values[code] = development.filter((item) => item.development_stage === stage).length;
  });
  return values;
}

function aggregate(values, strategy) {
  const present = values.filter((value) => value !== null && value !== undefined).map(Number);
  if (!present.length) return null;
  if (strategy === 'SUM' || strategy === 'COUNT') return present.reduce((sum, value) => sum + value, 0);
  if (strategy === 'AVERAGE') return present.reduce((sum, value) => sum + value, 0) / present.length;
  return present.at(-1);
}

export function calculateIndicatorRows({ definitions, applicability = new Map(), records, manualValues, center, year }) {
  const byCode = new Map(definitions.map((definition) => [definition.code, definition]));
  const monthly = new Map(Array.from({ length: 12 }, (_, index) => [index + 1, {}]));
  manualValues.forEach((value) => { monthly.get(value.month)[value.code] = value.numeric_value ?? value.text_value ?? value.json_value; });
  for (let month = 1; month <= 12; month += 1) {
    Object.assign(monthly.get(month), automaticValues(records, center, year, month));
    const values = monthly.get(month);
    if (values.RECEITA_TOTAL_CENTRO !== undefined || values.DESPESAS_TOTAL_CENTRO !== undefined) {
      values.RESULTADO_ANUAL_CENTRO = Number(values.RECEITA_TOTAL_CENTRO || 0) - Number(values.DESPESAS_TOTAL_CENTRO || 0);
    }
  }

  const rows = [];
  const push = (definition, month, value) => {
    if (value === null || value === undefined || applicability.get(definition.id) === false) return;
    const { start, end } = month ? monthBounds(year, month) : { start: isoDate(year, 1, 1), end: isoDate(year, 12, 31) };
    rows.push({
      indicatorId: definition.id, year, month, periodStart: start, periodEnd: end,
      numericValue: ['TEXT', 'BOOLEAN', 'JSON'].includes(definition.value_type) ? null : Number(value),
      textValue: ['TEXT', 'BOOLEAN'].includes(definition.value_type) ? String(value) : null,
      jsonValue: definition.value_type === 'JSON' ? value : null,
      sourceType: 'SYSTEM_CALCULATION', notes: 'Calculado automaticamente pelo serviço central de indicadores',
    });
  };

  definitions.filter((item) => item.calculation_type !== 'MANUAL').forEach((definition) => {
    for (let month = 1; month <= 12; month += 1) push(definition, month, monthly.get(month)[definition.code]);
  });
  definitions.forEach((definition) => {
    let values = Array.from({ length: 12 }, (_, index) => monthly.get(index + 1)[definition.code]);
    let annual = aggregate(values, definition.annual_aggregation);
    if (definition.code === 'RESULTADO_ANUAL_CENTRO') {
      annual = aggregate(Array.from({ length: 12 }, (_, index) => monthly.get(index + 1).RECEITA_TOTAL_CENTRO), 'SUM')
        - aggregate(Array.from({ length: 12 }, (_, index) => monthly.get(index + 1).DESPESAS_TOTAL_CENTRO), 'SUM');
    }
    push(definition, null, annual);
  });
  const profile = {
    FASE_CENTRO: center.phase,
    INSTALACOES_CENTRO: center.facilities_status,
    LEI_INOVACAO_EXISTENTE: center.innovation_law_status,
    MIDITEC_ADOTADO: center.miditec_status,
  };
  Object.entries(profile).forEach(([code, value]) => { if (byCode.has(code)) push(byCode.get(code), null, value); });
  return rows;
}

export async function recompute(centerId, year, userId) {
  const [center, definitions, records, manualValues] = await Promise.all([
    repository.findCenter(centerId), repository.allDefinitions(), repository.recordsForCalculation(centerId, year),
    repository.manualValuesForCalculation(centerId, year),
  ]);
  if (!center) return [];
  const configured = await repository.listDefinitions(centerId);
  const applicability = new Map(configured.map((item) => [item.id, item.applicable]));
  const rows = calculateIndicatorRows({ definitions, applicability, records, manualValues, center, year });
  await repository.withTransaction(async (client) => {
    await repository.clearSystemValues(centerId, year, userId, client);
    for (const row of rows) await repository.upsertValue({ ...row, centerId }, userId, client);
  });
  return rows;
}
