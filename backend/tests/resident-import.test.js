import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { residentWorkbookFixture } from './fixtures/indicator-import-workbooks.js';
import { parseResidentWorkbook, summarizeResidents } from '../src/services/residentImportParser.js';
import { RESIDENT_HEADERS } from '../src/domain/indicatorImportCatalog.js';

export const clientsBuffer = async (rows, { sheetName = 'Clientes', headerRow = 2, headers = RESIDENT_HEADERS } = {}) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.getRow(headerRow).values = headers.map((header) => ' ' + header + '  ');
  rows.forEach((row, index) => { sheet.getRow(headerRow + index + 1).values = row; });
  return Buffer.from(await workbook.xlsx.writeBuffer());
};
const occupation = (overrides = {}) => {
  const fields = { legend: 'Locada', landlord: 'Locador', block: 'HUB', unit: 'Sala 201', area: '55,40', name: 'Empresa XYZ', document: '11.222.333/0001-81', start: '01/01/2026', end: '', sector: 'Tecnologia', nationality: 'Brasil', ...overrides };
  return Object.values(fields);
};

describe('importação do arquivo Clientes', () => {
  it('lê cabeçalho na linha 2 com espaços e Bloco e Modúlo, preservando todas as ocupações', async () => {
    const parsed = await parseResidentWorkbook(await clientsBuffer([
      occupation(), occupation({ block: 'MOB', unit: 'Sala 202', area: 60, document: '11222333000181' }),
      occupation({ block: 'UNI', unit: 'Sala 103', area: '70,00', legend: 'Cessão' }),
    ]));
    expect(parsed.errors).toEqual([]);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({ document: '11222333000181', documentFormatted: '11.222.333/0001-81', totalArea: 185.4, validationStatus: 'VALID' });
    expect(parsed.items[0].contracts).toHaveLength(3);
    expect(parsed.items[0].contracts.map((contract) => contract.block)).toEqual(['HUB', 'MOB', 'UNI']);
    expect(parsed.summary).toMatchObject({ rowsRead: 3, companies: 1, uniqueCnpjs: 1, occupations: 3, valid: 1 });
  });

  it.each(['Locada', 'Cessão', 'Comodato'])('aceita ocupação %s', async (legend) => {
    const parsed = await parseResidentWorkbook(await clientsBuffer([occupation({ legend })]));
    expect(parsed.items[0]).toMatchObject({ included: true, validationStatus: 'VALID', contractType: legend });
  });

  it.each(['Disponível', 'Áreas Comuns'])('mostra %s como ignorado sem erros', async (legend) => {
    const parsed = await parseResidentWorkbook(await clientsBuffer([occupation({ legend, name: '', document: '', start: 'Pendente', area: '' })]));
    expect(parsed.items[0]).toMatchObject({ ignored: true, included: false, validationStatus: 'IGNORED', issues: [] });
    expect(parsed.summary).toMatchObject({ ignored: 1, companies: 0, occupations: 0, needsReview: 0 });
  });

  it.each(['30/04/20257', '31/09/2026', 'Pendente'])('preserva data %s para revisão sem abortar', async (end) => {
    const parsed = await parseResidentWorkbook(await clientsBuffer([occupation({ end }), occupation({ document: '04.252.011/0001-10', name: 'Outra' })]));
    expect(parsed.errors).toEqual([]);
    expect(parsed.items[0].contracts[0]).toMatchObject({ endInput: end, endDate: null });
    expect(parsed.items[0].issues).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'endInput', row: 3, message: 'Data inválida (Fim) na linha 3' })]));
    expect(parsed.summary).toMatchObject({ needsReview: 1, valid: 1 });
  });

  it('interpreta data Excel, serial, decimal e separadores brasileiros', async () => {
    const parsed = await parseResidentWorkbook(await clientsBuffer([
      occupation({ start: new Date('2026-01-01T00:00:00Z'), end: 46387, area: '1.234,56' }),
    ]));
    expect(parsed.items[0].contracts[0]).toMatchObject({ startDate: '2026-01-01', area: 1234.56 });
    expect(parsed.items[0].contracts[0].endDate).toMatch(/^2026-/);
  });

  it('destaca CNPJ ausente ou inválido, área inválida, empresa ausente e bloco desconhecido', async () => {
    const parsed = await parseResidentWorkbook(await clientsBuffer([
      occupation({ document: '', name: '', block: 'XYZ', area: 'abc' }),
      occupation({ document: '00.000.000/0000-00' }),
    ]));
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['name', 'document', 'block', 'areaInput']));
    expect(parsed.items[1].issues[0].message).toBe('CNPJ inválido na linha 4');
  });

  it('consolida CNPJ inválido sem descartar ocupações e mantém ausências separadas para revisão', async () => {
    const parsed = await parseResidentWorkbook(await clientsBuffer([
      occupation({ document: '00.000.000/0000-00' }), occupation({ document: '00000000000000', unit: 'Sala 202' }),
      occupation({ document: '' }), occupation({ document: '' }),
    ]));
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[0].contracts).toHaveLength(2);
    expect(parsed.summary.occupations).toBe(4);
    expect(parsed.items.every((item) => item.validationStatus === 'REVIEW_REQUIRED')).toBe(true);
  });

  it('retém blocos desconhecidos e ignorados no draft', async () => {
    const parsed = await parseResidentWorkbook(await residentWorkbookFixture());
    const company = parsed.items.find((item) => item.name === 'Empresa Anônima A');
    expect(company.contracts).toHaveLength(2);
    expect(company.rooms).toEqual(['HUB 201', 'UNI 301']);
    expect(parsed.items.find((item) => item.name === 'Empresa Fora do Centro').validationStatus).toBe('REVIEW_REQUIRED');
    expect(parsed.summary).toMatchObject({ companies: 5, rowsRead: 8, occupations: 6, ignored: 2 });
    expect(summarizeResidents(parsed.items, 2026).monthly.slice(0, 10)).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 1]);
  });

  it('dá mensagens específicas para aba, cabeçalho e coluna ausentes', async () => {
    expect((await parseResidentWorkbook(await clientsBuffer([], { sheetName: 'Outra' }))).errors[0].message).toBe('Aba "Clientes" não encontrada.');
    expect((await parseResidentWorkbook(await clientsBuffer([], { headerRow: 3 }))).errors[0].message).toContain('Cabeçalho esperado na linha 2');
    const headers = [...RESIDENT_HEADERS]; headers[6] = 'Documento';
    expect((await parseResidentWorkbook(await clientsBuffer([], { headers }))).errors[0].message).toContain('Coluna "CNPJ" não encontrada');
  });
});
