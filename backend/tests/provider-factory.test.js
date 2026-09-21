import { describe, expect, it, vi } from 'vitest';
import { createEmailProvider, selectEmailProvider } from '../src/email/providerFactory.js';
import { EmailConfigurationError } from '../src/email/smtpProvider.js';

describe('email provider selection', () => {
  it('always selects mock in tests even with complete inherited SMTP variables', () => {
    const smtp = vi.fn();
    const mockProvider = { verify: vi.fn(), send: vi.fn() };
    const mock = vi.fn(() => mockProvider);
    const environment = {
      NODE_ENV: 'test',
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'smtp.example.test',
      SMTP_USER: 'inherited-user',
      SMTP_PASSWORD: 'inherited-password',
      EMAIL_FROM: 'sender@example.test',
    };

    expect(createEmailProvider(environment, { mock, smtp })).toBe(mockProvider);
    expect(mock).toHaveBeenCalledOnce();
    expect(smtp).not.toHaveBeenCalled();
  });

  it('defaults development to mock without SMTP configuration', () => {
    expect(selectEmailProvider({ NODE_ENV: 'development' })).toBe('mock');
  });

  it('allows SMTP in development only when explicitly selected', () => {
    expect(selectEmailProvider({ NODE_ENV: 'development', EMAIL_PROVIDER: 'smtp' })).toBe('smtp');
    expect(() => selectEmailProvider({ NODE_ENV: 'development', EMAIL_PROVIDER: 'invalid' }))
      .toThrowError(EmailConfigurationError);
  });

  it('accepts only explicit SMTP in production', () => {
    expect(selectEmailProvider({ NODE_ENV: 'production', EMAIL_PROVIDER: 'smtp' })).toBe('smtp');
    expect(() => selectEmailProvider({ NODE_ENV: 'production', EMAIL_PROVIDER: 'mock' }))
      .toThrowError(EmailConfigurationError);
    expect(() => selectEmailProvider({ NODE_ENV: 'production' }))
      .toThrowError(EmailConfigurationError);
  });
});
