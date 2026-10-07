import { createHash } from 'node:crypto';
import { EVENT_HEADERS, EVENT_MODES, EVENT_SHEET, IMPORT_YEAR, modeLabels } from '../domain/indicatorImportCatalog.js';
import { cleanText, countByMonth, isoDateTime, normalizedKey, parseDateValue, parseNumberValue, readExpectedSheet, validationSummary } from './indicatorImportUtils.js';

export const normalizeEventMode = (value) => EVENT_MODES.find((mode) => mode === cleanText(value) || normalizedKey(modeLabels[mode]) === normalizedKey(value)) || cleanText(value);

export function validateEvent(item) {
  const issues = [];
  const row = item.sourceRows?.[0];
  const issue = (field, message) => issues.push({ field, row, message: message + ' na linha ' + row });
  if (!cleanText(item.name)) issue('name', 'Evento ausente');
  if (!parseDateValue(item.startAt)) issue('startAt', 'Data inválida');
  if (!cleanText(item.location)) issue('location', 'Local ausente');
  for (const field of ['participants', 'participatingCompanies']) {
    if (cleanText(item[field]) && parseNumberValue(item[field], { integer: true }) === null) issue(field, field === 'participants' ? 'Participantes inválidos' : 'Empresas participantes inválidas');
  }
  if (item.mode && !EVENT_MODES.includes(normalizeEventMode(item.mode))) issue('mode', 'Modo desconhecido');
  return issues;
}

export async function parseEventWorkbook(buffer, { year = IMPORT_YEAR } = {}) {
  const loaded = await readExpectedSheet(buffer, { sheetName: EVENT_SHEET, headerRow: 1, headers: EVENT_HEADERS, exactHeaders: true });
  if (loaded.error) return { errors: [loaded.error], warnings: [], items: [], summary: {} };
  const items = [], warnings = [];
  loaded.worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 1 || !row.values.slice(1, 9).some((value) => cleanText(value))) return;
    const values = EVENT_HEADERS.map((_, index) => row.getCell(index + 1).value);
    const date = parseDateValue(values[1]);
    const item = {
      id: 'event-' + rowNumber, sourceRows: [rowNumber], name: cleanText(values[0]),
      startAt: isoDateTime(date), dateRaw: cleanText(values[1]), endAt: null, location: cleanText(values[2]),
      theme: cleanText(values[3]), mode: normalizeEventMode(values[4]), subtype: cleanText(values[5]),
      participants: parseNumberValue(values[6], { integer: true }) ?? (cleanText(values[6]) || null),
      participatingCompanies: parseNumberValue(values[7], { integer: true }) ?? (cleanText(values[7]) || null),
      included: false, reviewStatus: 'PENDING', possibleEvent: true,
      duplicateKey: date ? date.toISOString().slice(0, 10) + '|' + normalizedKey(values[0]) : 'row:' + rowNumber,
      duplicateGroup: null, grouped: false, participantStrategy: 'MANUAL',
    };
    item.issues = validateEvent(item);
    item.validationStatus = item.issues.length ? 'REVIEW_REQUIRED' : 'VALID';
    warnings.push(...item.issues.map((issue) => ({ ...issue, code: 'INVALID_EVENT_ROW' })));
    items.push(item);
  });
  const groups = new Map();
  items.forEach((item) => groups.set(item.duplicateKey, [...(groups.get(item.duplicateKey) || []), item]));
  groups.forEach((group, key) => {
    if (group.length < 2) return;
    const groupId = createHash('sha256').update(key).digest('hex').slice(0, 12);
    group.forEach((item) => { item.duplicateGroup = groupId; if (!item.issues.length) item.validationStatus = 'WARNING'; });
    warnings.push({ code: 'POSSIBLE_DUPLICATE', rows: group.flatMap((item) => item.sourceRows), message: 'Possível mesmo evento: nome e data coincidem.' });
  });
  return { errors: [], warnings, items, summary: summarizeEvents(items, year), sheetName: EVENT_SHEET, year };
}

export function summarizeEvents(items, year = IMPORT_YEAR) {
  const included = items.filter((item) => item.included);
  return {
    ...validationSummary(items), records: items.length, rowsRead: items.length,
    possibleEvents: items.filter((item) => item.possibleEvent).length,
    included: included.length, reviewed: items.filter((item) => item.included || item.reviewStatus === 'EXCLUDED').length, excluded: items.filter((item) => item.reviewStatus === 'EXCLUDED').length,
    pending: items.filter((item) => item.reviewStatus === 'PENDING').length,
    duplicates: new Set(items.filter((item) => item.duplicateGroup && !item.grouped).map((item) => item.duplicateGroup)).size,
    missingParticipants: items.filter((item) => item.participants === null).length,
    monthly: countByMonth(included.filter((item) => !validateEvent(item).length), (item) => parseDateValue(item.startAt), year),
  };
}
