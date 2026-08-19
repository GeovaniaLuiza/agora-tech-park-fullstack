import ExcelJS from 'exceljs';
import { INDICATOR_CATALOG, REFERENCE_TOTALS_2025, REFERENCE_TOTALS_2026, SOURCE_TYPES } from '../domain/indicatorCatalog.js';

const MONTH_COLUMNS = Object.freeze(Array.from({ length: 12 }, (_, index) => index + 2));

export function unwrapCellValue(value) {
  if (value && typeof value === 'object') {
    if ('result' in value) return value.result;
    if ('text' in value) return value.text;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
  }
  return value;
}

export function parseBrazilianNumber(value, valueType = 'NUMBER') {
  const raw = unwrapCellValue(value);
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return Number.isFinite(Number(raw)) ? Number(raw) : null;
  let text = raw.trim();
  if (!text || /^(n\/?d|não se aplica)$/i.test(text)) return null;
  if (/^#(?:REF!|DIV\/0!|VALUE!|N\/A|NAME\?)/i.test(text)) return null;
  const percent = text.includes('%') || valueType === 'PERCENT';
  text = text.replace(/R\$/gi, '').replace(/\s/g, '');
  if (/^-?\d+(\.\d+)?$/.test(text)) return percent && text.includes('%') ? Number(text.replace('%', '')) / 100 : Number(text);
  text = text.replace(/%/g, '').replace(/\./g, '').replace(',', '.');
  const numericText = text.replace(/[^0-9.-]/g, '');
  if (!numericText || numericText === '-' || numericText === '.') return null;
  const parsed = Number(numericText);
  if (!Number.isFinite(parsed)) return null;
  return percent ? parsed / 100 : parsed;
}

function periodFor(year, month) {
  if (month) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function recordFor(definition, year, month, rawValue) {
  const { start, end } = periodFor(year, month);
  if (definition.valueType === 'TEXT') {
    const value = String(unwrapCellValue(rawValue) ?? '').trim();
    if (!value) return null;
    return { code: definition.code, year, month, periodStart: start, periodEnd: end, textValue: value, sourceType: SOURCE_TYPES.SPREADSHEET };
  }
  const numericValue = parseBrazilianNumber(rawValue, definition.valueType);
  if (numericValue === null) return null;
  return { code: definition.code, year, month, periodStart: start, periodEnd: end, numericValue, sourceType: SOURCE_TYPES.SPREADSHEET };
}

function collectOpenInnovation(worksheet) {
  const organizations = [];
  for (let row = 1603; row <= 1614; row += 1) {
    const name = String(unwrapCellValue(worksheet.getCell(row, 1).value) ?? '').trim();
    if (!name) continue;
    organizations.push({
      organization: name,
      challenges: parseBrazilianNumber(worksheet.getCell(row, 2).value) || 0,
      solutions: parseBrazilianNumber(worksheet.getCell(row, 3).value) || 0,
      deals: parseBrazilianNumber(worksheet.getCell(row, 4).value) || 0,
    });
  }
  return organizations;
}

export async function parseIndicatorWorkbook(filePath, { sheetName = 'CI JOINVILLE', year = 2026 } = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) throw Object.assign(new Error(`Aba "${sheetName}" não encontrada`), { code: 'SHEET_NOT_FOUND', status: 422 });

  const definitions = INDICATOR_CATALOG.map((item) => ({
    code: item.code,
    name: String(unwrapCellValue(worksheet.getCell(item.row, 1).value) || item.name).trim(),
    description: `Importado da aba ${sheetName}, linha ${item.row}.`,
    category: item.category,
    unit: item.unit,
    valueType: item.valueType,
    periodicity: item.annualColumn === 2 ? 'ANNUAL' : 'MONTHLY',
    aggregationType: item.aggregation,
  }));
  const values = [];
  const errors = [];

  for (const item of INDICATOR_CATALOG) {
    if (!item.annualColumn || item.annualColumn === 14) {
      for (const [index, column] of MONTH_COLUMNS.entries()) {
        const record = recordFor(item, year, index + 1, worksheet.getCell(item.row, column).value);
        if (record) values.push(record);
      }
    }
    const annualColumn = item.annualColumn || 14;
    const annual = recordFor(item, year, null, worksheet.getCell(item.row, annualColumn).value);
    if (annual) values.push(annual);
  }

  const openInnovation = collectOpenInnovation(worksheet);
  definitions.push({ code: 'INOVACAO_ABERTA_ORGANIZACOES', name: 'Organizações apoiadas em inovação aberta', description: 'Desafios, soluções e negócios por organização.', category: 'Inovação aberta', unit: 'REGISTRO', valueType: 'JSON', periodicity: 'ANNUAL', aggregationType: 'MANUAL' });
  const annualPeriod = periodFor(year, null);
  values.push({ code: 'INOVACAO_ABERTA_ORGANIZACOES', year, month: null, periodStart: annualPeriod.start, periodEnd: annualPeriod.end, jsonValue: openInnovation, sourceType: SOURCE_TYPES.SPREADSHEET });

  const annualByCode = new Map(values.filter((value) => value.month === null).map((value) => [value.code, value.numericValue]));
  const referenceTotals = year === 2025 ? REFERENCE_TOTALS_2025 : REFERENCE_TOTALS_2026;
  for (const [code, expected] of Object.entries(referenceTotals)) {
    const actual = annualByCode.get(code);
    if (actual === undefined || Math.abs(actual - expected) > 0.0001) errors.push({ code: 'REFERENCE_MISMATCH', indicatorCode: code, expected, actual: actual ?? null });
  }

  for (const item of INDICATOR_CATALOG.filter((entry) => ['FATURAMENTO_EMPRESAS', 'ARRECADACAO_EMPRESAS'].includes(entry.code))) {
    if (typeof unwrapCellValue(worksheet.getCell(item.row, 2).value) === 'string') {
      errors.push({ code: 'TEXT_CURRENCY_CELL', indicatorCode: item.code, cell: `B${item.row}`, message: 'Valor monetário armazenado como texto; convertido pelo importador e mantido como inconsistência de origem.' });
    }
  }

  return { sheetName, year, definitions, values, errors, openInnovation };
}
