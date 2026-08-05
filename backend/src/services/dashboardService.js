import * as repository from '../repositories/dashboardRepository.js';
import { DASHBOARD_CODES, SOURCE_TYPES } from '../domain/indicatorCatalog.js';
import { serviceError } from '../utils/validation.js';

const GROUPS = Object.freeze({
  companies: ['EMPRESAS_ATIVAS_TOTAL', 'NOVAS_EMPRESAS_ATIVAS', 'STARTUPS_ATIVAS', 'COLABORADORES_EMPRESAS', 'FATURAMENTO_EMPRESAS', 'ARRECADACAO_EMPRESAS'],
  financial: ['RECEITA_TOTAL_CENTRO', 'DESPESAS_TOTAL_CENTRO', 'RESULTADO_ANUAL_CENTRO'],
  projects: ['PROJETOS_SUBMETIDOS', 'PROJETOS_GANHOS', 'VALOR_PROJETOS_GANHOS'],
  engagement: ['VISITANTES_CENTRO', 'CAPACITACOES_REALIZADAS', 'EMPRESAS_CAPACITADAS', 'PESSOAS_CAPACITADAS'],
});

export function normalizeFilters(query = {}) {
  const year = Number(query.year || 2025);
  const month = query.month === undefined || query.month === '' ? null : Number(query.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw serviceError(422, 'Ano inválido', 'INVALID_YEAR');
  if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) throw serviceError(422, 'Mês inválido', 'INVALID_MONTH');
  const sourceType = query.sourceType || SOURCE_TYPES.SPREADSHEET;
  if (!Object.values(SOURCE_TYPES).includes(sourceType)) throw serviceError(422, 'Origem inválida', 'INVALID_SOURCE_TYPE');
  return { year, month, category: query.category || null, sourceType, startDate: query.startDate || null, endDate: query.endDate || null };
}

function toCard(row) {
  const current = row.numeric_value === null ? row.text_value ?? row.json_value : Number(row.numeric_value);
  const previous = row.previous_numeric_value === null ? row.previous_text_value : Number(row.previous_numeric_value);
  const numeric = typeof current === 'number';
  const variationAbsolute = numeric && typeof previous === 'number' ? current - previous : null;
  const variationPercent = variationAbsolute !== null && previous !== 0 ? (variationAbsolute / Math.abs(previous)) * 100 : null;
  return {
    code: row.code,
    title: row.title,
    description: row.description,
    category: row.category,
    value: current,
    unit: row.unit,
    valueType: row.value_type,
    period: row.month ? `${String(row.month).padStart(2, '0')}/${row.year}` : String(row.year),
    year: row.year,
    month: row.month,
    source: row.source_type,
    updatedAt: row.consolidated_at || row.updated_at,
    previousValue: previous ?? null,
    variationAbsolute,
    variationPercent,
    direction: variationAbsolute === null ? null : variationAbsolute > 0 ? 'UP' : variationAbsolute < 0 ? 'DOWN' : 'STABLE',
  };
}

function groupSeries(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.code)) grouped.set(row.code, { code: row.code, name: row.name, unit: row.unit, valueType: row.value_type, category: row.category, points: [] });
    grouped.get(row.code).points.push({ month: row.month, value: Number(row.numeric_value), periodStart: row.period_start, periodEnd: row.period_end });
  }
  return [...grouped.values()];
}

export const operationalSummary = repository.operationalSummary;

export async function institutionalSummary(rawFilters) {
  const filters = normalizeFilters(rawFilters);
  const [rows, categories, latestImport] = await Promise.all([
    repository.institutionalCards(filters), repository.categories(), repository.latestImport(filters.year),
  ]);
  const selected = rows.filter((row) => DASHBOARD_CODES.includes(row.code)).map(toCard);
  return { period: filters.month ? `${String(filters.month).padStart(2, '0')}/${filters.year}` : String(filters.year), filters, categories, lastUpdate: latestImport?.imported_at || selected[0]?.updatedAt || null, source: latestImport ? { type: SOURCE_TYPES.SPREADSHEET, fileName: latestImport.file_name, sheetName: latestImport.sheet_name } : null, cards: selected };
}

async function section(name, rawFilters) {
  const filters = normalizeFilters(rawFilters);
  const codes = GROUPS[name];
  const [cards, rows] = await Promise.all([
    repository.institutionalCards(filters), repository.series(codes, filters),
  ]);
  return { filters, cards: cards.filter((row) => codes.includes(row.code)).map(toCard), series: groupSeries(rows) };
}

export const companies = (filters) => section('companies', filters);
export const financial = (filters) => section('financial', filters);
export const projects = (filters) => section('projects', filters);
export const engagement = (filters) => section('engagement', filters);
