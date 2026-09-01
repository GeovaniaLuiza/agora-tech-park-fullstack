import ExcelJS from 'exceljs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { officialTemplateFixture } from './fixtures/indicator-import-workbooks.js';

const mocks = vi.hoisted(() => ({ findCenter: vi.fn(), records: vi.fn(), audit: vi.fn() }));
vi.mock('../src/repositories/indicatorImportRepository.js', () => ({
  findCenter: mocks.findCenter,
  recordsForOfficialWorkbook: mocks.records,
}));
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.audit }));
import { generateOfficialWorkbook, workbookStatus } from '../src/services/indicatorWorkbookExporter.js';

let temporaryDirectory;
const event = (overrides = {}) => ({ record_type: 'EVENT', name: 'Evento Anônimo', event_at: new Date('2026-03-15T09:00:00Z'), location: 'Auditório', theme: null, mode: null, subtype: null, participants: null, participating_companies: null, ...overrides });
const resident = (overrides = {}) => ({ record_type: 'RESIDENT_COMPANY', name: 'Empresa Anônima', start_date: new Date('2026-01-01T00:00:00Z'), end_date: null, location: 'UNI - Salas 301, 302', sector: 'Tecnologia', result: null, program_name: null, collaborators_entry: null, collaborators_exit: null, intellectual_property: null, funds_raised: null, annual_revenue: null, international_relationships: null, ...overrides });

beforeEach(async () => {
  vi.clearAllMocks();
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'agora-indicator-template-'));
  const template = await officialTemplateFixture({ existingEvent: true });
  const templateFile = path.join(temporaryDirectory, 'template.xlsx');
  await template.xlsx.writeFile(templateFile);
  process.env.INDICATOR_SPREADSHEET_PATH = templateFile;
  mocks.findCenter.mockResolvedValue({ id: 'center-1', name: 'Centro de Inovação' });
  mocks.records.mockResolvedValue([event({ name: '=HYPERLINK("https://invalid")' }), resident()]);
  mocks.audit.mockResolvedValue();
});
afterEach(async () => { delete process.env.INDICATOR_SPREADSHEET_PATH; await fs.rm(temporaryDirectory, { recursive: true, force: true }); });

describe('geração da planilha oficial', () => {
  it('detecta dados existentes e preserva a fórmula anual de residentes com warning', async () => {
    const status = await workbookStatus({ centerId: 'center-1', year: 2026 }, { sub: 'user-1' });
    expect(status.requiresStrategy).toBe(true);
    expect(status.events.template.rows).toBe(1);
    expect(status.warnings[0]).toEqual(expect.objectContaining({ code: 'RESIDENT_ANNUAL_FORMULA_REVIEW', formula: 'SUM(B1516:D1516)' }));
  });

  it('substitui somente os blocos autorizados, neutraliza fórmula maliciosa e preserva estilos/fórmulas', async () => {
    const report = await generateOfficialWorkbook({ centerId: 'center-1', year: 2026, strategy: 'REPLACE' }, { sub: 'user-1' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(report.body);
    const sheet = workbook.getWorksheet('CI JOINVILLE');
    expect(sheet.getCell('A89').value).toBe('\'=HYPERLINK("https://invalid")');
    expect(sheet.getCell('A89').fill.fgColor.argb).toBe('FFEAF2F8');
    expect(sheet.getCell('B87').value).toBe(0);
    expect(sheet.getCell('D87').value).toBe(1);
    expect(sheet.getCell('N87').formula).toBe('SUM(B87:M87)');
    expect(sheet.getCell('B1516').value).toBe(1);
    expect(sheet.getCell('M1516').value).toBe(1);
    expect(sheet.getCell('N1516').formula).toBe('SUM(B1516:D1516)');
    expect(sheet.getCell('A1430').value).toBe('Grandes Empresas');
    expect(sheet.getCell('A1600').value).toBe('Inovação Aberta');
  });

  it('mescla sem apagar registros existentes e bloqueia excesso de capacidade', async () => {
    let report = await generateOfficialWorkbook({ centerId: 'center-1', year: 2026, strategy: 'MERGE' }, { sub: 'user-1' });
    let workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(report.body);
    let sheet = workbook.getWorksheet('CI JOINVILLE');
    expect(sheet.getCell('A89').value).toBe('Evento existente');
    expect(sheet.getCell('A90').value).toContain('HYPERLINK');
    expect(sheet.getCell('B87').value).toBe(1);
    expect(sheet.getCell('D87').value).toBe(1);

    mocks.records.mockResolvedValue(Array.from({ length: 1342 }, (_, index) => event({ name: `Evento ${index}` })));
    await expect(generateOfficialWorkbook({ centerId: 'center-1', year: 2026, strategy: 'REPLACE' }, { sub: 'user-1' }))
      .rejects.toMatchObject({ code: 'EVENT_TEMPLATE_CAPACITY_EXCEEDED' });
  });
});
