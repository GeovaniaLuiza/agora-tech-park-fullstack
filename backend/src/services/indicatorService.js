import * as repository from '../repositories/indicatorRepository.js';
import { record } from '../repositories/auditRepository.js';
import { serviceError } from '../utils/validation.js';
import { buildIndicatorReport } from './indicatorReportModel.js';
import { renderIndicatorPdf } from './indicatorPdfReport.js';

export const list = (filters) => repository.summary(filters);
export const history = repository.periods;
export const dashboard = repository.dashboard;

export async function refresh(period, user) {
  if (!period?.trim()) throw serviceError(422, 'Informe o período', 'PERIOD_REQUIRED');
  await repository.recompute(period.trim());
  await record({ userId: user.sub, action: 'INDICATORS_REFRESHED', entity: 'indicator', details: { period: period.trim() } });
}

function xmlEscape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const reportValue = (row) => row.value ?? row.text_value ?? (row.json_value ? JSON.stringify(row.json_value) : '');

function excel(rows) {
  const dataRows = rows.map((row) => {
    const value = reportValue(row);
    const type = row.value === null ? 'String' : 'Number';
    return `<Row><Cell><Data ss:Type="String">${xmlEscape(row.code || '')}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(row.name)}</Data></Cell><Cell><Data ss:Type="${type}">${xmlEscape(value)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(row.unit || '')}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(row.period)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(row.source)}</Data></Cell></Row>`;
  }).join('');
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Indicadores"><Table><Row><Cell><Data ss:Type="String">Código</Data></Cell><Cell><Data ss:Type="String">Indicador</Data></Cell><Cell><Data ss:Type="String">Valor</Data></Cell><Cell><Data ss:Type="String">Unidade</Data></Cell><Cell><Data ss:Type="String">Período</Data></Cell><Cell><Data ss:Type="String">Origem</Data></Cell></Row>${dataRows}</Table></Worksheet></Workbook>`;
}

export async function exportReport(format, filters, user) {
  if (!['pdf', 'excel', 'csv'].includes(format)) throw serviceError(422, 'Formato de exportação inválido', 'INVALID_EXPORT_FORMAT');
  const queryFilters = format === 'pdf' ? { ...filters, year: filters.year || filters.period?.match(/^\d{4}/)?.[0], period: null } : filters;
  const rows = await repository.summary(queryFilters);
  let pdfBody;
  if (format === 'pdf') {
    const year = Number(queryFilters.year || rows[0]?.year || new Date().getFullYear());
    const previous = await repository.summary({ ...queryFilters, year: String(year - 1) }).catch(() => []);
    pdfBody = await renderIndicatorPdf(buildIndicatorReport(rows, filters, user, previous));
  }
  await record({ userId: user.sub, action: 'INDICATORS_EXPORTED', entity: 'indicator', details: { format, period: filters.period || null } });
  if (format === 'pdf') return { body: pdfBody, contentType: 'application/pdf', extension: 'pdf' };
  if (format === 'csv') {
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const body = ['Código,Indicador,Valor,Unidade,Período,Origem', ...rows.map((row) => [row.code, row.name, reportValue(row), row.unit, row.period, row.source].map(escape).join(','))].join('\r\n');
    return { body: `\uFEFF${body}`, contentType: 'text/csv; charset=utf-8', extension: 'csv' };
  }
  return { body: excel(rows), contentType: 'application/vnd.ms-excel; charset=utf-8', extension: 'xls' };
}
