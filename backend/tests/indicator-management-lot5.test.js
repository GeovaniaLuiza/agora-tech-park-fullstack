import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repo: {
    listCenters: vi.fn(), updateCenter: vi.fn(), createCenter: vi.fn(), findCenter: vi.fn(), listDefinitions: vi.fn(),
    listCatalogDefinitions: vi.fn(), findDefinition: vi.fn(), upsertValue: vi.fn(), listValues: vi.fn(), valueHistory: vi.fn(),
    findRecord: vi.fn(), createRecord: vi.fn(), updateRecord: vi.fn(), deleteRecord: vi.fn(), listRecords: vi.fn(),
  },
  audit: vi.fn(), recompute: vi.fn(),
}));
vi.mock('../src/repositories/indicatorManagementRepository.js', () => mocks.repo);
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.audit }));
vi.mock('../src/services/indicatorCalculationService.js', () => ({ recompute: mocks.recompute }));

import * as service from '../src/services/indicatorManagementService.js';

const admin = { sub: 'admin-1', role: 'ADMIN' };
const center = { id: 'center-1', name: 'Centro' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repo.findCenter.mockResolvedValue(center);
  mocks.audit.mockResolvedValue();
  mocks.recompute.mockResolvedValue();
});

describe('indicatorManagementService lote 5', () => {
  it('lista centros e catalogo respeitando flags', async () => {
    mocks.repo.listCenters.mockResolvedValue([center]);
    mocks.repo.listCatalogDefinitions.mockResolvedValue([{ id: 'def-1' }]);
    await expect(service.listCenters(true)).resolves.toEqual([center]);
    await expect(service.listCatalogDefinitions(true, admin)).resolves.toEqual([{ id: 'def-1' }]);
    expect(mocks.repo.listCenters).toHaveBeenCalledWith({ includeInactive: true });
  });

  it('cria e atualiza centro, recalculando apenas na atualizacao', async () => {
    mocks.repo.createCenter.mockResolvedValue({ id: 'new-center' });
    mocks.repo.updateCenter.mockResolvedValue(center);
    await expect(service.saveCenter(null, { code: 'CTR', name: 'Centro' }, admin)).resolves.toMatchObject({ id: 'new-center' });
    await expect(service.saveCenter('center-1', { name: 'Centro', year: 2026 }, admin)).resolves.toEqual(center);
    expect(mocks.recompute).toHaveBeenCalledWith('center-1', 2026, 'admin-1');
  });

  it('valida permissao, campos e centro inexistente ao salvar centro', async () => {
    await expect(service.saveCenter(null, {}, { role: 'LEITOR' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.saveCenter(null, { name: 'Centro' }, admin)).rejects.toMatchObject({ code: 'CODE_REQUIRED' });
    mocks.repo.updateCenter.mockResolvedValue(null);
    await expect(service.saveCenter('missing', { year: 2026 }, admin)).rejects.toMatchObject({ code: 'CENTER_NOT_FOUND' });
  });

  it('retorna metadados normalizando tipos e rejeita centro ausente', async () => {
    mocks.repo.listDefinitions.mockResolvedValue([{ id: 'def-1', value_type: 'NUMBER' }]);
    await expect(service.metadata('center-1')).resolves.toMatchObject({ center, definitions: [expect.objectContaining({ value_type: 'DECIMAL' })] });
    mocks.repo.findCenter.mockResolvedValueOnce(null);
    await expect(service.metadata('missing')).rejects.toMatchObject({ code: 'CENTER_NOT_FOUND' });
  });

  it('consulta valores com filtros normalizados', async () => {
    mocks.repo.listValues.mockResolvedValue([]);
    await service.values({ centerId: 'center-1', year: '2026', month: '', indicatorId: '', includeAnnual: 'true' });
    expect(mocks.repo.listValues).toHaveBeenCalledWith({ centerId: 'center-1', year: 2026, month: null, indicatorId: null, includeAnnual: true });
    await service.values({ centerId: 'center-1', year: 2026, month: '12' });
    expect(mocks.repo.listValues).toHaveBeenLastCalledWith(expect.objectContaining({ month: 12, includeAnnual: false }));
  });

  it('valida ano, mes e indicador obrigatorio nas consultas', async () => {
    await expect(service.values({ centerId: 'center-1', year: '', month: 1 })).rejects.toMatchObject({ code: 'FIELD_REQUIRED' });
    await expect(service.values({ centerId: 'center-1', year: 2026, month: 13 })).rejects.toMatchObject({ code: 'INVALID_FIELD' });
    await expect(service.history({ centerId: 'center-1' })).rejects.toMatchObject({ code: 'INDICATOR_REQUIRED' });
  });

  it('salva valores manuais textuais e booleanos', async () => {
    mocks.repo.findDefinition.mockResolvedValueOnce({ id: 'text', code: 'TXT', calculation_type: 'MANUAL', value_type: 'TEXT' });
    mocks.repo.upsertValue.mockResolvedValueOnce({ id: 'v1', created: false });
    await service.saveManualValue({ centerId: 'center-1', indicatorId: 'text', year: 2026, month: 1, value: 'Relato' }, admin);
    expect(mocks.repo.upsertValue).toHaveBeenLastCalledWith(expect.objectContaining({ numericValue: null, textValue: 'Relato' }), 'admin-1');
    mocks.repo.findDefinition.mockResolvedValueOnce({ id: 'bool', code: 'BOOL', calculation_type: 'MANUAL', value_type: 'BOOLEAN' });
    mocks.repo.upsertValue.mockResolvedValueOnce({ id: 'v2', created: true });
    await service.saveManualValue({ centerId: 'center-1', indicatorId: 'bool', year: 2026, month: 2, value: 0 }, admin);
    expect(mocks.repo.upsertValue).toHaveBeenLastCalledWith(expect.objectContaining({ textValue: 'false' }), 'admin-1');
  });

  it('rejeita indicador ausente e numero manual negativo', async () => {
    mocks.repo.findDefinition.mockResolvedValueOnce(null);
    await expect(service.saveManualValue({ centerId: 'center-1', indicatorId: 'missing' }, admin)).rejects.toMatchObject({ code: 'INDICATOR_NOT_FOUND' });
    mocks.repo.findDefinition.mockResolvedValueOnce({ id: 'def', calculation_type: 'MANUAL', value_type: 'DECIMAL' });
    await expect(service.saveManualValue({ centerId: 'center-1', indicatorId: 'def', year: 2026, month: 1, value: -1 }, admin)).rejects.toMatchObject({ code: 'INVALID_FIELD' });
  });

  it('lista registros com filtros opcionais e busca', async () => {
    mocks.repo.listRecords.mockResolvedValue([]);
    await service.listRecords({ centerId: 'center-1', type: 'EVENT', year: '2026', month: '3', search: 'demo', includeInactive: 'true' });
    expect(mocks.repo.listRecords).toHaveBeenCalledWith({ centerId: 'center-1', type: 'EVENT', year: 2026, month: 3, search: 'demo', includeInactive: true });
  });

  it('valida tipos, datas, modo, categoria e numeros de registros', async () => {
    const base = { centerId: 'center-1', name: 'Registro', startDate: '2026-01-01' };
    await expect(service.saveRecord(null, 'INVALID', base, admin)).rejects.toMatchObject({ code: 'INVALID_RECORD_TYPE' });
    await expect(service.saveRecord(null, 'FUNCTION', { ...base, mode: 'INVALID' }, admin)).rejects.toMatchObject({ code: 'INVALID_MODE' });
    await expect(service.saveRecord(null, 'DEVELOPMENT_COMPANY', base, admin)).rejects.toMatchObject({ code: 'DEVELOPMENT_STAGE_REQUIRED' });
    await expect(service.saveRecord(null, 'PROGRAM', { ...base, participants: -1 }, admin)).rejects.toMatchObject({ code: 'INVALID_FIELD' });
  });

  it('atualiza registro continuo e recalcula todos os anos impactados', async () => {
    const current = { id: 'r1', record_type: 'PROGRAM', innovation_center_id: 'center-1', name: 'Programa', start_date: '2024-01-01', end_date: '2024-12-31' };
    mocks.repo.findRecord.mockResolvedValue(current);
    mocks.repo.updateRecord.mockResolvedValue({ ...current, start_date: '2025-01-01', end_date: null, continuous: true });
    await service.saveRecord('r1', 'PROGRAM', { startDate: '2025-01-01', endDate: null, continuous: true, active: false }, admin);
    expect(mocks.repo.updateRecord).toHaveBeenCalledWith('r1', expect.objectContaining({ end_date: null, active: false }), 'admin-1');
    expect(mocks.recompute).toHaveBeenCalledWith('center-1', 2024, 'admin-1');
    expect(mocks.recompute).toHaveBeenCalledWith('center-1', 2025, 'admin-1');
  });

  it('remove registro existente e rejeita ausente ou de outro tipo', async () => {
    mocks.repo.findRecord.mockResolvedValueOnce(null);
    await expect(service.removeRecord('r1', 'EVENT', admin)).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
    mocks.repo.findRecord.mockResolvedValueOnce({ record_type: 'PROGRAM' });
    await expect(service.removeRecord('r1', 'EVENT', admin)).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
    mocks.repo.findRecord.mockResolvedValueOnce({ id: 'r1', record_type: 'EVENT', innovation_center_id: 'center-1', event_at: '2026-02-01' });
    await expect(service.removeRecord('r1', 'EVENT', admin)).resolves.toBeUndefined();
    expect(mocks.repo.deleteRecord).toHaveBeenCalledWith('r1', 'admin-1');
  });
});
