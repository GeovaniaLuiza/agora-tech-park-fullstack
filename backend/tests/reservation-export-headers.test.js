import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseEventWorkbook } from '../src/services/eventImportParser.js';
import { reservationWorkbookFixture } from './fixtures/indicator-import-workbooks.js';

// Exact header text observed in the real 13-column reservation exports.
// All row values are synthetic; no operational workbook or personal data is stored.
const headers = ['ID', 'Data de início', 'Data de término', 'Horário', 'Sala', 'Tipo', 'Responsável', 'Cliente', 'Empresa', 'Site', 'Prédio / Torre', 'Andar', 'Status'];
const row = ['reservation-test', '01/10/2026', '01/10/2026', '08:00 - 12:00', 'Sala A', 'Evento', 'Responsável sintético', 'Atividade sintética', 'Empresa sintética', 'Site sintético', 'HUB', '2', 'Confirmada'];

describe('reservation export headers observed in real workbooks', () => {
  it('recognizes ID at A1 and maps all 13 columns without editing the export', async () => {
    const buffer = await reservationWorkbookFixture([row], headers);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Exportação');
    expect(sheet.columnCount).toBe(13);
    expect(sheet.getRow(1).values.slice(1)).toEqual(headers);
    expect(sheet.getCell('A1').value).toBe('ID');
    expect(sheet.getCell('A1').type).toBe(ExcelJS.ValueType.String);
    const parsed = await parseEventWorkbook(buffer);
    expect(parsed.errors).toEqual([]);
    expect(parsed.sheetName).toBe('Exportação');
    expect(parsed.summary).toMatchObject({ rowsRead: 1, records: 1, possibleEvents: 1, valid: 1, ignored: 0 });
    expect(parsed.items[0]).toMatchObject({ sourceIds: ['reservation-test'], reservationConfirmed: true, included: false, reviewStatus: 'PENDING' });
    expect(parsed.items[0].reservations).toEqual([{
      sourceRow: 2, sourceId: 'reservation-test', startAt: '2026-10-01T00:00:00.000Z', endAt: '2026-10-01T00:00:00.000Z',
      endRaw: '2026-10-01T00:00:00.000Z', schedule: '08:00 - 12:00', location: 'Sala A', subtype: 'Evento',
      responsible: 'Responsável sintético', client: 'Atividade sintética', company: 'Empresa sintética', site: 'Site sintético', building: 'HUB', floor: '2', status: 'Confirmada',
    }]);
  });

  it.each([
    { headers: headers.map((header) => '\uFEFF ' + header + '\u00A0') },
    { headers: headers.map((header) => header.normalize('NFD').replaceAll(' ', '\n')) },
  ])('already accepts BOM, surrounding whitespace, NBSP and decomposed accents %#', async (variant) => {
    const parsed = await parseEventWorkbook(await reservationWorkbookFixture([row], variant.headers));
    expect(parsed.errors).toEqual([]);
    expect(parsed.items[0]).toMatchObject({ sourceIds: ['reservation-test'], validationStatus: 'VALID' });
  });

  it('rejects an export that actually lacks ID, even when all other columns exist', async () => {
    const parsed = await parseEventWorkbook(await reservationWorkbookFixture([row.slice(1)], headers.slice(1)));
    expect(parsed.errors).toEqual([{
      code: 'INVALID_HEADERS', message: "Coluna 'ID' não encontrada na aba 'Exportação'.", missing: ['ID'],
    }]);
    expect(parsed.items).toEqual([]);
  });
});
