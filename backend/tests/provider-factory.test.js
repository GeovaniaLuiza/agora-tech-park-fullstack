import { describe, expect, it, vi } from 'vitest';
import { createEmailProvider, selectEmailProvider } from '../src/email/providerFactory.js';
import { EmailConfigurationError } from '../src/email/smtpProvider.js';

describe('email provider selection', () => {
  it('uses the default mock factory when only SMTP is injected', async () => {
    const smtp = vi.fn();
    const provider = createEmailProvider({ NODE_ENV: 'test', EMAIL_PROVIDER: 'smtp' }, { smtp });

    expect(await provider.verify()).toBe(true);
    expect(await provider.send({ to: 'recipient@example.test' }))
      .toMatchObject({ messageId: 'mock-message-id' });
    expect(smtp).not.toHaveBeenCalled();
  });

  it('uses the default SMTP factory when only mock is injected', () => {
    const mock = vi.fn();

    expect(() => createEmailProvider({ NODE_ENV: 'production', EMAIL_PROVIDER: 'smtp' }, { mock }))
      .toThrowError(EmailConfigurationError);
    expect(mock).not.toHaveBeenCalled();
  });

  it('preserves an injected SMTP factory and passes the environment unchanged', () => {
    const environment = { NODE_ENV: 'production', EMAIL_PROVIDER: 'smtp' };
    const provider = { verify: vi.fn(), send: vi.fn() };
    const smtp = vi.fn(() => provider);

    expect(createEmailProvider(environment, { smtp })).toBe(provider);
    expect(smtp).toHaveBeenCalledExactlyOnceWith(environment);
  });

  it('uses the default factories when providers is omitted or undefined', async () => {
    const environment = { NODE_ENV: 'test' };
    expect(await createEmailProvider(environment).verify()).toBe(true);
    expect(await createEmailProvider(environment, undefined).verify()).toBe(true);
  });

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
