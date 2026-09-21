import { describe, expect, it } from 'vitest';
import { validateEnvironment } from '../src/config/environment.js';

const valid = {
  NODE_ENV: 'production',
  PORT: '3000',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/agora',
  JWT_SECRET: 'a'.repeat(32),
  CLIENT_URL: 'https://app.example.org',
  FRONTEND_URL: 'https://app.example.org',
  METRICS_TOKEN: 'b'.repeat(32),
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'smtp.example.org',
};

describe('validateEnvironment', () => {
  it('defaults production to IPv4 loopback', () => {
    expect(validateEnvironment(valid).LISTEN_HOST).toBe('127.0.0.1');
  });

  it.each(['development', 'test'])('preserves container access in %s', (NODE_ENV) => {
    expect(validateEnvironment({ ...valid, NODE_ENV }).LISTEN_HOST).toBe('0.0.0.0');
    expect(validateEnvironment({ ...valid, NODE_ENV, LISTEN_HOST: '127.0.0.1' }).LISTEN_HOST).toBe('127.0.0.1');
  });

  it('accepts explicit production loopback', () => {
    expect(validateEnvironment({ ...valid, LISTEN_HOST: '127.0.0.1' }).LISTEN_HOST).toBe('127.0.0.1');
  });

  it.each(['0.0.0.0', '::', 'localhost', '192.168.1.10', ''])('rejects unsafe production binding: %s', (LISTEN_HOST) => {
    expect(() => validateEnvironment({ ...valid, LISTEN_HOST })).toThrow(/LISTEN_HOST/);
  });

  it('accepts a complete production configuration', () => {
    expect(validateEnvironment(valid).PORT).toBe(3000);
    expect(validateEnvironment(valid).EMAIL_PROVIDER).toBe('smtp');
  });

  it('rejects placeholder production secrets without exposing them', () => {
    expect(() => validateEnvironment({ ...valid, JWT_SECRET: 'troque-esta-chave-em-producao-1234' }))
      .toThrow(/Production secrets/);
  });

  it('requires SMTP configuration in production', () => {
    expect(() => validateEnvironment({ ...valid, SMTP_HOST: undefined })).toThrow(/SMTP_HOST/);
  });

  it('rejects the mock provider in production', () => {
    expect(() => validateEnvironment({ ...valid, EMAIL_PROVIDER: 'mock', SMTP_HOST: undefined }))
      .toThrow(/EMAIL_PROVIDER=smtp/);
  });

  it('accepts the mock provider in development without SMTP variables', () => {
    const config = validateEnvironment({
      ...valid,
      NODE_ENV: 'development',
      EMAIL_PROVIDER: 'mock',
      SMTP_HOST: undefined,
    });

    expect(config.EMAIL_PROVIDER).toBe('mock');
  });

  it('uses the mock provider by default in development', () => {
    const config = validateEnvironment({
      ...valid,
      NODE_ENV: 'development',
      EMAIL_PROVIDER: undefined,
      SMTP_HOST: undefined,
    });

    expect(config.EMAIL_PROVIDER).toBe('mock');
  });

  it('forces the mock provider in tests even when SMTP is inherited', () => {
    const config = validateEnvironment({ ...valid, NODE_ENV: 'test', EMAIL_PROVIDER: 'smtp' });
    expect(config.EMAIL_PROVIDER).toBe('mock');
  });
});
