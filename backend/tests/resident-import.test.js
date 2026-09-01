import { describe, expect, it } from 'vitest';
import { residentWorkbookFixture } from './fixtures/indicator-import-workbooks.js';
import { parseResidentWorkbook, summarizeResidents } from '../src/services/residentImportParser.js';

describe('importação de empresas residentes', () => {
  it('filtra HUB/MOB/UNI por padrão e consolida CNPJ/CPF sem contar salas', async () => {
    const parsed = await parseResidentWorkbook(await residentWorkbookFixture());
    expect(parsed.errors).toEqual([]);
    const company = parsed.items.find((item) => item.name === 'Empresa Anônima A');
    expect(company.contracts).toHaveLength(2);
    expect(company.rooms).toEqual(['HUB 201', 'UNI 301']);
    expect(company.contractType).toBe('Locada');
    expect(company.included).toBe(true);
    // Company was filtered out, not included=false
    expect(parsed.items.find((item) => item.name === 'Empresa Fora do Centro')).toBeUndefined();
    expect(parsed.summary.included).toBe(3); // Three consolidated identities in HUB/MOB/UNI
    expect(parsed.summary.ignoredObservationRows).toBe(3); // Updated count
  });

  it('usa nome como fallback sem persistir contato e exige revisão de períodos descontínuos', async () => {
    const parsed = await parseResidentWorkbook(await residentWorkbookFixture());
    const company = parsed.items.find((item) => item.name === 'Empresa Sem Documento');
    expect(company.documentMasked).toBe('Não informado');
    expect(company.discontinuous).toBe(true);
    expect(company.reviewStatus).toBe('WITH_WARNINGS');
    expect(company).not.toHaveProperty('email');
    expect(company).not.toHaveProperty('phone');
    expect(parsed.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(['IDENTITY_REVIEW', 'DISCONTINUOUS_OCCUPANCY']));   
  });

  it('calcula empresa ativa em cada mês por identidade, não por contrato', async () => {
    const parsed = await parseResidentWorkbook(await residentWorkbookFixture());
    const summary = summarizeResidents(parsed.items, 2026);
    expect(summary.monthly[0]).toBe(2);
    expect(summary.monthly[2]).toBe(1);
    expect(summary.monthly[6]).toBe(3);
    expect(summary.monthly[9]).toBe(1);
  });
});
