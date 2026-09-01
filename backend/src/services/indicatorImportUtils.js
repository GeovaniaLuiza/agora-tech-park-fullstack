import ExcelJS from 'exceljs';

export const unwrapCellValue = (value) => {
  if (value && typeof value === 'object') {
    if (value instanceof Date) return value;
    if ('result' in value) return value.result;
    if ('text' in value) return value.text;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
  }
  return value;
};

export const cleanText = (value) => String(unwrapCellValue(value) ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
export const normalizedKey = (value) => cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, ' ').trim();
export const safeSpreadsheetText = (value) => {
  const text = cleanText(value);
  return /^[=+@]/.test(text) || /^-\D/.test(text) ? `'${text}` : text;
};

export function parseDateValue(value) {
  const raw = unwrapCellValue(value);
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return new Date(raw.getTime());
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const epoch = Date.UTC(1899, 11, 30);
    const parsed = new Date(epoch + raw * 86400000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const text = cleanText(raw);
  if (!text) return null;
  const brazilian = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brazilian) {
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = brazilian;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
    return parsed.getUTCFullYear() === Number(year) && parsed.getUTCMonth() === Number(month) - 1 && parsed.getUTCDate() === Number(day) ? parsed : null;
  }
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

export const isoDate = (value) => value ? value.toISOString().slice(0, 10) : null;
export const isoDateTime = (value) => value ? value.toISOString() : null;
export const monthBounds = (year, month) => ({
  start: `${year}-${String(month).padStart(2, '0')}-01`,
  end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
});
export const overlaps = (startDate, endDate, start, end) => (!startDate || startDate <= end) && (!endDate || endDate >= start);

const headerKey = (value) => normalizedKey(value).replace(/\s/g, '');

export async function readExpectedSheet(buffer, { sheetName, headerRow, headers }) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) return { error: { code: 'SHEET_NOT_FOUND', message: `A planilha deve conter a aba "${sheetName}".` } };
  const actual = headers.map((_, index) => headerKey(worksheet.getRow(headerRow).getCell(index + 1).value));
  const missing = headers.filter((expected, index) => {
    const accepted = (Array.isArray(expected) ? expected : [expected]).map(headerKey);
    return !accepted.includes(actual[index]);
  }).map((expected) => Array.isArray(expected) ? expected[0] : expected);
  if (missing.length) return { error: { code: 'INVALID_HEADERS', message: `Cabeçalhos inválidos na aba "${sheetName}".`, missing } };
  return { workbook, worksheet };
}

export const countByMonth = (items, dateSelector, year) => Array.from({ length: 12 }, (_, index) =>
  items.filter((item) => {
    const date = dateSelector(item);
    return date && date.getUTCFullYear() === year && date.getUTCMonth() === index;
  }).length);
