import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ repository: { findDefinition: vi.fn(), upsertFormValue: vi.fn(), upsertAnnualValue: vi.fn(), valueByCode: vi.fn(), upsertDerivedResult: vi.fn() }, audit: vi.fn() }));
vi.mock('../src/repositories/indicatorValueRepository.js', () => mocks.repository);
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.audit }));

import { processLinkedAnswers } from '../src/services/indicatorValueService.js';

const input = { responseId: 'response-1', organizationId: 'organization-1', centerId: 'center-1', year: 2026, month: 2, userId: 'user-1' };
const client = { query: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repository.findDefinition.mockResolvedValue({ id: 'indicator-1', active: true, calculation_type: 'MANUAL', value_type: 'DECIMAL', name: 'Receita', code: 'RECEITA_TOTAL_CENTRO' });
  mocks.repository.upsertFormValue.mockResolvedValue({ id: 'value-1', created: true });
  mocks.repository.upsertAnnualValue.mockResolvedValue();
  mocks.repository.valueByCode.mockResolvedValue(null);
  mocks.repository.upsertDerivedResult.mockResolvedValue(null);
  mocks.audit.mockResolvedValue();
  client.query.mockResolvedValue({ rows: [{ id: 'annual-result' }] });
});

describe('processamento de valores de indicadores vinculados', () => {
  it('não persiste quando não há respostas vinculadas', async () => {
    await expect(processLinkedAnswers({ ...input, answers: [{ questionId: 'q1', value: 'texto' }] }, client)).resolves.toBe(0);
    expect(mocks.repository.findDefinition).not.toHaveBeenCalled();
    expect(mocks.repository.upsertFormValue).not.toHaveBeenCalled();
  });

  it('rejeita vínculo de indicador inexistente ou inativo', async () => {
    mocks.repository.findDefinition.mockResolvedValueOnce(null);
    await expect(processLinkedAnswers({ ...input, answers: [{ questionId: 'q1', indicator_id: 'indicator-1', value: '10' }] }, client)).rejects.toMatchObject({ code: 'INVALID_INDICATOR_LINK' });
    expect(mocks.repository.upsertFormValue).not.toHaveBeenCalled();
  });

  it('rejeita indicador calculado em resposta manual', async () => {
    mocks.repository.findDefinition.mockResolvedValueOnce({ active: true, calculation_type: 'AUTOMATIC', name: 'Resultado' });
    await expect(processLinkedAnswers({ ...input, answers: [{ questionId: 'q1', indicator_id: 'indicator-1', value: '10' }] }, client)).rejects.toMatchObject({ code: 'READ_ONLY_INDICATOR' });
  });

  it('persiste valor manual, período mensal, anual e auditoria de criação', async () => {
    const changed = await processLinkedAnswers({ ...input, answers: [{ questionId: 'q1', indicator_id: 'indicator-1', value: '12,5' }] }, client);
    expect(changed).toBe(1);
    expect(mocks.repository.upsertFormValue).toHaveBeenCalledWith(expect.objectContaining({ numericValue: 12.5, periodStart: '2026-02-01', periodEnd: '2026-02-28' }), client);
    expect(mocks.repository.upsertAnnualValue).toHaveBeenCalledWith(expect.objectContaining({ sourceType: 'FORM_RESPONSE' }), client);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'INDICATOR_VALUE_CREATED', details: expect.objectContaining({ questionId: 'q1' }) }), client);
  });

  it('audita atualização quando o valor existente é sobrescrito', async () => {
    mocks.repository.upsertFormValue.mockResolvedValueOnce({ id: 'value-1', created: false });
    await processLinkedAnswers({ ...input, answers: [{ questionId: 'q1', indicator_id: 'indicator-1', value: '10' }] }, client);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'INDICATOR_VALUE_UPDATED' }), client);
  });

  it('recalcula resultado quando receita e despesa existem', async () => {
    mocks.repository.valueByCode.mockResolvedValueOnce(100).mockResolvedValueOnce(35);
    mocks.repository.upsertDerivedResult.mockResolvedValueOnce({ id: 'derived-1' });
    const changed = await processLinkedAnswers({ ...input, answers: [{ questionId: 'q1', indicator_id: 'indicator-1', value: '100' }] }, client);
    expect(changed).toBe(2);
    expect(mocks.repository.upsertDerivedResult).toHaveBeenCalledWith(expect.objectContaining({ value: 65, periodEnd: '2026-02-28' }), client);
    expect(mocks.repository.upsertAnnualValue).toHaveBeenCalledWith(expect.objectContaining({ indicatorId: 'annual-result', sourceType: 'SYSTEM_CALCULATION' }), client);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'INDICATOR_RECALCULATED' }), client);
  });
});
