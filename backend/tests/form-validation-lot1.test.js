import { describe, expect, it, vi } from 'vitest';
import { validateForm, validateQuestion } from '../src/middlewares/validate.js';

const run = (middleware, body, method = 'POST') => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  middleware({ body, method }, res, next);
  return { res, next };
};

describe('validacao adicional de formularios', () => {
  it('rejeita titulo ausente ao criar formulario', () => {
    const { res, next } = run(validateForm, {});
    expect(res.status).toHaveBeenCalledWith(422); expect(next).not.toHaveBeenCalled();
  });
  it('rejeita titulo curto em atualizacao parcial', () => {
    const { res, next } = run(validateForm, { title: 'ab' }, 'PATCH');
    expect(res.status).toHaveBeenCalledWith(422); expect(next).not.toHaveBeenCalled();
  });
  it('rejeita data invalida', () => {
    const { res, next } = run(validateForm, { title: 'Coleta valida', startDate: 'nao-e-data' });
    expect(res.status).toHaveBeenCalledWith(422); expect(next).not.toHaveBeenCalled();
  });
  it('rejeita pergunta sem rotulo na criacao', () => {
    const { res, next } = run(validateQuestion, { type: 'TEXT' });
    expect(res.status).toHaveBeenCalledWith(422); expect(next).not.toHaveBeenCalled();
  });
});
