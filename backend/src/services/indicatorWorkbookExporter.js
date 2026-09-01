import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMPORT_YEAR, TEMPLATE_BLOCKS, TEMPLATE_SHEET } from '../domain/indicatorImportCatalog.js';
import * as repository from '../repositories/indicatorImportRepository.js';
import { record as audit } from '../repositories/auditRepository.js';
import { monthBounds, overlaps, safeSpreadsheetText } from './indicatorImportUtils.js';
import { serviceError } from '../utils/validation.js';

const DEFAULT_TEMPLATE = fileURLToPath(new URL('../../../frontend/imgs/Indicadores Rede de Centros de Inovação 2026_Joinville.xlsx', import.meta.url));
const outputName = 'Indicadores Rede de Centros de Inovação 2026_Joinville_atualizado.xlsx';
const templatePath = () => process.env.INDICATOR_SPREADSHEET_PATH ? path.resolve(process.env.INDICATOR_SPREADSHEET_PATH) : DEFAULT_TEMPLATE;

const valueText = (value) => value === null || value === undefined || value === '' ? null : safeSpreadsheetText(value);
const sameAnchor = (worksheet, [address, expected]) => String(worksheet.getCell(address).value || '').normalize('NFC').trim() === expected;
const blockOccupied = (worksheet, block) => {
  let cells = 0, rows = 0, lastRow = block.dataStart - 1;
  for (let row = block.dataStart; row <= block.dataEnd; row += 1) {
    let occupied = false;
    for (let column = 1; column <= block.columns; column += 1) {
      const value = worksheet.getCell(row, column).value;
      if (value !== null && value !== undefined && value !== '') { cells += 1; occupied = true; }
    }
    if (occupied) { rows += 1; lastRow = row; }
  }
  return { occupied: rows > 0, rows, cells, lastRow };
};

async function loadTemplate() {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.readFile(templatePath()); }
  catch (error) { throw serviceError(404, `Template oficial não encontrado: ${error.message}`, 'TEMPLATE_NOT_FOUND'); }
  const worksheet = workbook.getWorksheet(TEMPLATE_SHEET);
  if (!worksheet) throw serviceError(422, `O template deve conter a aba "${TEMPLATE_SHEET}".`, 'TEMPLATE_SHEET_NOT_FOUND');
  for (const block of Object.values(TEMPLATE_BLOCKS)) {
    if (![block.sectionAnchor, block.countAnchor, block.headerAnchor, block.nextAnchor].every((anchor) => sameAnchor(worksheet, anchor))) {
      throw serviceError(422, 'As âncoras do template oficial foram alteradas. Exportação bloqueada.', 'TEMPLATE_ANCHOR_MISMATCH');
    }
  }
  return { workbook, worksheet };
}

export async function workbookStatus({ centerId, year = IMPORT_YEAR }, user) {
  const center = await repository.findCenter(centerId);
  if (!center) throw serviceError(404, 'Centro de Inovação não encontrado.', 'CENTER_NOT_FOUND');
  const { worksheet } = await loadTemplate();
  const records = await repository.recordsForOfficialWorkbook(centerId, Number(year));
  const events = records.filter((row) => row.record_type === 'EVENT');
  const residents = records.filter((row) => row.record_type === 'RESIDENT_COMPANY');
  return {
    center, year: Number(year), events: { records: events.length, template: blockOccupied(worksheet, TEMPLATE_BLOCKS.EVENTS) },
    residents: { records: residents.length, template: blockOccupied(worksheet, TEMPLATE_BLOCKS.RESIDENTS) },
    warnings: [{ code: 'RESIDENT_ANNUAL_FORMULA_REVIEW', message: 'Fórmula anual de Empresas Residentes requer validação.', formula: worksheet.getCell(TEMPLATE_BLOCKS.RESIDENTS.annualFormulaCell).formula }],
    requiresStrategy: blockOccupied(worksheet, TEMPLATE_BLOCKS.EVENTS).occupied || blockOccupied(worksheet, TEMPLATE_BLOCKS.RESIDENTS).occupied,
    requestedBy: user?.sub || null,
  };
}

const clearBlock = (worksheet, block) => {
  for (let row = block.dataStart; row <= block.dataEnd; row += 1) for (let column = 1; column <= block.columns; column += 1) worksheet.getCell(row, column).value = null;
};
const startRowFor = (worksheet, block, strategy) => strategy === 'MERGE' ? Math.max(block.dataStart, blockOccupied(worksheet, block).lastRow + 1) : block.dataStart;
const excelDate = (value) => value ? new Date(`${new Date(value).toISOString().slice(0, 10)}T00:00:00Z`) : null;

function writeEvents(worksheet, records, strategy) {
  const block = TEMPLATE_BLOCKS.EVENTS;
  if (strategy === 'REPLACE') clearBlock(worksheet, block);
  const startRow = startRowFor(worksheet, block, strategy);
  if (startRow + records.length - 1 > block.dataEnd) throw serviceError(422, `O bloco de eventos comporta no máximo ${block.dataEnd - block.dataStart + 1} registros.`, 'EVENT_TEMPLATE_CAPACITY_EXCEEDED');
  records.forEach((record, index) => {
    const row = worksheet.getRow(startRow + index);
    row.getCell(1).value = valueText(record.name);
    row.getCell(2).value = excelDate(record.event_at);
    row.getCell(3).value = valueText(record.location);
    row.getCell(4).value = valueText(record.theme);
    row.getCell(5).value = valueText(record.mode === 'PRESENTIAL' ? 'Presencial' : record.mode === 'HYBRID' ? 'Híbrido' : record.mode === 'ONLINE' ? 'Online' : 'Não informado');
    row.getCell(6).value = valueText(record.subtype);
    row.getCell(7).value = record.participants === null ? null : Number(record.participants);
    row.getCell(8).value = record.participating_companies === null ? null : Number(record.participating_companies);
  });
  const monthly = Array(12).fill(0);
  for (let row = block.dataStart; row <= block.dataEnd; row += 1) {
    const date = worksheet.getCell(row, 2).value;
    if (date instanceof Date && date.getUTCFullYear() === IMPORT_YEAR) monthly[date.getUTCMonth()] += 1;
  }
  monthly.forEach((value, index) => { worksheet.getCell(87, index + 2).value = value; });
}

function writeResidents(worksheet, records, strategy) {
  const block = TEMPLATE_BLOCKS.RESIDENTS;
  if (strategy === 'REPLACE') clearBlock(worksheet, block);
  const startRow = startRowFor(worksheet, block, strategy);
  if (startRow + records.length - 1 > block.dataEnd) throw serviceError(422, `O bloco de empresas residentes comporta no máximo ${block.dataEnd - block.dataStart + 1} registros.`, 'RESIDENT_TEMPLATE_CAPACITY_EXCEEDED');
  records.forEach((record, index) => {
    const row = worksheet.getRow(startRow + index);
    row.getCell(1).value = valueText(record.name);
    row.getCell(2).value = excelDate(record.start_date);
    row.getCell(3).value = excelDate(record.end_date);
    row.getCell(4).value = valueText(record.result);
    row.getCell(5).value = valueText(record.program_name);
    row.getCell(6).value = valueText(record.location);
    row.getCell(7).value = valueText(record.sector);
    row.getCell(8).value = record.collaborators_entry === null ? null : Number(record.collaborators_entry);
    row.getCell(9).value = record.collaborators_exit === null ? null : Number(record.collaborators_exit);
    row.getCell(10).value = valueText(record.intellectual_property);
    row.getCell(11).value = record.funds_raised === null ? null : Number(record.funds_raised);
    row.getCell(12).value = record.annual_revenue === null ? null : Number(record.annual_revenue);
    row.getCell(13).value = valueText(record.international_relationships);
  });
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const { start, end } = monthBounds(IMPORT_YEAR, index + 1);
    let count = 0;
    for (let row = block.dataStart; row <= block.dataEnd; row += 1) {
      const name = worksheet.getCell(row, 1).value;
      const entry = worksheet.getCell(row, 2).value;
      const exit = worksheet.getCell(row, 3).value;
      if (name && overlaps(entry instanceof Date ? entry.toISOString().slice(0, 10) : null, exit instanceof Date ? exit.toISOString().slice(0, 10) : null, start, end)) count += 1;
    }
    return count;
  });
  monthly.forEach((value, index) => { worksheet.getCell(1516, index + 2).value = value; });
}

export async function generateOfficialWorkbook({ centerId, year = IMPORT_YEAR, strategy = 'CANCEL' }, user) {
  if (!['MERGE', 'REPLACE', 'CANCEL'].includes(strategy)) throw serviceError(422, 'Estratégia de exportação inválida.', 'INVALID_EXPORT_STRATEGY');
  const status = await workbookStatus({ centerId, year }, user);
  if (strategy === 'CANCEL') throw serviceError(409, 'Geração cancelada. Escolha Mesclar ou Substituir conscientemente.', 'EXPORT_CANCELLED');
  if (!status.requiresStrategy && strategy === 'MERGE') strategy = 'REPLACE';
  const originalResidentFormula = status.warnings[0].formula;
  const { workbook, worksheet } = await loadTemplate();
  const records = await repository.recordsForOfficialWorkbook(centerId, Number(year));
  writeEvents(worksheet, records.filter((row) => row.record_type === 'EVENT'), strategy);
  writeResidents(worksheet, records.filter((row) => row.record_type === 'RESIDENT_COMPANY'), strategy);
  if (worksheet.getCell(TEMPLATE_BLOCKS.EVENTS.annualFormulaCell).formula !== 'SUM(B87:M87)') throw serviceError(422, 'A fórmula anual de eventos foi alterada inesperadamente.', 'EVENT_FORMULA_CHANGED');
  if (worksheet.getCell(TEMPLATE_BLOCKS.RESIDENTS.annualFormulaCell).formula !== originalResidentFormula) throw serviceError(422, 'A fórmula anual de residentes foi alterada inesperadamente.', 'RESIDENT_FORMULA_CHANGED');
  const body = Buffer.from(await workbook.xlsx.writeBuffer());
  await audit({ userId: user.sub, action: 'OFFICIAL_INDICATOR_WORKBOOK_EXPORTED', entity: 'indicator_import_batch', details: { centerId, year: Number(year), strategy, events: status.events.records, residents: status.residents.records, warnings: status.warnings } });
  return { body, fileName: outputName, warnings: status.warnings };
}
