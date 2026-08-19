import * as repository from '../repositories/indicatorValueRepository.js';
import { record } from '../repositories/auditRepository.js';
import { serviceError } from '../utils/validation.js';

function monthBounds(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export function normalizeIndicatorValue(definition, rawValue) {
  const raw = String(rawValue ?? '').trim();
  if (!raw) throw serviceError(422, `Informe ${definition.name}`, 'INDICATOR_VALUE_REQUIRED');
  if (['TEXT'].includes(definition.value_type)) return { numericValue: null, textValue: raw, jsonValue: null };
  const normalized = raw.replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) throw serviceError(422, `Valor inválido para ${definition.name}`, 'INVALID_INDICATOR_VALUE');
  const value = Number(normalized);
  if (!Number.isFinite(value)) throw serviceError(422, `Valor inválido para ${definition.name}`, 'INVALID_INDICATOR_VALUE');
  if (definition.value_type === 'INTEGER' && !Number.isInteger(value)) throw serviceError(422, `${definition.name} exige um número inteiro`, 'INVALID_INDICATOR_VALUE');
  if (definition.value_type === 'PERCENTAGE' || definition.value_type === 'PERCENT') {
    if (value < 0 || value > 100) throw serviceError(422, `${definition.name} deve estar entre 0 e 100`, 'INVALID_INDICATOR_VALUE');
  } else if (value < 0 && definition.code !== 'RESULTADO_ANUAL_CENTRO') {
    throw serviceError(422, `${definition.name} não aceita valor negativo`, 'INVALID_INDICATOR_VALUE');
  }
  return { numericValue: value, textValue: null, jsonValue: null };
}

export async function processLinkedAnswers({ responseId, organizationId, centerId, year, month, userId, answers }, client) {
  const bounds = monthBounds(year, month);
  const changed = [];
  for (const answer of answers.filter((item) => item.indicator_id)) {
    const definition = await repository.findDefinition(answer.indicator_id, client);
    if (!definition?.active) throw serviceError(422, 'Indicador vinculado inexistente ou inativo', 'INVALID_INDICATOR_LINK');
    if (definition.calculation_type !== 'MANUAL') throw serviceError(422, `${definition.name} não pode ser coletado manualmente`, 'READ_ONLY_INDICATOR');
    const value = normalizeIndicatorValue(definition, answer.value);
    const saved = await repository.upsertFormValue({ ...value, indicatorId: definition.id, organizationId,
      centerId, year, month, periodStart: bounds.start, periodEnd: bounds.end, responseId, userId }, client);
    await repository.upsertAnnualValue({ indicatorId: definition.id, centerId, year,
      sourceType: 'FORM_RESPONSE', responseId, userId }, client);
    changed.push(saved.id);
    await record({ userId, action: saved.created ? 'INDICATOR_VALUE_CREATED' : 'INDICATOR_VALUE_UPDATED',
      entity: 'indicator_value', entityId: saved.id,
      details: { responseId, questionId: answer.questionId, indicatorCode: definition.code, year, month, source: 'FORM_RESPONSE' } }, client);
  }
  const revenue = await repository.valueByCode('RECEITA_TOTAL_CENTRO', centerId, year, month, client);
  const expenses = await repository.valueByCode('DESPESAS_TOTAL_CENTRO', centerId, year, month, client);
  if (revenue !== null && expenses !== null) {
    const derived = await repository.upsertDerivedResult({ centerId, year, month, periodStart: bounds.start,
      periodEnd: bounds.end, value: revenue - expenses, responseId, userId }, client);
    if (derived) {
      const definition = await client.query("SELECT id FROM indicator_definitions WHERE code='RESULTADO_ANUAL_CENTRO'");
      await repository.upsertAnnualValue({ indicatorId: definition.rows[0].id, centerId, year,
        sourceType: 'SYSTEM_CALCULATION', responseId, userId }, client);
      changed.push(derived.id);
      await record({ userId, action: 'INDICATOR_RECALCULATED', entity: 'indicator_value', entityId: derived.id,
        details: { responseId, indicatorCode: 'RESULTADO_ANUAL_CENTRO', year, month } }, client);
    }
  }
  return changed.length;
}
