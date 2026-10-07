import ExcelJS from 'exceljs';
import * as repository from '../repositories/dashboardRepository.js';
import { DASHBOARD_CODES, SOURCE_TYPES } from '../domain/indicatorCatalog.js';
import { record } from '../repositories/auditRepository.js';
import { serviceError } from '../utils/validation.js';

const GROUPS = Object.freeze({
  companies: ['EMPRESAS_ATIVAS_TOTAL', 'NOVAS_EMPRESAS_ATIVAS', 'STARTUPS_ATIVAS', 'EMPRESAS_RESIDENTES', 'COLABORADORES_EMPRESAS', 'FATURAMENTO_EMPRESAS', 'ARRECADACAO_EMPRESAS'],
  financial: ['RECEITA_TOTAL_CENTRO', 'DESPESAS_TOTAL_CENTRO', 'RESULTADO_ANUAL_CENTRO'],
  projects: ['PROJETOS_SUBMETIDOS', 'PROJETOS_GANHOS', 'VALOR_PROJETOS_GANHOS'],
  engagement: ['VISITANTES_CENTRO', 'EVENTOS_REALIZADOS', 'CAPACITACOES_REALIZADAS', 'EMPRESAS_CAPACITADAS', 'PESSOAS_CAPACITADAS'],
});

export function normalizeFilters(query = {}) {
  const year = Number(query.year || new Date().getFullYear());
  const month = query.month === undefined || query.month === '' ? null : Number(query.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw serviceError(422, 'Ano inválido', 'INVALID_YEAR');
  if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) throw serviceError(422, 'Mês inválido', 'INVALID_MONTH');
  const sourceType = query.sourceType || SOURCE_TYPES.LIVE;
  if (!Object.values(SOURCE_TYPES).includes(sourceType)) throw serviceError(422, 'Origem inválida', 'INVALID_SOURCE_TYPE');
  return { year, month, category: query.category || null, sourceType, centerId: query.centerId || null, startDate: query.startDate || null, endDate: query.endDate || null };
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
  return { period: filters.month ? `${String(filters.month).padStart(2, '0')}/${filters.year}` : String(filters.year), filters, categories, lastUpdate: selected[0]?.updatedAt || latestImport?.imported_at || null, source: filters.sourceType === SOURCE_TYPES.LIVE ? { type: SOURCE_TYPES.LIVE, fileName: 'Cadastros e lançamentos consolidados' } : latestImport ? { type: SOURCE_TYPES.SPREADSHEET, fileName: latestImport.file_name, sheetName: latestImport.sheet_name } : null, cards: selected };
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

const sourceLabels = Object.freeze({
  FORM_RESPONSE: 'Formulário',
  MANUAL_ENTRY: 'Lançamento manual',
  SYSTEM_CALCULATION: 'Cálculo do sistema',
  SPREADSHEET_IMPORT: 'Planilha importada',
});

const reportValue = (row) => {
  if (row.numeric_value !== null && row.numeric_value !== undefined) return Number(row.numeric_value);
  if (row.text_value !== null && row.text_value !== undefined) return row.text_value;
  if (row.json_value !== null && row.json_value !== undefined) return JSON.stringify(row.json_value);
  return '';
};

export async function exportIndicatorSpreadsheet(rawFilters, user) {
  const filters = normalizeFilters(rawFilters);
  const rows = await repository.indicatorReportRows(filters);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Plataforma de Indicadores - Ágora Tech Park';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('Indicadores', { views: [{ state: 'frozen', ySplit: 4 }] });
  const lastColumn = 'N';
  worksheet.mergeCells(`A1:${lastColumn}1`);
  worksheet.getCell('A1').value = 'RELATÓRIO DE INDICADORES';
  worksheet.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 };
  worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173F35' } };
  worksheet.getCell('A1').alignment = { horizontal: 'center' };
  worksheet.mergeCells(`A2:${lastColumn}2`);
  worksheet.getCell('A2').value = `Ano: ${filters.year} | Mês: ${filters.month || 'Todos'} | Categoria: ${filters.category || 'Todas'} | Origem: ${filters.sourceType}`;
  worksheet.getCell('A2').font = { italic: true, color: { argb: 'FF4B5563' } };

  const headers = ['Centro', 'Código', 'Indicador', 'Categoria', 'Descrição', 'Ano', 'Mês', 'Período', 'Valor', 'Unidade', 'Tipo', 'Origem', 'Início', 'Fim'];
  worksheet.addRow([]);
  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF26735B' } };

  for (const row of rows) {
    const period = row.month ? `${String(row.month).padStart(2, '0')}/${row.year}` : String(row.year);
    const dataRow = worksheet.addRow([
      row.center_name, row.code, row.name, row.category, row.description || '', row.year,
      row.month || '', period, reportValue(row), row.unit, row.value_type,
      sourceLabels[row.source_type] || row.source_type, row.period_start || '', row.period_end || '',
    ]);
    const valueCell = dataRow.getCell(9);
    if (typeof valueCell.value === 'number') {
      if (row.value_type === 'CURRENCY' || row.unit === 'BRL') valueCell.numFmt = 'R$ #,##0.00';
      else if (row.value_type === 'PERCENT' || row.unit === 'PERCENT') valueCell.numFmt = '0.00%';
      else valueCell.numFmt = '#,##0.00';
    }
  }

  worksheet.autoFilter = { from: 'A4', to: `${lastColumn}${Math.max(4, worksheet.rowCount)}` };
  worksheet.columns = [
    { width: 30 }, { width: 28 }, { width: 42 }, { width: 28 }, { width: 52 },
    { width: 10 }, { width: 10 }, { width: 14 }, { width: 18 }, { width: 14 },
    { width: 16 }, { width: 24 }, { width: 14 }, { width: 14 },
  ];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber >= 4) row.alignment = { vertical: 'top', wrapText: true };
  });

  await record({
    userId: user?.sub || null,
    action: 'INDICATORS_EXPORTED',
    entity: 'indicator',
    details: { format: 'xlsx', filters, rows: rows.length },
  });
  const body = Buffer.from(await workbook.xlsx.writeBuffer());
  const suffix = filters.month ? `${filters.year}-${String(filters.month).padStart(2, '0')}` : String(filters.year);
  return { body, fileName: `relatorio-indicadores-${suffix}.xlsx`, rows: rows.length };
}
