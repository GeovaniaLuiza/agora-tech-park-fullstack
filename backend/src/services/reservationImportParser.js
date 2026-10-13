import { createHash } from 'node:crypto';
import { cleanText, isoDateTime, normalizedKey, parseDateValue } from './indicatorImportUtils.js';
import { summarizeEvents, validateEvent } from './eventImportParser.js';

export const RESERVATION_HEADERS = ['ID', 'Data de início', 'Data de término', 'Horário', 'Sala', 'Tipo', 'Responsável', 'Cliente', 'Empresa', 'Site', 'Prédio / Torre', 'Andar', 'Status'];
const requiredHeaders = ['ID', 'Data de início', 'Horário', 'Sala', 'Tipo', 'Status'];
const digest = (value) => createHash('sha256').update(value).digest('hex');

export function parseReservationSheet(worksheet, year) {
  const columns = new Map();
  worksheet.getRow(1).eachCell((cell, index) => columns.set(normalizedKey(cell.value), index));
  const missing = requiredHeaders.find((header) => !columns.has(normalizedKey(header)))
    || (!columns.has('cliente') && !columns.has('empresa') ? 'Cliente ou Empresa' : null);
  if (missing) return { errors: [{ code: 'INVALID_HEADERS', message: `Coluna '${missing}' não encontrada na aba 'Exportação'.`, missing: [missing] }], warnings: [], items: [], summary: {} };
  const groups = new Map(), warnings = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || !row.values.slice(1).some(cleanText)) return;
    const value = (header) => columns.has(normalizedKey(header)) ? row.getCell(columns.get(normalizedKey(header))).value : null;
    const fields = Object.fromEntries(RESERVATION_HEADERS.map((header) => [header, cleanText(value(header))]));
    const start = parseDateValue(value('Data de início')), end = parseDateValue(value('Data de término'));
    const name = fields.Cliente || fields.Empresa;
    const schedule = fields.Horário.replace(/\s*-\s*/g, ' - ');
    const confirmed = normalizedKey(fields.Status) === 'confirmada';
    const reservation = { sourceRow: rowNumber, sourceId: fields.ID, company: fields.Empresa, client: fields.Cliente,
      responsible: fields.Responsável, startAt: isoDateTime(start), endAt: isoDateTime(end), endRaw: isoDateTime(end) || fields['Data de término'],
      schedule, location: fields.Sala, subtype: fields.Tipo, site: fields.Site, building: fields['Prédio / Torre'], floor: fields.Andar, status: fields.Status };
    // Resource IDs and rooms are deliberately excluded: a booking can use several rooms.
    // Different types/sites/companies/time slots remain separate activities.
    const key = JSON.stringify([normalizedKey(name), normalizedKey(fields.Empresa), isoDateTime(start), isoDateTime(end), schedule, normalizedKey(fields.Tipo), normalizedKey(fields.Site)]);
    const canGroup = confirmed && name && start && fields.ID
      && /^([01]\d|2[0-3]):[0-5]\d - ([01]\d|2[0-3]):[0-5]\d$/.test(schedule)
      && (!fields['Data de término'] || (end && end >= start));
    const groupKey = canGroup ? key : `row:${rowNumber}`;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.sourceRows.push(rowNumber);
      existing.reservations.push(reservation);
      existing.sourceIds.push(fields.ID);
      existing.location = [...new Set(existing.reservations.map((entry) => entry.location).filter(Boolean))].join(' / ');
      existing.grouped = true;
      return;
    }
    groups.set(groupKey, {
      id: 'reservation-' + digest(canGroup ? key : `${fields.ID}|${rowNumber}`).slice(0, 24),
      sourceFormat: 'RESERVATIONS', sourceKey: 'reservation:' + digest(canGroup ? key : JSON.stringify([key, fields.ID || rowNumber])), sourceIds: [fields.ID].filter(Boolean), reservations: [reservation],
      reservationConfirmed: confirmed, sourceRows: [rowNumber], name, startAt: isoDateTime(start), dateRaw: fields['Data de início'],
      endAt: isoDateTime(end), endDateRaw: isoDateTime(end) || fields['Data de término'], schedule, location: fields.Sala, theme: '', mode: '', subtype: fields.Tipo,
      participants: null, participatingCompanies: null, included: false, ignored: !confirmed,
      reviewStatus: confirmed ? 'PENDING' : 'EXCLUDED', possibleEvent: confirmed,
      duplicateKey: key, duplicateGroup: null, grouped: false, participantStrategy: 'MANUAL',
    });
  });
  const items = [...groups.values()];
  const ids = new Map();
  for (const item of items.filter((entry) => entry.reservationConfirmed)) {
    for (const id of new Set(item.sourceIds)) {
      if (ids.has(id)) { item.sourceIdConflict = true; ids.get(id).sourceIdConflict = true; }
      ids.set(id, item);
    }
  }
  for (const item of items) {
    item.issues = validateEvent(item);
    item.validationStatus = item.ignored ? 'IGNORED' : item.issues.length ? 'REVIEW_REQUIRED' : 'VALID';
    warnings.push(...item.issues.map((issue) => ({ ...issue, code: item.ignored ? 'UNCONFIRMED_RESERVATION' : 'INVALID_EVENT_ROW' })));
  }
  if (!items.some((item) => item.reservationConfirmed)) warnings.push({ code: 'NO_CONFIRMED_RESERVATIONS', message: 'Não foram encontradas reservas confirmadas para importação.' });
  return { errors: [], warnings, items, summary: summarizeEvents(items, year), sheetName: 'Exportação', year };
}
