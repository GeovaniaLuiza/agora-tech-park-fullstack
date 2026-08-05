import * as repository from '../repositories/indicatorRepository.js';
import { record } from '../repositories/auditRepository.js';
import { serviceError } from '../utils/validation.js';

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

function pdfEscape(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?').replace(/[()\\]/g, '\\$&');
}

function pdf(rows) {
  const lines = ['Relatorio de indicadores - Centro de Inovacao de Joinville', `Gerado em ${new Date().toLocaleDateString('pt-BR')}`, '', ...rows.map((row) => `${row.name}: ${reportValue(row)} ${row.unit || ''} (${row.period})`)];
  const commands = lines.map((line, index) => `BT /F1 11 Tf 50 ${790 - index * 18} Td (${pdfEscape(line)}) Tj ET`).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

export async function exportReport(format, filters, user) {
  const rows = await repository.summary(filters);
  if (!['pdf', 'excel', 'csv'].includes(format)) throw serviceError(422, 'Formato de exportação inválido', 'INVALID_EXPORT_FORMAT');
  await record({ userId: user.sub, action: 'INDICATORS_EXPORTED', entity: 'indicator', details: { format, period: filters.period || null } });
  if (format === 'pdf') return { body: pdf(rows), contentType: 'application/pdf', extension: 'pdf' };
  if (format === 'csv') {
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const body = ['Código,Indicador,Valor,Unidade,Período,Origem', ...rows.map((row) => [row.code, row.name, reportValue(row), row.unit, row.period, row.source].map(escape).join(','))].join('\r\n');
    return { body: `\uFEFF${body}`, contentType: 'text/csv; charset=utf-8', extension: 'csv' };
  }
  return { body: excel(rows), contentType: 'application/vnd.ms-excel; charset=utf-8', extension: 'xls' };
}
