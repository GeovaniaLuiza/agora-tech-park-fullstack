import { createHash } from 'node:crypto';
import { EVENT_SHEET, IMPORT_YEAR } from '../domain/indicatorImportCatalog.js';
import { cleanText, countByMonth, isoDateTime, normalizedKey, parseDateValue, readExpectedSheet } from './indicatorImportUtils.js';

const HEADERS = ['Agendamento', 'Horário Agendamento Início', 'Horário Agendamento Fim', 'Nome Cliente', 'Quantidade de pessoas'];
const POSSIBLE_EVENT = /\b(evento|eventos|reuniao|reunioes|reuniao|reunioes)\b/i;
const IS_EVENT = /\b(evento|eventos)\b/i;
const IS_REUNION = /\b(reuniao|reunioes|reuniao|reunioes)\b/i;

const parseParticipants = (value) => {
  if (value === null || value === undefined || cleanText(value) === '') return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isInteger(number) && number >= 0 ? number : null;
};

export async function parseEventWorkbook(buffer, { year = IMPORT_YEAR } = {}) {
  const loaded = await readExpectedSheet(buffer, { sheetName: EVENT_SHEET, headerRow: 1, headers: HEADERS });
  if (loaded.error) return { errors: [loaded.error], warnings: [], items: [], summary: {} };
  const { worksheet } = loaded;
  const items = [];
  const warnings = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const location = cleanText(row.getCell(1).value);
    const name = cleanText(row.getCell(4).value);

    // Regra 5: NÃO usar Nome da Sala. Classificação é pelo Nome Cliente.
    const normalizedName = cleanText(name).toLowerCase();
    const isRelevant = POSSIBLE_EVENT.test(normalizedName);

    if (!isRelevant) return; // Regra 6: Ignorar se não atender ao critério

    if (!location && !name) return;
    const start = parseDateValue(row.getCell(2).value);
    const end = parseDateValue(row.getCell(3).value);
    if (!name || !start) {
      warnings.push({ code: 'INVALID_EVENT_ROW', row: rowNumber, message: 'Registro sem nome ou data inicial válida.' });
      return;
    }
    const participants = parseParticipants(row.getCell(5).value);
    if (participants === null) warnings.push({ code: 'MISSING_PARTICIPANTS', row: rowNumber, message: 'Quantidade de participantes não informada.' });
    const duplicateKey = `${start.toISOString().slice(0, 10)}|${normalizedKey(name)}`;

    // Regra 10: Categoria automática
    const type = IS_EVENT.test(normalizedName) ? 'Evento' : (IS_REUNION.test(normalizedName) ? 'Reunião' : 'Revisar');

    items.push({
      id: `event-${rowNumber}`, sourceRows: [rowNumber], name, location,
      startAt: isoDateTime(start), endAt: isoDateTime(end), participants,
      theme: '', mode: '', modeSuggestion: 'PRESENTIAL', subtype: type, participatingCompanies: null,
      included: false, reviewStatus: 'PENDING', possibleEvent: true,
      duplicateKey, duplicateGroup: null, grouped: false, participantStrategy: 'MANUAL',
    });
  });
  const groups = new Map();
  items.forEach((item) => groups.set(item.duplicateKey, [...(groups.get(item.duplicateKey) || []), item]));
  groups.forEach((group, key) => {
    if (group.length < 2) return;
    const groupId = createHash('sha256').update(key).digest('hex').slice(0, 12);
    group.forEach((item) => { item.duplicateGroup = groupId; });
    warnings.push({ code: 'POSSIBLE_DUPLICATE', rows: group.flatMap((item) => item.sourceRows), message: 'Possível mesmo evento: nome e data coincidem.' });
  });
  const summary = summarizeEvents(items, year);
  return { errors: [], warnings, items, summary, sheetName: EVENT_SHEET, year };
}

export function summarizeEvents(items, year = IMPORT_YEAR) {
  const included = items.filter((item) => item.included);
  return {
    records: items.length,
    possibleEvents: items.filter((item) => item.possibleEvent).length,
    included: included.length,
    excluded: items.filter((item) => item.reviewStatus === 'EXCLUDED').length,
    pending: items.filter((item) => item.reviewStatus === 'PENDING').length,
    duplicates: new Set(items.filter((item) => item.duplicateGroup && !item.grouped).map((item) => item.duplicateGroup)).size,
    missingParticipants: items.filter((item) => item.participants === null).length,
    monthly: countByMonth(included, (item) => parseDateValue(item.startAt), year),
  };
}
