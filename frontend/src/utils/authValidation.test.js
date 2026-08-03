import { describe, expect, it } from 'vitest';
import { isValidCnpj, validateLogin, validateRegistration } from './authValidation';
describe('validação de autenticação', () => {
  it('valida e-mail e senha no login', () => expect(validateLogin({ email: 'inválido', password: '' })).toEqual(expect.objectContaining({ email: expect.any(String), password: expect.any(String) })));
  it('valida dígitos verificadores do CNPJ', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false);
  });
  it('valida confirmação, senha forte e termos', () => {
    const errors = validateRegistration({ name: 'Pessoa Teste', email: 'pessoa@test.com', password: 'fraca', confirmPassword: 'outra', cnpj: '11222333000181', companyName: 'Startup', acceptedTerms: false });
    expect(errors).toEqual(expect.objectContaining({ password: expect.any(String), confirmPassword: expect.any(String), acceptedTerms: expect.any(String) }));
  });
});
