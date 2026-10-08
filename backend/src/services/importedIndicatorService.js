import * as imports from '../repositories/indicatorImportRepository.js';
import * as management from '../repositories/indicatorManagementRepository.js';
import { calculateIndicatorRows, isStockActive } from './indicatorCalculationService.js';
import { monthBounds } from './indicatorImportUtils.js';
import { serviceError } from '../utils/validation.js';

const codes = { EVENTS: 'EVENTOS_REALIZADOS', RESIDENTS: 'EMPRESAS_RESIDENTES' };
export async function confirmedIndicators({ type, centerId, year: inputYear, month: inputMonth }, user) {
  if (!['ADMIN', 'PESQUISADOR'].includes(user?.role)) throw serviceError(403, 'Acesso não autorizado.', 'FORBIDDEN');
  if (!codes[type]) throw serviceError(404, 'Tipo de importação inválido.', 'INVALID_IMPORT_TYPE');
  const year = Number(inputYear), month = inputMonth ? Number(inputMonth) : null;
  if (!centerId || !Number.isInteger(year) || year < 2000 || year > 2200 || (month !== null && (!Number.isInteger(month) || month < 1 || month > 12))) {
    throw serviceError(422, 'Informe centro, ano e mês válidos.', 'INVALID_FILTER');
  }
  const center = await imports.findCenter(centerId);
  if (!center) throw serviceError(404, 'Centro de Inovação não encontrado.', 'CENTER_NOT_FOUND');
  const [records, definitions] = await Promise.all([imports.confirmedRecords(centerId, year, type), management.listDefinitions(centerId)]);
  const definition = definitions.find((item) => item.code === codes[type]);
  if (!definition) throw serviceError(422, 'Indicador não configurado para o centro.', 'INDICATOR_NOT_FOUND');
  const values = calculateIndicatorRows({ definitions: [definition], records, manualValues: [], center, year });
  const monthly = Array.from({ length: 12 }, (_, index) => values.find((row) => row.month === index + 1)?.numericValue ?? 0);
  const bounds = monthBounds(year, month || 1);
  const annualRecords = type === 'RESIDENTS' ? records.filter((record) => isStockActive(record, `${year}-01-01`, `${year}-12-31`)) : records;
  const detailed = annualRecords.filter((record) => !month || (type === 'EVENTS'
    ? new Date(record.event_at).getUTCMonth() + 1 === month
    : isStockActive(record, bounds.start, bounds.end)));
  return { center, year, month, code: codes[type], monthly, total: values.find((row) => row.month === null)?.numericValue ?? 0,
    annualAggregation: definition.annual_aggregation, records: detailed };
}
