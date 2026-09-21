import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findCenter: vi.fn(), findDefinition: vi.fn(), createDefinition: vi.fn(), updateDefinition: vi.fn(),
  definitionFormLinks: vi.fn(), deactivateDefinition: vi.fn(), upsertValue: vi.fn(), findValue: vi.fn(),
  deleteManualValue: vi.fn(), createRecord: vi.fn(), findRecord: vi.fn(), updateRecord: vi.fn(), deleteRecord: vi.fn(),
  setApplicability: vi.fn(), record: vi.fn(), recompute: vi.fn(),
}));
vi.mock('../src/repositories/indicatorManagementRepository.js', () => mocks);
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.record }));
vi.mock('../src/services/indicatorCalculationService.js', () => ({ recompute: mocks.recompute }));

import * as service from '../src/services/indicatorManagementService.js';

const admin = { sub: 'admin-1', role: 'ADMIN' };
const editor = { sub: 'editor-1', role: 'GESTOR' };
const catalog = { code: 'RECEITA_TOTAL', name: 'Receita total', category: 'Financeiro', unit: 'BRL', valueType: 'CURRENCY', periodicity: 'MONTHLY', aggregationType: 'SUM' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findCenter.mockResolvedValue({ id: 'center-1', name: 'Centro' });
  mocks.record.mockResolvedValue(); mocks.recompute.mockResolvedValue();
});

describe('gestão de indicadores (RF-007)', () => {
  it('cria definição válida e registra auditoria', async () => {
    mocks.createDefinition.mockResolvedValue({ id: 'def-1', code: 'RECEITA_TOTAL' });
    await expect(service.createCatalogDefinition(catalog, admin)).resolves.toMatchObject({ id: 'def-1' });
    expect(mocks.createDefinition).toHaveBeenCalledWith(expect.objectContaining({ code: 'RECEITA_TOTAL', unit: 'BRL' }));
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'INDICATOR_DEFINITION_CREATED' }));
  });
  it('bloqueia configuração inválida e perfil sem permissão para catálogo', async () => {
    await expect(service.createCatalogDefinition({ ...catalog, periodicity: 'DAILY' }, admin)).rejects.toMatchObject({ code: 'INVALID_INDICATOR_DEFINITION' });
    await expect(service.createCatalogDefinition(catalog, editor)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('converte conflito de código do repository', async () => {
    mocks.createDefinition.mockRejectedValue({ code: '23505' });
    await expect(service.createCatalogDefinition(catalog, admin)).rejects.toMatchObject({ code: 'INDICATOR_CODE_EXISTS', status: 409 });
  });
  it('atualiza definição existente e rejeita indicador inexistente', async () => {
    mocks.findDefinition.mockResolvedValueOnce({ id: 'def-1', code: 'ANTIGO' }); mocks.updateDefinition.mockResolvedValue({ id: 'def-1' });
    await expect(service.updateCatalogDefinition('def-1', catalog, admin)).resolves.toEqual({ id: 'def-1' });
    expect(mocks.updateDefinition).toHaveBeenCalledWith('def-1', expect.objectContaining({ code: undefined }));
    mocks.findDefinition.mockResolvedValueOnce(null);
    await expect(service.updateCatalogDefinition('missing', catalog, admin)).rejects.toMatchObject({ code: 'INDICATOR_NOT_FOUND' });
  });
  it('inativa definição sem vínculos e bloqueia definição em uso', async () => {
    mocks.findDefinition.mockResolvedValue({ id: 'def-1', code: 'CODIGO' }); mocks.definitionFormLinks.mockResolvedValueOnce(0);
    await service.removeCatalogDefinition('def-1', admin);
    expect(mocks.deactivateDefinition).toHaveBeenCalledWith('def-1');
    mocks.definitionFormLinks.mockResolvedValueOnce(2);
    await expect(service.removeCatalogDefinition('def-1', admin)).rejects.toMatchObject({ code: 'INDICATOR_IN_USE' });
  });
  it('salva percentual manual, recalcula e audita', async () => {
    mocks.findDefinition.mockResolvedValue({ id: 'def-1', code: 'TAXA', calculation_type: 'MANUAL', value_type: 'PERCENTAGE' });
    mocks.upsertValue.mockResolvedValue({ id: 'value-1', created: true });
    await service.saveManualValue({ centerId: 'center-1', indicatorId: 'def-1', year: 2026, month: 2, value: '25', notes: 'ok' }, editor);
    expect(mocks.upsertValue).toHaveBeenCalledWith(expect.objectContaining({ numericValue: .25, periodEnd: '2026-02-28' }), 'editor-1');
    expect(mocks.recompute).toHaveBeenCalledWith('center-1', 2026, 'editor-1');
  });
  it('rejeita valor manual de indicador automático, inteiro fracionado e percentual fora da faixa', async () => {
    mocks.findDefinition.mockResolvedValueOnce({ id: 'a', calculation_type: 'AUTOMATIC', value_type: 'INTEGER' });
    await expect(service.saveManualValue({ centerId: 'center-1', indicatorId: 'a', year: 2026, month: 1, value: 1 }, editor)).rejects.toMatchObject({ code: 'READ_ONLY_INDICATOR' });
    mocks.findDefinition.mockResolvedValueOnce({ id: 'b', calculation_type: 'MANUAL', value_type: 'INTEGER' });
    await expect(service.saveManualValue({ centerId: 'center-1', indicatorId: 'b', year: 2026, month: 1, value: 1.5 }, editor)).rejects.toMatchObject({ code: 'INTEGER_REQUIRED' });
    mocks.findDefinition.mockResolvedValueOnce({ id: 'c', calculation_type: 'MANUAL', value_type: 'PERCENTAGE' });
    await expect(service.saveManualValue({ centerId: 'center-1', indicatorId: 'c', year: 2026, month: 1, value: 101 }, editor)).rejects.toMatchObject({ code: 'PERCENTAGE_RANGE' });
  });
  it('exclui lançamento manual e rejeita lançamento inexistente', async () => {
    mocks.findValue.mockResolvedValueOnce({ id: 'v-1', source_type: 'MANUAL_ENTRY', innovation_center_id: 'center-1', year: 2026 });
    await service.removeManualValue('v-1', editor);
    expect(mocks.deleteManualValue).toHaveBeenCalledWith('v-1', 'editor-1');
    mocks.findValue.mockResolvedValueOnce(null);
    await expect(service.removeManualValue('none', editor)).rejects.toMatchObject({ code: 'VALUE_NOT_FOUND' });
  });
  it('cria registro de evento e valida campos obrigatórios e datas', async () => {
    mocks.createRecord.mockResolvedValue({ id: 'event-1', innovation_center_id: 'center-1', event_at: '2026-03-10T10:00:00Z' });
    await service.saveRecord(null, 'EVENT', { centerId: 'center-1', name: 'Demo', eventAt: '2026-03-10T10:00:00Z', participants: 4 }, editor);
    expect(mocks.createRecord).toHaveBeenCalledWith(expect.objectContaining({ record_type: 'EVENT', participants: 4 }), 'editor-1');
    await expect(service.saveRecord(null, 'EVENT', { centerId: 'center-1', name: 'Sem data' }, editor)).rejects.toMatchObject({ code: 'EVENT_DATE_REQUIRED' });
    await expect(service.saveRecord(null, 'PROGRAM', { centerId: 'center-1', name: 'Programa', startDate: '2026-02-02', endDate: '2026-01-01' }, editor)).rejects.toMatchObject({ code: 'INVALID_DATE_RANGE' });
  });
  it('controla aplicabilidade, centro e autorização', async () => {
    mocks.findDefinition.mockResolvedValueOnce({ id: 'def-1', not_applicable_allowed: true }); mocks.setApplicability.mockResolvedValue({ applicable: false });
    await expect(service.setApplicability({ centerId: 'center-1', indicatorId: 'def-1', applicable: false, year: 2026 }, editor)).resolves.toEqual({ applicable: false });
    mocks.findDefinition.mockResolvedValueOnce({ id: 'def-2', not_applicable_allowed: false });
    await expect(service.setApplicability({ centerId: 'center-1', indicatorId: 'def-2' }, editor)).rejects.toMatchObject({ code: 'NOT_APPLICABLE_NOT_ALLOWED' });
    await expect(service.setApplicability({ centerId: 'center-1', indicatorId: 'def-1' }, { role: 'LEITOR' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
