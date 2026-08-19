import * as repository from '../repositories/indicatorManagementRepository.js';
import { record as audit } from '../repositories/auditRepository.js';
import { DEVELOPMENT_STAGES, MODES, RECORD_TYPES, RECORD_TYPE_VALUES, normalizedValueType } from '../domain/indicatorManagementCatalog.js';
import { serviceError } from '../utils/validation.js';
import { recompute } from './indicatorCalculationService.js';

const editRoles = new Set(['ADMIN', 'PESQUISADOR', 'GESTOR']);
const catalogRoles = new Set(['ADMIN', 'PESQUISADOR']);
const catalogValueTypes = new Set(['INTEGER', 'DECIMAL', 'CURRENCY', 'PERCENTAGE', 'TEXT']);
const catalogPeriodicities = new Set(['MONTHLY', 'ANNUAL', 'EVENT']);
const catalogAggregations = new Set(['SUM', 'AVERAGE', 'COUNT', 'LAST_VALUE', 'MAX', 'MIN']);
const annualAggregations = new Set(['SUM', 'AVERAGE', 'COUNT', 'LAST_VALUE']);
const CATALOG_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,99}$/;
const CATALOG_TEXT_PATTERN = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} ().,%/+&'’ºª°_-]*$/u;
const CATALOG_UNIT_PATTERN = /^[\p{L}\p{M}\p{N}%$€./ºª°_-][\p{L}\p{M}\p{N} %$€./ºª°_-]*$/u;
const required = (value, message, code) => {
  if (value === undefined || value === null || String(value).trim() === '') throw serviceError(422, message, code);
  return value;
};
const catalogText = (value, field, pattern, maxLength = 150) => {
  const normalized = String(required(value, `${field} é obrigatório.`, `${field.toUpperCase()}_REQUIRED`)).trim();
  if (normalized.length > maxLength || !pattern.test(normalized)) throw serviceError(422, `${field} possui caracteres inválidos.`, `INVALID_${field.toUpperCase()}`);
  return normalized;
};
const integer = (value, name, { optional = true, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw serviceError(422, `${name} é obrigatório.`, 'FIELD_REQUIRED');
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw serviceError(422, `${name} possui valor inválido.`, 'INVALID_FIELD');
  return parsed;
};
const decimal = (value, name) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) throw serviceError(422, `${name} possui valor inválido.`, 'INVALID_FIELD');
  return parsed;
};
const ensureEditor = (user) => {
  if (!editRoles.has(user.role)) throw serviceError(403, 'Você não possui permissão para alterar indicadores.', 'FORBIDDEN');
};
const ensureCatalogEditor = (user) => {
  if (!catalogRoles.has(user.role)) throw serviceError(403, 'Você não possui permissão para administrar o catálogo.', 'FORBIDDEN');
};
const ensureCenter = async (id) => {
  required(id, 'Centro de Inovação é obrigatório.', 'CENTER_REQUIRED');
  const center = await repository.findCenter(id);
  if (!center) throw serviceError(404, 'Centro de Inovação não encontrado.', 'CENTER_NOT_FOUND');
  return center;
};
const yearValue = (value) => integer(value, 'Ano', { optional: false, min: 2000, max: 2200 });
const monthValue = (value) => integer(value, 'Mês', { optional: false, min: 1, max: 12 });

export const listCenters = (includeInactive = false) => repository.listCenters({ includeInactive });

export async function saveCenter(id, payload, user) {
  ensureEditor(user);
  const result = id
    ? await repository.updateCenter(id, payload, user.sub)
    : await repository.createCenter({ ...payload, code: required(payload.code, 'Código é obrigatório.', 'CODE_REQUIRED'), name: required(payload.name, 'Nome é obrigatório.', 'NAME_REQUIRED') }, user.sub);
  if (!result) throw serviceError(404, 'Centro de Inovação não encontrado.', 'CENTER_NOT_FOUND');
  await audit({ userId: user.sub, action: id ? 'INNOVATION_CENTER_UPDATED' : 'INNOVATION_CENTER_CREATED', entity: 'innovation_center', entityId: result.id });
  if (id) await recompute(result.id, yearValue(payload.year || new Date().getFullYear()), user.sub);
  return result;
}

export async function metadata(centerId) {
  const center = await ensureCenter(centerId);
  const definitions = (await repository.listDefinitions(center.id)).map((item) => ({ ...item, value_type: normalizedValueType(item.value_type) }));
  return { center, definitions, recordTypes: RECORD_TYPES, modes: MODES, developmentStages: DEVELOPMENT_STAGES };
}

function catalogPayload(payload, { editing = false } = {}) {
  const code = editing ? undefined : String(required(payload.code, 'Código é obrigatório.', 'CODE_REQUIRED')).trim().toUpperCase();
  if (!editing && !CATALOG_CODE_PATTERN.test(code)) throw serviceError(422, 'Use um código estável com letras, números e underscore.', 'INVALID_INDICATOR_CODE');
  const valueType = String(required(payload.valueType, 'Tipo é obrigatório.', 'VALUE_TYPE_REQUIRED')).toUpperCase();
  const periodicity = String(required(payload.periodicity, 'Periodicidade é obrigatória.', 'PERIODICITY_REQUIRED')).toUpperCase();
  const aggregationType = String(required(payload.aggregationType, 'Agregação é obrigatória.', 'AGGREGATION_REQUIRED')).toUpperCase();
  const annualAggregation = String(payload.annualAggregation || aggregationType).toUpperCase();
  if (!catalogValueTypes.has(valueType) || !catalogPeriodicities.has(periodicity)
      || !catalogAggregations.has(aggregationType) || !annualAggregations.has(annualAggregation)) {
    throw serviceError(422, 'Configuração do indicador inválida.', 'INVALID_INDICATOR_DEFINITION');
  }
  return { code, name: catalogText(payload.name, 'Nome', CATALOG_TEXT_PATTERN),
    description: String(payload.description || '').trim() || null,
    category: catalogText(payload.category, 'Categoria', CATALOG_TEXT_PATTERN, 100),
    unit: catalogText(payload.unit, 'Unidade', CATALOG_UNIT_PATTERN, 50).toUpperCase(),
    valueType, periodicity, aggregationType, annualAggregation,
    sortOrder: integer(payload.sortOrder, 'Ordem', { optional: true, min: 0, max: 100000 }) || 0,
    active: payload.active !== false };
}

export async function listCatalogDefinitions(includeInactive, user) {
  ensureCatalogEditor(user);
  return repository.listCatalogDefinitions(includeInactive);
}

export async function createCatalogDefinition(payload, user) {
  ensureCatalogEditor(user);
  try {
    const result = await repository.createDefinition(catalogPayload(payload));
    await audit({ userId: user.sub, action: 'INDICATOR_DEFINITION_CREATED', entity: 'indicator_definition', entityId: result.id, details: { code: result.code } });
    return result;
  } catch (error) {
    if (error.code === '23505') throw serviceError(409, 'Já existe um indicador com este código.', 'INDICATOR_CODE_EXISTS');
    throw error;
  }
}

export async function updateCatalogDefinition(id, payload, user) {
  ensureCatalogEditor(user);
  const current = await repository.findDefinition(id);
  if (!current) throw serviceError(404, 'Indicador não encontrado.', 'INDICATOR_NOT_FOUND');
  const result = await repository.updateDefinition(id, catalogPayload(payload, { editing: true }));
  await audit({ userId: user.sub, action: 'INDICATOR_DEFINITION_UPDATED', entity: 'indicator_definition', entityId: id, details: { code: current.code } });
  return result;
}

export async function removeCatalogDefinition(id, user) {
  ensureCatalogEditor(user);
  const current = await repository.findDefinition(id);
  if (!current) throw serviceError(404, 'Indicador não encontrado.', 'INDICATOR_NOT_FOUND');
  if (await repository.definitionFormLinks(id)) throw serviceError(409, 'O indicador está vinculado a um formulário ativo ou em rascunho.', 'INDICATOR_IN_USE');
  await repository.deactivateDefinition(id);
  await audit({ userId: user.sub, action: 'INDICATOR_DEFINITION_DEACTIVATED', entity: 'indicator_definition', entityId: id, details: { code: current.code } });
}

export async function values(filters) {
  await ensureCenter(filters.centerId);
  const year = yearValue(filters.year);
  const month = filters.month === undefined || filters.month === '' ? null : monthValue(filters.month);
  return repository.listValues({ centerId: filters.centerId, year, month, indicatorId: filters.indicatorId || null, includeAnnual: filters.includeAnnual === 'true' });
}

export async function history(filters) {
  await ensureCenter(filters.centerId);
  required(filters.indicatorId, 'Indicador é obrigatório.', 'INDICATOR_REQUIRED');
  return repository.valueHistory({ centerId: filters.centerId, indicatorId: filters.indicatorId });
}

function typedManualValue(definition, value) {
  const type = normalizedValueType(definition.value_type);
  if (type === 'TEXT') return { numericValue: null, textValue: String(required(value, 'Valor é obrigatório.', 'VALUE_REQUIRED')), jsonValue: null };
  if (type === 'BOOLEAN') return { numericValue: null, textValue: String(Boolean(value)), jsonValue: null };
  let numericValue = decimal(required(value, 'Valor é obrigatório.', 'VALUE_REQUIRED'), 'Valor');
  if (type === 'INTEGER' && !Number.isInteger(numericValue)) throw serviceError(422, 'O valor deve ser um número inteiro.', 'INTEGER_REQUIRED');
  if (type === 'PERCENTAGE') {
    if (numericValue > 100) throw serviceError(422, 'O percentual deve estar entre 0 e 100.', 'PERCENTAGE_RANGE');
    numericValue /= 100;
  }
  return { numericValue, textValue: null, jsonValue: null };
}

export async function saveManualValue(payload, user) {
  ensureEditor(user);
  await ensureCenter(payload.centerId);
  const definition = await repository.findDefinition(required(payload.indicatorId, 'Indicador é obrigatório.', 'INDICATOR_REQUIRED'));
  if (!definition) throw serviceError(404, 'Indicador não encontrado.', 'INDICATOR_NOT_FOUND');
  if (definition.calculation_type !== 'MANUAL') throw serviceError(422, 'Indicadores automáticos ou derivados não podem ser editados manualmente.', 'READ_ONLY_INDICATOR');
  const year = yearValue(payload.year);
  const month = monthValue(payload.month);
  const typed = typedManualValue(definition, payload.value);
  const bounds = { start: `${year}-${String(month).padStart(2, '0')}-01`, end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };
  const saved = await repository.upsertValue({ ...typed, centerId: payload.centerId, indicatorId: definition.id, year, month, periodStart: bounds.start, periodEnd: bounds.end, sourceType: 'MANUAL_ENTRY', notes: payload.notes || null }, user.sub);
  await recompute(payload.centerId, year, user.sub);
  await audit({ userId: user.sub, action: saved.created ? 'INDICATOR_VALUE_CREATED' : 'INDICATOR_VALUE_UPDATED', entity: 'indicator_value', entityId: saved.id, details: { indicator: definition.code, year, month } });
  return saved;
}

export async function removeManualValue(id, user) {
  ensureEditor(user);
  const current = await repository.findValue(id);
  if (!current || current.source_type !== 'MANUAL_ENTRY') throw serviceError(404, 'Lançamento manual não encontrado.', 'VALUE_NOT_FOUND');
  await repository.deleteManualValue(id, user.sub);
  await recompute(current.innovation_center_id, current.year, user.sub);
  await audit({ userId: user.sub, action: 'INDICATOR_VALUE_DELETED', entity: 'indicator_value', entityId: id });
}

const snakeFields = Object.freeze({
  centerId: 'innovation_center_id', recordType: 'record_type', startDate: 'start_date', endDate: 'end_date', eventAt: 'event_at',
  participatingCompanies: 'participating_companies', inRegion: 'in_region', supportType: 'support_type',
  contributionPeriodicity: 'contribution_periodicity', programName: 'program_name', developmentStage: 'development_stage',
  collaboratorsEntry: 'collaborators_entry', collaboratorsExit: 'collaborators_exit', intellectualProperty: 'intellectual_property',
  fundsRaised: 'funds_raised', annualRevenue: 'annual_revenue', internationalRelationships: 'international_relationships',
});
const normalizeRecord = (payload) => Object.entries(payload).reduce((result, [key, value]) => ({ ...result, [snakeFields[key] || key]: value }), {});
const yearsImpacted = (row) => new Set([row.year, yearOfDate(row.event_at), yearOfDate(row.start_date), yearOfDate(row.end_date), new Date().getFullYear()].filter(Boolean));
const yearOfDate = (value) => value ? new Date(value).getUTCFullYear() : null;

function validateRecord(payload, type) {
  if (!RECORD_TYPE_VALUES.includes(type)) throw serviceError(404, 'Tipo de cadastro de indicador inválido.', 'INVALID_RECORD_TYPE');
  const data = normalizeRecord(payload);
  data.record_type = type;
  data.name = String(required(data.name, 'Nome é obrigatório.', 'NAME_REQUIRED')).trim();
  data.continuous = Boolean(data.continuous);
  data.active = data.active === undefined ? true : Boolean(data.active);
  data.extra = data.extra || {};
  if (data.end_date && data.start_date && data.end_date < data.start_date) throw serviceError(422, 'A data final não pode ser anterior à data inicial.', 'INVALID_DATE_RANGE');
  if (data.continuous) data.end_date = null;
  if (type === 'EVENT') required(data.event_at, 'Data e hora do evento é obrigatória.', 'EVENT_DATE_REQUIRED');
  if (['FUNCTION', 'PROGRAM', 'DEVELOPMENT_COMPANY', 'RESIDENT_COMPANY'].includes(type)) required(data.start_date, 'Data de início/entrada é obrigatória.', 'START_DATE_REQUIRED');
  if (data.mode && !MODES.includes(data.mode)) throw serviceError(422, 'Modo inválido.', 'INVALID_MODE');
  if (type === 'DEVELOPMENT_COMPANY' && !DEVELOPMENT_STAGES.includes(data.development_stage)) throw serviceError(422, 'Categoria do programa é obrigatória.', 'DEVELOPMENT_STAGE_REQUIRED');
  ['participants','participating_companies','collaborators_entry','collaborators_exit','challenges','solutions','deals'].forEach((field) => { data[field] = integer(data[field], field); });
  ['amount','funds_raised','annual_revenue'].forEach((field) => { data[field] = decimal(data[field], field); });
  if (data.year !== undefined && data.year !== null && data.year !== '') data.year = yearValue(data.year);
  if (data.month !== undefined && data.month !== null && data.month !== '') data.month = monthValue(data.month);
  if (type === 'OPEN_INNOVATION') { data.year = yearValue(data.year); data.month = monthValue(data.month); }
  return data;
}

export async function listRecords(filters) {
  await ensureCenter(filters.centerId);
  return repository.listRecords({ centerId: filters.centerId, type: filters.type, year: filters.year ? yearValue(filters.year) : null, month: filters.month ? monthValue(filters.month) : null, search: filters.search || null, includeInactive: filters.includeInactive === 'true' });
}

export async function saveRecord(id, type, payload, user) {
  ensureEditor(user);
  const current = id ? await repository.findRecord(id) : null;
  if (id && (!current || current.record_type !== type)) throw serviceError(404, 'Cadastro não encontrado.', 'RECORD_NOT_FOUND');
  const merged = current ? { ...current, ...normalizeRecord(payload) } : normalizeRecord(payload);
  await ensureCenter(merged.innovation_center_id);
  const data = validateRecord(merged, type);
  const saved = id ? await repository.updateRecord(id, data, user.sub) : await repository.createRecord(data, user.sub);
  const impacted = new Set([...yearsImpacted(saved), ...(current ? yearsImpacted(current) : [])]);
  for (const year of impacted) await recompute(saved.innovation_center_id, year, user.sub);
  await audit({ userId: user.sub, action: id ? 'INDICATOR_RECORD_UPDATED' : 'INDICATOR_RECORD_CREATED', entity: `indicator_${type.toLowerCase()}`, entityId: saved.id, details: { impactedYears: [...impacted] } });
  return saved;
}

export async function removeRecord(id, type, user) {
  ensureEditor(user);
  const current = await repository.findRecord(id);
  if (!current || current.record_type !== type) throw serviceError(404, 'Cadastro não encontrado.', 'RECORD_NOT_FOUND');
  await repository.deleteRecord(id, user.sub);
  for (const year of yearsImpacted(current)) await recompute(current.innovation_center_id, year, user.sub);
  await audit({ userId: user.sub, action: 'INDICATOR_RECORD_DELETED', entity: `indicator_${type.toLowerCase()}`, entityId: id });
}

export async function setApplicability(payload, user) {
  ensureEditor(user);
  await ensureCenter(payload.centerId);
  const definition = await repository.findDefinition(payload.indicatorId);
  if (!definition?.not_applicable_allowed) throw serviceError(422, 'Este indicador não permite a opção “Não aplicável”.', 'NOT_APPLICABLE_NOT_ALLOWED');
  const result = await repository.setApplicability(payload.centerId, definition.id, Boolean(payload.applicable), payload.notes, user.sub);
  await recompute(payload.centerId, yearValue(payload.year || new Date().getFullYear()), user.sub);
  return result;
}
