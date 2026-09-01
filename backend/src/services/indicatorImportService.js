import { createHash } from 'node:crypto';
import { EVENT_MODES, EVENT_TYPES, IMPORT_STATUS, IMPORT_TYPES, IMPORT_TYPE_VALUES, IMPORT_YEAR, MAX_IMPORT_BYTES, XLSX_MIME } from '../domain/indicatorImportCatalog.js';
import * as repository from '../repositories/indicatorImportRepository.js';
import { record as audit } from '../repositories/auditRepository.js';
import { recompute } from './indicatorCalculationService.js';
import { parseEventWorkbook, summarizeEvents } from './eventImportParser.js';
import { parseResidentWorkbook, summarizeResidents } from './residentImportParser.js';
import { cleanText, parseDateValue } from './indicatorImportUtils.js';
import { serviceError } from '../utils/validation.js';

const managerRoles = new Set(['ADMIN', 'PESQUISADOR']);
const ensureManager = (user) => { if (!managerRoles.has(user?.role)) throw serviceError(403, 'Você não possui permissão para importar indicadores.', 'FORBIDDEN'); };
const ensureType = (type) => {
  const normalized = String(type || '').toUpperCase();
  if (!IMPORT_TYPE_VALUES.includes(normalized)) throw serviceError(404, 'Tipo de importação inválido.', 'INVALID_IMPORT_TYPE');
  return normalized;
};
const ensureBatch = async (id) => {
  const batch = await repository.findBatch(id);
  if (!batch) throw serviceError(404, 'Importação não encontrada.', 'IMPORT_NOT_FOUND');
  return batch;
};
const integerOrNull = (value, field) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw serviceError(422, `${field} deve ser um número inteiro não negativo.`, 'INVALID_FIELD');
  return parsed;
};
const decimalOrNull = (value, field) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) throw serviceError(422, `${field} deve ser um número não negativo.`, 'INVALID_FIELD');
  return parsed;
};
const text = (value, max = 220) => cleanText(value).slice(0, max);

function validateFile({ fileName, mimeType, buffer }) {
  if (!String(fileName || '').toLowerCase().endsWith('.xlsx')) throw serviceError(422, 'Selecione um arquivo com extensão .xlsx.', 'INVALID_FILE_EXTENSION');
  if (mimeType !== XLSX_MIME) throw serviceError(422, 'O tipo MIME do arquivo não corresponde a uma planilha XLSX.', 'INVALID_FILE_TYPE');
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw serviceError(422, 'O arquivo enviado está vazio.', 'EMPTY_FILE');
  if (buffer.length > MAX_IMPORT_BYTES) throw serviceError(413, 'A planilha excede o limite de 10 MB.', 'PAYLOAD_TOO_LARGE');
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4B || buffer[2] !== 0x03 || buffer[3] !== 0x04) throw serviceError(422, 'O conteúdo do arquivo não é um XLSX válido.', 'INVALID_XLSX_SIGNATURE');
}

const presentBatch = (batch) => ({
  id: batch.id, importType: batch.import_type, fileName: batch.file_name, fileHash: batch.file_hash,
  sheetName: batch.sheet_name, centerId: batch.innovation_center_id, centerName: batch.center_name,
  year: batch.year, status: batch.status, summary: batch.summary, warnings: batch.warnings,
  draft: batch.draft, createdAt: batch.created_at, updatedAt: batch.updated_at, confirmedAt: batch.confirmed_at,
});

export async function preview({ type, fileName, mimeType, buffer, centerId, reprocess = false }, user) {
  ensureManager(user);
  const importType = ensureType(type);
  validateFile({ fileName, mimeType, buffer });
  const center = await repository.findCenter(centerId);
  if (!center) throw serviceError(404, 'Centro de Inovação não encontrado.', 'CENTER_NOT_FOUND');
  const fileHash = createHash('sha256').update(buffer).digest('hex').toUpperCase();
  const previous = await repository.findPrevious({ fileHash, importType, centerId });
  if (previous && !reprocess) throw serviceError(409, 'Este arquivo já foi processado anteriormente.', 'IMPORT_ALREADY_EXISTS', { previousImport: previous });
  let parsed;
  try { parsed = importType === IMPORT_TYPES.EVENTS ? await parseEventWorkbook(buffer) : await parseResidentWorkbook(buffer); }
  catch (error) { throw serviceError(422, `Não foi possível interpretar a planilha: ${error.message}`, 'INVALID_XLSX'); }
  if (parsed.errors.length) throw serviceError(422, parsed.errors[0].message, parsed.errors[0].code, { errors: parsed.errors });
  const status = parsed.warnings.length ? IMPORT_STATUS.WITH_WARNINGS : IMPORT_STATUS.REVIEW_PENDING;
  const batch = await repository.createBatch({
    importType, fileName: text(fileName, 255), fileHash, fileSize: buffer.length, mimeType,
    sheetName: parsed.sheetName, centerId, year: parsed.year, status,
    totalRecords: parsed.summary.records || 0, totalIgnored: parsed.summary.excluded || 0,
    totalWarnings: parsed.warnings.length, summary: parsed.summary, warnings: parsed.warnings,
    draft: { items: parsed.items, filters: importType === IMPORT_TYPES.RESIDENTS ? { onlyInnovationBlocks: true } : {} }, userId: user.sub,
  });
  await audit({ userId: user.sub, action: 'INDICATOR_IMPORT_PREVIEWED', entity: 'indicator_import_batch', entityId: batch.id, details: { importType, fileName: batch.file_name, fileHash, records: parsed.summary.records } });
  return presentBatch({ ...batch, center_name: center.name });
}

export async function getBatch(id, user) { ensureManager(user); return presentBatch(await ensureBatch(id)); }
export async function getLatestDraft({ type, centerId }, user) {
  ensureManager(user); const importType = ensureType(type);
  const batch = await repository.latestDraft({ importType, centerId, userId: user.sub });
  return batch ? presentBatch(batch) : null;
}

function reviewedEvents(original, submitted) {
  const originals = new Map(original.map((item) => [item.id, item]));
  return submitted.map((item) => {
    const source = originals.get(item.id);
    if (!source) throw serviceError(422, 'A revisão contém um evento desconhecido.', 'INVALID_REVIEW_ITEM');
    const mode = item.mode || '';
    if (mode && !EVENT_MODES.includes(mode)) throw serviceError(422, 'Modo de evento inválido.', 'INVALID_EVENT_MODE');
    const subtype = text(item.subtype, 100);
    if (subtype && !EVENT_TYPES.includes(subtype)) throw serviceError(422, 'Tipo de evento inválido.', 'INVALID_EVENT_SUBTYPE');
    return { ...source, name: text(item.name), location: text(item.location), startAt: parseDateValue(item.startAt)?.toISOString() || source.startAt,
      endAt: parseDateValue(item.endAt)?.toISOString() || null, participants: integerOrNull(item.participants, 'Participantes'),
      theme: text(item.theme, 160), mode, subtype, participatingCompanies: integerOrNull(item.participatingCompanies, 'Empresas participantes'),
      included: Boolean(item.included), reviewStatus: item.included ? 'VALIDATED' : item.reviewStatus === 'EXCLUDED' ? 'EXCLUDED' : 'PENDING' };
  });
}

function reviewedResidents(original, submitted) {
  const originals = new Map(original.map((item) => [item.id, item]));
  return submitted.map((item) => {
    const source = originals.get(item.id);
    if (!source) throw serviceError(422, 'A revisão contém uma empresa desconhecida.', 'INVALID_REVIEW_ITEM');
    const startDate = parseDateValue(item.startDate)?.toISOString().slice(0, 10) || source.startDate;
    const endDate = item.endDate ? parseDateValue(item.endDate)?.toISOString().slice(0, 10) : null;
    if (startDate && endDate && endDate < startDate) throw serviceError(422, 'Data de saída anterior à entrada.', 'INVALID_DATE_RANGE');
    const included = Boolean(item.included);
    const manualPeriodOverride = Boolean(item.manualPeriodOverride);
    const discontinuous = source.discontinuous && !manualPeriodOverride;
    return { ...source, name: text(item.name), included, manualBlockOverride: Boolean(item.manualBlockOverride),
      manualPeriodOverride, discontinuous, location: text(item.location),
      rooms: Array.isArray(item.rooms) ? item.rooms.map((value) => text(value)).filter(Boolean) : source.rooms,
      contractType: text(item.contractType, 100), startDate, endDate, sector: text(item.sector, 160),
      result: text(item.result, 1000), programName: text(item.programName, 180),
      collaboratorsEntry: integerOrNull(item.collaboratorsEntry, 'Colaboradores na entrada'),
      collaboratorsExit: integerOrNull(item.collaboratorsExit, 'Colaboradores na saída'),
      intellectualProperty: text(item.intellectualProperty, 1000), fundsRaised: decimalOrNull(item.fundsRaised, 'Captação de recursos'),
      annualRevenue: decimalOrNull(item.annualRevenue, 'Faturamento anual'),
      internationalRelationships: text(item.internationalRelationships, 1000),
      reviewStatus: !included ? 'EXCLUDED' : discontinuous ? 'WITH_WARNINGS' : 'VALIDATED' };
  });
}

export async function saveReview(id, payload, user) {
  ensureManager(user); const batch = await ensureBatch(id);
  if (![IMPORT_STATUS.REVIEW_PENDING, IMPORT_STATUS.WITH_WARNINGS, IMPORT_STATUS.VALIDATED].includes(batch.status)) throw serviceError(409, 'Esta importação não pode mais ser revisada.', 'IMPORT_NOT_EDITABLE');
  if (!Array.isArray(payload.items) || payload.items.length > 2500) throw serviceError(422, 'Revisão inválida.', 'INVALID_REVIEW');
  const items = batch.import_type === IMPORT_TYPES.EVENTS
    ? reviewedEvents(batch.draft.items || [], payload.items)
    : reviewedResidents(batch.draft.items || [], payload.items);
  const summary = batch.import_type === IMPORT_TYPES.EVENTS ? summarizeEvents(items, batch.year) : summarizeResidents(items, batch.year);
  const saved = await repository.saveDraft(id, { draft: { ...batch.draft, items }, summary, warnings: batch.warnings, status: batch.warnings.length ? IMPORT_STATUS.WITH_WARNINGS : IMPORT_STATUS.VALIDATED });
  if (!saved) throw serviceError(409, 'Esta importação não pode mais ser revisada.', 'IMPORT_NOT_EDITABLE');
  return presentBatch({ ...saved, center_name: batch.center_name });
}

export async function groupEvents(id, { itemIds, participantStrategy = 'MANUAL', participants = null }, user) {
  ensureManager(user); const batch = await ensureBatch(id);
  if (batch.import_type !== IMPORT_TYPES.EVENTS) throw serviceError(422, 'Agrupamento disponível apenas para eventos.', 'INVALID_IMPORT_TYPE');
  const selected = (batch.draft.items || []).filter((item) => itemIds?.includes(item.id));
  if (selected.length < 2 || new Set(selected.map((item) => item.duplicateKey)).size !== 1) throw serviceError(422, 'Selecione reservas com o mesmo nome e data.', 'INVALID_EVENT_GROUP');
  const known = selected.map((item) => item.participants).filter((value) => value !== null);
  let participantValue = integerOrNull(participants, 'Participantes');
  if (participantStrategy === 'MAX') participantValue = known.length ? Math.max(...known) : null;
  if (participantStrategy === 'SUM') participantValue = known.length ? known.reduce((sum, value) => sum + value, 0) : null;
  if (!['MANUAL', 'MAX', 'SUM'].includes(participantStrategy)) throw serviceError(422, 'Estratégia de participantes inválida.', 'INVALID_PARTICIPANT_STRATEGY');
  const sourceRows = selected.flatMap((item) => item.sourceRows).sort((a, b) => a - b);
  const merged = { ...selected[0], id: `event-group-${createHash('sha256').update(sourceRows.join(',')).digest('hex').slice(0, 12)}`,
    sourceRows, location: [...new Set(selected.map((item) => item.location).filter(Boolean))].join(' / '),
    participants: participantValue, participantStrategy, duplicateGroup: null, grouped: true, included: true, reviewStatus: 'VALIDATED' };
  const remaining = (batch.draft.items || []).filter((item) => !itemIds.includes(item.id));
  const items = [...remaining, merged];
  const summary = summarizeEvents(items, batch.year);
  const saved = await repository.saveDraft(id, { draft: { ...batch.draft, items }, summary, warnings: batch.warnings, status: batch.warnings.length ? IMPORT_STATUS.WITH_WARNINGS : IMPORT_STATUS.VALIDATED });
  return presentBatch({ ...saved, center_name: batch.center_name });
}

function eventRecord(item) {
  return { recordType: 'EVENT', name: item.name, eventAt: item.startAt, startDate: null, endDate: null,
    location: item.location || null, theme: item.theme || null, mode: item.mode && item.mode !== 'NOT_INFORMED' ? item.mode : null,
    subtype: item.subtype || null, participants: item.participants, participatingCompanies: item.participatingCompanies,
    sector: null, result: null, programName: null, collaboratorsEntry: null, collaboratorsExit: null,
    intellectualProperty: null, fundsRaised: null, annualRevenue: null, internationalRelationships: null,
    sourceRows: item.sourceRows, extra: { sourceKey: item.id, endAt: item.endAt, grouped: item.grouped, participantStrategy: item.participantStrategy } };
}
function residentRecord(item) {
  const location = [item.location, item.rooms?.length ? `Salas ${item.rooms.join(', ')}` : ''].filter(Boolean).join(' - ');
  return { recordType: 'RESIDENT_COMPANY', name: text(item.name, 220), startDate: item.startDate, endDate: item.endDate,
    eventAt: null, location: text(location, 220) || null,
    theme: null, mode: null, subtype: text(item.contractType, 100) || null, participants: null, participatingCompanies: null,
    sector: text(item.sector, 160) || null, result: item.result || null, programName: text(item.programName, 180) || null,
    collaboratorsEntry: item.collaboratorsEntry, collaboratorsExit: item.collaboratorsExit,
    intellectualProperty: item.intellectualProperty || null, fundsRaised: item.fundsRaised || null,
    annualRevenue: item.annualRevenue || null, internationalRelationships: item.internationalRelationships || null,
    sourceRows: item.sourceRows, extra: { sourceKey: item.id, documentHash: item.documentHash, documentMasked: item.documentMasked,
      contracts: item.contracts, discontinuous: item.discontinuous } };
}

export async function confirm(id, user) {
  ensureManager(user); const batch = await ensureBatch(id);
  if (batch.status === IMPORT_STATUS.IMPORTED) throw serviceError(409, 'Esta importação já foi confirmada.', 'IMPORT_ALREADY_CONFIRMED');
  if (![IMPORT_STATUS.REVIEW_PENDING, IMPORT_STATUS.WITH_WARNINGS, IMPORT_STATUS.VALIDATED].includes(batch.status)) throw serviceError(409, 'Importação indisponível para confirmação.', 'IMPORT_NOT_CONFIRMABLE');
  const included = (batch.draft.items || []).filter((item) => item.included);
  if (!included.length) throw serviceError(422, 'Selecione ao menos um registro antes de confirmar.', 'NO_INCLUDED_RECORDS');
  const records = included.map(batch.import_type === IMPORT_TYPES.EVENTS ? eventRecord : residentRecord);
  await repository.replaceBatchRecords(batch, records, user.sub);
  await recompute(batch.innovation_center_id, batch.year, user.sub);
  const summary = batch.import_type === IMPORT_TYPES.EVENTS ? summarizeEvents(batch.draft.items, batch.year) : summarizeResidents(batch.draft.items, batch.year);
  const saved = await repository.markImported(id, { imported: records.length, ignored: (batch.draft.items || []).length - records.length, summary, userId: user.sub });
  await audit({ userId: user.sub, action: 'INDICATOR_IMPORT_CONFIRMED', entity: 'indicator_import_batch', entityId: id,
    details: { importType: batch.import_type, imported: records.length, ignored: (batch.draft.items || []).length - records.length, fileHash: batch.file_hash } });
  return presentBatch({ ...saved, center_name: batch.center_name });
}

export const importOptions = () => ({ eventModes: EVENT_MODES, eventTypes: EVENT_TYPES, year: IMPORT_YEAR, mimeType: XLSX_MIME, maxBytes: MAX_IMPORT_BYTES });
