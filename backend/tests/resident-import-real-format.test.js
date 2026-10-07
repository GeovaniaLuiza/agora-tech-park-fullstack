import { describe, expect, it } from 'vitest';
import { residentWorkbookFixture } from './fixtures/indicator-import-workbooks.js';
import { parseResidentWorkbook } from '../src/services/residentImportParser.js';

describe('fixture sintética do formato Clientes.xlsx', () => {
  it('consolida por CNPJ, preserva ocupações e mantém espaços disponíveis como ignorados', async () => {
    const residents = await parseResidentWorkbook(await residentWorkbookFixture());
    expect(residents.errors).toEqual([]);
    expect(residents.summary).toMatchObject({ rowsRead: 8, companies: 5, occupations: 6, ignored: 2 });
    const company = residents.items.find((item) => item.sourceRows.length === 2);
    expect(company.contracts).toHaveLength(2);
    expect(company.location).toBe('HUB / UNI');
  });
});
