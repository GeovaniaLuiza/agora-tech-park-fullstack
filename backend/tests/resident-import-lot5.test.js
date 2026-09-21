import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseResidentWorkbook, summarizeResidents } from '../src/services/residentImportParser.js';

const bufferFor = async (rows, { sheetName = 'Locatários Perini Business', validHeader = true } = {}) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(['RelaÃ§Ã£o']); sheet.addRow([]);
  sheet.addRow(validHeader
    ? ['Legenda ', 'Bloco', 'Bloco e Modúlo ', 'Cliente', 'Área ', 'CNPJ', 'Vigência ', 'Fim ', 'Locador ', 'Atividades', 'Nacionalidade', 'Nome ', 'Telefone', 'E-mail ']
    : ['Cabecalho incorreto']);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

describe('residentImportParser lote 5', () => {
  it('retorna erros estruturais para aba e cabecalho inesperados', async () => {
    const wrongSheet = await parseResidentWorkbook(await bufferFor([], { sheetName: 'Outra aba' }));
    expect(wrongSheet.errors).toHaveLength(1);
    expect(wrongSheet.items).toEqual([]);
    const wrongHeader = await parseResidentWorkbook(await bufferFor([], { validHeader: false }));
    expect(wrongHeader.errors).toHaveLength(1);
  });

  it('normaliza documentos validos, contratos, status e datas invalidas', async () => {
    const rows = [
      ['Comodato', 'HUB', '101', 'Empresa CNPJ', 10, '11.222.333/0001-81', '01/01/2020', '01/01/2021', '', 'Tecnologia'],
      ['Cessão', 'MOB', '102', 'Pessoa CPF', 10, '529.982.247-25', '01/01/2099', '', '', 'Pesquisa'],
      ['Locada', 'UNI', '103', 'Empresa Ativa', 10, '', 'data invalida', '', '', 'Serviços'],
      ['', '', '', '', '', '', '', '', '', 'observacao'],
    ];
    const parsed = await parseResidentWorkbook(await bufferFor(rows));
    expect(parsed.items.find((item) => item.name === 'Empresa CNPJ')).toMatchObject({ documentMasked: '11.***.***/0001-81', contractType: 'Comodato', status: 'ENDED', reviewStatus: 'VALIDATED' });
    expect(parsed.items.find((item) => item.name === 'Pessoa CPF')).toMatchObject({ documentMasked: '***.982.247-**', contractType: 'Cessão', status: 'FUTURE', reviewStatus: 'VALIDATED' });
    expect(parsed.warnings.map((warning) => warning.code)).toContain('INVALID_CONTRACT_DATE');
    expect(parsed.summary.ignoredObservationRows).toBe(1);
  });

  it('resume incluidos, excluidos e override manual de periodo e bloco', () => {
    const items = [
      { included: true, reviewStatus: 'VALIDATED', contracts: [{ eligibleBlock: false, startDate: '2026-01-01', endDate: '2026-01-31' }], manualBlockOverride: true, manualPeriodOverride: false, discontinuous: false },
      { included: true, reviewStatus: 'WITH_WARNINGS', contracts: [], manualPeriodOverride: true, startDate: '2026-02-01', endDate: '2026-02-28', discontinuous: true },
      { included: false, reviewStatus: 'EXCLUDED', contracts: [{ eligibleBlock: true, startDate: '2026-01-01', endDate: null }], discontinuous: false },
    ];
    const summary = summarizeResidents(items, 2026);
    expect(summary).toMatchObject({ records: 3, included: 2, excluded: 1, warnings: 1, discontinuous: 1 });
    expect(summary.monthly.slice(0, 3)).toEqual([1, 1, 0]);
  });
});
