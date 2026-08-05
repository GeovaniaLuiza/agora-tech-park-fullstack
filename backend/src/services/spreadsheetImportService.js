import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIndicatorWorkbook } from './spreadsheetParser.js';
import * as repository from '../repositories/spreadsheetImportRepository.js';
import { record } from '../repositories/auditRepository.js';
import { serviceError } from '../utils/validation.js';

const DEFAULT_FILE = fileURLToPath(new URL('../../../frontend/imgs/Indicadores Rede de Centros de Inovação 2025_Joinville.xlsx', import.meta.url));

export function configuredSpreadsheetPath() {
  return process.env.INDICATOR_SPREADSHEET_PATH
    ? path.resolve(process.env.INDICATOR_SPREADSHEET_PATH)
    : DEFAULT_FILE;
}

async function readSource() {
  const filePath = configuredSpreadsheetPath();
  let body;
  try { body = await readFile(filePath); }
  catch { throw serviceError(404, 'Planilha institucional não encontrada no servidor', 'SPREADSHEET_NOT_FOUND'); }
  return { body, filePath, fileName: path.basename(filePath), fileHash: createHash('sha256').update(body).digest('hex').toUpperCase() };
}

export async function exportSource(user) {
  const source = await readSource();
  await record({
    userId: user.sub,
    action: 'SPREADSHEET_EXPORTED',
    entity: 'spreadsheet_import',
    details: { fileName: source.fileName, fileHash: source.fileHash, sheetName: 'CI JOINVILLE', year: 2025 },
  });
  return { body: source.body, fileName: source.fileName };
}

export async function validateSource() {
  const source = await readSource();
  const parsed = await parseIndicatorWorkbook(source.filePath);
  return {
    fileName: source.fileName,
    fileHash: source.fileHash,
    sheetName: parsed.sheetName,
    year: parsed.year,
    definitions: parsed.definitions.length,
    values: parsed.values.length,
    warnings: parsed.errors,
    valid: !parsed.errors.some((error) => error.code === 'REFERENCE_MISMATCH'),
  };
}

export async function importSource(user, { reprocess = false } = {}) {
  const source = await readSource();
  const duplicate = await repository.findImported(source.fileHash, 'CI JOINVILLE', 2025);
  if (duplicate && !reprocess) return { ...duplicate, duplicate: true };
  const previous = await repository.findImportedYear('CI JOINVILLE', 2025);
  if (previous && !reprocess) throw serviceError(409, 'Já existe uma importação de 2025. Reprocessamento exige autorização explícita.', 'IMPORT_REPROCESS_REQUIRED', { importId: previous.id });
  const parsed = await parseIndicatorWorkbook(source.filePath);
  if (parsed.errors.some((error) => error.code === 'REFERENCE_MISMATCH')) {
    throw serviceError(422, 'Os totais da planilha não coincidem com as referências de 2025', 'SPREADSHEET_REFERENCE_MISMATCH', { errors: parsed.errors });
  }
  const result = await repository.persistImport({ ...source, parsed, userId: user?.sub || null, reprocess });
  if (result.conflict) throw serviceError(409, 'Já existe uma importação para este período', 'IMPORT_REPROCESS_REQUIRED', { importId: result.id });
  return result;
}
