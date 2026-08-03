import { describe, expect, it, vi } from 'vitest';
import {
  classifyEmailError,
  createSmtpProvider,
  EmailConfigurationError,
  validateSmtpConfiguration,
} from '../src/email/smtpProvider.js';

const validEnvironment = {
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_SECURE: 'false',
  EMAIL_FROM: 'Ágora Tech Park <nao-responda@agora.test>',
};

describe('configuração e diagnóstico SMTP', () => {
  it('aceita Mailpit local sem autenticação e executa transport.verify()', async () => {
    const transport = { verify: vi.fn().mockResolvedValue(true), sendMail: vi.fn(), close: vi.fn() };
    const createTransport = vi.fn(() => transport);
    const provider = createSmtpProvider(validEnvironment, createTransport);

    await expect(provider.verify()).resolves.toBe(true);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'localhost',
      port: 1025,
      secure: false,
    }));
    expect(createTransport.mock.calls[0][0]).not.toHaveProperty('auth');
  });

  it.each([
    [{ ...validEnvironment, SMTP_HOST: '' }, 'SMTP_HOST_MISSING'],
    [{ ...validEnvironment, SMTP_PORT: 'invalid' }, 'SMTP_PORT_INVALID'],
    [{ ...validEnvironment, SMTP_PORT: '465', SMTP_SECURE: 'false' }, 'SMTP_PORT_465_REQUIRES_SECURE'],
    [{ ...validEnvironment, SMTP_PORT: '587', SMTP_SECURE: 'true' }, 'SMTP_PORT_587_REQUIRES_STARTTLS'],
    [{ ...validEnvironment, SMTP_USER: 'user', SMTP_PASSWORD: '' }, 'SMTP_AUTH_INCOMPLETE'],
    [{ ...validEnvironment, SMTP_USER: '', SMTP_PASSWORD: 'secret' }, 'SMTP_AUTH_INCOMPLETE'],
    [{ ...validEnvironment, EMAIL_FROM: '', EMAIL_FROM_NAME: '', EMAIL_FROM_ADDRESS: '' }, 'EMAIL_FROM_MISSING'],
  ])('detecta configuração inválida sem expor valores', (environment, reason) => {
    expect(() => validateSmtpConfiguration(environment)).toThrowError(EmailConfigurationError);
    try {
      validateSmtpConfiguration(environment);
    } catch (error) {
      expect(error.reason).toBe(reason);
      expect(error.message).not.toMatch(/user|secret|localhost/i);
    }
  });

  it.each([
    [{ code: 'ENOTFOUND' }, 'DNS_FAILURE'],
    [{ code: 'ECONNREFUSED' }, 'CONNECTION_REFUSED'],
    [{ code: 'ESOCKET', syscall: 'connect', command: 'CONN' }, 'CONNECTION_REFUSED'],
    [{ code: 'ETIMEDOUT' }, 'CONNECTION_TIMEOUT'],
    [{ code: 'EAUTH', response: '535 senha secreta' }, 'AUTHENTICATION_REJECTED'],
    [{ command: 'MAIL FROM' }, 'SENDER_REJECTED'],
    [{ command: 'RCPT TO' }, 'RECIPIENT_REJECTED'],
    [{ code: 'EPROTO' }, 'TLS_INCOMPATIBLE'],
  ])('classifica falha técnica em código sanitizado', (error, reason) => {
    expect(classifyEmailError(error)).toBe(reason);
    expect(classifyEmailError(error)).not.toContain('senha');
  });
});
