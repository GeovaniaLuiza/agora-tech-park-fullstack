import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { eventWorkbookFixture } from './fixtures/indicator-import-workbooks.js';
import { EVENT_HEADERS } from '../src/domain/indicatorImportCatalog.js';
import { parseEventWorkbook } from '../src/services/eventImportParser.js';

const eventsBuffer = async (rows, { sheetName = 'Eventos', headerRow = 1, headers = EVENT_HEADERS } = {}) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.getRow(headerRow).values = headers;
  rows.forEach((row, index) => { sheet.getRow(headerRow + index + 1).values = row; });
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

describe('formato real Eventos.xlsx', () => {
  it('lê colunas reais, inclusive opcionais vazios, sem filtrar pelo título', async () => {
    const parsed = await parseEventWorkbook(await eventsBuffer([
      ['Empresa ABC', '15/03/2026', 'HUB', '', 'Presencial', '', '', ''],
      ['Encontro', new Date('2026-04-10T00:00:00Z'), 'UNI', 'Tecnologia', 'Híbrido', 'Tipo real', '40', '5'],
      ['Oficina', 46023, 'MOB', '', 'Online', '', 10, 2],
    ]));
    expect(parsed.errors).toEqual([]);
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[0]).toMatchObject({ name: 'Empresa ABC', startAt: '2026-03-15T00:00:00.000Z', theme: '', mode: 'PRESENTIAL', subtype: '', participants: null, participatingCompanies: null, validationStatus: 'VALID', included: false });
    expect(parsed.items[1]).toMatchObject({ startAt: '2026-04-10T00:00:00.000Z', theme: 'Tecnologia', mode: 'HYBRID', subtype: 'Tipo real', participants: 40, participatingCompanies: 5 });
    expect(parsed.items[2].startAt).toMatch(/^2026-/);
    expect(parsed.warnings).toEqual([]);
  });
  it('preserva campos inválidos e incompletos no preview para revisão por linha', async () => {
    const parsed = await parseEventWorkbook(await eventsBuffer([
      ['', '31/09/2026', '', '', 'Presencial', '', 'abc', '2,5'],
      ['Completo', '01/01/2026', 'HUB', '', '', '', '1.200', '3'],
    ]));
    expect(parsed.errors).toEqual([]);
    expect(parsed.items[0]).toMatchObject({ startAt: null, dateRaw: '31/09/2026', participants: 'abc', participatingCompanies: '2,5', validationStatus: 'REVIEW_REQUIRED' });
    expect(parsed.items[0].issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['name', 'startAt', 'location', 'participants', 'participatingCompanies']));
    expect(parsed.items[1].participants).toBe(1200);
    expect(parsed.summary).toMatchObject({ records: 2, needsReview: 1, valid: 1 });
  });
  it('identifica aba, cabeçalho na linha 1 e coluna ausentes', async () => {
    expect((await parseEventWorkbook(await eventsBuffer([], { sheetName: 'Outra' }))).errors[0].message).toBe('Aba "Eventos" não encontrada.');
    expect((await parseEventWorkbook(await eventsBuffer([], { headerRow: 2 }))).errors[0].message).toContain('Cabeçalho esperado na linha 1');
    const headers = [...EVENT_HEADERS]; headers[0] = 'Nome';
    expect((await parseEventWorkbook(await eventsBuffer([], { headers }))).errors[0].message).toContain('Coluna "Lista" não encontrada');
  });
  it('exige os nomes exatos das oito colunas de Eventos', async () => {
    for (const [index, name] of [[3, 'Tematica'], [5, 'Tipo de evento'], [6, 'Numero de Participantes'], [7, 'N de Empresas Participantes']]) {
      const headers = [...EVENT_HEADERS];
      headers[index] = name;
      const parsed = await parseEventWorkbook(await eventsBuffer([], { headers }));
      expect(parsed.errors[0]).toMatchObject({ code: 'INVALID_HEADERS', missing: [EVENT_HEADERS[index]] });
    }
  });
});
it('usa a fixture sintética de Eventos sem persistência automática', async () => {
  const parsed = await parseEventWorkbook(await eventWorkbookFixture());
  expect(parsed.errors).toEqual([]);
  expect(parsed.items).toHaveLength(4);
  expect(parsed.items.every((item) => !item.included)).toBe(true);
});
